//! Badges ("insignias", 0.3.3): gathers the facts from the database, stores the badges earned and
//! gives their one-off XP. The catalogue and the rules live in `tapomo_core::badges`.

use rusqlite::{params, Connection};
use serde::Serialize;
use tapomo_core::badges::{self, Facts, BADGES};

use crate::db;

/// Share of the personal pace that counts as "¡Superándote!" for the `beating_5` badge.
pub const BEATING_SHARE: f64 = 0.95;

const HOUR: &str = "CAST(strftime('%H', start_ms / 1000, 'unixepoch', 'localtime') AS INTEGER)";
const DAY: &str = "CAST(ROUND(julianday(date(start_ms / 1000, 'unixepoch', 'localtime')) - 2440587.5) AS INTEGER)";

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Bursts that reached the beating zone. Counted live from 0.3.3 on; the first time, the history is
/// counted against today's personal pace (the pace back then is not stored).
pub fn beating_bursts(conn: &Connection) -> rusqlite::Result<u32> {
    if let Some(n) = db::get_raw(conn, "beating_bursts")?.and_then(|v| v.parse().ok()) {
        return Ok(n);
    }
    let n: u32 = match tapomo_core::personal_reference(&db::peak_data(conn)?.0) {
        Some(reference) => conn.query_row("SELECT COUNT(*) FROM bursts WHERE peak_wpm >= ?1", [reference * BEATING_SHARE], |r| r.get(0))?,
        None => 0,
    };
    db::set_raw(conn, "beating_bursts", &n.to_string())?;
    Ok(n)
}

/// One more burst reached the beating zone.
pub fn add_beating_burst(conn: &Connection) -> rusqlite::Result<()> {
    let n = beating_bursts(conn)?;
    db::set_raw(conn, "beating_bursts", &(n + 1).to_string())
}

fn facts(conn: &Connection) -> rusqlite::Result<Facts> {
    let settings = db::get_settings(conn)?;
    let goal_ms = u64::from(settings.daily_goal_min) * 60_000;
    let today = db::today_day(conn)?;
    let days = db::daily_active(conn)?;
    let column = |sql: &str| -> rusqlite::Result<Vec<f64>> {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |r| r.get::<_, f64>(0))?;
        rows.collect()
    };
    let exists = |sql: String| -> rusqlite::Result<bool> { conn.query_row(&format!("SELECT EXISTS({sql})"), [], |r| r.get(0)) };
    Ok(Facts {
        bursts: conn.query_row("SELECT COUNT(*) FROM bursts", [], |r| r.get::<_, i64>(0))?.max(0) as u64,
        best_clean_run: db::best_streak(conn)?,
        best_day_chars: conn
            .query_row(&format!("SELECT COALESCE(MAX(c), 0) FROM (SELECT SUM(chars) AS c FROM bursts GROUP BY {DAY})"), [], |r| r.get::<_, i64>(0))?
            .max(0) as u64,
        peak_records: badges::record_count(column("SELECT peak_wpm FROM bursts WHERE peak_wpm IS NOT NULL ORDER BY start_ms")?),
        crown_records: badges::record_count(column("SELECT best_streak FROM bursts ORDER BY start_ms")?),
        beating_bursts: beating_bursts(conn)?,
        best_day_streak: badges::best_day_streak(&days, today, goal_ms, settings.weekend_rest),
        early_bird: exists(format!("SELECT 1 FROM bursts WHERE {HOUR} < 8"))?,
        night_owl: exists(format!("SELECT 1 FROM bursts WHERE {HOUR} >= 23"))?,
        full_goal_week: badges::full_goal_week(&days, goal_ms, settings.weekend_rest),
        full_houses: conn.query_row("SELECT COUNT(*) FROM xp_events WHERE kind = 'full'", [], |r| r.get(0))?,
    })
}

fn earned_ids(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT id FROM badges")?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    rows.collect()
}

/// Stores the badges earned since the last check and gives their XP. Returns their ids. The very first
/// check (nothing stored yet and never checked) marks what the history earned as `retro`.
pub fn check(conn: &Connection) -> rusqlite::Result<Vec<&'static str>> {
    let have = earned_ids(conn)?;
    let new = badges::newly_earned(&facts(conn)?, &have);
    let first = db::get_raw(conn, "badges_checked")?.is_none();
    if new.is_empty() && !first {
        return Ok(new);
    }
    let today = db::today_day(conn)?;
    let tx = conn.unchecked_transaction()?;
    for id in &new {
        let xp = badges::find(id).map_or(0, |b| b.rarity.xp());
        tx.execute("INSERT OR IGNORE INTO badges(id, ts, retro) VALUES (?1, ?2, ?3)", params![id, now_ms(), first])?;
        tx.execute(
            "INSERT INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(day, kind) DO NOTHING",
            params![now_ms(), today, format!("badge:{id}"), xp],
        )?;
    }
    db::set_raw(&tx, "badges_checked", "1")?;
    tx.commit()?;
    Ok(new)
}

