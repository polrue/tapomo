//! All SQLite access. Only counts, durations and executable names are stored.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tapomo_core::Burst;

const DEFAULT_EXCLUSIONS: [&str; 4] = ["KeePass.exe", "KeePassXC.exe", "1Password.exe", "Bitwarden.exe"];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
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
    Ok(())
}

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
    set_raw(conn, "wear_style", if s.wear_style == "subtle" { "subtle" } else { "bold" })
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
    let sql = format!("SELECT {DAY_OF_START}, SUM(end_ms - start_ms) FROM bursts GROUP BY 1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
    rows.collect()
}

/// Active time of today alone (cheap: uses the start-of-day index range).
pub fn today_active_ms(conn: &Connection) -> rusqlite::Result<u64> {
    let since = range_start_ms(conn, "today")?;
    let ms: i64 = conn.query_row("SELECT COALESCE(SUM(end_ms - start_ms), 0) FROM bursts WHERE start_ms >= ?1", [since], |r| r.get(0))?;
    Ok(ms.max(0) as u64)
}

#[derive(Debug, Serialize)]
pub struct DailyGoal {
    pub goal_min: u32,
    pub today_ms: u64,
    pub met_today: bool,
    pub streak_days: u32,
    pub freeze_used_this_week: bool,
    pub freeze_saved_streak_recently: bool,
}

/// `open_ms` is the burst still being typed, which is not stored yet.
pub fn daily_goal(conn: &Connection, open_ms: u64) -> rusqlite::Result<DailyGoal> {
    let settings = get_settings(conn)?;
    let today = today_day(conn)?;
    let mut days = daily_active(conn)?;
    days.push((today, open_ms));
    let status = tapomo_core::goal_status(&days, today, u64::from(settings.daily_goal_min) * 60_000, settings.weekend_rest);
    Ok(DailyGoal {
        goal_min: settings.daily_goal_min,
        today_ms: status.today_ms,
        met_today: status.met_today,
        streak_days: status.streak_days,
        freeze_used_this_week: status.freeze_used_this_week,
        freeze_saved_streak_recently: status.freeze_saved_streak_recently,
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
