//! Typing lessons (0.4): results, per-key stats (lesson text only) and lesson XP.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tapomo_core::lessons as core;

use crate::db;

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Per-key counts from one lesson. `key` is a character of OUR lesson text, never the user's own typing.
#[derive(Debug, Deserialize)]
pub struct KeyCount {
    pub key: String,
    pub hits: u32,
    pub misses: u32,
    /// Total time to type this key correctly, in ms (for the average).
    pub ms: u64,
}

/// Per-pair counts from one lesson: `pair` is two consecutive letters of OUR lesson text.
#[derive(Debug, Deserialize)]
pub struct PairCount {
    pub pair: String,
    pub hits: u32,
    pub misses: u32,
    pub ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct LessonRun {
    pub lesson_id: String,
    /// `es` or `us`.
    pub layout: String,
    pub duration_ms: u64,
    pub wpm: f64,
    pub accuracy: f64,
    pub target_wpm: f64,
    pub keys: Vec<KeyCount>,
    #[serde(default)]
    pub bigrams: Vec<PairCount>,
    /// Characters of the lesson text typed (0.7.2: lessons count as typing).
    #[serde(default)]
    pub chars: u32,
    /// Longest run without a mistake.
    #[serde(default)]
    pub best_run: u32,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Saved {
    pub stars: u8,
    pub best_before: u8,
    pub xp: u32,
}

/// Known lesson keyboard layouts; anything else counts as Spanish (the first one shipped).
fn layout_id(s: &str) -> &'static str {
    match s {
        "us" => "us",
        "fr" => "fr",
        "de" => "de",
        _ => "es",
    }
}

/// Exactly two letters (no spaces, digits or punctuation).
fn is_pair(s: &str) -> bool {
    s.chars().count() == 2 && s.chars().all(char::is_alphabetic)
}

fn clean_id(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')).take(48).collect()
}

/// Stores a finished lesson and gives its XP (capped per day). Returns the stars and XP.
pub fn save(conn: &Connection, run: &LessonRun) -> rusqlite::Result<Saved> {
    let id = clean_id(&run.lesson_id);
    let layout = layout_id(&run.layout);
    let accuracy = run.accuracy.clamp(0.0, 1.0);
    let wpm = if run.wpm.is_finite() { run.wpm.clamp(0.0, 300.0) } else { 0.0 };
    let stars = core::stars(accuracy, wpm, run.target_wpm);
    let today = db::today_day(conn)?;
    let best_before: u8 = conn
        .query_row("SELECT MAX(stars) FROM lesson_results WHERE lesson_id = ?1 AND layout = ?2", params![id, layout], |r| r.get::<_, Option<u8>>(0))?
        .unwrap_or(0);
    let accurate_before: bool = conn
        .query_row("SELECT 1 FROM lesson_results WHERE lesson_id = ?1 AND layout = ?2 AND accuracy >= ?3", params![id, layout, core::TWO_STARS], |_| Ok(()))
        .optional()?
        .is_some();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO lesson_results(lesson_id, layout, ts, day, duration_ms, wpm, accuracy, stars, as_burst) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, layout, now_ms(), today, run.duration_ms.min(3_600_000) as i64, wpm, accuracy, stars, run.chars > 0],
    )?;
    for k in run.keys.iter().filter(|k| k.key.chars().count() == 1) {
        tx.execute(
            "INSERT INTO key_stats(layout, key, hits, misses, total_ms) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(layout, key) DO UPDATE SET hits = hits + excluded.hits, misses = misses + excluded.misses, total_ms = total_ms + excluded.total_ms",
            params![layout, k.key, k.hits, k.misses, k.ms.min(600_000) as i64],
        )?;
    }
    for b in run.bigrams.iter().take(400).filter(|b| is_pair(&b.pair)) {
        tx.execute(
            "INSERT INTO bigram_stats(layout, pair, hits, misses, total_ms) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(layout, pair) DO UPDATE SET hits = hits + excluded.hits, misses = misses + excluded.misses, total_ms = total_ms + excluded.total_ms",
            params![layout, b.pair.to_lowercase(), b.hits, b.misses, b.ms.min(600_000) as i64],
        )?;
    }
    // Daily lesson XP, capped: the amount only grows up to the cap.
    let cap = core::LESSON_XP * core::LESSON_XP_DAILY_CAP;
    tx.execute(
        "INSERT INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, 'lessons', ?3)
         ON CONFLICT(day, kind) DO UPDATE SET amount = MIN(?4, amount + excluded.amount)",
        params![now_ms(), today, core::LESSON_XP, cap],
    )?;
    let first_accurate = !accurate_before && accuracy >= core::TWO_STARS;
    if first_accurate {
        tx.execute(
            "INSERT OR IGNORE INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, ?3, ?4)",
            params![now_ms(), today, format!("lesson:{layout}:{id}"), core::FIRST_ACCURATE_XP],
        )?;
    }
    tx.commit()?;
    Ok(Saved { stars, best_before, xp: core::lesson_xp(first_accurate) })
}

