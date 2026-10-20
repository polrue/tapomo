//! All SQLite access. Only counts, durations and executable names are stored.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tapomo_core::Burst;

const DEFAULT_EXCLUSIONS: [&str; 4] = ["KeePass.exe", "KeePassXC.exe", "1Password.exe", "Bitwarden.exe"];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    // An encrypted database is unlocked first; a key that can't be read leaves it locked and the
    // migration below fails with a clear error instead of touching the file.
    match crate::keystore::load(path) {
        Ok(Some(key)) => crate::keystore::unlock(&conn, &key)?,
        Ok(None) => {}
        Err(e) => log::error!("could not read the database key: {e}"),
    }
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    // WAL lets the UI read while the tracker writes.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE apps (
                 id INTEGER PRIMARY KEY,
                 exe TEXT NOT NULL UNIQUE,
                 alias TEXT
             );
             CREATE TABLE bursts (
                 id INTEGER PRIMARY KEY,
                 app_id INTEGER NOT NULL REFERENCES apps(id),
                 start_ms INTEGER NOT NULL,
                 end_ms INTEGER NOT NULL,
                 chars INTEGER NOT NULL,
                 backspaces INTEGER NOT NULL,
                 word_deletes INTEGER NOT NULL,
                 peak_wpm REAL,
                 best_streak INTEGER NOT NULL
             );
             CREATE INDEX idx_bursts_start ON bursts(start_ms);
             CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE exclusions (exe TEXT PRIMARY KEY);",
        )?;
        for exe in DEFAULT_EXCLUSIONS {
            conn.execute("INSERT INTO exclusions(exe) VALUES (?1)", [exe])?;
        }
        conn.execute_batch("PRAGMA user_version = 1; COMMIT;")?;
    }
    if version < 2 {
        // Welcome screen: people who already have bursts recorded have been here before. Additive only.
        conn.execute_batch(
            "BEGIN;
             INSERT OR IGNORE INTO settings(key, value)
                 SELECT 'welcome_done', '1' WHERE EXISTS (SELECT 1 FROM bursts);
             PRAGMA user_version = 2;
             COMMIT;",
        )?;
    }
    if version < 3 {
        // XP ledger (0.3.2): one row per day and kind of award, amounts only. Additive only.
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE xp_events (
                 id INTEGER PRIMARY KEY,
                 ts INTEGER NOT NULL,
                 day INTEGER NOT NULL,
                 kind TEXT NOT NULL,
                 amount INTEGER NOT NULL,
                 UNIQUE(day, kind)
             );
             PRAGMA user_version = 3;
             COMMIT;",
        )?;
    }
    if version < 4 {
        // Badges (0.3.3): when each one was earned. Additive only.
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE badges (
                 id TEXT PRIMARY KEY,
                 ts INTEGER NOT NULL,
                 retro INTEGER NOT NULL DEFAULT 0,
                 seen INTEGER NOT NULL DEFAULT 0
             );
             PRAGMA user_version = 4;
             COMMIT;",
        )?;
    }
    if version < 5 {
        // Shortcut counter (0.3.6): only a daily count per kind. Additive only.
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE shortcut_days (
                 day INTEGER NOT NULL,
                 kind TEXT NOT NULL,
                 count INTEGER NOT NULL,
                 PRIMARY KEY (day, kind)
             );
             PRAGMA user_version = 5;
             COMMIT;",
        )?;
    }
    if version < 6 {
        // Typing lessons (0.4): results and per-key stats of OUR lesson texts only. Additive only.
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE lesson_results (
                 id INTEGER PRIMARY KEY,
                 lesson_id TEXT NOT NULL,
                 layout TEXT NOT NULL,
                 ts INTEGER NOT NULL,
                 day INTEGER NOT NULL,
                 duration_ms INTEGER NOT NULL,
                 wpm REAL NOT NULL,
                 accuracy REAL NOT NULL,
                 stars INTEGER NOT NULL
             );
             CREATE INDEX idx_lesson_results_lesson ON lesson_results(lesson_id, layout);
             CREATE TABLE key_stats (
                 layout TEXT NOT NULL,
                 key TEXT NOT NULL,
                 hits INTEGER NOT NULL,
                 misses INTEGER NOT NULL,
                 total_ms INTEGER NOT NULL,
                 PRIMARY KEY (layout, key)
             );
             PRAGMA user_version = 6;
             COMMIT;",
        )?;
    }
    if version < 7 {
        // Shortcut trainer (0.4.3): per catalogue shortcut, days used and a few days. Additive only.
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE shortcut_levels (
                 id TEXT PRIMARY KEY,
                 days_used INTEGER NOT NULL DEFAULT 0,
                 first_day INTEGER,
                 last_day INTEGER,
                 suggested_day INTEGER,
                 known INTEGER NOT NULL DEFAULT 0
             );
             PRAGMA user_version = 7;
             COMMIT;",
        )?;
    }
    if version < 8 {
        // Lessons count as typing (0.7.2): new lessons also store a burst, so their goal time comes from
        // there; `as_burst` keeps older lessons (which have no burst) counting through this table.
        conn.execute_batch(
            "BEGIN;
             ALTER TABLE lesson_results ADD COLUMN as_burst INTEGER NOT NULL DEFAULT 0;
             PRAGMA user_version = 8;
             COMMIT;",
        )?;
    }
    if version < 9 {
        // Streak protectors replace the weekly comodín from today on; days before keep the old
        // rule, so no streak made under it breaks. New installs start them on their first day.
        conn.execute_batch(
            "BEGIN;
             INSERT OR IGNORE INTO settings(key, value)
               VALUES ('protectors_since', CAST(CAST(ROUND(julianday(date('now', 'localtime')) - 2440587.5) AS INTEGER) AS TEXT));
             PRAGMA user_version = 9;
             COMMIT;",
        )?;
    }
    Ok(())
}

