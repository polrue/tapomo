//! Tauri commands and the settings plumbing shared with the tray.

use std::sync::mpsc::{self, Sender};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use tauri::menu::{CheckMenuItem, MenuItem};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::db::{self, AppStat, HeatCell, Settings, Summary};
use crate::{i18n, pet};
use crate::tracker::{Msg, Shared};

/// Tray menu entries, kept so their labels can follow the language setting.
pub struct TrayItems {
    pub open: MenuItem<tauri::Wry>,
    pub show_pet: CheckMenuItem<tauri::Wry>,
    pub pause: CheckMenuItem<tauri::Wry>,
    pub quit: MenuItem<tauri::Wry>,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub tx: Sender<Msg>,
    pub shared: Arc<Shared>,
}

type CmdResult<T> = Result<T, String>;

impl AppState {
    fn with_db<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> CmdResult<T> {
        let conn = self.db.lock().map_err(|_| "database lock poisoned".to_string())?;
        f(&conn).map_err(|e| {
            log::error!("database error: {e}");
            e.to_string()
        })
    }
}

#[tauri::command]
pub fn get_summary(state: State<AppState>, range: String) -> CmdResult<Summary> {
    let streak = state.shared.streak.load(Ordering::Relaxed);
    state.with_db(|c| db::summary(c, &range, streak))
}

#[tauri::command]
pub fn get_heatmap(state: State<AppState>, range: String) -> CmdResult<Vec<HeatCell>> {
    state.with_db(|c| db::heatmap(c, &range))
}

#[tauri::command]
pub fn get_apps(state: State<AppState>, range: String) -> CmdResult<Vec<AppStat>> {
    state.with_db(|c| db::apps(c, &range))
}

#[tauri::command]
pub fn set_alias(state: State<AppState>, exe: String, alias: String) -> CmdResult<()> {
    state.with_db(|c| db::set_alias(c, &exe, &alias))
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> CmdResult<Settings> {
    state.with_db(db::get_settings)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, settings: Settings) -> CmdResult<()> {
    apply_settings(&app, settings)
}

#[tauri::command]
pub fn list_exclusions(state: State<AppState>) -> CmdResult<Vec<String>> {
    state.with_db(db::list_exclusions)
}

#[tauri::command]
pub fn add_exclusion(state: State<AppState>, exe: String) -> CmdResult<()> {
    state.with_db(|c| db::add_exclusion(c, &exe))?;
    log::info!("exclusion added");
    let _ = state.tx.send(Msg::Reload);
    Ok(())
}

#[tauri::command]
pub fn remove_exclusion(state: State<AppState>, exe: String) -> CmdResult<()> {
    state.with_db(|c| db::remove_exclusion(c, &exe))?;
    log::info!("exclusion removed");
    let _ = state.tx.send(Msg::Reload);
    Ok(())
}

/// Saves settings and propagates them: tracker, tray, autostart and the UI.
pub fn apply_settings(app: &AppHandle, settings: Settings) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let old = state.with_db(db::get_settings).ok();
    state.with_db(|c| db::set_settings(c, &settings))?;
    let _ = state.tx.send(Msg::Reload);
    if let Some(old) = &old {
        let changed = changed_settings(old, &settings);
        if !changed.is_empty() {
            log::info!("settings changed: {}", changed.join(", "));
        }
    }

    let autolaunch = app.autolaunch();
    let enabled = autolaunch.is_enabled().unwrap_or(false);
    if settings.autostart != enabled {
        let result = if settings.autostart { autolaunch.enable() } else { autolaunch.disable() };
        if let Err(e) = result {
            log::warn!("could not change autostart: {e}");
        }
    }

    if settings.show_pet && old.as_ref().is_some_and(|o| !o.show_pet) {
        pet::cancel_snooze(&state.shared);
    }
    state.shared.show_pet.store(settings.show_pet, Ordering::Relaxed);
    pet::sync(app, &state.shared);
    refresh_tray(app, &settings);
    let _ = app.emit("tapomo://settings", ());
    Ok(())
}

/// Names (never values) of the settings that differ.
fn changed_settings(old: &Settings, new: &Settings) -> Vec<&'static str> {
    [
        ("pause_ms", old.pause_ms != new.pause_ms),
        ("language", old.language != new.language),
        ("autostart", old.autostart != new.autostart),
        ("ignore_fullscreen", old.ignore_fullscreen != new.ignore_fullscreen),
        ("paused", old.paused != new.paused),
        ("show_pet", old.show_pet != new.show_pet),
    ]
    .into_iter()
    .filter_map(|(name, changed)| changed.then_some(name))
    .collect()
}

/// Updates the tray labels and the pause checkmark.
pub fn refresh_tray(app: &AppHandle, settings: &Settings) {
    let Some(items) = app.try_state::<TrayItems>() else { return };
    let lang = i18n::resolve(&settings.language);
    let _ = items.open.set_text(i18n::tr(lang, "tray.open"));
    let _ = items.show_pet.set_text(i18n::tr(lang, "tray.show_pet"));
    let _ = items.show_pet.set_checked(settings.show_pet);
    let _ = items.pause.set_text(i18n::tr(lang, "tray.pause"));
    let _ = items.pause.set_checked(settings.paused);
    let _ = items.quit.set_text(i18n::tr(lang, "tray.quit"));
}

/// Tray "pause" toggle.
pub fn toggle_pause(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(mut settings) = state.with_db(db::get_settings) else { return };
    settings.paused = !settings.paused;
    if let Err(e) = apply_settings(app, settings) {
        log::error!("could not toggle pause: {e}");
    }
}

/// Tray "show Tapomo" toggle.
pub fn toggle_show_pet(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(settings) = state.with_db(db::get_settings) else { return };
    set_show_pet(app, !settings.show_pet);
}

/// Turns the floating Tapomo on or off (same as the setting).
pub fn set_show_pet(app: &AppHandle, on: bool) {
    let state = app.state::<AppState>();
    let Ok(mut settings) = state.with_db(db::get_settings) else { return };
    settings.show_pet = on;
    if let Err(e) = apply_settings(app, settings) {
        log::error!("could not change the pet setting: {e}");
    }
}

/// Motivational line for the click bubble: a template key plus its variables.
#[tauri::command]
pub fn get_pet_tip(state: State<AppState>, lang: String) -> CmdResult<Option<crate::pet_tip::PetTip>> {
    let lang = i18n::resolve(&lang);
    state.with_db(|c| crate::pet_tip::next_tip(c, lang))
}

/// Opens the folder holding the log files in the file manager.
#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> CmdResult<()> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| {
        log::error!("could not open the logs folder: {e}");
        e.to_string()
    })
}

/// Flushes the open burst, then exits.
pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (ack_tx, ack_rx) = mpsc::sync_channel(1);
    if state.tx.send(Msg::Shutdown(ack_tx)).is_ok() {
        let _ = ack_rx.recv_timeout(Duration::from_secs(2));
    }
    app.exit(0);
}
