//! The floating Tapomo: a small transparent always-on-top window.
//!
//! It is click-through and never takes focus, except in "move" mode, where the
//! user can drag it to a new place (the position is saved when move mode ends).

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::commands::{AppState, TrayItems};
use crate::tracker::Shared;
use crate::{db, platform};

pub const LABEL: &str = "pet";
/// Logical size of the window.
const WIDTH: f64 = 150.0;
const HEIGHT: f64 = 190.0;
/// Logical gap to the screen edge in the default spot.
const MARGIN: f64 = 16.0;

/// Creates the (still hidden) pet window. Call once from `setup`.
pub fn create(app: &AppHandle, saved: Option<(i32, i32)>) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pet.html".into()))
        .title("Tapomo")
        .inner_size(WIDTH, HEIGHT)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .build()?;

    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        platform::make_noactivate(hwnd.0 as isize);
    }
    let _ = window.set_ignore_cursor_events(true);

    place(app, &window, saved);
    Ok(())
}

/// Moves the window to the saved spot (clamped on-screen) or the default bottom-right corner.
fn place(app: &AppHandle, window: &WebviewWindow, saved: Option<(i32, i32)>) {
    let Ok(size) = window.outer_size() else { return };
    let (w, h) = (size.width as i32, size.height as i32);
    let pos = saved.and_then(|(x, y)| clamp_on_screen(app, x, y, w, h)).unwrap_or_else(|| default_pos(app, window, w, h));
    let _ = window.set_position(PhysicalPosition::new(pos.0, pos.1));
}

/// Keeps a saved position visible if monitors changed; `None` when it is nowhere near a screen.
fn clamp_on_screen(app: &AppHandle, x: i32, y: i32, w: i32, h: i32) -> Option<(i32, i32)> {
    let (cx, cy) = (x + w / 2, y + h / 2);
    let monitors = app.available_monitors().ok()?;
    let m = monitors.iter().find(|m| {
        let (p, s) = (m.position(), m.size());
        cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
    })?;
    let (p, s) = (m.position(), m.size());
    let max_x = (p.x + s.width as i32 - w).max(p.x);
    let max_y = (p.y + s.height as i32 - h).max(p.y);
    Some((x.clamp(p.x, max_x), y.clamp(p.y, max_y)))
}

/// Bottom-right of the primary monitor's work area (above the taskbar).
fn default_pos(app: &AppHandle, window: &WebviewWindow, w: i32, h: i32) -> (i32, i32) {
    let margin = (MARGIN * window.scale_factor().unwrap_or(1.0)).round() as i32;
    let area = platform::primary_work_area().or_else(|| {
        let m = app.primary_monitor().ok().flatten()?;
        let (p, s) = (m.position(), m.size());
        Some((p.x, p.y, p.x + s.width as i32, p.y + s.height as i32))
    });
    match area {
        Some((_, _, right, bottom)) => (right - w - margin, bottom - h - margin),
        None => (margin, margin),
    }
}

/// Shows or hides the window from the `show_pet` setting and the fullscreen flag.
pub fn sync(app: &AppHandle, shared: &Shared) {
    let visible = shared.show_pet.load(Ordering::Relaxed) && !shared.fullscreen.load(Ordering::Relaxed);
    if shared.pet_visible.swap(visible, Ordering::Relaxed) == visible {
        return;
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = if visible { window.show() } else { window.hide() };
    }
    if !visible && shared.pet_move.load(Ordering::Relaxed) {
        set_move_mode(app, false);
    }
}

/// Turns "move" mode on or off. On: the window takes clicks so it can be dragged.
/// Off: the position is saved and the window is click-through again.
pub fn set_move_mode(app: &AppHandle, on: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let on = on && state.shared.pet_visible.load(Ordering::Relaxed);
    state.shared.pet_move.store(on, Ordering::Relaxed);

    if !on {
        if let Ok(p) = window.outer_position() {
            match state.db.lock() {
                Ok(conn) => {
                    if let Err(e) = db::set_pet_pos(&conn, p.x, p.y) {
                        log::error!("could not save pet position: {e}");
                    }
                }
                Err(_) => log::error!("database lock poisoned"),
            }
        }
    }
    let _ = window.set_ignore_cursor_events(!on);
    let _ = app.emit_to(LABEL, "tapomo://pet-move", on);
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.move_pet.set_checked(on);
    }
}
