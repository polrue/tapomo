//! Worker thread: turns raw keystrokes into stored bursts.
//!
//! Everything slow (process lookup, SQLite, fullscreen query) happens here so
//! the keyboard hook stays instant.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use tapomo_core::{personal_reference, Burst, Config, Engine, KeyClass, KeyEvent, Zone, REFERENCE_MIN_PEAKS};
use tauri::{AppHandle, Emitter};

use crate::hook::RawKey;
use crate::{badges, db, pet, platform, shortcuts, xp};

/// Worker tick: closes finished bursts and drives the live bar.
const TICK: Duration = Duration::from_millis(250);
const FULLSCREEN_CHECK: Duration = Duration::from_millis(500);
const EXE_CACHE_TTL: Duration = Duration::from_secs(30);
/// How often counted shortcuts are turned into XP.
const SHORTCUT_SETTLE: Duration = Duration::from_secs(30);

/// Messages for the worker thread.
pub enum Msg {
    Key(RawKey),
    /// Settings or exclusions changed in the database: re-read them.
    Reload,
    /// A key was dropped because a password field has focus: close the open burst.
    PasswordFocus,
    /// XP changed outside the tracker (a lesson): re-read the total so no level-up is announced twice.
    XpRefresh,
    /// A shortcut of this kind was used in the window with this handle (the key itself is never sent).
    Shortcut(tapomo_core::shortcuts::ShortcutKind, Option<u32>, isize),
    /// Flush the open burst, save and stop. The sender is acknowledged when done.
    Shutdown(SyncSender<()>),
}

/// State shared with the UI side.
#[derive(Default)]
pub struct Shared {
    pub streak: AtomicU32,
    /// Key and live events are only emitted while the main window or the pet is on screen.
    pub window_visible: AtomicBool,
    /// The floating Tapomo is currently on screen.
    pub pet_visible: AtomicBool,
    /// Setting `show_pet`.
    pub show_pet: AtomicBool,
    /// A fullscreen game or presentation hides the pet.
    pub fullscreen: AtomicBool,
    /// "Hide for 1 hour" from the pet's menu is active (not persisted).
    pub pet_snoozed: AtomicBool,
    /// Bumped whenever a snooze starts or is cancelled, so an old timer can tell it is stale.
    pub snooze_gen: AtomicU32,
    /// When the running snooze ends, in ms since the Unix epoch (0 = none).
    pub snooze_until_ms: AtomicU64,
    /// Length of the burst being typed (0 when none): it counts towards today's goal before it is stored.
    pub open_burst_ms: AtomicU64,
    /// When the last key of any kind arrived, in ms since the Unix epoch (0 = none yet). Only a
    /// time: the updater uses it to install while nobody is typing.
    pub last_key_ms: AtomicU64,
}

impl Shared {
    fn ui_visible(&self) -> bool {
        self.window_visible.load(Ordering::Relaxed) || self.pet_visible.load(Ordering::Relaxed)
    }
}

/// Payload of `tapomo://goal`: today's goal has just been reached.
#[derive(Serialize, Clone)]
struct GoalReached {
    goal_min: u32,
    today_ms: u64,
}

/// Payload of `tapomo://xp`: XP changed. `level > prev_level` is a level-up.
#[derive(Serialize, Clone)]
struct XpChanged {
    xp: u64,
    level: u32,
    prev_level: u32,
    /// Challenges of the day completed just now.
    challenges: Vec<&'static str>,
    /// Badges earned just now.
    badges: Vec<&'static str>,
}

/// Payload of `tapomo://live`. `wpm` is `null` when no burst is open (or it is too young).
#[derive(Serialize, Clone)]
struct Live {
    wpm: Option<f64>,
    reference: Option<f64>,
    percent: Option<f64>,
    zone: Option<&'static str>,
    /// All-time best 10 s peak as a percentage of the reference.
    record_percent: Option<f64>,
    calibrating: Option<Calibrating>,
    streak: Streak,
}

#[derive(Serialize, Clone)]
struct Calibrating {
    have: usize,
    need: usize,
}

