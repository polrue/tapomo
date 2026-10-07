//! The floating Tapomo: a small transparent always-on-top window.
//!
//! It never takes focus (`WS_EX_NOACTIVATE`) and is click-through everywhere except
//! over Tapomo's body: a 40 ms poll compares the cursor with the body rectangle the page
//! reports and toggles `set_ignore_cursor_events`. The body can then be dragged; the
//! page reports pointer down/move/up and this module moves the window from the cursor.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::commands::{self, AppState};
use crate::i18n;
use tauri::menu::{CheckMenuItem, ContextMenu, Menu, MenuItem};
use crate::tracker::Shared;
use crate::{db, platform};

pub const LABEL: &str = "pet";
/// Logical size of the window.
const WIDTH: f64 = 210.0;
const HEIGHT: f64 = 210.0;
/// Logical gap to the screen edge in the default spot.
const MARGIN: f64 = 16.0;

const POLL: Duration = Duration::from_millis(40);
const POLL_HIDDEN: Duration = Duration::from_millis(250);
/// The cursor position is sent to the page (for the eyes) at most this often.
const CURSOR_EVERY: Duration = Duration::from_millis(50);

/// Body rectangle in physical px relative to the window's top-left, as reported by the page.
#[derive(Clone, Copy, Default)]
struct Hit {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    /// Device pixels per logical (CSS) pixel, to hand the cursor back in CSS px.
    scale: f64,
}

impl Hit {
    fn contains(&self, x: i32, y: i32) -> bool {
        let (x, y) = (f64::from(x), f64::from(y));
        self.w > 0.0 && x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
}

/// Runtime state of the floating window, managed by Tauri.
#[derive(Default)]
pub struct PetRuntime {
    hit: Mutex<Hit>,
    /// Cursor offset inside the window when the drag began (physical px).
    drag: Mutex<Option<(i32, i32)>>,
    hwnd: AtomicIsize,
    /// Mirrors what was last passed to `set_ignore_cursor_events`.
    ignoring: AtomicBool,
    hover: AtomicBool,
}

#[derive(Serialize, Clone, Copy)]
struct CursorPayload {
    x: f64,
    y: f64,
}

/// Creates the (still hidden) pet window and starts the hit-test poll. Call once from `setup`.
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

