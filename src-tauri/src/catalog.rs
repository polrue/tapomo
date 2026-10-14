//! Shortcut trainer, phase B (0.4.3): the closed catalogue in `data/shortcuts.json`, per-shortcut levels
//! by days of use, the tip of the day and the album.
//!
//! Privacy: the keyboard hook only recognises combinations that are IN this catalogue (none of them
//! sensitive). Anything else stays an anonymous "other" (phase A). Per shortcut only `days_used`,
//! `first_day` and `last_day` are kept, never a per-day history.

use std::collections::HashMap;
use std::sync::OnceLock;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::db;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Override {
    pub apps: Vec<String>,
    pub mods: String,
    pub vk: u32,
    pub label: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Apps {
    All(String),
    Some(Vec<String>),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Entry {
    pub id: String,
    pub apps: Apps,
    pub mods: String,
    pub vk: u32,
    pub label: String,
    pub label_en: String,
    pub category: String,
    pub level: String,
    pub tip: HashMap<String, String>,
    #[serde(default)]
    pub overrides: HashMap<String, Override>,
}

#[derive(Deserialize)]
struct Doc {
    shortcuts: Vec<Entry>,
}

/// Modifier bits as the hook sees them.
pub const CTRL: u8 = 1;
pub const ALT: u8 = 2;
pub const WIN: u8 = 4;
pub const SHIFT: u8 = 8;

fn mods_bits(s: &str) -> u8 {
    s.chars().fold(0, |m, c| m | match c {
        'c' => CTRL,
        'a' => ALT,
        'w' => WIN,
        's' => SHIFT,
        _ => 0,
    })
}

/// One recognisable combination: which entry, and for which apps (an override is limited to its apps).
struct Combo {
    entry: usize,
    apps: Option<Vec<String>>,
}

struct Catalogue {
    entries: Vec<Entry>,
    /// (mods, vk) → combinations; the hook only needs to know whether a key is in here.
    combos: HashMap<(u8, u32), Vec<Combo>>,
}

fn catalogue() -> &'static Catalogue {
    static CAT: OnceLock<Catalogue> = OnceLock::new();
    CAT.get_or_init(|| {
        let entries = serde_json::from_str::<Doc>(include_str!("../../data/shortcuts.json")).map(|d| d.shortcuts).unwrap_or_else(|e| {
            log::error!("shortcut catalogue is invalid: {e}");
            Vec::new()
        });
        let mut combos: HashMap<(u8, u32), Vec<Combo>> = HashMap::new();
        for (i, e) in entries.iter().enumerate() {
            let apps = match &e.apps {
                Apps::All(_) => None,
                Apps::Some(list) => Some(list.iter().map(|a| a.to_lowercase()).collect()),
            };
            combos.entry((mods_bits(&e.mods), e.vk)).or_default().push(Combo { entry: i, apps });
            for o in e.overrides.values() {
                let apps = Some(o.apps.iter().map(|a| a.to_lowercase()).collect());
                combos.entry((mods_bits(&o.mods), o.vk)).or_default().push(Combo { entry: i, apps });
            }
        }
        Catalogue { entries, combos }
    })
}

/// Called from the keyboard hook: is this combination in the catalogue? Cheap (one hash lookup).
/// The returned code only ever identifies a catalogue combination, never an arbitrary key.
pub fn known_combo(mods: u8, vk: u32) -> Option<u32> {
    catalogue().combos.contains_key(&(mods, vk)).then_some((u32::from(mods) << 16) | vk)
}

/// The catalogue entries a recognised combination stands for in this app (usually one).
pub fn resolve(code: u32, exe: &str) -> Vec<&'static str> {
    let cat = catalogue();
    let exe = exe.to_lowercase();
    let key = ((code >> 16) as u8, code & 0xFFFF);
    cat.combos
        .get(&key)
        .map(|list| {
            list.iter()
                .filter(|c| c.apps.as_ref().is_none_or(|apps| apps.contains(&exe)))
                .map(|c| cat.entries[c.entry].id.as_str())
                .collect()
        })
        .unwrap_or_default()
}

