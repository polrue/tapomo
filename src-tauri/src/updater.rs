//! Updates: the check and the install are done here (the page only asks), and an optional
//! background task installs new versions while the user is not typing.
//! Nothing about the user or their typing is ever sent: it is a plain download from GitHub.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::commands::{AppState, CmdResult};
use crate::db;

/// First background check, a minute after start, so it never competes with startup.
const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// A silent update only installs after this long without a keystroke.
const IDLE_BEFORE_INSTALL: Duration = Duration::from_secs(2 * 60);
const IDLE_POLL: Duration = Duration::from_secs(15);

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
    date: Option<String>,
}

/// Payload of `tapomo://update-progress`; `total` is unknown when the server does not say.
#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn settings(app: &AppHandle) -> Option<db::Settings> {
    app.state::<AppState>().with_db(db::get_settings).ok()
}

/// The newer release: `Err` when the check itself failed (offline, no release yet...), `Ok(None)` when up to date.
async fn check_result(app: &AppHandle) -> Result<Option<Update>, ()> {
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    result.map_err(|e| log::warn!("update check failed: {e}"))
}

/// The newer release, if any. Errors are logged and mean "none".
async fn find_update(app: &AppHandle) -> Option<Update> {
    check_result(app).await.ok().flatten()
}

// ------------------------------------------------------------- the pet's parcel

/// Store page of the Microsoft Store build.
const STORE_URL: &str = "ms-windows-store://pdp/?productid=9NZCXQH9BLCZ";

/// What the floating pet knows about updates: the newer version found (it shows a parcel and the menu
/// entry «Actualizar a la versión X») and whether this run is downloading it right now.
#[derive(Default)]
pub struct Notice {
    version: Mutex<Option<String>>,
    busy: AtomicBool,
}

/// Payload of `tapomo://update-state` (sent to the pet): `state` is "available", "none", "downloading",
/// "installing" or "failed".
#[derive(Serialize, Clone)]
pub struct PetUpdateState {
    state: &'static str,
    version: Option<String>,
}

/// Testing aid: TAPOMO_FAKE_UPDATE=1.9.9 makes the pet believe that version is available (no real check,
/// and «Actualizar» only simulates the download).
fn fake_version() -> Option<String> {
    std::env::var("TAPOMO_FAKE_UPDATE").ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn emit_state(app: &AppHandle, state: &'static str, version: Option<String>) {
    let _ = app.emit_to(crate::pet::LABEL, "tapomo://update-state", PetUpdateState { state, version });
}

/// Remembers the newer version (or `None`) and tells the pet.
fn set_notice(app: &AppHandle, version: Option<String>) {
    let version = fake_version().or(version);
    if let Some(n) = app.try_state::<Notice>() {
        *n.version.lock().unwrap_or_else(|e| e.into_inner()) = version.clone();
    }
    // While the pet downloads, «available» would reset its progress bar: install_update re-sends the state at the end.
    if app.try_state::<Notice>().is_some_and(|n| n.busy.load(Ordering::Relaxed)) {
        return;
    }
    emit_state(app, if version.is_some() { "available" } else { "none" }, version);
}

/// The pet asks on load (events sent before its page loaded are lost): the newer version, if any.
#[tauri::command]
pub fn pet_update_notice(notice: tauri::State<Notice>) -> Option<String> {
    notice.version.lock().ok()?.clone()
}

/// The version to offer in the pet's menu: none while it is already downloading.
pub fn menu_version(app: &AppHandle) -> Option<String> {
    let n = app.try_state::<Notice>()?;
    if n.busy.load(Ordering::Relaxed) {
        return None;
    }
    let v = n.version.lock().ok()?.clone();
    v
}

/// «Actualizar» in the pet's menu: the Store build opens its Store page; otherwise the same download and
/// install as the main window's dialog (the pet follows it through `tapomo://update-state`).
pub fn pet_update(app: &AppHandle) {
    if crate::packaged::is_packaged() {
        if let Err(e) = tauri_plugin_opener::open_url(STORE_URL, None::<&str>) {
            log::error!("could not open the Store page: {e}");
        }
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = install_update(app).await;
    });
}