/// App name of the bursts that lessons store: they happen inside Tapomo.
pub const LESSONS_APP: &str = "Tapomo";

// ---------------------------------------------------------------- settings

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub pause_ms: u64,
    /// Empty means "follow the system language".
    pub language: String,
    pub autostart: bool,
    pub ignore_fullscreen: bool,
    pub paused: bool,
    /// Floating Tapomo on the desktop.
    pub show_pet: bool,
    /// Ask GitHub (and only GitHub) whether there is a newer release, at most once a day.
    pub check_updates: bool,
    /// Install new versions by itself, once the user has stopped typing for a while.
    pub auto_update: bool,
    /// The first-run welcome has been seen or skipped.
    pub welcome_done: bool,
    /// Daily goal in active minutes: 0 (off), 10, 20 or 30.
    pub daily_goal_min: u32,
    /// Saturdays and Sundays never break the day streak.
    pub weekend_rest: bool,
    /// What Tapomo wears: skin id, accessory ids and drawing style (`bold` or `subtle`). The ids
    /// belong to `ui/wardrobe.js`, which ignores unknown or locked ones.
    pub skin: String,
    pub accessories: Vec<String>,
    pub wear_style: String,
    /// Hair colour for the hairstyles: `negro`, `castano` or `rubio`.
    #[serde(default = "default_hair")]
    pub hair_color: String,
    /// Count Ctrl/Alt/Win shortcuts by kind (never which one).
    pub count_shortcuts: bool,
    /// Time spent in lessons counts towards the daily goal.
    pub lessons_in_goal: bool,
    /// One shortcut tip a day (only with `count_shortcuts`).
    pub shortcut_tips: bool,
}

fn default_hair() -> String {
    "castano".into()
}

/// Goal choices offered in the settings; anything else falls back to the default.
pub const GOAL_CHOICES: [u32; 4] = [0, 10, 20, 30];
pub const DEFAULT_GOAL_MIN: u32 = 20;

fn valid_goal(min: u32) -> u32 {
    if GOAL_CHOICES.contains(&min) { min } else { DEFAULT_GOAL_MIN }
}

pub fn get_raw(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()
}