#[derive(Debug, Serialize)]
pub struct BadgeOut {
    pub id: &'static str,
    pub rarity: &'static str,
    pub xp: u32,
    /// Unix ms when it was earned; `None` while pending.
    pub earned_ms: Option<i64>,
    /// Earned by the history before badges existed (shown together, once).
    pub retro: bool,
    /// Pending only: progress for the hint ("312 of 1,000").
    pub have: u64,
    pub need: u64,
    /// Earned but not shown to the user yet.
    pub unseen: bool,
}

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<BadgeOut>> {
    let f = facts(conn)?;
    let mut stmt = conn.prepare("SELECT id, ts, retro, seen FROM badges")?;
    let stored: Vec<(String, i64, bool, bool)> =
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<rusqlite::Result<_>>()?;
    Ok(BADGES
        .iter()
        .map(|b| {
            let row = stored.iter().find(|s| s.0 == b.id);
            let (have, need) = (b.progress)(&f);
            BadgeOut {
                id: b.id,
                rarity: b.rarity.id(),
                xp: b.rarity.xp(),
                earned_ms: row.map(|r| r.1),
                retro: row.is_some_and(|r| r.2),
                have: have.min(need),
                need,
                unseen: row.is_some_and(|r| !r.3),
            }
        })
        .collect())
}

/// The badges have been shown: clears the "new" dot.
pub fn mark_seen(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("UPDATE badges SET seen = 1 WHERE seen = 0", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tapomo_core::Burst;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-badges-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    fn burst(conn: &Connection, hour: u32, chars: u32, peak: Option<f64>, clean: u32) {
        let start: i64 = conn
            .query_row(
                "SELECT CAST(strftime('%s', 'now', 'localtime', 'start of day', ?1, 'utc') AS INTEGER) * 1000",
                [format!("+{hour} hours")],
                |r| r.get(0),
            )
            .unwrap();
        let app = db::intern_app(conn, "test.exe").unwrap();
        let b = Burst { app_id: app, start_ms: start as u64, end_ms: start as u64 + 60_000, chars, backspaces: 0, word_deletes: 0, peak_wpm: peak, best_streak: clean };
        db::insert_burst(conn, &b).unwrap();
    }

    #[test]
    fn history_badges_are_retro_and_paid_once() {
        let c = mem();
        burst(&c, 6, 500, Some(50.0), 100);
        burst(&c, 9, 600, Some(60.0), 200);
        let first = check(&c).unwrap();
        assert!(first.contains(&"first_burst") && first.contains(&"early_bird") && first.contains(&"first_record") && first.contains(&"crowned"), "{first:?}");
        assert!(check(&c).unwrap().is_empty());
        let l = list(&c).unwrap();
        let fb = l.iter().find(|b| b.id == "first_burst").unwrap();
        assert!(fb.retro && fb.unseen && fb.earned_ms.is_some());
        let xp: i64 = c.query_row("SELECT SUM(amount) FROM xp_events WHERE kind LIKE 'badge:%'", [], |r| r.get(0)).unwrap();
        assert_eq!(xp, 25 * 3 + 50); // crowned is silver
        mark_seen(&c).unwrap();
        assert!(list(&c).unwrap().iter().all(|b| !b.unseen));
    }

    #[test]
    fn later_badges_are_not_retro_and_pending_ones_show_progress() {
        let c = mem();
        assert!(check(&c).unwrap().is_empty()); // nothing yet, but the first check is done
        burst(&c, 23, 500, None, 50);
        let new = check(&c).unwrap();
        assert_eq!(new, ["first_burst", "night_owl"]);
        let l = list(&c).unwrap();
        assert!(!l.iter().find(|b| b.id == "night_owl").unwrap().retro);
        let hundred = l.iter().find(|b| b.id == "bursts_100").unwrap();
        assert_eq!((hundred.have, hundred.need, hundred.earned_ms), (1, 100, None));
    }

    #[test]
    fn beating_counter_starts_from_history_then_counts_live() {
        let c = mem();
        assert_eq!(beating_bursts(&c).unwrap(), 0);
        add_beating_burst(&c).unwrap();
        add_beating_burst(&c).unwrap();
        assert_eq!(beating_bursts(&c).unwrap(), 2);
    }
}
