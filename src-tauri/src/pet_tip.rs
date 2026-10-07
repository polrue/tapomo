//! Motivational bubble shown when Tapomo is clicked. Facts come from the stored counts
//! (today against the user's own last 30 days); the page renders `t(key, vars)`.
//! Tone rule: only positive facts are ever eligible, nothing compares unfavourably.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use tapomo_core::{personal_reference, REFERENCE_MIN_PEAKS};

use crate::db;

const CHARS_PER_PAGE: u64 = 1800;
/// Last tips shown, so the same one is not repeated straight away.
static RECENT: Mutex<VecDeque<&'static str>> = Mutex::new(VecDeque::new());

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct PetTip {
    pub key: &'static str,
    pub vars: serde_json::Map<String, serde_json::Value>,
}

/// Counts of one period.
#[derive(Default, Debug)]
pub struct Period {
    pub bursts: u64,
    pub chars: u64,
    pub backspaces: u64,
    pub avg_wpm: f64,
    pub peak: f64,
    pub best_streak: u32,
}

/// Everything the candidates need, gathered once per click.
#[derive(Default, Debug)]
pub struct Facts {
    pub today: Period,
    pub month: Period,
    pub all_time_max: Option<f64>,
    /// Best peak before today.
    pub prev_max: Option<f64>,
    /// Hour (0-23) with the best average speed over the last 30 days.
    pub best_hour: Option<u8>,
    /// Fastest app of the last 30 days among apps with enough bursts, when there are at least two.
    pub top_app: Option<String>,
    /// `(have, need)` while the live bar is still calibrating.
    pub calibrating: Option<(usize, usize)>,
}

fn period(conn: &Connection, range: &str) -> rusqlite::Result<Period> {
    let since = db::range_start_ms(conn, range)?;
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(chars),0), COALESCE(SUM(backspaces),0),
                COALESCE(SUM(MAX(chars-1,0)),0), COALESCE(SUM(end_ms-start_ms),0),
                COALESCE(MAX(peak_wpm),0), COALESCE(MAX(best_streak),0)
         FROM bursts WHERE start_ms >= ?1",
        [since],
        |r| {
            let intervals: f64 = r.get(3)?;
            let dur_ms: f64 = r.get(4)?;
            Ok(Period {
                bursts: r.get(0)?,
                chars: r.get(1)?,
                backspaces: r.get(2)?,
                avg_wpm: if dur_ms > 0.0 { intervals / 5.0 / (dur_ms / 60_000.0) } else { 0.0 },
                peak: r.get(5)?,
                best_streak: r.get(6)?,
            })
        },
    )
}

pub fn gather(conn: &Connection) -> rusqlite::Result<Facts> {
    let today = period(conn, "today")?;
    let month = period(conn, "30d")?;
    let today_start = db::range_start_ms(conn, "today")?;
    let prev_max: Option<f64> =
        conn.query_row("SELECT MAX(peak_wpm) FROM bursts WHERE peak_wpm IS NOT NULL AND start_ms < ?1", [today_start], |r| r.get(0))?;
    let (peaks, all_time_max) = db::peak_data(conn)?;
    let calibrating = personal_reference(&peaks).is_none().then_some((peaks.len(), REFERENCE_MIN_PEAKS));

    // Best hour of the day over the last 30 days (burst-weighted across weekdays).
    let cells = db::heatmap(conn, "30d")?;
    let mut hours = [(0.0f64, 0u64); 24];
    for c in &cells {
        hours[c.hour as usize].0 += c.avg_wpm * c.bursts as f64;
        hours[c.hour as usize].1 += c.bursts;
    }
    let best_hour = hours
        .iter()
        .enumerate()
        .filter(|(_, (_, n))| *n >= 3)
        .max_by(|a, b| (a.1 .0 / a.1 .1 as f64).total_cmp(&(b.1 .0 / b.1 .1 as f64)))
        .map(|(h, _)| h as u8);

    // Fastest app among those with at least 5 bursts.
    let since = db::range_start_ms(conn, "30d")?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(NULLIF(a.alias,''), a.exe),
                SUM(MAX(b.chars-1,0)) / 5.0 / (SUM(b.end_ms-b.start_ms) / 60000.0)
         FROM bursts b JOIN apps a ON a.id = b.app_id
         WHERE b.start_ms >= ?1
         GROUP BY a.id HAVING COUNT(*) >= 5 AND SUM(b.end_ms-b.start_ms) > 0
         ORDER BY 2 DESC",
    )?;
    let apps: Vec<String> = stmt.query_map([since], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<_>>()?;
    let top_app = (apps.len() >= 2).then(|| apps[0].trim_end_matches(".exe").trim_end_matches(".EXE").to_string());

    Ok(Facts { today, month, all_time_max, prev_max, best_hour, top_app, calibrating })
}

