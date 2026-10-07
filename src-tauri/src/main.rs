#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod hook;
mod i18n;
mod platform;
mod tracker;

use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use commands::{AppState, TrayItems};
use tracker::Shared;

fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if let Some(state) = app.try_state::<AppState>() {
        state.shared.window_visible.store(true, Ordering::Relaxed);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![
            commands::get_summary,
            commands::get_heatmap,
            commands::get_apps,
            commands::set_alias,
            commands::get_settings,
            commands::set_settings,
            commands::list_exclusions,
            commands::add_exclusion,
            commands::remove_exclusion,
        ])
        .on_window_event(|window, event| {
            // Closing only hides: the app keeps measuring from the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    state.shared.window_visible.store(false, Ordering::Relaxed);
                }
            }
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("tapomo.db");
            let conn = db::open(&db_path)?;
            let settings = db::get_settings(&conn)?;

            // Autostart defaults to ON, but only the installed app should register itself.
            if !cfg!(debug_assertions) && settings.autostart && !app.autolaunch().is_enabled().unwrap_or(false) {
                if let Err(e) = app.autolaunch().enable() {
                    log::warn!("could not enable autostart: {e}");
                }
            }

            let (tx, rx) = mpsc::channel();
            let shared = Arc::new(Shared::default());
            tracker::spawn(app.handle().clone(), db_path, rx, shared.clone());
            hook::start(tx.clone());
            app.manage(AppState { db: Mutex::new(conn), tx, shared });

            let lang = i18n::resolve(&settings.language);
            let open = MenuItem::with_id(app, "open", i18n::tr(lang, "tray.open"), true, None::<&str>)?;
            let pause = CheckMenuItem::with_id(app, "pause", i18n::tr(lang, "tray.pause"), true, settings.paused, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", i18n::tr(lang, "tray.quit"), true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &quit])?;
            app.manage(TrayItems { open, pause, quit });

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Tapomo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "pause" => commands::toggle_pause(app),
                    "quit" => commands::quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("error while running Tapomo: {e}"));
}