// ------------------------------------------------------------------ levels

/// Level by distinct days used: 0 por descubrir, 1 aprendiendo (1–3), 2 cogiendo el tranquillo (4–7),
/// 3 casi lo tienes (8–10), 4 dominado (11+).
pub fn level_of(days: u32) -> u8 {
    match days {
        0 => 0,
        1..=3 => 1,
        4..=7 => 2,
        8..=10 => 3,
        _ => 4,
    }
}

/// XP when reaching each level (index = level).
pub const LEVEL_XP: [u32; 5] = [0, 5, 10, 15, 25];

/// What happened when a catalogue shortcut was used.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Used {
    pub id: String,
    pub level: u8,
    /// The level went up with this use (counted once a day).
    pub level_up: bool,
    /// It was today's or a recent tip and this is its very first use: "¡Ya usas Ctrl+Mayús+T!".
    pub tip_learnt: bool,
}

pub fn record_use(conn: &Connection, id: &str) -> rusqlite::Result<Option<Used>> {
    let today = db::today_day(conn)?;
    let row: Option<(u32, Option<i64>, Option<i64>)> = conn
        .query_row("SELECT days_used, last_day, suggested_day FROM shortcut_levels WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let (days, last, suggested) = row.unwrap_or((0, None, None));
    if last == Some(today) {
        return Ok(None); // a day counts once
    }
    let new_days = days + 1;
    conn.execute(
        "INSERT INTO shortcut_levels(id, days_used, first_day, last_day) VALUES (?1, 1, ?2, ?2)
         ON CONFLICT(id) DO UPDATE SET days_used = days_used + 1, last_day = excluded.last_day, first_day = COALESCE(first_day, excluded.first_day)",
        params![id, today],
    )?;
    let (before, after) = (level_of(days), level_of(new_days));
    if after > before {
        conn.execute(
            "INSERT OR IGNORE INTO xp_events(ts, day, kind, amount) VALUES (?1, ?2, ?3, ?4)",
            params![std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0), today, format!("sc:{id}:{after}"), LEVEL_XP[after as usize]],
        )?;
    }
    // A tip counts as learnt if it is used for the first time within a week of being suggested.
    let tip_learnt = days == 0 && suggested.is_some_and(|s| today - s <= 7);
    Ok(Some(Used { id: id.to_string(), level: after, level_up: after > before, tip_learnt }))
}

// ------------------------------------------------------------- tip of the day

#[derive(Debug, Serialize, Clone)]
pub struct Tip {
    pub id: String,
    pub label: String,
    pub text: String,
    /// The app it is for (alias or exe), when it is app-specific.
    pub app: Option<String>,
}

const LEVELS: [&str; 3] = ["basic", "medium", "advanced"];

