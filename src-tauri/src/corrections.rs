//! Corrected keys: how many times the key pressed right before a Backspace was a given one, as a daily
//! total per virtual key. Never text, never a sequence, never the app. Can be turned off.

use std::collections::HashMap;

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db;

/// Adds `counts` (`vk` -> times) to today's totals.
pub fn add_many(conn: &Connection, counts: &HashMap<u32, u32>) -> rusqlite::Result<()> {
    let day = db::today_day(conn)?;
    let tx = conn.unchecked_transaction()?;
    for (vk, n) in counts.iter().filter(|(vk, n)| **vk <= 255 && **n > 0) {
        tx.execute(
            "INSERT INTO corrected_keys(day, vk, n) VALUES (?1, ?2, ?3)
             ON CONFLICT(day, vk) DO UPDATE SET n = n + excluded.n",
            params![day, vk, n],
        )?;
    }
    tx.commit()
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Corrected {
    pub vk: u32,
    pub count: u64,
}

/// The `n` most corrected keys of the last `days` days (today included), most corrected first.
pub fn top(conn: &Connection, days: u32, n: usize) -> rusqlite::Result<Vec<Corrected>> {
    let from = db::today_day(conn)? - i64::from(days.clamp(1, 366)) + 1;
    let mut stmt = conn.prepare(
        "SELECT vk, SUM(n) AS total FROM corrected_keys WHERE day >= ?1 GROUP BY vk ORDER BY total DESC, vk LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![from, n as i64], |r| Ok(Corrected { vk: r.get(0)?, count: r.get::<_, i64>(1)?.max(0) as u64 }))?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-corrections-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    #[test]
    fn aggregates_per_day_and_ranks() {
        let c = mem();
        add_many(&c, &HashMap::from([(0x41, 3), (0x42, 5)])).unwrap();
        add_many(&c, &HashMap::from([(0x41, 4), (0x43, 1)])).unwrap();
        let t = top(&c, 30, 2).unwrap();
        assert_eq!(t, vec![Corrected { vk: 0x41, count: 7 }, Corrected { vk: 0x42, count: 5 }]);
        let rows: i64 = c.query_row("SELECT COUNT(*) FROM corrected_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 3, "one row per day and key");
    }

    #[test]
    fn old_days_fall_out_of_the_window() {
        let c = mem();
        let today = db::today_day(&c).unwrap();
        c.execute("INSERT INTO corrected_keys(day, vk, n) VALUES (?1, 65, 99)", [today - 40]).unwrap();
        add_many(&c, &HashMap::from([(66, 1)])).unwrap();
        assert_eq!(top(&c, 30, 5).unwrap(), vec![Corrected { vk: 66, count: 1 }]);
        assert!(top(&mem(), 30, 5).unwrap().is_empty());
    }
}