pub fn set_raw(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_settings(conn: &Connection) -> rusqlite::Result<Settings> {
    let flag = |key: &str, default: bool| -> rusqlite::Result<bool> {
        Ok(get_raw(conn, key)?.map_or(default, |v| v == "1"))
    };
    let pause_ms = get_raw(conn, "pause_ms")?.and_then(|v| v.parse().ok()).unwrap_or(2_000);
    Ok(Settings {
        pause_ms: pause_ms.clamp(1_000, 5_000),
        language: get_raw(conn, "language")?.unwrap_or_default(),
        autostart: flag("autostart", true)?,
        ignore_fullscreen: flag("ignore_fullscreen", true)?,
        paused: flag("paused", false)?,
        show_pet: flag("show_pet", true)?,
        check_updates: flag("check_updates", true)?,
        auto_update: flag("auto_update", false)?,
        welcome_done: flag("welcome_done", false)?,
        daily_goal_min: valid_goal(get_raw(conn, "daily_goal_min")?.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_GOAL_MIN)),
        weekend_rest: flag("weekend_rest", false)?,
        skin: get_raw(conn, "skin")?.unwrap_or_else(|| "clasico".into()),
        accessories: get_raw(conn, "accessories")?
            .map(|v| v.split(',').map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect())
            .unwrap_or_default(),
        wear_style: get_raw(conn, "wear_style")?.filter(|v| v == "subtle").unwrap_or_else(|| "bold".into()),
        hair_color: get_raw(conn, "hair_color")?.filter(|v| matches!(v.as_str(), "negro" | "castano" | "rubio")).unwrap_or_else(default_hair),
        count_shortcuts: flag("count_shortcuts", true)?,
        lessons_in_goal: flag("lessons_in_goal", true)?,
        shortcut_tips: flag("shortcut_tips", true)?,
    })
}

pub fn set_settings(conn: &Connection, s: &Settings) -> rusqlite::Result<()> {
    let b = |v: bool| if v { "1" } else { "0" };
    set_raw(conn, "pause_ms", &s.pause_ms.clamp(1_000, 5_000).to_string())?;
    set_raw(conn, "language", &s.language)?;
    set_raw(conn, "autostart", b(s.autostart))?;
    set_raw(conn, "ignore_fullscreen", b(s.ignore_fullscreen))?;
    set_raw(conn, "paused", b(s.paused))?;
    set_raw(conn, "show_pet", b(s.show_pet))?;
    set_raw(conn, "check_updates", b(s.check_updates))?;
    set_raw(conn, "auto_update", b(s.auto_update))?;
    set_raw(conn, "welcome_done", b(s.welcome_done))?;
    set_raw(conn, "daily_goal_min", &valid_goal(s.daily_goal_min).to_string())?;
    set_raw(conn, "weekend_rest", b(s.weekend_rest))?;
    let id = |v: &str| v.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(32).collect::<String>();
    set_raw(conn, "skin", &id(&s.skin))?;
    set_raw(conn, "accessories", &s.accessories.iter().map(|a| id(a)).filter(|a| !a.is_empty()).take(16).collect::<Vec<_>>().join(","))?;
    set_raw(conn, "wear_style", if s.wear_style == "subtle" { "subtle" } else { "bold" })?;
    set_raw(conn, "hair_color", if matches!(s.hair_color.as_str(), "negro" | "castano" | "rubio") { &s.hair_color } else { "castano" })?;
    set_raw(conn, "count_shortcuts", b(s.count_shortcuts))?;
    set_raw(conn, "lessons_in_goal", b(s.lessons_in_goal))?;
    set_raw(conn, "shortcut_tips", b(s.shortcut_tips))
}

/// Saved position of the floating Tapomo (physical px). Kept out of [`Settings`]
/// so the settings form can never overwrite it with a stale value.
pub fn get_pet_pos(conn: &Connection) -> rusqlite::Result<Option<(i32, i32)>> {
    let read = |key: &str| -> rusqlite::Result<Option<i32>> { Ok(get_raw(conn, key)?.and_then(|v| v.parse().ok())) };
    Ok(read("pet_x")?.zip(read("pet_y")?))
}

pub fn set_pet_pos(conn: &Connection, x: i32, y: i32) -> rusqlite::Result<()> {
    set_raw(conn, "pet_x", &x.to_string())?;
    set_raw(conn, "pet_y", &y.to_string())
}

// ------------------------------------------------------------- apps, bursts

/// Returns the id of `exe`, inserting it on first sight.
pub fn intern_app(conn: &Connection, exe: &str) -> rusqlite::Result<u32> {
    conn.execute("INSERT OR IGNORE INTO apps(exe) VALUES (?1)", [exe])?;
    conn.query_row("SELECT id FROM apps WHERE exe = ?1", [exe], |r| r.get(0))
}