#[derive(Serialize, Clone)]
struct Streak {
    current: u32,
    best: u32,
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
    /// Personal 100 % of the live bar, and how many peaks it was built from.
    reference: Option<f64>,
    peak_count: usize,
    max_peak: Option<f64>,
    /// Time of the last accepted key of the open burst; `None` once it is closed.
    last_key_ms: Option<u64>,
    live_active: bool,
    /// Daily goal in ms (0 = off) and the stored active time of `goal_day`.
    goal_ms: u64,
    goal_day: i64,
    goal_stored_ms: u64,
    /// Local day for which `tapomo://goal` has fired (or the goal was already met), so it fires once.
    goal_fired_day: Option<i64>,
    goal_refreshed: Instant,
    /// Total XP after the last settle.
    xp_total: u64,
    /// Setting `count_shortcuts`.
    count_shortcuts: bool,
    /// Shortcuts counted since the last XP settle, and when that was.
    shortcuts_pending: bool,
    last_settle: Instant,
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
            reference: None,
            peak_count: 0,
            max_peak: None,
            last_key_ms: None,
            live_active: false,
            goal_ms: 0,
            goal_day: 0,
            goal_stored_ms: 0,
            goal_fired_day: None,
            goal_refreshed: Instant::now(),
            xp_total: 0,
            count_shortcuts: true,
            shortcuts_pending: false,
            last_settle: Instant::now(),
        };
        // Converts the history the first time and catches up on days the app was closed. Silent: the
        // main window reveals any level reached meanwhile.
        match xp::settle(&t.conn) {
            Ok(s) => t.xp_total = s.total,
            Err(e) => log::error!("could not settle XP: {e}"),
        }
        // Badges the history already earned (or earned while closed); their XP joins the total.
        match badges::check(&t.conn).and_then(|_| xp::total(&t.conn)) {
            Ok(total) => t.xp_total = total,
            Err(e) => log::error!("could not check badges: {e}"),
        }
        t.refresh_reference();
        t.reload();
        t
    }

    fn run(mut self, rx: Receiver<Msg>) {
        let mut next_tick = Instant::now() + TICK;
        loop {
            match rx.recv_timeout(next_tick.saturating_duration_since(Instant::now())) {
                Ok(Msg::Key(key)) => {
                    self.shared.last_key_ms.store(key.t_ms, Ordering::Relaxed);
                    self.on_key(key);
                }
                Ok(Msg::Reload) => self.reload(),
                Ok(Msg::Shortcut(kind, combo, hwnd)) => self.on_shortcut(kind, combo, hwnd),
                Ok(Msg::XpRefresh) => {
                    if let Ok(total) = xp::total(&self.conn) {
                        self.xp_total = total;
                    }
                    // A lesson may have added goal time: re-read it without re-arming the event, so
                    // reaching the goal with a lesson is celebrated like reaching it typing.
                    if let Ok(ms) = db::today_active_ms(&self.conn) {
                        self.goal_stored_ms = ms;
                    }
                    self.sync_goal();
                    // The goal (and challenges) may now give XP too.
                    self.settle_xp();
                }
                Ok(Msg::PasswordFocus) => {
                    self.shared.last_key_ms.store(now_ms(), Ordering::Relaxed);
                    self.last_key_ms = None;
                    let burst = self.engine.flush();
                    self.finish_burst(burst);
                    self.sync_goal();
                }
                Ok(Msg::Shutdown(ack)) => {
                    self.last_key_ms = None;
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
                let now = now_ms();
                let burst = self.engine.tick(now);
                if burst.is_some() {
                    self.last_key_ms = None;
                }
                self.finish_burst(burst);
                self.sync_goal();
                self.shared.streak.store(self.engine.current_streak(), Ordering::Relaxed);
                self.emit_live(now);
                self.watch_fullscreen();
                // Shortcut XP is folded in now and then, not on every Ctrl+C.
                if self.shortcuts_pending && self.last_settle.elapsed() >= SHORTCUT_SETTLE {
                    self.settle_xp();
                }
            }
        }
    }

    fn reload(&mut self) {
        match db::get_settings(&self.conn) {
            Ok(s) => {
                let was_paused = self.paused;
                self.paused = s.paused;
                self.ignore_fullscreen = s.ignore_fullscreen;
                self.count_shortcuts = s.count_shortcuts;
                let flushed = if self.paused && !was_paused { self.last_key_ms = None; self.engine.flush() } else { None };
                self.engine.set_config(Config::default().with_pause_ms(s.pause_ms));
                self.finish_burst(flushed);
            }
            Err(e) => log::error!("could not read settings: {e}"),
        }
        match db::list_exclusions(&self.conn) {
            Ok(list) => self.excluded = list.into_iter().map(|e| e.to_lowercase()).collect(),
            Err(e) => log::error!("could not read exclusions: {e}"),
        }
        self.refresh_goal();
        self.sync_goal();
    }

    fn on_key(&mut self, key: RawKey) {
        if self.paused || key.class == KeyClass::Ignored {
            return;
        }
        if self.ignore_fullscreen && self.fullscreen_busy() {
            return;
        }
        let Some(exe) = self.exe_for(key.hwnd) else { return };
        if self.excluded.contains(&exe.to_lowercase()) || is_own_exe(&exe) {
            return;
        }
        let Some(app_id) = self.app_id(&exe) else { return };

        if self.shared.ui_visible() {
            let _ = self.app.emit("tapomo://key", class_name(key.class));
        }
        self.last_key_ms = Some(key.t_ms);

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
        self.sync_goal();
    }

    /// Counts a shortcut under the same rules as typing: not while paused, in a fullscreen game or in an
    /// excluded app. Only its kind is stored, as a daily count.
    fn on_shortcut(&mut self, kind: tapomo_core::shortcuts::ShortcutKind, combo: Option<u32>, hwnd: isize) {
        if self.paused || !self.count_shortcuts || (self.ignore_fullscreen && self.fullscreen_busy()) {
            return;
        }
        let Some(exe) = self.exe_for(hwnd) else { return };
        if self.excluded.contains(&exe.to_lowercase()) || is_own_exe(&exe) {
            return;
        }
        if let Err(e) = shortcuts::add(&self.conn, kind) {
            log::error!("could not count a shortcut: {e}");
            return;
        }
        self.shortcuts_pending = true;
        if self.shared.ui_visible() {
            let _ = self.app.emit("tapomo://shortcut", kind.id());
        }
        // Phase B: a catalogue shortcut moves up its own level (once a day).
        for id in combo.map(|c| crate::catalog::resolve(c, &exe)).unwrap_or_default() {
            match crate::catalog::record_use(&self.conn, id) {
                Ok(Some(used)) if used.tip_learnt || (used.level_up && used.level == 4) => {
                    let _ = self.app.emit("tapomo://shortcut-learnt", used);
                }
                Ok(_) => {}
                Err(e) => log::error!("could not record a shortcut level: {e}"),
            }
        }
    }

    fn finish_burst(&mut self, burst: Option<Burst>) {
        let Some(burst) = burst else { return };
        if let Err(e) = db::insert_burst(&self.conn, &burst) {
            log::error!("could not save burst: {e}");
            return;
        }
        // Records against the values from before this burst (the first peak or run is not a record).
        let peak_record = burst.peak_wpm.zip(self.max_peak).is_some_and(|(p, max)| p > max);
        let streak_record = self.saved_best > 0 && burst.best_streak > self.saved_best;
        if burst.peak_wpm.zip(self.reference).is_some_and(|(p, r)| p >= r * badges::BEATING_SHARE) {
            if let Err(e) = badges::add_beating_burst(&self.conn) {
                log::error!("could not count the beating burst: {e}");
            }
        }
        self.persist_best();
        self.refresh_reference();
        self.goal_stored_ms += burst.duration_ms();
        let _ = self.app.emit("tapomo://burst", ());
        if peak_record || streak_record {
            if let Err(e) = xp::add_record(&self.conn) {
                log::error!("could not save record XP: {e}");
            }
        }
        self.settle_xp();
    }

    /// Updates the XP ledger and tells the windows when it changed.
    fn settle_xp(&mut self) {
        self.shortcuts_pending = false;
        self.last_settle = Instant::now();
        let mut settled = match xp::settle(&self.conn) {
            Ok(s) => s,
            Err(e) => {
                log::error!("could not settle XP: {e}");
                return;
            }
        };
        let new_badges = match badges::check(&self.conn) {
            Ok(b) => b,
            Err(e) => {
                log::error!("could not check badges: {e}");
                Vec::new()
            }
        };
        if !new_badges.is_empty() {
            settled.total = xp::total(&self.conn).unwrap_or(settled.total);
        }
        if settled.total == self.xp_total && settled.new_challenges.is_empty() && new_badges.is_empty() {
            return;
        }
        let prev_level = tapomo_core::xp::level_for_xp(self.xp_total);
        self.xp_total = settled.total;
        let payload = XpChanged {
            xp: settled.total,
            level: tapomo_core::xp::level_for_xp(settled.total),
            prev_level,
            challenges: settled.new_challenges,
            badges: new_badges,
        };
        if payload.level > prev_level {
            log::info!("level up: {} -> {}", prev_level, payload.level);
        }
        let _ = self.app.emit("tapomo://xp", payload);
    }

    /// Re-reads the goal setting and the stored active time of today. A goal that is already met
    /// (before a restart, or after lowering the goal) is marked as fired without a celebration;
    /// raising it above today's time re-arms the event.
    fn refresh_goal(&mut self) {
        self.goal_refreshed = Instant::now();
        let read = || -> rusqlite::Result<(u64, i64, u64)> {
            let goal_ms = u64::from(db::get_settings(&self.conn)?.daily_goal_min) * 60_000;
            Ok((goal_ms, db::today_day(&self.conn)?, db::today_active_ms(&self.conn)?))
        };
        match read() {
            Ok((goal_ms, day, stored)) => {
                (self.goal_ms, self.goal_day, self.goal_stored_ms) = (goal_ms, day, stored);
                self.goal_fired_day = (goal_ms > 0 && stored + self.engine.open_burst_ms() >= goal_ms).then_some(day);
            }
            Err(e) => log::error!("could not read the daily goal: {e}"),
        }
    }

    /// Publishes the open burst's length and fires `tapomo://goal` the moment today's goal is reached.
    fn sync_goal(&mut self) {
        let open = self.engine.open_burst_ms();
        self.shared.open_burst_ms.store(open, Ordering::Relaxed);
        if self.goal_ms == 0 {
            return;
        }
        // The day rolls over (or the clock moved): start from the stored time of the new day. Checked once a minute.
        if self.goal_refreshed.elapsed() >= Duration::from_secs(60) {
            let day = db::today_day(&self.conn).unwrap_or(self.goal_day);
            if day != self.goal_day {
                self.refresh_goal();
            } else {
                self.goal_refreshed = Instant::now();
            }
        }
        if self.goal_fired_day == Some(self.goal_day) || self.goal_stored_ms + open < self.goal_ms {
            return;
        }
        self.goal_fired_day = Some(self.goal_day);
        let _ = self.app.emit("tapomo://goal", GoalReached { goal_min: (self.goal_ms / 60_000) as u32, today_ms: self.goal_stored_ms + open });
    }

    /// Rebuilds the personal 100 % from the stored peaks (cheap: a few thousand rows at most).
    fn refresh_reference(&mut self) {
        match db::peak_data(&self.conn) {
            Ok((peaks, max)) => {
                self.peak_count = peaks.len();
                self.reference = personal_reference(&peaks);
                self.max_peak = max;
            }
            Err(e) => log::error!("could not read peaks: {e}"),
        }
    }

    /// `tapomo://live` every tick while a burst is open, plus one empty payload when it closes.
    fn emit_live(&mut self, now: u64) {
        let pause_ms = self.engine.config().pause_ms;
        let active = self.last_key_ms.is_some_and(|t| now.saturating_sub(t) <= pause_ms);
        let was_active = std::mem::replace(&mut self.live_active, active);
        if (!active && !was_active) || !self.shared.ui_visible() {
            return;
        }
        let wpm = if active { self.engine.live_wpm(now) } else { None };
        let percent = wpm.zip(self.reference).map(|(w, r)| w / r * 100.0);
        let payload = Live {
            wpm,
            reference: self.reference,
            percent,
            zone: percent.map(|p| Zone::of(p).id()),
            record_percent: self.max_peak.zip(self.reference).map(|(m, r)| m / r * 100.0),
            calibrating: self
                .reference
                .is_none()
                .then_some(Calibrating { have: self.peak_count, need: REFERENCE_MIN_PEAKS }),
            streak: Streak { current: self.engine.current_streak(), best: self.engine.best_streak_ever() },
        };
        let _ = self.app.emit("tapomo://live", payload);
    }

    /// Hides the floating Tapomo while a fullscreen game or presentation runs.
    fn watch_fullscreen(&mut self) {
        if !self.shared.show_pet.load(Ordering::Relaxed) {
            return;
        }
        let busy = self.fullscreen_busy();
        if busy != self.shared.fullscreen.swap(busy, Ordering::Relaxed) {
            pet::sync(&self.app, &self.shared);
        }
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

/// Tapomo's own windows (settings fields, lessons) are never measured: lesson typing has its own stats.
fn is_own_exe(exe: &str) -> bool {
    static OWN: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    OWN.get_or_init(|| std::env::current_exe().ok()?.file_name()?.to_str().map(str::to_lowercase))
        .as_deref()
        .is_some_and(|own| own == exe.to_lowercase())
}

/// Class name for the mascot animation: never the key itself.
fn class_name(class: KeyClass) -> &'static str {
    match class {
        KeyClass::Char => "char",
        KeyClass::Space => "space",
        KeyClass::Enter => "enter",
        KeyClass::Backspace => "delete",
        KeyClass::WordDelete => "word_delete",
        KeyClass::Ignored => "ignored",
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
