//! The XP ledger: turns stored bursts into `xp_events` rows. Pure maths lives in `tapomo_core::xp`.
//!
//! Every award is one row per (day, kind). Awards are recomputed from the bursts and upserted with
//! `MAX`, so they only ever grow: XP is never lost, and settling twice changes nothing. Nothing about
//! the text or the keys is stored, only kinds and amounts.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tapomo_core::xp::{self, Challenge, DayBurst};

use crate::db;

/// SQL for the local day number of `start_ms` (same scale as `db::today_day`).
const DAY: &str = "CAST(ROUND(julianday(date(start_ms / 1000, 'unixepoch', 'localtime')) - 2440587.5) AS INTEGER)";
const MINUTE: &str = "CAST(strftime('%H', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER) * 60 + CAST(strftime('%M', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER)";

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Bursts of local days `from..=to`, reduced for the challenges.
fn day_bursts(conn: &Connection, from: i64, to: i64) -> rusqlite::Result<Vec<DayBurst>> {
    // A cheap index range first (one extra day each side covers any time-zone offset), then the exact days.
    let sql = format!(
        "SELECT {DAY}, {MINUTE}, end_ms - start_ms, chars, best_streak, app_id FROM bursts
         WHERE start_ms >= ?1 AND start_ms < ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![(from - 1) * 86_400_000, (to + 2) * 86_400_000], |r| {
        Ok(DayBurst {
            day: r.get(0)?,
            start_min: r.get(1)?,
            duration_ms: r.get::<_, i64>(2)?.max(0) as u64,
            chars: r.get(3)?,
            best_streak: r.get(4)?,
            app_id: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().filter(|b| b.day >= from && b.day <= to).collect())
}

/// Distinct days with bursts before `day` (the index range adds a day of margin for time zones).
fn history_days(conn: &Connection, day: i64) -> rusqlite::Result<usize> {
    let sql = format!("SELECT COUNT(DISTINCT d) FROM (SELECT {DAY} AS d FROM bursts WHERE start_ms < ?1) WHERE d < ?2");
    conn.query_row(&sql, params![(day + 1) * 86_400_000, day], |r| r.get::<_, i64>(0)).map(|n| n.max(0) as usize)
}

/// Characters typed per local day.
fn daily_chars(conn: &Connection) -> rusqlite::Result<std::collections::HashMap<i64, u64>> {
    let sql = format!("SELECT {DAY}, SUM(chars) FROM bursts GROUP BY 1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
    rows.collect()
}

/// Inserts or raises an award. Returns true when the row is new.
fn award(conn: &Connection, day: i64, kind: &str, amount: u32) -> rusqlite::Result<bool> {
    if amount == 0 {
        return Ok(false);
    }
    let existed: bool = conn.query_row("SELECT 1 FROM xp_events WHERE day = ?1 AND kind = ?2", params![day, kind], |_| Ok(())).optional()?.is_some();
    conn.execute(
        "INSERT INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(day, kind) DO UPDATE SET amount = MAX(amount, excluded.amount)",
        params![now_ms(), day, kind, amount],
    )?;
    Ok(!existed)
}

/// The goal status of `day`: met, and the day streak it makes.
fn goal_on(days: &[(i64, u64)], day: i64, settings: &db::Settings) -> Option<u32> {
    let goal_ms = u64::from(settings.daily_goal_min) * 60_000;
    let s = tapomo_core::goal_status(days, day, goal_ms, settings.weekend_rest);
    s.met_today.then_some(s.streak_days)
}

/// Challenges of `day` with their progress.
pub fn challenges(conn: &Connection, day: i64, settings: &db::Settings) -> rusqlite::Result<[Challenge; 3]> {
    let bursts = day_bursts(conn, day - xp::CALIBRATION_DAYS, day)?;
    let goal_ms = u64::from(settings.daily_goal_min) * 60_000;
    let shortcuts = if settings.count_shortcuts { crate::shortcuts::daily(conn)? } else { Vec::new() };
    Ok(xp::daily_challenges(&bursts, day, history_days(conn, day)?, goal_ms, &shortcuts))
}

/// What a settle changed.
#[derive(Debug, Default)]
pub struct Settled {
    pub total: u64,
    /// Challenges completed by this settle (ids), to celebrate them.
    pub new_challenges: Vec<&'static str>,
}

/// Brings the ledger up to date with the stored bursts. Cheap enough to run after every burst.
///
/// The first time (no `xp_since_day` yet) the history before today is converted at once into a
/// single `retro` award: typing, goals and day streaks with the same daily caps, but no challenges
/// or records, which did not exist then.
pub fn settle(conn: &Connection) -> rusqlite::Result<Settled> {
    let today = db::today_day(conn)?;
    let settings = db::get_settings(conn)?;
    let days = db::daily_active(conn)?;
    let chars = daily_chars(conn)?;
    let since = match db::get_raw(conn, "xp_since_day")?.and_then(|v| v.parse::<i64>().ok()) {
        Some(d) => d,
        None => {
            let retro: u32 = chars
                .iter()
                .filter(|(d, _)| **d < today)
                .map(|(&d, &c)| xp::typing_xp(c) + goal_on(&days, d, &settings).map_or(0, |s| xp::GOAL_XP + xp::streak_xp(s)))
                .sum();
            award(conn, today, "retro", retro)?;
            db::set_raw(conn, "xp_since_day", &today.to_string())?;
            today
        }
    };
    let from = db::get_raw(conn, "xp_settled_day")?.and_then(|v| v.parse::<i64>().ok()).unwrap_or(since).max(since);
    let mut new_challenges = Vec::new();
    let shortcuts = crate::shortcuts::daily(conn)?;
    for day in from..=today {
        let used = shortcuts.iter().filter(|(d, _)| *d == day).map(|(_, n)| *n).sum();
        award(conn, day, "shortcuts", tapomo_core::shortcuts::shortcut_xp(used))?;
        award(conn, day, "typing", xp::typing_xp(chars.get(&day).copied().unwrap_or(0)))?;
        if let Some(streak) = goal_on(&days, day, &settings) {
            award(conn, day, "goal", xp::GOAL_XP)?;
            award(conn, day, "streak", xp::streak_xp(streak))?;
        }
        let list = challenges(conn, day, &settings)?;
        for c in list.iter().filter(|c| c.done) {
            if award(conn, day, &format!("challenge:{}", c.id), xp::CHALLENGE_XP)? && day == today {
                new_challenges.push(c.id);
            }
        }
        if list.iter().all(|c| c.done) {
            award(conn, day, "full", xp::FULL_HOUSE_XP)?;
        }
    }
    db::set_raw(conn, "xp_settled_day", &today.to_string())?;
    Ok(Settled { total: total(conn)?, new_challenges })
}

/// A personal record (10 s peak or clean run) beaten now: +10 XP, at most twice a day.
pub fn add_record(conn: &Connection) -> rusqlite::Result<()> {
    let today = db::today_day(conn)?;
    conn.execute(
        "INSERT INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, 'record', ?3)
         ON CONFLICT(day, kind) DO UPDATE SET amount = MIN(?4, amount + excluded.amount)",
        params![now_ms(), today, xp::RECORD_XP, xp::RECORD_XP_CAP],
    )?;
    Ok(())
}

pub fn total(conn: &Connection) -> rusqlite::Result<u64> {
    conn.query_row("SELECT COALESCE(SUM(amount), 0) FROM xp_events", [], |r| r.get::<_, i64>(0)).map(|n| n.max(0) as u64)
}

#[derive(Debug, Serialize)]
pub struct ChallengeOut {
    pub id: &'static str,
    pub target: u32,
    pub progress: u32,
    pub done: bool,
}

/// Everything the Today view and the wardrobe need.
#[derive(Debug, Serialize)]
pub struct XpState {
    pub xp: u64,
    pub level: u32,
    pub level_start: u64,
    pub next_level_at: u64,
    pub today_xp: u64,
    pub challenges: Vec<ChallengeOut>,
    /// Highest level the user has already been shown (its rewards revealed).
    pub seen_level: u32,
    /// Level the history alone gave, while its one-off message has not been shown.
    pub retro_level: Option<u32>,
}

pub fn state(conn: &Connection) -> rusqlite::Result<XpState> {
    let total = total(conn)?;
    let info = xp::level_info(total);
    let today = db::today_day(conn)?;
    let today_xp: i64 = conn.query_row("SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE day = ?1 AND kind <> 'retro'", [today], |r| r.get(0))?;
    let settings = db::get_settings(conn)?;
    let challenges = challenges(conn, today, &settings)?
        .into_iter()
        .map(|c| ChallengeOut { id: c.id, target: c.target, progress: c.progress, done: c.done })
        .collect();
    let seen_level = db::get_raw(conn, "xp_seen_level")?.and_then(|v| v.parse().ok()).unwrap_or(1);
    let retro: Option<i64> = conn.query_row("SELECT amount FROM xp_events WHERE kind = 'retro'", [], |r| r.get(0)).optional()?;
    let retro_seen = db::get_raw(conn, "xp_retro_seen")?.is_some();
    Ok(XpState {
        xp: total,
        level: info.level,
        level_start: info.level_start,
        next_level_at: info.next_level_at,
        today_xp: today_xp.max(0) as u64,
        challenges,
        seen_level,
        retro_level: retro.filter(|_| !retro_seen).map(|a| xp::level_for_xp(a.max(0) as u64)),
    })
}

/// The level-up (or the history message) has been shown up to `level`.
pub fn ack(conn: &Connection, level: u32) -> rusqlite::Result<()> {
    let seen: u32 = db::get_raw(conn, "xp_seen_level")?.and_then(|v| v.parse().ok()).unwrap_or(1);
    db::set_raw(conn, "xp_seen_level", &seen.max(level).to_string())?;
    db::set_raw(conn, "xp_retro_seen", "1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tapomo_core::Burst;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-xp-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    /// A burst `days_ago` local days back, at noon, `secs` long with `chars` characters.
    fn burst(conn: &Connection, days_ago: i64, secs: u64, chars: u32) {
        let start: i64 = conn
            .query_row("SELECT CAST(strftime('%s', 'now', 'localtime', 'start of day', ?1, '+12 hours', 'utc') AS INTEGER) * 1000", [format!("-{days_ago} days")], |r| r.get(0))
            .unwrap();
        let app = db::intern_app(conn, "test.exe").unwrap();
        let b = Burst { app_id: app, start_ms: start as u64, end_ms: start as u64 + secs * 1000, chars, backspaces: 0, word_deletes: 0, peak_wpm: None, best_streak: chars };
        db::insert_burst(conn, &b).unwrap();
    }

    #[test]
    fn history_becomes_one_retro_award_and_settling_is_idempotent() {
        let c = mem();
        burst(&c, 2, 25 * 60, 10_000); // goal met (20 min): 100 typing + 30 goal + 2 streak
        burst(&c, 1, 60, 500); // 5 typing
        let s = settle(&c).unwrap();
        assert_eq!(s.total, 137);
        assert_eq!(settle(&c).unwrap().total, 137);
        let st = state(&c).unwrap();
        assert_eq!((st.level, st.retro_level, st.today_xp), (2, Some(2), 0));
        ack(&c, 2).unwrap();
        assert_eq!(state(&c).unwrap().retro_level, None);
    }

    #[test]
    fn today_grows_and_never_shrinks() {
        let c = mem();
        settle(&c).unwrap(); // a new user: no history, no retro
        assert_eq!(total(&c).unwrap(), 0);
        burst(&c, 0, 60, 1_000);
        settle(&c).unwrap();
        let first = total(&c).unwrap();
        assert!(first >= 10, "typing XP plus maybe welcome challenges, got {first}");
        burst(&c, 0, 60, 1_000);
        let s = settle(&c).unwrap();
        assert!(s.total >= first + 10);
        // Lowering the goal setting or anything else never takes XP away.
        let mut set = db::get_settings(&c).unwrap();
        set.daily_goal_min = 0;
        db::set_settings(&c, &set).unwrap();
        assert!(settle(&c).unwrap().total >= s.total);
    }

    #[test]
    fn welcome_challenges_pay_once() {
        let c = mem();
        settle(&c).unwrap();
        for _ in 0..3 {
            burst(&c, 0, 30, 400);
        }
        let s = settle(&c).unwrap();
        assert!(s.new_challenges.contains(&"bursts") && s.new_challenges.contains(&"chars"), "{:?}", s.new_challenges);
        assert!(settle(&c).unwrap().new_challenges.is_empty());
    }

    #[test]
    fn records_are_capped_per_day() {
        let c = mem();
        settle(&c).unwrap();
        for _ in 0..5 {
            add_record(&c).unwrap();
        }
        assert_eq!(total(&c).unwrap(), u64::from(xp::RECORD_XP_CAP));
    }
}