pub fn insert_burst(conn: &Connection, b: &Burst) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO bursts(app_id, start_ms, end_ms, chars, backspaces, word_deletes, peak_wpm, best_streak)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![b.app_id, b.start_ms as i64, b.end_ms as i64, b.chars, b.backspaces, b.word_deletes, b.peak_wpm, b.best_streak],
    )?;
    Ok(())
}

/// All-time record: the saved value or the best streak of any stored burst.
pub fn best_streak(conn: &Connection) -> rusqlite::Result<u32> {
    let saved: u32 = get_raw(conn, "best_streak")?.and_then(|v| v.parse().ok()).unwrap_or(0);
    let stored: u32 = conn.query_row("SELECT COALESCE(MAX(best_streak), 0) FROM bursts", [], |r| r.get(0))?;
    Ok(saved.max(stored))
}

pub fn save_best_streak(conn: &Connection, best: u32) -> rusqlite::Result<()> {
    set_raw(conn, "best_streak", &best.to_string())
}

/// Inputs of the live bar: every stored 10 s peak of the last 30 days, and the
/// all-time maximum peak.
pub fn peak_data(conn: &Connection) -> rusqlite::Result<(Vec<f64>, Option<f64>)> {
    let since = range_start_ms(conn, "30d")?;
    let mut stmt = conn.prepare("SELECT peak_wpm FROM bursts WHERE peak_wpm IS NOT NULL AND start_ms >= ?1")?;
    let peaks = stmt.query_map([since], |r| r.get::<_, f64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let max: Option<f64> = conn.query_row("SELECT MAX(peak_wpm) FROM bursts WHERE peak_wpm IS NOT NULL", [], |r| r.get(0))?;
    Ok((peaks, max))
}

/// This week's best 10 s peak (the week starts on Monday, local time), if any burst long enough was typed.
pub fn week_max_peak(conn: &Connection) -> rusqlite::Result<Option<f64>> {
    conn.query_row("SELECT MAX(peak_wpm) FROM bursts WHERE peak_wpm IS NOT NULL AND start_ms >= ?1", [week_start_ms(conn)?], |r| r.get(0))
}

/// Monday 00:00 of the current week in Unix ms; the week boundary uses the local time zone.
/// `weekday 0` moves to the coming Sunday (or stays on one), so `-6 days` is always that week's Monday.
pub(crate) fn week_start_ms(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT CAST(strftime('%s', 'now', 'localtime', 'weekday 0', '-6 days', 'start of day', 'utc') AS INTEGER) * 1000",
        [],
        |r| r.get(0),
    )
}

/// The four speeds under the live bar. Each is `None` while there is nothing to show.
#[derive(Debug, Serialize, PartialEq)]
pub struct SpeedSummary {
    /// Best 10 s peak since Monday.
    pub week_record: Option<f64>,
    /// Gross speed of today's bursts, duration-weighted like `summary`.
    pub today_avg: Option<f64>,
    /// Gross speed of the latest burst long enough to have a peak.
    pub last_burst: Option<f64>,
    /// Best 10 s peak ever.
    pub all_time: Option<f64>,
}

/// Gross wpm of `intervals` (chars - 1) typed in `ms`, as `summary` and `Burst::gross_wpm` do.
fn gross_wpm(intervals: i64, ms: i64) -> Option<f64> {
    (ms > 0).then(|| intervals.max(0) as f64 / 5.0 / (ms as f64 / 60_000.0))
}

pub fn speed_summary(conn: &Connection) -> rusqlite::Result<SpeedSummary> {
    let (intervals, dur_ms): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(MAX(chars - 1, 0)), 0), COALESCE(SUM(end_ms - start_ms), 0) FROM bursts WHERE start_ms >= ?1",
        [range_start_ms(conn, "today")?],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let last: Option<(i64, i64)> = conn
        .query_row(
            "SELECT chars - 1, end_ms - start_ms FROM bursts WHERE peak_wpm IS NOT NULL ORDER BY start_ms DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(SpeedSummary {
        week_record: week_max_peak(conn)?,
        today_avg: gross_wpm(intervals, dur_ms),
        last_burst: last.and_then(|(intervals, ms)| gross_wpm(intervals, ms)),
        all_time: conn.query_row("SELECT MAX(peak_wpm) FROM bursts WHERE peak_wpm IS NOT NULL", [], |r| r.get(0))?,
    })
}

