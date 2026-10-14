//! "Ver tus récords" (0.3.7): the context of each personal record. There is never any text to show
//! (it is never stored), only when, where, how long and how fast.

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
pub struct Record {
    /// `peak` (best 10 s speed), `clean` (longest run without deleting), `long` (longest burst),
    /// `day` (most characters in one day).
    pub id: &'static str,
    pub value: f64,
    /// When it happened (start of the burst, or noon of the day for `day`), Unix ms.
    pub at_ms: i64,
    /// App it happened in (alias if set). `None` for `day`.
    pub app: Option<String>,
    pub duration_ms: u64,
    pub chars: u64,
}

const APP: &str = "COALESCE(NULLIF(a.alias, ''), a.exe)";

fn burst_record(conn: &Connection, id: &'static str, order: &str, value: &str) -> rusqlite::Result<Option<Record>> {
    conn.query_row(
        &format!(
            "SELECT {value}, b.start_ms, {APP}, b.end_ms - b.start_ms, b.chars
             FROM bursts b JOIN apps a ON a.id = b.app_id WHERE {value} IS NOT NULL ORDER BY {order} DESC, b.start_ms ASC LIMIT 1"
        ),
        [],
        |r| {
            Ok(Record {
                id,
                value: r.get(0)?,
                at_ms: r.get(1)?,
                app: r.get(2)?,
                duration_ms: r.get::<_, i64>(3)?.max(0) as u64,
                chars: r.get::<_, i64>(4)?.max(0) as u64,
            })
        },
    )
    .optional()
}

/// The records, best first per kind; kinds with no data are left out.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Record>> {
    let mut out = Vec::new();
    out.extend(burst_record(conn, "peak", "b.peak_wpm", "b.peak_wpm")?);
    out.extend(burst_record(conn, "clean", "b.best_streak", "CAST(b.best_streak AS REAL)")?);
    out.extend(burst_record(conn, "long", "b.end_ms - b.start_ms", "CAST(b.end_ms - b.start_ms AS REAL)")?);
    let day: Option<(i64, i64, i64)> = conn
        .query_row(
            "SELECT date(start_ms / 1000, 'unixepoch', 'localtime') AS d, SUM(chars), SUM(end_ms - start_ms)
             FROM bursts GROUP BY d ORDER BY SUM(chars) DESC, d ASC LIMIT 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?
        .map(|(d, chars, ms): (String, i64, i64)| {
            let noon: i64 = conn
                .query_row("SELECT CAST(strftime('%s', ?1, '+12 hours', 'utc') AS INTEGER) * 1000", [d], |r| r.get(0))
                .unwrap_or(0);
            (noon, chars, ms)
        });
    if let Some((at_ms, chars, ms)) = day {
        out.push(Record { id: "day", value: chars as f64, at_ms, app: None, duration_ms: ms.max(0) as u64, chars: chars.max(0) as u64 });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tapomo_core::Burst;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-records-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    fn burst(c: &Connection, exe: &str, start: u64, secs: u64, chars: u32, peak: Option<f64>, clean: u32) {
        let app = db::intern_app(c, exe).unwrap();
        db::insert_burst(c, &Burst { app_id: app, start_ms: start, end_ms: start + secs * 1000, chars, backspaces: 0, word_deletes: 0, peak_wpm: peak, best_streak: clean })
            .unwrap();
    }

    #[test]
    fn each_record_with_its_context() {
        let c = mem();
        assert!(list(&c).unwrap().is_empty());
        let t0 = 1_760_000_000_000;
        burst(&c, "WINWORD.EXE", t0, 60, 400, Some(70.0), 300);
        burst(&c, "code.exe", t0 + 3_600_000, 300, 1_500, Some(91.5), 120);
        db::set_alias(&c, "code.exe", "VS Code").unwrap();
        let r = list(&c).unwrap();
        let get = |id: &str| r.iter().find(|x| x.id == id).unwrap();
        assert_eq!((get("peak").value, get("peak").app.as_deref()), (91.5, Some("VS Code")));
        assert_eq!((get("clean").value, get("clean").app.as_deref()), (300.0, Some("WINWORD.EXE")));
        assert_eq!(get("long").duration_ms, 300_000);
        assert_eq!(get("day").chars, 1_900);
    }
}