    let runtime = PetRuntime { ignoring: AtomicBool::new(true), ..Default::default() };
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        platform::make_noactivate(hwnd.0 as isize);
        runtime.hwnd.store(hwnd.0 as isize, Ordering::Relaxed);
    }
    let _ = window.set_ignore_cursor_events(true);
    app.manage(runtime);

    place(app, &window, saved);
    spawn_poll(app.clone());
    log::info!("pet window created");
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
    let show = shared.show_pet.load(Ordering::Relaxed);
    let fullscreen = shared.fullscreen.load(Ordering::Relaxed);
    let snoozed = shared.pet_snoozed.load(Ordering::Relaxed);
    let visible = show && !fullscreen && !snoozed;
    if shared.pet_visible.swap(visible, Ordering::Relaxed) == visible {
        return;
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = if visible { window.show() } else { window.hide() };
    }
    if visible {
        log::info!("pet shown");
    } else {
        let reason = if !show {
            "setting off"
        } else if snoozed {
            "hidden for an hour"
        } else {
            "fullscreen app"
        };
        log::info!("pet hidden ({reason})");
        // A hidden pet must not stay "grabbed".
        if let Some(rt) = app.try_state::<PetRuntime>() {
            *lock(&rt.drag) = None;
            rt.hover.store(false, Ordering::Relaxed);
        }
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ------------------------------------------------------------- hit-testing

fn spawn_poll(app: AppHandle) {
    let spawned = std::thread::Builder::new().name("tapomo-pet".into()).spawn(move || {
        let mut last_cursor = (i32::MIN, i32::MIN);
        let mut last_sent = Instant::now();
        loop {
            let visible = app.try_state::<AppState>().is_some_and(|s| s.shared.pet_visible.load(Ordering::Relaxed));
            if !visible {
                std::thread::sleep(POLL_HIDDEN);
                continue;
            }
            std::thread::sleep(POLL);
            poll_once(&app, &mut last_cursor, &mut last_sent);
        }
    });
    if let Err(e) = spawned {
        log::error!("could not start pet hit-test thread: {e}");
    }
}

fn poll_once(app: &AppHandle, last_cursor: &mut (i32, i32), last_sent: &mut Instant) {
    let Some(rt) = app.try_state::<PetRuntime>() else { return };
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let Some(cur) = platform::cursor_pos() else { return };
    let Some(rect) = platform::window_rect(rt.hwnd.load(Ordering::Relaxed)) else { return };
    let hit = *lock(&rt.hit);
    let rel = (cur.0 - rect.0, cur.1 - rect.1);
    let dragging = lock(&rt.drag).is_some();
    let inside = dragging || hit.contains(rel.0, rel.1);

    // Only touch the window when the answer changes.
    if rt.ignoring.swap(!inside, Ordering::Relaxed) == inside {
        let _ = window.set_ignore_cursor_events(!inside);
    }
    // The page cannot see the pointer while the window is click-through, so hover comes from here.
    if rt.hover.swap(inside, Ordering::Relaxed) != inside {
        let _ = app.emit_to(LABEL, "tapomo://pet-hover", inside);
    }
    if cur != *last_cursor && last_sent.elapsed() >= CURSOR_EVERY {
        *last_cursor = cur;
        *last_sent = Instant::now();
        let scale = if hit.scale > 0.0 { hit.scale } else { 1.0 };
        let payload = CursorPayload { x: f64::from(rel.0) / scale, y: f64::from(rel.1) / scale };
        let _ = app.emit_to(LABEL, "tapomo://cursor", payload);
    }
}

/// The page reports Tapomo's body rectangle (CSS px, relative to the window) and the device pixel ratio.
#[tauri::command]
pub fn pet_set_hit(rt: tauri::State<PetRuntime>, x: f64, y: f64, w: f64, h: f64, dpr: f64) {
    let dpr = if dpr.is_finite() && dpr > 0.0 { dpr } else { 1.0 };
    *lock(&rt.hit) = Hit { x: x * dpr, y: y * dpr, w: w * dpr, h: h * dpr, scale: dpr };
}

// ---------------------------------------------------------------- dragging

#[tauri::command]
pub fn pet_drag_start(app: AppHandle, rt: tauri::State<PetRuntime>) {
    let (Some(cur), Some(rect)) = (platform::cursor_pos(), platform::window_rect(rt.hwnd.load(Ordering::Relaxed))) else {
        return;
    };
    *lock(&rt.drag) = Some((cur.0 - rect.0, cur.1 - rect.1));
    if rt.ignoring.swap(false, Ordering::Relaxed) {
        if let Some(window) = app.get_webview_window(LABEL) {
            let _ = window.set_ignore_cursor_events(false);
        }
    }
}

/// Follows the cursor, keeping Tapomo's body inside the work area of the monitor under it.
#[tauri::command]
pub fn pet_drag_move(app: AppHandle, rt: tauri::State<PetRuntime>) {
    let Some((off_x, off_y)) = *lock(&rt.drag) else { return };
    let Some(cur) = platform::cursor_pos() else { return };
    let Some(rect) = platform::window_rect(rt.hwnd.load(Ordering::Relaxed)) else { return };
    let hit = *lock(&rt.hit);
    let (mut x, mut y) = (cur.0 - off_x, cur.1 - off_y);
    if let Some((l, t, r, b)) = platform::work_area_at(cur.0, cur.1) {
        // Horizontally and at the bottom the body must stay on screen; the top edge keeps
        // the whole window (and so the speech bubble) visible.
        let (hx, hy, hw, hh) = (hit.x as i32, hit.y as i32, hit.w as i32, hit.h as i32);
        x = x.clamp(l - hx, (r - hx - hw).max(l - hx));
        y = y.clamp(t, (b - hy - hh).max(t));
    }
    if (x, y) != (rect.0, rect.1) {
        if let Some(window) = app.get_webview_window(LABEL) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    }
}

/// Ends the drag and remembers where Tapomo was left.
#[tauri::command]
pub fn pet_drag_end(rt: tauri::State<PetRuntime>, state: tauri::State<AppState>) {
    if lock(&rt.drag).take().is_none() {
        return;
    }
    let Some(rect) = platform::window_rect(rt.hwnd.load(Ordering::Relaxed)) else { return };
    match state.db.lock() {
        Ok(conn) => {
            if let Err(e) = db::set_pet_pos(&conn, rect.0, rect.1) {
                log::error!("could not save pet position: {e}");
            }
        }
        Err(_) => log::error!("database lock poisoned"),
    }
}

// ------------------------------------------------------------ mouse actions

/// Double-click: open or focus the main window.
#[tauri::command]
pub fn pet_open_main(app: AppHandle) {
    crate::show_main(&app);
}

/// How many times the hover hint has been shown; it is shown the first 3 times only.
const HINT_TIMES: u32 = 3;

/// `true` (and counted) while the hover hint still has to be shown.
#[tauri::command]
pub fn pet_hint(state: tauri::State<AppState>) -> bool {
    let Ok(conn) = state.db.lock() else { return false };
    let shown: u32 = db::get_raw(&conn, "pet_hint_count").ok().flatten().and_then(|v| v.parse().ok()).unwrap_or(0);
    if shown >= HINT_TIMES {
        return false;
    }
    let _ = db::set_raw(&conn, "pet_hint_count", &(shown + 1).to_string());
    true
}

/// Right-click: native context menu on the pet window.
#[tauri::command]
pub fn pet_menu(app: AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    let settings = state.db.lock().map_err(|_| "database lock poisoned".to_string()).and_then(|c| db::get_settings(&c).map_err(|e| e.to_string()))?;
    let lang = i18n::resolve(&settings.language);
    let tr = |k: &str| i18n::tr(lang, k);
    let open = MenuItem::with_id(&app, "pet_open", tr("pet.menu.open"), true, None::<&str>).map_err(|e| e.to_string())?;
    let say = MenuItem::with_id(&app, "pet_say", tr("pet.menu.say"), true, None::<&str>).map_err(|e| e.to_string())?;
    let hour = MenuItem::with_id(&app, "pet_hide_hour", tr("pet.menu.hide_hour"), true, None::<&str>).map_err(|e| e.to_string())?;
    let hide = MenuItem::with_id(&app, "pet_hide", tr("pet.menu.hide"), true, None::<&str>).map_err(|e| e.to_string())?;
    let pause = CheckMenuItem::with_id(&app, "pet_pause", tr("pet.menu.pause"), true, settings.paused, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(&app, &[&open, &say, &hour, &hide, &pause]).map_err(|e| e.to_string())?;
    let window = app.get_webview_window(LABEL).ok_or("pet window missing")?.as_ref().window();
    menu.popup(window).map_err(|e| e.to_string())
}

/// Handles the pet menu entries (ids start with `pet_`).
pub fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        "pet_open" => crate::show_main(app),
        "pet_say" => {
            let _ = app.emit_to(LABEL, "tapomo://pet-say", ());
        }
        "pet_hide_hour" => snooze(app, Duration::from_secs(3600)),
        "pet_hide" => commands::set_show_pet(app, false),
        "pet_pause" => commands::toggle_pause(app),
        _ => {}
    }
}

/// Hides the pet for `dur` (kept in memory only: a restart brings it back).
fn snooze(app: &AppHandle, dur: Duration) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let gen = state.shared.snooze_gen.fetch_add(1, Ordering::Relaxed) + 1;
    state.shared.pet_snoozed.store(true, Ordering::Relaxed);
    sync(app, &state.shared);
    let app = app.clone();
    let _ = std::thread::Builder::new().name("tapomo-snooze".into()).spawn(move || {
        std::thread::sleep(dur);
        let Some(state) = app.try_state::<AppState>() else { return };
        if state.shared.snooze_gen.load(Ordering::Relaxed) == gen {
            state.shared.pet_snoozed.store(false, Ordering::Relaxed);
            sync(&app, &state.shared);
        }
    });
}

/// Cancels a running snooze (the user turned Tapomo on again by hand).
pub fn cancel_snooze(shared: &Shared) {
    shared.snooze_gen.fetch_add(1, Ordering::Relaxed);
    shared.pet_snoozed.store(false, Ordering::Relaxed);
}
