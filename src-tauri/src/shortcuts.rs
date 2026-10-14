//! Shortcut counter, phase A (0.3.6): daily counts per kind. Only `(day, kind, count)` is stored:
//! never which shortcut it was, never a key.

use rusqlite::{params, Connection};
use serde::Serialize;
use tapomo_core::shortcuts::ShortcutKind;

use crate::db;

/// One more shortcut of `kind` today.
pub fn add(conn: &Connection, kind: ShortcutKind) -> rusqlite::Result<()> {
    let day = db::today_day(conn)?;
    conn.execute(
        "INSERT INTO shortcut_days(day, kind, count) VALUES (?1, ?2, 1)
         ON CONFLICT(day, kind) DO UPDATE SET count = count + 1",
        params![day, kind.id()],
    )?;
    Ok(())
}

/// Shortcuts per local day (all kinds together).
pub fn daily(conn: &Connection) -> rusqlite::Result<Vec<(i64, u64)>> {
    let mut stmt = conn.prepare("SELECT day, SUM(count) FROM shortcut_days GROUP BY day")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?;
    rows.collect()
}

#[derive(Debug, Serialize, Default)]
pub struct Today {
    pub enabled: bool,
    pub total: u64,
    /// `(kind id, count)` for the five kinds, in display order.
    pub kinds: Vec<(&'static str, u64)>,
    /// All-time total, for the "Maestro de atajos" hint.
    pub all_time: u64,
}

pub fn today(conn: &Connection) -> rusqlite::Result<Today> {
    let day = db::today_day(conn)?;
    let mut stmt = conn.prepare("SELECT kind, count FROM shortcut_days WHERE day = ?1")?;
    let rows: Vec<(String, i64)> = stmt.query_map([day], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
    let kinds: Vec<(&'static str, u64)> = ShortcutKind::ALL
        .iter()
        .map(|k| (k.id(), rows.iter().filter(|(id, _)| id == k.id()).map(|(_, n)| (*n).max(0) as u64).sum()))
        .collect();
    let all_time: i64 = conn.query_row("SELECT COALESCE(SUM(count), 0) FROM shortcut_days", [], |r| r.get(0))?;
    Ok(Today {
        enabled: db::get_settings(conn)?.count_shortcuts,
        total: kinds.iter().map(|(_, n)| n).sum(),
        kinds,
        all_time: all_time.max(0) as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-shortcuts-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    #[test]
    fn counts_by_kind_and_day() {
        let c = mem();
        for _ in 0..3 {
            add(&c, ShortcutKind::Clipboard).unwrap();
        }
        add(&c, ShortcutKind::Save).unwrap();
        let t = today(&c).unwrap();
        assert!(t.enabled, "on by default");
        assert_eq!((t.total, t.all_time), (4, 4));
        assert_eq!(t.kinds[0], ("clipboard", 3));
        assert_eq!(t.kinds[2], ("save", 1));
        assert_eq!(daily(&c).unwrap(), vec![(db::today_day(&c).unwrap(), 4)]);
    }
}