/// Decimal and thousands separators follow the language.
fn num(n: f64, decimals: usize, lang: &str) -> String {
    let s = format!("{n:.decimals$}");
    let (int, frac) = s.split_once('.').map_or((s.as_str(), None), |(i, f)| (i, Some(f)));
    let (group, dec) = if lang == "es" { ('.', ',') } else { (',', '.') };
    let mut out = String::new();
    for (i, ch) in int.chars().enumerate() {
        if i > 0 && (int.len() - i) % 3 == 0 {
            out.push(group);
        }
        out.push(ch);
    }
    if let Some(f) = frac {
        out.push(dec);
        out.push_str(f);
    }
    out
}

type Candidate = (&'static str, Vec<(&'static str, String)>, u32);

/// Every tip whose condition holds, with its weight (facts 3, generic 1).
pub fn candidates(f: &Facts, lang: &str) -> Vec<Candidate> {
    let mut c: Vec<Candidate> = Vec::new();
    // Speed unit of the language (ES: ppm = palabras por minuto).
    let unit = if lang == "es" { "ppm" } else { "WPM" };
    let t = &f.today;
    let m = &f.month;
    if t.bursts == 0 {
        c.push(("tip.hello_empty", vec![], 4));
    }
    if t.best_streak >= 30 {
        c.push(("tip.streak_today", vec![("n", num(t.best_streak as f64, 0, lang))], 3));
    }
    if t.bursts >= 5 && m.avg_wpm > 0.0 && t.avg_wpm >= m.avg_wpm * 1.05 {
        let p = ((t.avg_wpm / m.avg_wpm - 1.0) * 100.0).round();
        c.push(("tip.faster_than_usual", vec![("p", num(p, 0, lang))], 3));
    }
    if t.chars >= 100 && t.backspaces > 0 {
        let ratio = t.backspaces as f64 / t.chars as f64 * 100.0;
        let month_ratio = if m.chars > 0 { m.backspaces as f64 / m.chars as f64 * 100.0 } else { f64::MAX };
        if ratio <= 3.0 || ratio <= month_ratio {
            let p = if ratio < 1.0 { num(ratio, 1, lang) } else { num(ratio.round(), 0, lang) };
            c.push(("tip.low_corrections", vec![("p", p)], 3));
        }
    }
    if let Some(max) = f.all_time_max {
        if t.peak > 0.0 {
            if t.peak < max && t.peak >= max * 0.9 && (max - t.peak).round() >= 1.0 {
                c.push(("tip.near_record", vec![("w", num(t.peak.round(), 0, lang)), ("d", num((max - t.peak).round(), 0, lang)), ("u", unit.into())], 3));
            }
            if f.prev_max.is_some_and(|p| t.peak > p) && t.peak >= max {
                c.push(("tip.record_today", vec![("w", num(t.peak.round(), 0, lang)), ("u", unit.into())], 5));
            }
        }
    }
    if m.bursts >= 20 {
        if let Some(h) = f.best_hour {
            c.push(("tip.best_hour", vec![("h", h.to_string())], 2));
        }
    }
    let pages = t.chars / CHARS_PER_PAGE;
    if pages >= 1 {
        c.push(("tip.volume_today", vec![("n", num(t.chars as f64, 0, lang)), ("pages", num(pages as f64, 0, lang))], 2));
    }
    if let Some(app) = &f.top_app {
        c.push(("tip.top_app", vec![("app", app.clone())], 2));
    }
    if let Some((have, need)) = f.calibrating {
        c.push(("tip.calibrating", vec![("have", have.to_string()), ("need", need.to_string())], 4));
    }
    for key in ["tip.generic_1", "tip.generic_2", "tip.generic_3"] {
        c.push((key, vec![], 1));
    }
    c
}