/// Fake download for TAPOMO_FAKE_UPDATE: progress events like the real one, then back to the parcel.
async fn simulate_install(app: &AppHandle) {
    for i in 1..=20u64 {
        tokio::time::sleep(Duration::from_millis(150)).await;
        let _ = app.emit("tapomo://update-progress", Progress { downloaded: i * 50, total: Some(1000) });
    }
    emit_state(app, "installing", fake_version());
    tokio::time::sleep(Duration::from_millis(1500)).await;
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Option<UpdateInfo> {
    // The Store build is updated by the Store.
    if crate::packaged::is_packaged() || !settings(&app).is_some_and(|s| s.check_updates) {
        set_notice(&app, None);
        return None;
    }
    if fake_version().is_some() {
        set_notice(&app, None); // the fake version; the real updater stays untouched
        return None;
    }
    let found = match check_result(&app).await {
        Ok(found) => found,
        Err(()) => return None, // offline: keep what the pet already shows
    };
    set_notice(&app, found.as_ref().map(|u| u.version.clone()));
    let update = found?;
    log::info!("update available: {}", update.version);
    Some(UpdateInfo { version: update.version.clone(), notes: update.body.clone(), date: update.date.map(|d| d.to_string()) })
}

/// Downloads (reporting progress to the page) and installs. On Windows the installer runs in
/// passive mode and the app exits by itself, so on success this normally never returns.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> CmdResult<()> {
    if crate::packaged::is_packaged() {
        return Err("the Microsoft Store updates this build".into());
    }
    if let Some(n) = app.try_state::<Notice>() {
        if n.busy.swap(true, Ordering::Relaxed) {
            return Err("already updating".into());
        }
    }
    emit_state(&app, "downloading", None);
    let result = download_and_install(&app).await;
    if let Some(n) = app.try_state::<Notice>() {
        n.busy.store(false, Ordering::Relaxed);
    }
    // Still running means it did not install: the parcel comes back (after the pet says so if it failed).
    if result.is_err() {
        emit_state(&app, "failed", None);
    }
    let version = app.try_state::<Notice>().and_then(|n| n.version.lock().ok().and_then(|v| v.clone()));
    emit_state(&app, if version.is_some() { "available" } else { "none" }, version);
    result
}

async fn download_and_install(app: &AppHandle) -> CmdResult<()> {
    let app = app.clone();
    // With TAPOMO_FAKE_UPDATE the real updater is never touched: a real release could get installed.
    if fake_version().is_some() {
        simulate_install(&app).await;
        return Ok(());
    }
    let Some(update) = find_update(&app).await else {
        return Err("no update available".to_string());
    };
    log::info!("downloading update {}", update.version);
    let mut downloaded = 0u64;
    let progress_app = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit("tapomo://update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| {
            log::error!("update download failed: {e}");
            e.to_string()
        })?;
    log::info!("installing update {}", update.version);
    emit_state(&app, "installing", None);
    update.install(bytes).map_err(|e| {
        log::error!("update install failed: {e}");
        e.to_string()
    })
}

/// True once nothing has been typed for [`IDLE_BEFORE_INSTALL`] (or ever, since the app started).
fn user_idle(app: &AppHandle) -> bool {
    let last = app.state::<AppState>().shared.last_key_ms.load(Ordering::Relaxed);
    now_ms().saturating_sub(last) >= IDLE_BEFORE_INSTALL.as_millis() as u64
}

fn auto_update_on(app: &AppHandle) -> bool {
    settings(app).is_some_and(|s| s.check_updates && s.auto_update)
}

/// Background auto-update: first run about a minute after start, then every 24 h.
/// Downloads right away, installs when the user has been idle for a while.
pub fn spawn(app: AppHandle) {
    if fake_version().is_some() {
        set_notice(&app, None); // shows the fake version (the pet page asks for it when it loads)
    }
    if crate::packaged::is_packaged() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if auto_update_on(&app) {
                run_once(&app).await;
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

async fn run_once(app: &AppHandle) {
    if fake_version().is_some() {
        return;
    }
    log::info!("auto-update: checking");
    let Some(update) = find_update(app).await else {
        log::info!("auto-update: up to date");
        return;
    };
    set_notice(app, Some(update.version.clone())); // the parcel may show until it installs
    log::info!("auto-update: downloading {}", update.version);
    let bytes = match update.download(|_, _| {}, || {}).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("auto-update: download failed: {e}");
            return;
        }
    };
    log::info!("auto-update: downloaded, waiting for {} s without typing", IDLE_BEFORE_INSTALL.as_secs());
    loop {
        if !auto_update_on(app) {
            log::info!("auto-update: turned off meanwhile, not installing");
            return;
        }
        if user_idle(app) {
            break;
        }
        tokio::time::sleep(IDLE_POLL).await;
    }
    log::info!("auto-update: installing {}", update.version);
    if let Err(e) = update.install(bytes) {
        log::error!("auto-update: install failed: {e}");
    }
}
