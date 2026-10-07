//! Worker thread: turns raw keystrokes into stored bursts.
//!
//! Everything slow (process lookup, SQLite, fullscreen query) happens here so
//! the keyboard hook stays instant.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use tapomo_core::{Burst, Config, Engine, KeyClass, KeyEvent};
use tauri::{AppHandle, Emitter};

use crate::hook::RawKey;
use crate::{db, platform};

const TICK: Duration = Duration::from_millis(500);
const FULLSCREEN_CHECK: Duration = Duration::from_secs(2);
const EXE_CACHE_TTL: Duration = Duration::from_secs(30);

/// Messages for the worker thread.
pub enum Msg {
    Key(RawKey),
    /// Settings or exclusions changed in the database: re-read them.
    Reload,
    /// A key was dropped because a password field has focus: close the open burst.
    PasswordFocus,
    /// Flush the open burst, save and stop. The sender is acknowledged when done.
    Shutdown(SyncSender<()>),
}

/// State shared with the UI side.
#[derive(Default)]
pub struct Shared {
    pub streak: AtomicU32,
    /// Key animation events are only emitted while the window is on screen.
    pub window_visible: AtomicBool,
}

pub fn spawn(app: AppHandle, db_path: PathBuf, rx: Receiver<Msg>, shared: Arc<Shared>) {
    let spawned = std::thread::Builder::new().name("tapomo-tracker".into()).spawn(move || {
        let conn = match db::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                log::error!("tracker could not open the database: {e}");
                return;
            }
        };
        Tracker::new(app, conn, shared).run(rx);
    });
    if let Err(e) = spawned {
        log::error!("could not start tracker thread: {e}");
    }
}

struct Tracker {
    app: AppHandle,
    conn: Connection,
    shared: Arc<Shared>,
    engine: Engine,
    paused: bool,
    ignore_fullscreen: bool,
    excluded: HashSet<String>,
    app_ids: HashMap<String, u32>,
    exe_cache: HashMap<isize, (String, Instant)>,
    fullscreen: (Instant, bool),
    saved_best: u32,
    /// All-time record when the current streak began; crossing it fires `tapomo://record`.
    record_baseline: u32,
}

impl Tracker {
    fn new(app: AppHandle, conn: Connection, shared: Arc<Shared>) -> Self {
        let mut engine = Engine::new(Config::default());
        let saved_best = db::best_streak(&conn).unwrap_or(0);
        engine.set_best_streak_ever(saved_best);
        let mut t = Self {
            app,
            conn,
            shared,
            engine,
            paused: false,
            ignore_fullscreen: true,
            excluded: HashSet::new(),
            app_ids: HashMap::new(),
            exe_cache: HashMap::new(),
            fullscreen: (Instant::now() - FULLSCREEN_CHECK, false),
            saved_best,
            record_baseline: saved_best,
        };
        t.reload();
        t
    }

