//! League with yourself (0.3.4): weekly XP from the ledger, replayed by `tapomo_core::league`.
//! Badges and the one-off history award do not count: the league measures each week's effort.

use rusqlite::Connection;
use serde::Serialize;
use tapomo_core::league::{self, Outcome, LEAGUES};

use crate::db;

const COUNTED: &str = "kind <> 'retro' AND kind NOT LIKE 'badge:%'";

fn monday(day: i64) -> i64 {
    day - i64::from(tapomo_core::weekday(day))
}

#[derive(Debug, Serialize)]
pub struct LeagueOut {
    /// `bronze` … `legend`.
    pub league: &'static str,
    pub index: usize,
    pub week_xp: u64,
    /// XP this week has to beat to go up; `None` at the top or before the first finished week.
    pub target: Option<u64>,
    /// Days left in the current week, today included (1 on Sunday).
    pub days_left: u8,
    /// Result of the last finished week, while it has not been shown.
    pub result: Option<WeekResult>,
}

#[derive(Debug, Serialize)]
pub struct WeekResult {
    /// Monday of that week (local day number).
    pub week: i64,
    pub up: bool,
    pub league: &'static str,
    pub xp: u64,
}

pub fn state(conn: &Connection) -> rusqlite::Result<LeagueOut> {
    let today = db::today_day(conn)?;
    let since = db::get_raw(conn, "xp_since_day")?.and_then(|v| v.parse::<i64>().ok()).unwrap_or(today);
    let mut stmt = conn.prepare(&format!("SELECT day, SUM(amount) FROM xp_events WHERE {COUNTED} GROUP BY day"))?;
    let daily = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let weekly: Vec<(i64, u64)> = daily.into_iter().map(|(d, xp)| (monday(d), xp)).collect();
    let s = league::league_state(&weekly, monday(since), monday(today));
    let seen: i64 = db::get_raw(conn, "league_seen_week")?.and_then(|v| v.parse().ok()).unwrap_or(i64::MIN);
    let result = s.last.filter(|(week, _, _)| *week > seen).map(|(week, outcome, xp)| match outcome {
        Outcome::Up(i) => WeekResult { week, up: true, league: LEAGUES[i], xp },
        Outcome::Stay(i) => WeekResult { week, up: false, league: LEAGUES[i], xp },
    });
    Ok(LeagueOut {
        league: LEAGUES[s.league],
        index: s.league,
        week_xp: s.week_xp,
        target: s.target,
        days_left: 7 - tapomo_core::weekday(today),
        result,
    })
}

/// The result of the week starting on `week` has been shown.
pub fn ack(conn: &Connection, week: i64) -> rusqlite::Result<()> {
    let seen: i64 = db::get_raw(conn, "league_seen_week")?.and_then(|v| v.parse().ok()).unwrap_or(i64::MIN);
    db::set_raw(conn, "league_seen_week", &seen.max(week).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-league-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    fn add(c: &Connection, day: i64, kind: &str, amount: u32) {
        c.execute("INSERT INTO xp_events(ts, day, kind, amount) VALUES (0, ?1, ?2, ?3)", params![day, kind, amount]).unwrap();
    }

    #[test]
    fn last_week_beat_the_one_before() {
        let c = mem();
        let this = monday(db::today_day(&c).unwrap());
        db::set_raw(&c, "xp_since_day", &(this - 14).to_string()).unwrap();
        add(&c, this - 14, "typing", 300);
        add(&c, this - 14, "retro", 50_000); // history and badges never count
        add(&c, this - 7, "typing", 500);
        add(&c, this - 7, "badge:first_burst", 25);
        add(&c, this, "typing", 40);
        let s = state(&c).unwrap();
        assert_eq!((s.league, s.week_xp, s.target), ("silver", 40, Some(400)));
        let r = s.result.unwrap();
        assert_eq!((r.week, r.up, r.league, r.xp), (this - 7, true, "silver", 500));
        ack(&c, this - 7).unwrap();
        assert!(state(&c).unwrap().result.is_none());
    }

    #[test]
    fn a_new_user_starts_in_bronze_with_nothing_to_show() {
        let c = mem();
        let s = state(&c).unwrap();
        assert_eq!((s.league, s.target), ("bronze", None));
        assert!(s.result.is_none());
        assert!((1..=7).contains(&s.days_left));
    }
}