/// The all-time best peak with its context, and the runner-up (what a reset would fall back to).
#[derive(Debug, Serialize, PartialEq)]
pub struct TopPeak {
    pub burst_id: i64,
    pub value: f64,
    pub at_ms: i64,
    pub app: String,
    pub next: Option<f64>,
}

pub fn top_peak(conn: &Connection) -> rusqlite::Result<Option<TopPeak>> {
    let mut stmt = conn.prepare(
        "SELECT b.id, b.peak_wpm, b.start_ms, COALESCE(NULLIF(a.alias, ''), a.exe)
         FROM bursts b JOIN apps a ON a.id = b.app_id WHERE b.peak_wpm IS NOT NULL
         ORDER BY b.peak_wpm DESC, b.start_ms ASC LIMIT 2",
    )?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let next = rows.get(1).map(|r| r.1);
    Ok(rows.into_iter().next().map(|(burst_id, value, at_ms, app)| TopPeak { burst_id, value, at_ms, app, next }))
}

/// Forgets the speed of the top peak (only that: characters, XP and badges stay). Returns whether it
/// did; a stale `burst_id` that is no longer the top does nothing.
pub fn discard_peak(conn: &Connection, burst_id: i64) -> rusqlite::Result<bool> {
    if top_peak(conn)?.is_none_or(|t| t.burst_id != burst_id) {
        return Ok(false);
    }
    Ok(conn.execute("UPDATE bursts SET peak_wpm = NULL WHERE id = ?1", [burst_id])? > 0)
}

pub fn set_alias(conn: &Connection, exe: &str, alias: &str) -> rusqlite::Result<()> {
    let alias = alias.trim();
    let alias = (!alias.is_empty()).then_some(alias);
    conn.execute("UPDATE apps SET alias = ?2 WHERE exe = ?1", params![exe, alias])?;
    Ok(())
}

// --------------------------------------------------------------- exclusions

pub fn list_exclusions(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT exe FROM exclusions ORDER BY exe COLLATE NOCASE")?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    rows.collect()
}

pub fn add_exclusion(conn: &Connection, exe: &str) -> rusqlite::Result<()> {
    let exe = exe.trim();
    if exe.is_empty() {
        return Ok(());
    }
    conn.execute("INSERT OR IGNORE INTO exclusions(exe) VALUES (?1)", [exe])?;
    Ok(())
}

pub fn remove_exclusion(conn: &Connection, exe: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM exclusions WHERE exe = ?1", [exe])?;
    Ok(())
}

// ----------------------------------------------------------- daily goal

/// SQL for the local day number (days since 1970-01-01) of a Unix-ms timestamp expression.
const DAY_OF_START: &str = "CAST(ROUND(julianday(date(start_ms / 1000, 'unixepoch', 'localtime')) - 2440587.5) AS INTEGER)";

/// Today's local day number, same scale as [`daily_active`].
pub fn today_day(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT CAST(ROUND(julianday(date('now', 'localtime')) - 2440587.5) AS INTEGER)", [], |r| r.get(0))
}

