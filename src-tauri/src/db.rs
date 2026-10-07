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
    })
}

pub fn set_settings(conn: &Connection, s: &Settings) -> rusqlite::Result<()> {
    let b = |v: bool| if v { "1" } else { "0" };
    set_raw(conn, "pause_ms", &s.pause_ms.clamp(1_000, 5_000).to_string())?;
    set_raw(conn, "language", &s.language)?;
    set_raw(conn, "autostart", b(s.autostart))?;
    set_raw(conn, "ignore_fullscreen", b(s.ignore_fullscreen))?;
    set_raw(conn, "paused", b(s.paused))?;
    set_raw(conn, "show_pet", b(s.show_pet))
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

// -------------------------------------------------------------------- stats

/// Start of `range` in Unix ms; the day boundary uses the local time zone.
pub(crate) fn range_start_ms(conn: &Connection, range: &str) -> rusqlite::Result<i64> {
    let days_back = match range {
        "today" => 0,
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
}

/// Speeds are duration-weighted: total intervals over total burst time,
/// not a mean of per-burst means. Same maths as `Burst::gross_wpm`.
pub fn summary(conn: &Connection, range: &str, current_streak: u32) -> rusqlite::Result<Summary> {
    let since = range_start_ms(conn, range)?;
    let (bursts, chars, dur_ms, gross, net, peak): (u64, u64, f64, f64, f64, Option<f64>) = conn.query_row(
        "SELECT COUNT(*),
                COALESCE(SUM(chars), 0),
                COALESCE(SUM(end_ms - start_ms), 0),
                COALESCE(SUM(MAX(chars - 1, 0)), 0),
                COALESCE(SUM(MAX(chars - backspaces - 1, 0)), 0),
                MAX(peak_wpm)
         FROM bursts WHERE start_ms >= ?1",
        [since],
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