    fn run(mut self, rx: Receiver<Msg>) {
        let mut next_tick = Instant::now() + TICK;
        loop {
            match rx.recv_timeout(next_tick.saturating_duration_since(Instant::now())) {
                Ok(Msg::Key(key)) => self.on_key(key),
                Ok(Msg::Reload) => self.reload(),
                Ok(Msg::PasswordFocus) => {
                    let burst = self.engine.flush();
                    self.finish_burst(burst);
                }
                Ok(Msg::Shutdown(ack)) => {
                    let burst = self.engine.flush();
                    self.finish_burst(burst);
                    self.persist_best();
                    let _ = ack.send(());
                    return;
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if Instant::now() >= next_tick {
                next_tick = Instant::now() + TICK;
                let burst = self.engine.tick(now_ms());
                self.finish_burst(burst);
                self.shared.streak.store(self.engine.current_streak(), Ordering::Relaxed);
            }
        }
    }

    fn reload(&mut self) {
        match db::get_settings(&self.conn) {
            Ok(s) => {
                let was_paused = self.paused;
                self.paused = s.paused;
                self.ignore_fullscreen = s.ignore_fullscreen;
                let flushed = if self.paused && !was_paused { self.engine.flush() } else { None };
                self.engine.set_config(Config::default().with_pause_ms(s.pause_ms));
                self.finish_burst(flushed);
            }
            Err(e) => log::error!("could not read settings: {e}"),
        }
        match db::list_exclusions(&self.conn) {
            Ok(list) => self.excluded = list.into_iter().map(|e| e.to_lowercase()).collect(),
            Err(e) => log::error!("could not read exclusions: {e}"),
        }
    }

    fn on_key(&mut self, key: RawKey) {
        if self.paused || key.class == KeyClass::Ignored {
            return;
        }
        if self.ignore_fullscreen && self.fullscreen_busy() {
            return;
        }
        let Some(exe) = self.exe_for(key.hwnd) else { return };
        if self.excluded.contains(&exe.to_lowercase()) {
            return;
        }
        let Some(app_id) = self.app_id(&exe) else { return };

        if self.shared.window_visible.load(Ordering::Relaxed) {
            let _ = self.app.emit("tapomo://key", class_name(key.class));
        }

        if self.engine.current_streak() == 0 {
            self.record_baseline = self.engine.best_streak_ever();
        }
        let burst = self.engine.push(KeyEvent { t_ms: key.t_ms, class: key.class, app_id });
        let streak = self.engine.current_streak();
        self.shared.streak.store(streak, Ordering::Relaxed);
        if self.record_baseline > 0 && streak == self.record_baseline + 1 {
            let _ = self.app.emit("tapomo://record", ());
        }
        self.finish_burst(burst);
    }

    fn finish_burst(&mut self, burst: Option<Burst>) {
        let Some(burst) = burst else { return };
        if let Err(e) = db::insert_burst(&self.conn, &burst) {
            log::error!("could not save burst: {e}");
            return;
        }
        self.persist_best();
        let _ = self.app.emit("tapomo://burst", ());
    }

    fn persist_best(&mut self) {
        let best = self.engine.best_streak_ever();
        if best > self.saved_best {
            match db::save_best_streak(&self.conn, best) {
                Ok(()) => self.saved_best = best,
                Err(e) => log::error!("could not save best streak: {e}"),
            }
        }
    }

    fn app_id(&mut self, exe: &str) -> Option<u32> {
        if let Some(id) = self.app_ids.get(exe) {
            return Some(*id);
        }
        match db::intern_app(&self.conn, exe) {
            Ok(id) => {
                self.app_ids.insert(exe.to_string(), id);
                Some(id)
            }
            Err(e) => {
                log::error!("could not register app: {e}");
                None
            }
        }
    }

    /// Foreground executable name, cached per window for a short while
    /// (window handles get reused by other processes eventually).
    fn exe_for(&mut self, hwnd: isize) -> Option<String> {
        if let Some((exe, at)) = self.exe_cache.get(&hwnd) {
            if at.elapsed() < EXE_CACHE_TTL {
                return Some(exe.clone());
            }
        }
        let exe = platform::exe_name(hwnd)?;
        if self.exe_cache.len() > 256 {
            self.exe_cache.clear();
        }
        self.exe_cache.insert(hwnd, (exe.clone(), Instant::now()));
        Some(exe)
    }

    fn fullscreen_busy(&mut self) -> bool {
        if self.fullscreen.0.elapsed() >= FULLSCREEN_CHECK {
            self.fullscreen = (Instant::now(), platform::fullscreen_busy());
        }
        self.fullscreen.1
    }
}

/// Class name for the mascot animation: never the key itself.
fn class_name(class: KeyClass) -> &'static str {
    match class {
        KeyClass::Char => "char",
        KeyClass::Space => "space",
        KeyClass::Enter => "enter",
        KeyClass::Backspace | KeyClass::WordDelete => "delete",
        KeyClass::Ignored => "ignored",
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