/// Active typing time per local day: the sum of burst durations, by the day each burst started.
/// Derived on demand from `bursts` (indexed by `start_ms`); no separate table to keep in sync.
pub fn daily_active(conn: &Connection) -> rusqlite::Result<Vec<(i64, u64)>> {
    let in_goal = lessons_in_goal(conn)?;
    // Lesson bursts (0.7.2) only count towards the goal when the setting says so.
    let skip = if in_goal { String::new() } else { format!("WHERE app_id NOT IN (SELECT id FROM apps WHERE exe = '{LESSONS_APP}')") };
    let sql = format!("SELECT {DAY_OF_START}, SUM(end_ms - start_ms) FROM bursts {skip} GROUP BY 1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
    let mut days = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    // Older lessons (stored before they made bursts) count towards the daily goal too (setting, on by
    // default); repeated days add up.
    if in_goal {
        let mut stmt = conn.prepare("SELECT day, SUM(duration_ms) FROM lesson_results WHERE as_burst = 0 GROUP BY day")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
        days.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        // One entry per day: callers compare each entry with the goal.
        let mut merged: std::collections::BTreeMap<i64, u64> = std::collections::BTreeMap::new();
        for (d, ms) in days {
            *merged.entry(d).or_insert(0) += ms;
        }
        return Ok(merged.into_iter().collect());
    }
    Ok(days)
}

fn lessons_in_goal(conn: &Connection) -> rusqlite::Result<bool> {
    Ok(get_raw(conn, "lessons_in_goal")?.is_none_or(|v| v == "1"))
}

/// Active time of today alone (cheap: uses the start-of-day index range).
pub fn today_active_ms(conn: &Connection) -> rusqlite::Result<u64> {
    let since = range_start_ms(conn, "today")?;
    let in_goal = lessons_in_goal(conn)?;
    let skip = if in_goal { "" } else { " AND app_id NOT IN (SELECT id FROM apps WHERE exe = ?2)" };
    let sql = format!("SELECT COALESCE(SUM(end_ms - start_ms), 0) FROM bursts WHERE start_ms >= ?1{skip}");
    let ms: i64 = if in_goal {
        conn.query_row(&sql, [since], |r| r.get(0))?
    } else {
        conn.query_row(&sql, params![since, LESSONS_APP], |r| r.get(0))?
    };
    let lessons: i64 = if in_goal {
        conn.query_row("SELECT COALESCE(SUM(duration_ms), 0) FROM lesson_results WHERE day = ?1 AND as_burst = 0", [today_day(conn)?], |r| r.get(0))?
    } else {
        0
    };
    Ok((ms + lessons).max(0) as u64)
}

#[derive(Debug, Serialize)]
pub struct DailyGoal {
    pub goal_min: u32,
    pub today_ms: u64,
    pub met_today: bool,
    pub streak_days: u32,
    pub freeze_used_this_week: bool,
    pub freeze_saved_streak_recently: bool,
    /// Streak protectors in the bank (0..=2).
    pub protectors: u8,
}

/// The day the streak protectors replaced the weekly comodín (set by migration 9).
pub fn protectors_since(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    Ok(get_raw(conn, "protectors_since")?.and_then(|v| v.parse().ok()))
}

/// `open_ms` is the burst still being typed, which is not stored yet.
pub fn daily_goal(conn: &Connection, open_ms: u64) -> rusqlite::Result<DailyGoal> {
    let settings = get_settings(conn)?;
    let today = today_day(conn)?;
    let mut days = daily_active(conn)?;
    days.push((today, open_ms));
    let since = protectors_since(conn)?;
    let status = tapomo_core::goal_status(&days, today, u64::from(settings.daily_goal_min) * 60_000, settings.weekend_rest, since);
    Ok(DailyGoal {
        goal_min: settings.daily_goal_min,
        today_ms: status.today_ms,
        met_today: status.met_today,
        streak_days: status.streak_days,
        freeze_used_this_week: status.freeze_used_this_week,
        freeze_saved_streak_recently: status.freeze_saved_streak_recently,
        protectors: status.protectors,
    })
}

// -------------------------------------------------------------------- stats

/// Start of `range` in Unix ms; the day boundary uses the local time zone.
pub(crate) fn range_start_ms(conn: &Connection, range: &str) -> rusqlite::Result<i64> {
    let days_back = match range {
        "today" => 0,
        "yesterday" => 1,
        "7d" => 6,
        "30d" => 29,
        _ => return Ok(0),
    };
    conn.query_row(
        "SELECT CAST(strftime('%s', 'now', 'localtime', 'start of day', ?1, 'utc') AS INTEGER) * 1000",
        [format!("-{days_back} days")],
        |r| r.get(0),
    )
}

/// End (exclusive) of `range` in Unix ms: only "yesterday" stops before now.
fn range_end_ms(conn: &Connection, range: &str) -> rusqlite::Result<i64> {
    if range == "yesterday" { range_start_ms(conn, "today") } else { Ok(i64::MAX) }
}

#[derive(Debug, Serialize)]
pub struct Summary {
    pub avg_wpm: f64,
    pub avg_net_wpm: f64,
    pub peak_wpm: f64,
    pub best_streak: u32,
    pub current_streak: u32,
    pub chars_total: u64,
    pub active_minutes: f64,
    pub bursts: u64,
    /// Personal 100 % from the same peaks and function the live tracker uses (None while calibrating).
    pub reference: Option<f64>,
}

/// Speeds are duration-weighted: total intervals over total burst time,
/// not a mean of per-burst means. Same maths as `Burst::gross_wpm`.
pub fn summary(conn: &Connection, range: &str, current_streak: u32) -> rusqlite::Result<Summary> {
    let since = range_start_ms(conn, range)?;
    let until = range_end_ms(conn, range)?;
    let (bursts, chars, dur_ms, gross, net, peak): (u64, u64, f64, f64, f64, Option<f64>) = conn.query_row(
        "SELECT COUNT(*),
                COALESCE(SUM(chars), 0),
                COALESCE(SUM(end_ms - start_ms), 0),
                COALESCE(SUM(MAX(chars - 1, 0)), 0),
                COALESCE(SUM(MAX(chars - backspaces - 1, 0)), 0),
                MAX(peak_wpm)
         FROM bursts WHERE start_ms >= ?1 AND start_ms < ?2",
        [since, until],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )?;
    let minutes = dur_ms / 60_000.0;
    let rate = |intervals: f64| if minutes > 0.0 { intervals / 5.0 / minutes } else { 0.0 };
    Ok(Summary {
        avg_wpm: rate(gross),
        avg_net_wpm: rate(net),
        peak_wpm: peak.unwrap_or(0.0),
        best_streak: best_streak(conn)?,
        current_streak,
        chars_total: chars,
        active_minutes: minutes,
        bursts,
        reference: tapomo_core::personal_reference(&peak_data(conn)?.0),
    })
}

#[derive(Debug, Serialize)]
pub struct HeatCell {
    /// 0 = Monday … 6 = Sunday, local time.
    pub weekday: u8,
    pub hour: u8,
    pub avg_wpm: f64,
    pub bursts: u64,
}

/// A full 7×24 grid (Monday first), empty cells included.
pub fn heatmap(conn: &Connection, range: &str) -> rusqlite::Result<Vec<HeatCell>> {
    let since = range_start_ms(conn, range)?;
    let mut cells: Vec<HeatCell> = (0..7u8)
        .flat_map(|weekday| (0..24u8).map(move |hour| HeatCell { weekday, hour, avg_wpm: 0.0, bursts: 0 }))
        .collect();
    let mut stmt = conn.prepare(
        "SELECT CAST(strftime('%w', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER),
                CAST(strftime('%H', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER),
                COUNT(*),
                SUM(MAX(chars - 1, 0)),
                SUM(end_ms - start_ms)
         FROM bursts WHERE start_ms >= ?1
         GROUP BY 1, 2",
    )?;
    let rows = stmt.query_map([since], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, u64>(2)?, r.get::<_, f64>(3)?, r.get::<_, f64>(4)?))
    })?;
    for row in rows {
        let (sqlite_wd, hour, bursts, intervals, dur_ms) = row?;
        // SQLite: 0 = Sunday. Shift so Monday is 0.
        let weekday = ((sqlite_wd + 6) % 7) as usize;
        if let Some(cell) = cells.get_mut(weekday * 24 + hour as usize) {
            cell.bursts = bursts;
            cell.avg_wpm = if dur_ms > 0.0 { intervals / 5.0 / (dur_ms / 60_000.0) } else { 0.0 };
        }
    }
    Ok(cells)
}

