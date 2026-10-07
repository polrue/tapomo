#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod hook;
mod i18n;
mod password;
mod pet;
mod pet_tip;
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

pub(crate) fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if let Some(state) = app.try_state::<AppState>() {
        state.shared.window_visible.store(true, Ordering::Relaxed);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Rotating log file in the app log dir (about 1 MB each, the current one plus one older).
/// Nothing that identifies a key is ever logged; see the `log::` calls.
fn log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    let level = if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info };
    let mut targets = vec![Target::new(TargetKind::LogDir { file_name: Some("tapomo".into()) })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    tauri_plugin_log::Builder::new()
        .targets(targets)
        .level(level)
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepSome(2))
        .build()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(log_plugin())
        .plugin(tauri_plugin_opener::init())
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
            commands::open_logs_dir,
            commands::get_pet_tip,
            pet::pet_set_hit,
            pet::pet_drag_start,
            pet::pet_drag_move,
            pet::pet_drag_end,
            pet::pet_open_main,
            pet::pet_hint,
            pet::pet_menu,
        ])
        .on_menu_event(|app, event| {
            if let Some(id) = event.id().as_ref().strip_prefix("pet_") {
                pet::on_menu_event(app, &format!("pet_{id}"));
            }
        })
        .on_window_event(|window, event| {
            // Closing only hides: the app keeps measuring from the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() != "main" {
                    return;
                }
                let _ = window.hide();
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    state.shared.window_visible.store(false, Ordering::Relaxed);
                }
            }
        })
        .setup(|app| {
            log::info!("Tapomo {} starting", app.package_info().version);
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("tapomo.db");
            log::info!("database: {}", db_path.display());
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
            password::start();
            shared.show_pet.store(settings.show_pet, Ordering::Relaxed);
            let pet_pos = db::get_pet_pos(&conn).ok().flatten();
            app.manage(AppState { db: Mutex::new(conn), tx, shared: shared.clone() });
            // After `manage`: the pet page asks for the settings as soon as it loads.
            pet::create(app.handle(), pet_pos)?;
            pet::sync(app.handle(), &shared);

            let lang = i18n::resolve(&settings.language);
            let open = MenuItem::with_id(app, "open", i18n::tr(lang, "tray.open"), true, None::<&str>)?;
            let show_pet = CheckMenuItem::with_id(app, "show_pet", i18n::tr(lang, "tray.show_pet"), true, settings.show_pet, None::<&str>)?;
            let pause = CheckMenuItem::with_id(app, "pause", i18n::tr(lang, "tray.pause"), true, settings.paused, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", i18n::tr(lang, "tray.quit"), true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &show_pet, &pause, &quit])?;
            app.manage(TrayItems { open, show_pet, pause, quit });

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Tapomo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "pause" => commands::toggle_pause(app),
                    "show_pet" => commands::toggle_show_pet(app),
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

            // Autostart launches with --minimized and stays in the tray; opening
            // Tapomo by hand (Start menu, installer) shows the window.
            if !std::env::args().any(|a| a == "--minimized") {
                show_main(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("error while running Tapomo: {e}"));
}