#[derive(Debug, Serialize)]
pub struct Progress {
    /// `(lesson id, best stars, times done, best wpm)`. The best wpm is the sprint's personal best.
    pub lessons: Vec<(String, u8, u32, f64)>,
    /// `(lesson id, best stars)` of the lessons done today («Texto del día», «Tu práctica del día»).
    pub today: Vec<(String, u8)>,
    /// Average speed of the last lessons in this layout, for the «Ritmo» pacer and the daily practice size.
    pub recent_wpm: Option<f64>,
    /// Everyday average speed over the last 30 days, to set fair lesson targets.
    pub everyday_wpm: Option<f64>,
    /// Real (everyday) speed in the 14 days before the first lesson and in the last 14 days, once
    /// lessons started at least a week ago: "desde que empezaste las lecciones…".
    pub before_after: Option<(f64, f64)>,
}

/// Duration-weighted average wpm of bursts in `[from, to)` (ms), if there is enough typing.
fn avg_wpm(conn: &Connection, from: i64, to: i64) -> rusqlite::Result<Option<f64>> {
    let (intervals, ms, n): (f64, f64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(MAX(chars - 1, 0)), 0), COALESCE(SUM(end_ms - start_ms), 0), COUNT(*) FROM bursts WHERE start_ms >= ?1 AND start_ms < ?2",
        params![from, to],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    Ok((n >= 10 && ms > 0.0).then(|| intervals / 5.0 / (ms / 60_000.0)))
}