#[derive(Debug, Serialize)]
pub struct AppStat {
    pub exe: String,
    pub alias: Option<String>,
    pub avg_wpm: f64,
    pub chars: u64,
}

pub fn apps(conn: &Connection, range: &str) -> rusqlite::Result<Vec<AppStat>> {
    let since = range_start_ms(conn, range)?;
    let mut stmt = conn.prepare(
        "SELECT a.exe, a.alias,
                SUM(MAX(b.chars - 1, 0)),
                SUM(b.end_ms - b.start_ms),
                SUM(b.chars)
         FROM bursts b JOIN apps a ON a.id = b.app_id
         WHERE b.start_ms >= ?1
         GROUP BY a.id
         ORDER BY SUM(b.chars) DESC",
    )?;
    let rows = stmt.query_map([since], |r| {
        let intervals: f64 = r.get(2)?;
        let dur_ms: f64 = r.get(3)?;
        Ok(AppStat {
            exe: r.get(0)?,
            alias: r.get(1)?,
            avg_wpm: if dur_ms > 0.0 { intervals / 5.0 / (dur_ms / 60_000.0) } else { 0.0 },
            chars: r.get(4)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tapomo_core::Burst;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-db-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open(&path).unwrap()
    }

    fn now(c: &Connection) -> i64 {
        c.query_row("SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000", [], |r| r.get(0)).unwrap()
    }

    fn burst(c: &Connection, exe: &str, start: i64, secs: i64, chars: u32, peak: Option<f64>) {
        let app = intern_app(c, exe).unwrap();
        let (start_ms, end_ms) = (start as u64, (start + secs * 1000) as u64);
        insert_burst(c, &Burst { app_id: app, start_ms, end_ms, chars, backspaces: 0, word_deletes: 0, peak_wpm: peak, best_streak: 0, mash: false }).unwrap();
    }

    #[test]
    fn week_starts_on_a_monday_at_midnight() {
        let c = mem();
        let start = week_start_ms(&c).unwrap();
        let n = now(&c);
        assert!(start <= n && n - start < 7 * 86_400_000 + 3_600_000);
        // %w is 1 for Monday.
        let (wd, hms): (String, String) = c
            .query_row(
                "SELECT strftime('%w', ?1 / 1000, 'unixepoch', 'localtime'), strftime('%H:%M:%S', ?1 / 1000, 'unixepoch', 'localtime')",
                [start],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((wd.as_str(), hms.as_str()), ("1", "00:00:00"));
        // The same modifiers on fixed dates: Sunday maps six days back, Monday to itself.
        let monday = |day: &str| -> String { c.query_row("SELECT date(?1, 'weekday 0', '-6 days')", [day], |r| r.get(0)).unwrap() };
        assert_eq!(monday("2026-10-18"), "2026-10-12"); // Sunday
        assert_eq!(monday("2026-10-19"), "2026-10-19"); // Monday
        assert_eq!(monday("2026-10-24"), "2026-10-19"); // Saturday
    }

    #[test]
    fn speed_summary_empty_and_with_data() {
        let c = mem();
        assert_eq!(speed_summary(&c).unwrap(), SpeedSummary { week_record: None, today_avg: None, last_burst: None, all_time: None });
        let n = now(&c);
        // 61 chars in 60 s and 31 in 30 s are both 12 wpm; the newest burst is short (no peak), so it is skipped for last_burst.
        burst(&c, "a.exe", n - 200_000, 60, 61, Some(50.0));
        burst(&c, "a.exe", n - 120_000, 30, 31, Some(40.0));
        burst(&c, "a.exe", n - 60_000, 2, 100, None);
        // Older than any week, and the best ever.
        burst(&c, "a.exe", n - 30 * 86_400_000, 60, 61, Some(90.0));
        let s = speed_summary(&c).unwrap();
        assert_eq!(s.all_time, Some(90.0));
        assert_eq!(s.last_burst.map(|v| v.round()), Some(12.0));
        assert_eq!(s.week_record, Some(50.0));
    }

    #[test]
    fn discard_peak_only_removes_the_top() {
        let c = mem();
        assert!(top_peak(&c).unwrap().is_none());
        let n = now(&c);
        burst(&c, "a.exe", n - 300_000, 30, 100, Some(60.0));
        burst(&c, "b.exe", n - 200_000, 30, 100, Some(80.0));
        burst(&c, "a.exe", n - 100_000, 30, 100, Some(70.0));
        let top = top_peak(&c).unwrap().unwrap();
        assert_eq!((top.value, top.next, top.app.as_str()), (80.0, Some(70.0), "b.exe"));
        // A burst that is not the top is left alone.
        assert!(!discard_peak(&c, top.burst_id - 1).unwrap());
        assert_eq!(top_peak(&c).unwrap().unwrap().value, 80.0);
        assert!(discard_peak(&c, top.burst_id).unwrap());
        let top = top_peak(&c).unwrap().unwrap();
        assert_eq!((top.value, top.next), (70.0, Some(60.0)));
        // The burst and its characters are still there.
        let chars: i64 = c.query_row("SELECT SUM(chars) FROM bursts", [], |r| r.get(0)).unwrap();
        assert_eq!(chars, 300);
        assert_eq!(speed_summary(&c).unwrap().all_time, Some(70.0));
    }
}
