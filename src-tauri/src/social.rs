//! Optional online features (0.5): anonymous weekly stats and leagues with friends. Both are OFF by
//! default; the page talks to the server itself (fetch to api.tapomo.app only, see the CSP). Here:
//! the weekly summary that may be sent, and a small local store for the league credentials.

use rusqlite::Connection;
use serde::Serialize;

use crate::db;

/// What the anonymous stats would send for a finished ISO week. Nothing else ever leaves.
#[derive(Debug, Serialize, PartialEq)]
pub struct WeekSummary {
    /// ISO week, e.g. "2026-W41".
    pub week: String,
    pub avg_wpm: f64,
    pub peak_wpm: f64,
    /// 1 − backspaces / characters, as a rough accuracy.
    pub accuracy: f64,
    pub active_min: f64,
    pub bursts: u64,
}

/// ISO week label of local day `day` (days since 1970-01-01).
pub fn iso_week(day: i64) -> String {
    let wd = i64::from(tapomo_core::weekday(day)); // 0 = Monday
    let thursday = day - wd + 3;
    // Year of that Thursday, and its ordinal day, via the civil-from-days algorithm.
    let (y, _, _) = civil(thursday);
    let jan1 = days_from_civil(y, 1, 1);
    let week = (thursday - jan1) / 7 + 1;
    format!("{y}-W{week:02}")
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// Summary of the ISO week that starts on Monday `week` (local day number); `None` with too little typing.
pub fn week_summary(conn: &Connection, week: i64) -> rusqlite::Result<Option<WeekSummary>> {
    let day = "CAST(ROUND(julianday(date(start_ms / 1000, 'unixepoch', 'localtime')) - 2440587.5) AS INTEGER)";
    let (bursts, chars, back, intervals, ms, peak): (u64, f64, f64, f64, f64, Option<f64>) = conn.query_row(
        &format!(
            "SELECT COUNT(*), COALESCE(SUM(chars), 0), COALESCE(SUM(backspaces), 0), COALESCE(SUM(MAX(chars - 1, 0)), 0),
                    COALESCE(SUM(end_ms - start_ms), 0), MAX(peak_wpm)
             FROM bursts WHERE {day} >= ?1 AND {day} < ?2"
        ),
        [week, week + 7],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )?;
    if bursts < 10 || ms <= 0.0 {
        return Ok(None);
    }
    let round1 = |x: f64| (x * 10.0).round() / 10.0;
    Ok(Some(WeekSummary {
        week: iso_week(week),
        avg_wpm: round1(intervals / 5.0 / (ms / 60_000.0)),
        peak_wpm: round1(peak.unwrap_or(0.0)),
        accuracy: ((1.0 - back / chars.max(1.0)).clamp(0.0, 1.0) * 1000.0).round() / 1000.0,
        active_min: round1(ms / 60_000.0),
        bursts,
    }))
}

/// Monday (local day number) of the current week.
pub fn this_monday(conn: &Connection) -> rusqlite::Result<i64> {
    let today = db::today_day(conn)?;
    Ok(today - i64::from(tapomo_core::weekday(today)))
}

/// Local key/value store for the online features (install id, league credentials, last send).
/// Only keys starting with `social_` can be read or written from the page.
fn allowed(key: &str) -> bool {
    key.starts_with("social_") && key.len() <= 64 && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub fn get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    if !allowed(key) {
        return Ok(None);
    }
    db::get_raw(conn, key)
}

pub fn set(conn: &Connection, key: &str, value: Option<&str>) -> rusqlite::Result<()> {
    if !allowed(key) {
        return Ok(());
    }
    match value {
        Some(v) => db::set_raw(conn, key, &v.chars().take(4096).collect::<String>()),
        None => conn.execute("DELETE FROM settings WHERE key = ?1", [key]).map(|_| ()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_weeks() {
        let d = |y, m, dd| days_from_civil(y, m, dd);
        assert_eq!(iso_week(d(2026, 10, 15)), "2026-W42");
        assert_eq!(iso_week(d(2021, 1, 3)), "2020-W53"); // Sunday of the last 2020 week
        assert_eq!(iso_week(d(2024, 12, 30)), "2025-W01");
        assert_eq!(iso_week(d(2026, 1, 1)), "2026-W01");
        assert_eq!(civil(d(2026, 2, 28)), (2026, 2, 28));
    }

    #[test]
    fn only_social_keys() {
        let path = std::env::temp_dir().join(format!("tapomo-social-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let c = db::open(&path).unwrap();
        set(&c, "social_install_id", Some("abc")).unwrap();
        assert_eq!(get(&c, "social_install_id").unwrap().as_deref(), Some("abc"));
        set(&c, "paused", Some("1")).unwrap();
        assert_eq!(db::get_raw(&c, "paused").unwrap(), None, "settings are not writable from here");
        assert_eq!(get(&c, "best_streak").unwrap(), None);
        set(&c, "social_install_id", None).unwrap();
        assert_eq!(get(&c, "social_install_id").unwrap(), None);
    }

    #[test]
    fn little_typing_sends_nothing() {
        let path = std::env::temp_dir().join(format!("tapomo-social2-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let c = db::open(&path).unwrap();
        assert_eq!(week_summary(&c, this_monday(&c).unwrap()).unwrap(), None);
    }
}
