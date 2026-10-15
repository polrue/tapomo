//! Weekly card ("Carta semanal", 0.3.5): the best of a finished week, shown with the Monday league
//! result. Only facts that read well are sent; the page hides anything empty or zero.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::db;

const DAY: &str = "CAST(ROUND(julianday(date(start_ms / 1000, 'unixepoch', 'localtime')) - 2440587.5) AS INTEGER)";
const HOUR: &str = "CAST(strftime('%H', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER)";
/// A best hour needs a few bursts behind it to mean anything.
const MIN_BURSTS_HOUR: i64 = 3;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct Letter {
    /// Monday of the week (local day number).
    pub week: i64,
    pub active_ms: u64,
    pub chars: u64,
    pub days_typed: u32,
    pub goal_days: u32,
    /// Hour (0–23) with the best average speed, and that speed.
    pub best_hour: Option<(u8, f64)>,
    /// App with the most characters: alias if set, else the executable name.
    pub top_app: Option<String>,
    pub best_peak: Option<f64>,
    /// The week's best peak was an all-time record when it happened.
    pub peak_record: bool,
    pub best_clean_run: u32,
    pub challenges_done: u32,
    pub full_houses: u32,
    pub badges: Vec<String>,
    pub xp: u64,
}

/// Unix ms of the local midnight starting local day `day` (inclusive) — the week bounds.
fn day_start_ms(conn: &Connection, day: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT CAST(strftime('%s', date(?1 + 2440587.5), 'utc') AS INTEGER) * 1000",
        [day as f64],
        |r| r.get(0),
    )
}

pub fn letter(conn: &Connection, week: i64) -> rusqlite::Result<Letter> {
    let (from, to) = (day_start_ms(conn, week)?, day_start_ms(conn, week + 7)?);
    let range = "start_ms >= ?1 AND start_ms < ?2";
    let (active_ms, chars, days_typed, best_clean_run, best_peak): (i64, i64, u32, u32, Option<f64>) = conn.query_row(
        &format!("SELECT COALESCE(SUM(end_ms - start_ms), 0), COALESCE(SUM(chars), 0), COUNT(DISTINCT {DAY}), COALESCE(MAX(best_streak), 0), MAX(peak_wpm) FROM bursts WHERE {range}"),
        params![from, to],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )?;
    let best_hour: Option<(u8, f64)> = conn
        .query_row(
            &format!(
                "SELECT {HOUR} AS h, SUM(MAX(chars - 1, 0)) / 5.0 / (SUM(end_ms - start_ms) / 60000.0) AS wpm
                 FROM bursts WHERE {range} AND end_ms > start_ms GROUP BY h HAVING COUNT(*) >= {MIN_BURSTS_HOUR} ORDER BY wpm DESC LIMIT 1"
            ),
            params![from, to],
            |r| Ok((r.get::<_, i64>(0)? as u8, r.get::<_, f64>(1)?)),
        )
        .optional()?;
    let top_app: Option<String> = conn
        .query_row(
            &format!("SELECT COALESCE(a.alias, a.exe) FROM bursts b JOIN apps a ON a.id = b.app_id WHERE b.{} GROUP BY a.id ORDER BY SUM(b.chars) DESC LIMIT 1", range.replace(" AND ", " AND b.")),
            params![from, to],
            |r| r.get(0),
        )
        .optional()?;
    let before: Option<f64> = conn.query_row("SELECT MAX(peak_wpm) FROM bursts WHERE start_ms < ?1", [from], |r| r.get(0))?;
    let settings = db::get_settings(conn)?;
    let goal_ms = u64::from(settings.daily_goal_min) * 60_000;
    let goal_days = if goal_ms == 0 {
        0
    } else {
        db::daily_active(conn)?.iter().filter(|(d, ms)| *d >= week && *d < week + 7 && *ms >= goal_ms).count() as u32
    };
    let count = |sql: &str| -> rusqlite::Result<u32> { conn.query_row(sql, params![week, week + 7], |r| r.get(0)) };
    let mut stmt = conn.prepare("SELECT id FROM badges WHERE ts >= ?1 AND ts < ?2 AND retro = 0 ORDER BY ts")?;
    let badges = stmt.query_map(params![from, to], |r| r.get(0))?.collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(Letter {
        week,
        active_ms: active_ms.max(0) as u64,
        chars: chars.max(0) as u64,
        days_typed,
        goal_days,
        best_hour,
        top_app,
        best_peak,
        peak_record: best_peak.zip(before).is_some_and(|(p, b)| p > b),
        best_clean_run,
        challenges_done: count("SELECT COUNT(*) FROM xp_events WHERE day >= ?1 AND day < ?2 AND kind LIKE 'challenge:%'")?,
        full_houses: count("SELECT COUNT(*) FROM xp_events WHERE day >= ?1 AND day < ?2 AND kind = 'full'")?,
        badges,
        xp: conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE day >= ?1 AND day < ?2 AND kind <> 'retro' AND kind NOT LIKE 'badge:%'",
            params![week, week + 7],
            |r| r.get::<_, i64>(0),
        )?
        .max(0) as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tapomo_core::Burst;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-weekly-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    /// A burst on local day `day` at `hour`, `secs` long.
    fn burst(c: &Connection, exe: &str, day: i64, hour: i64, secs: u64, chars: u32, peak: Option<f64>) {
        let start = day_start_ms(c, day).unwrap() + hour * 3_600_000;
        let app = db::intern_app(c, exe).unwrap();
        let b = Burst { app_id: app, start_ms: start as u64, end_ms: start as u64 + secs * 1000, chars, backspaces: 0, word_deletes: 0, peak_wpm: peak, best_streak: chars, mash: false };
        db::insert_burst(c, &b).unwrap();
    }

    #[test]
    fn the_best_of_a_week() {
        let c = mem();
        let today = db::today_day(&c).unwrap();
        let week = today - i64::from(tapomo_core::weekday(today)) - 7; // last week's Monday
        burst(&c, "old.exe", week - 3, 10, 60, 300, Some(70.0)); // before: sets the record to beat
        for k in 0..3 {
            burst(&c, "WINWORD.EXE", week + 1, 9, 60, 301, Some(60.0 + f64::from(k))); // 60 wpm at 9 h
        }
        burst(&c, "code.exe", week + 2, 22, 21 * 60, 200, Some(80.0)); // goal day (20 min), record peak
        burst(&c, "WINWORD.EXE", week + 7, 9, 60, 999, Some(99.0)); // next week: ignored
        let l = letter(&c, week).unwrap();
        assert_eq!((l.days_typed, l.goal_days, l.chars), (2, 1, 3 * 301 + 200));
        assert_eq!(l.best_hour.map(|h| h.0), Some(9));
        assert_eq!(l.top_app.as_deref(), Some("WINWORD.EXE"));
        assert_eq!((l.best_peak, l.peak_record), (Some(80.0), true));
        assert_eq!(l.best_clean_run, 301);
    }

    #[test]
    fn an_empty_week_is_all_zeros() {
        let c = mem();
        let l = letter(&c, 20_000).unwrap();
        assert_eq!(l, Letter { week: 20_000, ..Letter::default() });
    }
}
