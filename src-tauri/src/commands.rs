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
use crate::i18n;
use crate::tracker::{Msg, Shared};

/// Tray menu entries, kept so their labels can follow the language setting.
pub struct TrayItems {
    pub open: MenuItem<tauri::Wry>,
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
    let _ = state.tx.send(Msg::Reload);
    Ok(())
}

#[tauri::command]
pub fn remove_exclusion(state: State<AppState>, exe: String) -> CmdResult<()> {
    state.with_db(|c| db::remove_exclusion(c, &exe))?;
    let _ = state.tx.send(Msg::Reload);
    Ok(())
}

/// Saves settings and propagates them: tracker, tray, autostart and the UI.
pub fn apply_settings(app: &AppHandle, settings: Settings) -> CmdResult<()> {
    let state = app.state::<AppState>();
    state.with_db(|c| db::set_settings(c, &settings))?;
    let _ = state.tx.send(Msg::Reload);

    let autolaunch = app.autolaunch();
    let enabled = autolaunch.is_enabled().unwrap_or(false);
    if settings.autostart != enabled {
        let result = if settings.autostart { autolaunch.enable() } else { autolaunch.disable() };
        if let Err(e) = result {
            log::warn!("could not change autostart: {e}");
        }
    }

    refresh_tray(app, &settings);
    let _ = app.emit("tapomo://settings", ());
    Ok(())
}

/// Updates the tray labels and the pause checkmark.
pub fn refresh_tray(app: &AppHandle, settings: &Settings) {
    let Some(items) = app.try_state::<TrayItems>() else { return };
    let lang = i18n::resolve(&settings.language);
    let _ = items.open.set_text(i18n::tr(lang, "tray.open"));
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

/// Flushes the open burst, then exits.
pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (ack_tx, ack_rx) = mpsc::sync_channel(1);
    if state.tx.send(Msg::Shutdown(ack_tx)).is_ok() {
        let _ = ack_rx.recv_timeout(Duration::from_secs(2));
    }
    app.exit(0);
}