/// Today's tip: at most one a day, about a shortcut the user has never used, for an app they typed in
/// today (or a general one). Skips the basics of a category the user already masters.
pub fn tip(conn: &Connection, lang: &str) -> rusqlite::Result<Option<Tip>> {
    let today = db::today_day(conn)?;
    if let Some((day, id)) = db::get_raw(conn, "sc_tip")?.and_then(|v| v.split_once(':').map(|(d, i)| (d.parse::<i64>().ok(), i.to_string()))) {
        if day == Some(today) {
            return Ok(if id.is_empty() { None } else { build(conn, &id, lang)? });
        }
    }
    let used: HashMap<String, (u32, bool)> = {
        let mut stmt = conn.prepare("SELECT id, days_used, known FROM shortcut_levels")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, u32>(1)?, r.get::<_, bool>(2)?))))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    let since = db::range_start_ms(conn, "today")?;
    let mut stmt = conn.prepare("SELECT a.exe FROM bursts b JOIN apps a ON a.id = b.app_id WHERE b.start_ms >= ?1 GROUP BY a.id ORDER BY SUM(b.end_ms - b.start_ms) DESC")?;
    let apps: Vec<String> = stmt.query_map([since], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<_>>()?;
    let cat = catalogue();
    let mastered = |category: &str| cat.entries.iter().filter(|e| e.category == category && used.get(&e.id).is_some_and(|u| level_of(u.0) >= 3)).count();
    let fits = |e: &Entry| match &e.apps {
        Apps::All(_) => true,
        Apps::Some(list) => list.iter().any(|a| apps.iter().any(|x| x.eq_ignore_ascii_case(a))),
    };
    let mut candidates: Vec<&Entry> = cat
        .entries
        .iter()
        .filter(|e| used.get(&e.id).is_none_or(|u| u.0 == 0 && !u.1) && fits(e) && !(e.level == "basic" && mastered(&e.category) >= 2))
        .collect();
    // App-specific tips for the apps used today first, then by level; a stable daily rotation among equals.
    candidates.sort_by_key(|e| (matches!(e.apps, Apps::All(_)), LEVELS.iter().position(|l| *l == e.level).unwrap_or(3)));
    let pick = candidates.first().map(|first| {
        let key = (matches!(first.apps, Apps::All(_)), first.level.clone());
        let same: Vec<&&Entry> = candidates.iter().filter(|e| (matches!(e.apps, Apps::All(_)), e.level.clone()) == key).collect();
        same[(today.rem_euclid(same.len() as i64)) as usize].id.clone()
    });
    db::set_raw(conn, "sc_tip", &format!("{today}:{}", pick.clone().unwrap_or_default()))?;
    let Some(id) = pick else { return Ok(None) };
    conn.execute(
        "INSERT INTO shortcut_levels(id, days_used, first_day, last_day, suggested_day) VALUES (?1, 0, NULL, NULL, ?2)
         ON CONFLICT(id) DO UPDATE SET suggested_day = excluded.suggested_day",
        params![id, today],
    )?;
    build(conn, &id, lang)
}

fn build(conn: &Connection, id: &str, lang: &str) -> rusqlite::Result<Option<Tip>> {
    let Some(e) = catalogue().entries.iter().find(|e| e.id == id) else { return Ok(None) };
    let since = db::range_start_ms(conn, "today")?;
    // In an Office app in Spanish, show the Spanish combination.
    let mut label = if lang == "es" { e.label.clone() } else { e.label_en.clone() };
    let app = match &e.apps {
        Apps::All(_) => None,
        Apps::Some(list) => {
            let mut stmt = conn.prepare("SELECT COALESCE(NULLIF(a.alias, ''), a.exe), a.exe FROM bursts b JOIN apps a ON a.id = b.app_id WHERE b.start_ms >= ?1 GROUP BY a.id")?;
            let today: Vec<(String, String)> = stmt.query_map([since], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
            today.into_iter().find(|(_, exe)| list.iter().any(|a| a.eq_ignore_ascii_case(exe))).map(|(name, _)| name.trim_end_matches(".exe").trim_end_matches(".EXE").to_string())
        }
    };
    if let Some(o) = e.overrides.get(lang) {
        if o.apps.iter().any(|a| app.as_deref().is_some_and(|x| a.to_lowercase().starts_with(&x.to_lowercase()))) {
            label = o.label.clone();
        }
    }
    let text = e.tip.get(lang).or_else(|| e.tip.get("en")).cloned().unwrap_or_default();
    Ok(Some(Tip { id: e.id.clone(), label, text, app }))
}

/// "Ya lo sé": never suggest it again (no level is given: levels only come from using it).
pub fn mark_known(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO shortcut_levels(id, days_used, first_day, last_day, known) VALUES (?1, 0, NULL, NULL, 1)
         ON CONFLICT(id) DO UPDATE SET known = 1",
        [id],
    )?;
    Ok(())
}

// --------------------------------------------------------------------- album