pub fn progress(conn: &Connection, layout: &str) -> rusqlite::Result<Progress> {
    let layout = layout_id(layout);
    let mut stmt = conn.prepare("SELECT lesson_id, MAX(stars), COUNT(*), MAX(wpm) FROM lesson_results WHERE layout = ?1 GROUP BY lesson_id")?;
    let lessons = stmt.query_map([layout], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut stmt = conn.prepare("SELECT lesson_id, MAX(stars) FROM lesson_results WHERE layout = ?1 AND day = ?2 GROUP BY lesson_id")?;
    let today = stmt.query_map(params![layout, db::today_day(conn)?], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let recent_wpm = recent_wpm(conn, layout)?;
    let now = now_ms();
    const DAY: i64 = 86_400_000;
    let everyday_wpm = avg_wpm(conn, now - 30 * DAY, now)?;
    let first: Option<i64> = conn.query_row("SELECT MIN(ts) FROM lesson_results", [], |r| r.get(0))?;
    let before_after = match first {
        Some(f) if now - f >= 7 * DAY => avg_wpm(conn, f - 14 * DAY, f)?.zip(avg_wpm(conn, now - 14 * DAY, now)?),
        _ => None,
    };
    Ok(Progress { lessons, everyday_wpm, before_after, today, recent_wpm })
}

/// How many recent lessons make the «recent lesson speed».
const RECENT_LESSONS: i64 = 10;

/// Average wpm of the last lessons in `layout` (at least 3 of them, else None).
fn recent_wpm(conn: &Connection, layout: &str) -> rusqlite::Result<Option<f64>> {
    let (avg, n): (Option<f64>, i64) = conn.query_row(
        "SELECT AVG(wpm), COUNT(*) FROM (SELECT wpm FROM lesson_results WHERE layout = ?1 AND wpm > 0 ORDER BY ts DESC, id DESC LIMIT ?2)",
        params![layout, RECENT_LESSONS],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(avg.filter(|_| n >= 3))
}

/// Keys of OUR lesson texts with the most misses or slowest times, hardest first.
pub fn hard_keys(conn: &Connection, layout: &str, n: usize) -> rusqlite::Result<Vec<String>> {
    let layout = layout_id(layout);
    let mut stmt = conn.prepare(
        "SELECT key, (misses + 1.0) / (hits + misses + 2.0) AS miss_rate, total_ms * 1.0 / MAX(hits, 1) AS avg_ms
         FROM key_stats WHERE layout = ?1 AND hits + misses >= 5 AND key <> ' '",
    )?;
    let mut rows: Vec<(String, f64, f64)> = stmt.query_map([layout], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
    let mean_ms = if rows.is_empty() { 1.0 } else { rows.iter().map(|r| r.2).sum::<f64>() / rows.len() as f64 };
    // Score: misses weigh most, slowness adds a little.
    rows.sort_by(|a, b| (b.1 * 3.0 + b.2 / mean_ms).total_cmp(&(a.1 * 3.0 + a.2 / mean_ms)));
    Ok(rows.into_iter().take(n).map(|r| r.0).collect())
}

/// Letter pairs of OUR lesson texts with the most misses or slowest times, hardest first.
pub fn hard_bigrams(conn: &Connection, layout: &str, n: usize) -> rusqlite::Result<Vec<String>> {
    let layout = layout_id(layout);
    let mut stmt = conn.prepare(
        "SELECT pair, (misses + 1.0) / (hits + misses + 2.0) AS miss_rate, total_ms * 1.0 / MAX(hits, 1) AS avg_ms
         FROM bigram_stats WHERE layout = ?1 AND hits + misses >= 5",
    )?;
    let mut rows: Vec<(String, f64, f64)> = stmt.query_map([layout], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
    let mean_ms = if rows.is_empty() { 1.0 } else { rows.iter().map(|r| r.2).sum::<f64>() / rows.len() as f64 };
    rows.sort_by(|a, b| (b.1 * 3.0 + b.2 / mean_ms).total_cmp(&(a.1 * 3.0 + a.2 / mean_ms)));
    Ok(rows.into_iter().take(n).map(|r| r.0).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-lessons-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    fn run(acc: f64, wpm: f64, keys: Vec<KeyCount>) -> LessonRun {
        LessonRun { lesson_id: "home-1".into(), layout: "es".into(), duration_ms: 120_000, wpm, accuracy: acc, target_wpm: 20.0, keys, bigrams: vec![], chars: 0, best_run: 0 }
    }

    #[test]
    fn stars_xp_and_first_accurate_bonus_once() {
        let c = mem();
        let a = save(&c, &run(0.9, 15.0, vec![])).unwrap();
        assert_eq!((a.stars, a.best_before, a.xp), (1, 0, 10));
        let b = save(&c, &run(0.99, 25.0, vec![])).unwrap();
        assert_eq!((b.stars, b.best_before, b.xp), (3, 1, 20));
        let again = save(&c, &run(0.99, 25.0, vec![])).unwrap();
        assert_eq!(again.xp, 10, "the accuracy bonus is once per lesson");
        let p = progress(&c, "es").unwrap();
        assert_eq!(p.lessons, vec![("home-1".to_string(), 3, 3, 25.0)]);
        assert!(p.before_after.is_none());
    }

    #[test]
    fn progress_has_the_best_speed_today_and_the_recent_pace() {
        let c = mem();
        let at = |id: &str, acc: f64, wpm: f64| LessonRun { lesson_id: id.into(), ..run(acc, wpm, vec![]) };
        save(&c, &at("sprint-1m", 0.9, 31.5)).unwrap();
        assert_eq!(progress(&c, "es").unwrap().recent_wpm, None, "fewer than three lessons give no pace");
        save(&c, &at("sprint-1m", 0.97, 44.0)).unwrap();
        save(&c, &at("es-001", 0.96, 30.0)).unwrap();
        let p = progress(&c, "es").unwrap();
        let sprint = p.lessons.iter().find(|l| l.0 == "sprint-1m").unwrap();
        assert_eq!((sprint.2, sprint.3), (2, 44.0), "personal best = highest wpm");
        let mut today = p.today.clone();
        today.sort();
        assert_eq!(today, vec![("es-001".to_string(), 2), ("sprint-1m".to_string(), 2)]);
        let r = p.recent_wpm.unwrap();
        assert!((r - (31.5 + 44.0 + 30.0) / 3.0).abs() < 1e-9, "{r}");
        // Another layout has its own progress.
        let us = progress(&c, "us").unwrap();
        assert!(us.lessons.is_empty() && us.today.is_empty() && us.recent_wpm.is_none());
        // Results of other days are not «today».
        c.execute("UPDATE lesson_results SET day = day - 1 WHERE lesson_id = 'es-001'", []).unwrap();
        assert_eq!(progress(&c, "es").unwrap().today, vec![("sprint-1m".to_string(), 2)]);
    }

    #[test]
    fn recent_pace_uses_only_the_last_ten() {
        let c = mem();
        for _ in 0..5 {
            save(&c, &run(0.9, 10.0, vec![])).unwrap();
        }
        for _ in 0..10 {
            save(&c, &run(0.9, 40.0, vec![])).unwrap();
        }
        assert_eq!(progress(&c, "es").unwrap().recent_wpm, Some(40.0));
    }

    #[test]
    fn library_and_sprint_ids_are_kept() {
        assert_eq!(clean_id("es-001"), "es-001");
        assert_eq!(clean_id("sprint-1m"), "sprint-1m");
        assert_eq!(clean_id("finger-9"), "finger-9");
    }

    #[test]
    fn a_lesson_stored_as_a_burst_counts_once_and_follows_the_goal_setting() {
        let c = mem();
        // What the tracker stores for a lesson: a burst of the lessons app, plus the result row.
        let end: i64 = c.query_row("SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000", [], |r| r.get(0)).unwrap();
        let app = db::intern_app(&c, db::LESSONS_APP).unwrap();
        db::insert_burst(&c, &tapomo_core::Burst { app_id: app, start_ms: end as u64 - 120_000, end_ms: end as u64, chars: 300, backspaces: 0, word_deletes: 0, peak_wpm: Some(30.0), best_streak: 80, mash: false }).unwrap();
        save(&c, &LessonRun { chars: 300, best_run: 80, ..run(0.95, 30.0, vec![]) }).unwrap();
        assert_eq!(db::today_active_ms(&c).unwrap(), 120_000, "not twice");
        assert_eq!(db::daily_active(&c).unwrap().iter().map(|d| d.1).sum::<u64>(), 120_000);
        let mut s = db::get_settings(&c).unwrap();
        s.lessons_in_goal = false;
        db::set_settings(&c, &s).unwrap();
        assert_eq!(db::today_active_ms(&c).unwrap(), 0);
        assert_eq!(db::daily_active(&c).unwrap().iter().map(|d| d.1).sum::<u64>(), 0);
    }

    #[test]
    fn lesson_time_joins_the_day_once() {
        let c = mem();
        let start: i64 = c.query_row("SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 60000", [], |r| r.get(0)).unwrap();
        let app = db::intern_app(&c, "test.exe").unwrap();
        db::insert_burst(&c, &tapomo_core::Burst { app_id: app, start_ms: start as u64, end_ms: start as u64 + 30_000, chars: 100, backspaces: 0, word_deletes: 0, peak_wpm: None, best_streak: 10, mash: false }).unwrap();
        save(&c, &run(0.9, 15.0, vec![])).unwrap(); // 120 s
        let days = db::daily_active(&c).unwrap();
        assert_eq!(days.len(), 1, "{days:?}");
        assert_eq!(days[0].1, 150_000);
        assert_eq!(db::today_active_ms(&c).unwrap(), 150_000);
        let mut s = db::get_settings(&c).unwrap();
        s.lessons_in_goal = false;
        db::set_settings(&c, &s).unwrap();
        assert_eq!(db::today_active_ms(&c).unwrap(), 30_000);
    }

    #[test]
    fn daily_xp_cap() {
        let c = mem();
        for _ in 0..15 {
            save(&c, &run(0.5, 10.0, vec![])).unwrap();
        }
        let xp: i64 = c.query_row("SELECT amount FROM xp_events WHERE kind = 'lessons'", [], |r| r.get(0)).unwrap();
        assert_eq!(xp, 100);
    }

    #[test]
    fn hard_keys_rank_misses_first() {
        let c = mem();
        let k = |key: &str, hits, misses, ms| KeyCount { key: key.into(), hits, misses, ms };
        save(&c, &run(0.9, 15.0, vec![k("a", 50, 0, 10_000), k("ñ", 10, 8, 9_000), k("j", 30, 1, 9_000), k("x", 2, 2, 1_000), k("ab", 9, 9, 9)])).unwrap();
        let hard = hard_keys(&c, "es", 2).unwrap();
        assert_eq!(hard[0], "ñ");
        assert!(!hard.contains(&"x".to_string()), "too few tries to judge");
        assert!(hard_keys(&c, "us", 3).unwrap().is_empty());
    }

    #[test]
    fn hard_bigrams_rank_misses_first_and_skip_junk() {
        let c = mem();
        let p = |pair: &str, hits, misses, ms| PairCount { pair: pair.into(), hits, misses, ms };
        let mut r = run(0.9, 15.0, vec![]);
        r.bigrams = vec![p("es", 50, 0, 10_000), p("br", 10, 8, 9_000), p("ue", 30, 3, 9_000), p("xy", 2, 2, 1_000), p("a ", 9, 9, 9), p("abc", 9, 9, 9), p("1a", 9, 9, 9)];
        save(&c, &r).unwrap();
        save(&c, &r).unwrap(); // totals add up across lessons
        let hard = hard_bigrams(&c, "es", 2).unwrap();
        assert_eq!(hard, vec!["br".to_string(), "xy".to_string()], "50 % misses beat 9 %, once there are 5 samples");
        let all = hard_bigrams(&c, "es", 10).unwrap();
        assert_eq!(all.len(), 4, "es, br, ue and xy (4 + 4 samples after two lessons)");
        assert!(!all.iter().any(|x| x == "a " || x == "abc" || x == "1a"));
        assert!(hard_bigrams(&c, "us", 3).unwrap().is_empty());
    }
}