/// Weighted random pick that avoids the most recent tips (and always the very last one).
pub fn pick(cands: Vec<Candidate>, recent: &mut VecDeque<&'static str>, seed: u64) -> Option<PetTip> {
    let fresh: Vec<&Candidate> = cands.iter().filter(|c| !recent.contains(&c.0)).collect();
    let pool: Vec<&Candidate> = if fresh.is_empty() { cands.iter().filter(|c| recent.back() != Some(&c.0)).collect() } else { fresh };
    let total: u64 = pool.iter().map(|c| u64::from(c.2)).sum();
    if total == 0 {
        return None;
    }
    // splitmix-style scramble of the seed
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    let mut roll = (z ^ (z >> 31)) % total;
    for c in pool {
        if roll < u64::from(c.2) {
            recent.push_back(c.0);
            while recent.len() > 4 {
                recent.pop_front();
            }
            let vars = c.1.iter().map(|(k, v)| ((*k).to_string(), serde_json::Value::String(v.clone()))).collect();
            return Some(PetTip { key: c.0, vars });
        }
        roll -= u64::from(c.2);
    }
    None
}

pub fn next_tip(conn: &Connection, lang: &str) -> rusqlite::Result<Option<PetTip>> {
    let facts = gather(conn)?;
    let seed = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
    let mut recent = RECENT.lock().unwrap_or_else(|e| e.into_inner());
    Ok(pick(candidates(&facts, lang), &mut recent, seed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(f: &Facts) -> Vec<&'static str> {
        candidates(f, "en").into_iter().map(|c| c.0).collect()
    }

    #[test]
    fn empty_day_says_hello_and_slower_days_never_compare() {
        let mut f = Facts::default();
        assert!(keys(&f).contains(&"tip.hello_empty"));
        f.today = Period { bursts: 8, chars: 400, avg_wpm: 40.0, ..Default::default() };
        f.month = Period { bursts: 80, chars: 4000, avg_wpm: 60.0, ..Default::default() };
        let k = keys(&f);
        assert!(!k.contains(&"tip.faster_than_usual") && !k.contains(&"tip.hello_empty"));
        assert!(k.contains(&"tip.generic_1"));
    }

    #[test]
    fn record_and_near_record() {
        let mut f = Facts { all_time_max: Some(100.0), prev_max: Some(90.0), ..Default::default() };
        f.today = Period { bursts: 6, peak: 100.0, ..Default::default() };
        assert!(keys(&f).contains(&"tip.record_today"));
        f.today.peak = 95.0;
        let k = keys(&f);
        assert!(k.contains(&"tip.near_record") && !k.contains(&"tip.record_today"));
    }

    #[test]
    fn pick_never_repeats_last() {
        let f = Facts::default();
        let mut recent = VecDeque::new();
        let mut last = "";
        for seed in 0..200 {
            let tip = pick(candidates(&f, "es"), &mut recent, seed).unwrap();
            assert_ne!(tip.key, last);
            last = tip.key;
        }
    }

    #[test]
    fn numbers_follow_language() {
        assert_eq!(num(12345.0, 0, "es"), "12.345");
        assert_eq!(num(0.5, 1, "es"), "0,5");
        assert_eq!(num(12345.0, 0, "en"), "12,345");
    }
}