#[derive(Debug, Serialize)]
pub struct AlbumItem {
    pub id: String,
    pub label: String,
    pub text: String,
    pub category: String,
    pub level: u8,
    pub days: u32,
}

pub fn album(conn: &Connection, lang: &str) -> rusqlite::Result<Vec<AlbumItem>> {
    let mut stmt = conn.prepare("SELECT id, days_used FROM shortcut_levels")?;
    let days: HashMap<String, u32> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
    Ok(catalogue()
        .entries
        .iter()
        .map(|e| {
            let d = days.get(&e.id).copied().unwrap_or(0);
            AlbumItem {
                id: e.id.clone(),
                label: if lang == "es" { e.label.clone() } else { e.label_en.clone() },
                text: e.tip.get(lang).or_else(|| e.tip.get("en")).cloned().unwrap_or_default(),
                category: e.category.clone(),
                level: level_of(d),
                days: d,
            }
        })
        .collect())
}

/// Shortcuts at the top level, for the badges.
pub fn mastered_count(conn: &Connection) -> rusqlite::Result<u32> {
    conn.query_row("SELECT COUNT(*) FROM shortcut_levels WHERE days_used >= 11", [], |r| r.get(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("tapomo-catalog-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        db::open(&path).unwrap()
    }

    #[test]
    fn the_catalogue_loads_and_resolves_per_app() {
        let cat = catalogue();
        assert!(cat.entries.len() >= 30);
        let ctrl_t = known_combo(CTRL, 0x54).expect("Ctrl+T is in the catalogue");
        assert_eq!(resolve(ctrl_t, "chrome.exe"), ["new_tab"]);
        assert!(resolve(ctrl_t, "notepad.exe").is_empty(), "browser-only");
        // Word in Spanish saves with Ctrl+G: it counts as "save" there, and nowhere else.
        let ctrl_g = known_combo(CTRL, 0x47).unwrap();
        assert_eq!(resolve(ctrl_g, "WINWORD.EXE"), ["save"]);
        assert!(resolve(ctrl_g, "notepad.exe").is_empty());
        // Not in the catalogue: incognito (sensitive) and random combinations are never recognised.
        assert_eq!(known_combo(CTRL | SHIFT, 0x4E), None);
        assert_eq!(known_combo(CTRL | ALT | WIN, 0x51), None);
    }

    #[test]
    fn levels_by_days() {
        assert_eq!([0, 1, 3, 4, 7, 8, 10, 11, 400].map(level_of), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
    }

    #[test]
    fn a_day_counts_once_and_levels_give_xp_once() {
        let c = mem();
        let u = record_use(&c, "copy").unwrap().unwrap();
        assert_eq!((u.level, u.level_up, u.tip_learnt), (1, true, false));
        assert!(record_use(&c, "copy").unwrap().is_none(), "same day");
        let xp: i64 = c.query_row("SELECT SUM(amount) FROM xp_events", [], |r| r.get(0)).unwrap();
        assert_eq!(xp, 5);
        // Pretend it was used on 10 earlier days.
        c.execute("UPDATE shortcut_levels SET days_used = 10, last_day = last_day - 1 WHERE id = 'copy'", []).unwrap();
        let u = record_use(&c, "copy").unwrap().unwrap();
        assert_eq!((u.level, u.level_up), (4, true));
        assert_eq!(mastered_count(&c).unwrap(), 1);
    }

    #[test]
    fn the_tip_is_stable_for_the_day_known_ones_are_skipped_and_first_use_is_celebrated() {
        let c = mem();
        let t1 = tip(&c, "es").unwrap().expect("a general tip with no history");
        let t2 = tip(&c, "es").unwrap().unwrap();
        assert_eq!(t1.id, t2.id);
        mark_known(&c, "explorer").unwrap();
        assert!(album(&c, "es").unwrap().iter().all(|a| a.level == 0));
        let used = record_use(&c, &t1.id).unwrap().unwrap();
        assert!(used.tip_learnt, "first use of the suggested shortcut");
    }
}
