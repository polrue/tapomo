//! Updates: the check and the install are done here (the page only asks), and an optional
//! background task installs new versions while the user is not typing.
//! Nothing about the user or their typing is ever sent: it is a plain download from GitHub.

use std::sync::atomic::Ordering;
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

/// The newer release, if any. Errors (offline, no release yet...) are logged and mean "none".
async fn find_update(app: &AppHandle) -> Option<Update> {
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    match result {
        Ok(update) => update,
        Err(e) => {
            log::warn!("update check failed: {e}");
            None
        }
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Option<UpdateInfo> {
    if !settings(&app)?.check_updates {
        return None;
    }
    let update = find_update(&app).await?;
    log::info!("update available: {}", update.version);
    Some(UpdateInfo { version: update.version.clone(), notes: update.body.clone(), date: update.date.map(|d| d.to_string()) })
}

/// Downloads (reporting progress to the page) and installs. On Windows the installer runs in
/// passive mode and the app exits by itself, so on success this normally never returns.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> CmdResult<()> {
    let update = find_update(&app).await.ok_or_else(|| "no update available".to_string())?;
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
    log::info!("auto-update: checking");
    let Some(update) = find_update(app).await else {
        log::info!("auto-update: up to date");
        return;
    };
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
