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
    /// Office only: the combination per Office language (`en`, `es`); see [`office_lang`].
    #[serde(default)]
    pub office: HashMap<String, OfficeCombo>,
    /// Doesn't count in Office apps, where the same keys mean something else in some languages.
    #[serde(default)]
    pub except_office: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OfficeCombo {
    pub mods: String,
    pub vk: u32,
    pub label: String,
}

/// The Office apps whose shortcuts change with the Office language.
const OFFICE_APPS: [&str; 4] = ["winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe"];

/// The app list of an entry ("office" expands to the Office apps); `None` = every app.
fn app_list(e: &Entry) -> Option<Vec<String>> {
    match &e.apps {
        Apps::All(a) if a == "office" => Some(OFFICE_APPS.iter().map(|x| x.to_string()).collect()),
        Apps::All(_) => None,
        Apps::Some(list) => Some(list.iter().map(|a| a.to_lowercase()).collect()),
    }
}

pub fn is_office(exe: &str) -> bool {
    OFFICE_APPS.contains(&exe.to_lowercase().as_str())
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

/// Combinations the hook must never recognise, whatever the catalogue says: private/incognito
/// windows (Chrome/Edge/Brave/Opera Ctrl+Shift+N, Firefox Ctrl+Shift+P) and similar. They stay "other".
const SENSITIVE: [(u8, u32); 3] = [(CTRL | SHIFT, 0x4E), (CTRL | SHIFT, 0x50), (CTRL | SHIFT, 0x42)];

/// One recognisable combination: which entry, and for which apps (an override is limited to its apps).
struct Combo {
    entry: usize,
    apps: Option<Vec<String>>,
    /// Office language this combination belongs to (Office entries only).
    lang: Option<String>,
    except_office: bool,
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
                Apps::All(a) if a == "office" => Some(OFFICE_APPS.iter().map(|x| x.to_string()).collect()),
                Apps::All(_) => None,
                Apps::Some(list) => Some(list.iter().map(|a| a.to_lowercase()).collect()),
            };
            let mut add = |key: (u8, u32), apps: Option<Vec<String>>, lang: Option<String>| {
                if SENSITIVE.contains(&key) {
                    log::warn!("shortcut catalogue lists a sensitive combination ({}); ignored", e.id);
                } else {
                    combos.entry(key).or_default().push(Combo { entry: i, apps, lang, except_office: e.except_office });
                }
            };
            if e.office.is_empty() {
                add((mods_bits(&e.mods), e.vk), apps.clone(), None);
            } else {
                for (lang, oc) in &e.office {
                    add((mods_bits(&oc.mods), oc.vk), apps.clone(), Some(lang.clone()));
                }
            }
            for o in e.overrides.values() {
                add((mods_bits(&o.mods), o.vk), Some(o.apps.iter().map(|a| a.to_lowercase()).collect()), None);
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

/// The catalogue entries a recognised combination stands for in this app (usually one). In Office the
/// meaning depends on the Office language (`office_lang`, "es" or "en").
pub fn resolve(code: u32, exe: &str, office_lang: &str) -> Vec<&'static str> {
    let cat = catalogue();
    let exe = exe.to_lowercase();
    let office = is_office(&exe);
    let key = ((code >> 16) as u8, code & 0xFFFF);
    cat.combos
        .get(&key)
        .map(|list| {
            list.iter()
                .filter(|c| !(c.except_office && office))
                .filter(|c| c.lang.as_deref().is_none_or(|l| l == office_lang))
                .filter(|c| c.apps.as_ref().is_none_or(|apps| apps.contains(&exe)))
                .map(|c| cat.entries[c.entry].id.as_str())
                .collect()
        })
        .unwrap_or_default()
}

// ------------------------------------------------------------- Office language

/// In Office, saving is Ctrl+S in English and Ctrl+G in Spanish (where Ctrl+S underlines). Tapomo
/// counts which of the two a person uses in Office to know the language of their Office; until there is
/// enough evidence it assumes the app's own language. Only these two counts are stored.
const CTRL_G: u32 = ((CTRL as u32) << 16) | 0x47;
const CTRL_S: u32 = ((CTRL as u32) << 16) | 0x53;
const OFFICE_EVIDENCE_MIN: u32 = 5;

pub fn office_evidence(conn: &Connection, code: u32, exe: &str) -> rusqlite::Result<()> {
    if !is_office(exe) {
        return Ok(());
    }
    let key = match code {
        CTRL_G => "office_ev_es",
        CTRL_S => "office_ev_en",
        _ => return Ok(()),
    };
    let n: u32 = db::get_raw(conn, key)?.and_then(|v| v.parse().ok()).unwrap_or(0);
    db::set_raw(conn, key, &(n + 1).to_string())
}

/// "es" or "en": the language of this person's Office, deduced from use, else the app language.
pub fn office_lang(conn: &Connection, ui_lang: &str) -> rusqlite::Result<&'static str> {
    let read = |k: &str| -> rusqlite::Result<u32> { Ok(db::get_raw(conn, k)?.and_then(|v| v.parse().ok()).unwrap_or(0)) };
    let (es, en) = (read("office_ev_es")?, read("office_ev_en")?);
    Ok(if es + en >= OFFICE_EVIDENCE_MIN {
        if es > en { "es" } else { "en" }
    } else if matches!(ui_lang, "es" | "ca") {
        "es"
    } else {
        "en"
    })
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
    let fits = |e: &Entry| app_list(e).is_none_or(|list| list.iter().any(|a| apps.iter().any(|x| x.eq_ignore_ascii_case(a))));
    let mut candidates: Vec<&Entry> = cat
        .entries
        .iter()
        .filter(|e| used.get(&e.id).is_none_or(|u| u.0 == 0 && !u.1) && fits(e) && !(e.level == "basic" && mastered(&e.category) >= 2))
        .collect();
    // App-specific tips for the apps used today first, then by level; a stable daily rotation among equals.
    candidates.sort_by_key(|e| (app_list(e).is_none(), LEVELS.iter().position(|l| *l == e.level).unwrap_or(3)));
    let pick = candidates.first().map(|first| {
        let key = (app_list(first).is_none(), first.level.clone());
        let same: Vec<&&Entry> = candidates.iter().filter(|e| (app_list(e).is_none(), e.level.clone()) == key).collect();
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
    if let Some(oc) = e.office.get(office_lang(conn, lang)?) {
        label = oc.label.clone();
    }
    let app = match app_list(e) {
        None => None,
        Some(list) => {
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

/// The album only lists useful shortcuts: global ones, those for an app with at least one burst in the
/// last 30 days, and anything the user already used or marked as known (earned progress never disappears).
pub fn album(conn: &Connection, lang: &str) -> rusqlite::Result<Vec<AlbumItem>> {
    let olang = office_lang(conn, lang)?;
    let mut stmt = conn.prepare("SELECT id, days_used, known FROM shortcut_levels")?;
    let progress: HashMap<String, (u32, bool)> =
        stmt.query_map([], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))?.collect::<rusqlite::Result<_>>()?;
    let since = db::range_start_ms(conn, "30d")?;
    let mut stmt = conn.prepare("SELECT DISTINCT a.exe FROM bursts b JOIN apps a ON a.id = b.app_id WHERE b.start_ms >= ?1")?;
    let used_apps: Vec<String> = stmt.query_map([since], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<_>>()?;
    let fits = |e: &Entry| app_list(e).is_none_or(|list| list.iter().any(|a| used_apps.iter().any(|x| x.eq_ignore_ascii_case(a))));
    Ok(catalogue()
        .entries
        .iter()
        .filter(|e| progress.get(&e.id).is_some_and(|p| p.0 > 0 || p.1) || fits(e))
        .map(|e| {
            let d = progress.get(&e.id).map_or(0, |p| p.0);
            AlbumItem {
                id: e.id.clone(),
                label: e
                    .office
                    .get(olang)
                    .map(|oc| oc.label.clone())
                    .unwrap_or_else(|| if lang == "es" { e.label.clone() } else { e.label_en.clone() }),
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
        assert_eq!(resolve(ctrl_t, "chrome.exe", "en"), ["new_tab"]);
        assert!(resolve(ctrl_t, "notepad.exe", "en").is_empty(), "browser-only");
        // Word in Spanish saves with Ctrl+G: it counts as "save" there, and nowhere else.
        let ctrl_g = known_combo(CTRL, 0x47).unwrap();
        assert_eq!(resolve(ctrl_g, "WINWORD.EXE", "es"), ["office_save"]);
        assert!(resolve(ctrl_g, "WINWORD.EXE", "en").is_empty(), "Go To in English Office: not in the album");
        assert!(resolve(ctrl_g, "notepad.exe", "es").is_empty());
        // Ctrl+S: save in English Office, underline in Spanish Office, plain save elsewhere.
        let ctrl_s = known_combo(CTRL, 0x53).unwrap();
        assert_eq!(resolve(ctrl_s, "WINWORD.EXE", "en"), ["office_save"]);
        assert_eq!(resolve(ctrl_s, "WINWORD.EXE", "es"), ["office_underline"]);
        assert_eq!(resolve(ctrl_s, "notepad.exe", "es"), ["save"]);
        // Not in the catalogue: incognito (sensitive) and random combinations are never recognised.
        assert_eq!(known_combo(CTRL | SHIFT, 0x4E), None);
        assert_eq!(known_combo(CTRL | SHIFT, 0x50), None, "Firefox private window");
        // Phase C: same keys, different apps, different meanings.
        let ctrl_t = known_combo(CTRL, 0x54).unwrap();
        assert_eq!(resolve(ctrl_t, "Photoshop.exe", "en"), ["free_transform"]);
        assert_eq!(resolve(known_combo(ALT, 0x26).unwrap(), "Code.exe", "en"), ["move_line"]);
        assert_eq!(known_combo(CTRL | ALT | WIN, 0x51), None);
        // Termius (SSH client): its own entries, only inside Termius.
        assert_eq!(resolve(known_combo(CTRL, 0x4A).unwrap(), "Termius.exe", "en"), ["termius_jump_tab"]);
        assert!(resolve(known_combo(CTRL, 0x4A).unwrap(), "notepad.exe", "en").is_empty());
        assert_eq!(resolve(known_combo(CTRL, 0x54).unwrap(), "termius.exe", "en"), ["termius_new_tab"]);
        assert_eq!(resolve(known_combo(CTRL, 0x4B).unwrap(), "Termius.exe", "en"), ["termius_palette"]);
        assert_eq!(resolve(known_combo(CTRL | ALT, 0x25).unwrap(), "Termius.exe", "en"), ["termius_pane_left"]);
        assert_eq!(resolve(known_combo(CTRL | ALT, 0x27).unwrap(), "Termius.exe", "en"), ["termius_pane_right"]);
        assert_eq!(known_combo(CTRL | ALT, 0x42), None);
    }

    fn burst_at(c: &Connection, exe: &str, start_ms: i64) {
        let app = db::intern_app(c, exe).unwrap();
        let b = tapomo_core::Burst {
            app_id: app,
            start_ms: start_ms as u64,
            end_ms: start_ms as u64 + 5000,
            chars: 20,
            backspaces: 0,
            word_deletes: 0,
            peak_wpm: None,
            best_streak: 0,
            mash: false,
        };
        db::insert_burst(c, &b).unwrap();
    }

    fn ids(c: &Connection) -> Vec<String> {
        album(c, "en").unwrap().into_iter().map(|a| a.id).collect()
    }

    #[test]
    fn the_album_shows_global_shortcuts_and_those_of_apps_used_in_the_last_30_days() {
        let c = mem();
        let now: i64 = c.query_row("SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000", [], |r| r.get(0)).unwrap();
        let day = 86_400_000;
        let shown = ids(&c);
        assert!(shown.iter().any(|i| i == "copy"), "global shortcuts are always there");
        assert!(!shown.iter().any(|i| i == "new_tab" || i == "termius_jump_tab" || i == "office_bold"), "no app used yet");
        burst_at(&c, "TERMIUS.EXE", now - 2 * day);
        burst_at(&c, "WINWORD.EXE", now - 2 * day);
        burst_at(&c, "chrome.exe", now - 40 * day); // too old
        let shown = ids(&c);
        assert!(shown.iter().any(|i| i == "termius_jump_tab"), "exe compare is case-insensitive");
        assert!(shown.iter().any(|i| i == "office_bold"), "the office alias expands");
        assert!(!shown.iter().any(|i| i == "new_tab"), "Chrome was last used more than 30 days ago");
        // Earned progress and «ya lo sé» stay even when the app is no longer used.
        record_use(&c, "new_tab").unwrap();
        mark_known(&c, "close_tab").unwrap();
        let shown = ids(&c);
        assert!(shown.iter().any(|i| i == "new_tab") && shown.iter().any(|i| i == "close_tab"));
        assert!(!shown.iter().any(|i| i == "reopen_tab"), "the rest of Chrome's shortcuts stay hidden");
    }

    #[test]
    fn office_language_is_deduced_from_use() {
        let c = mem();
        assert_eq!(office_lang(&c, "es").unwrap(), "es");
        assert_eq!(office_lang(&c, "en").unwrap(), "en");
        for _ in 0..6 {
            office_evidence(&c, CTRL_G, "WINWORD.EXE").unwrap();
        }
        office_evidence(&c, CTRL_S, "notepad.exe").unwrap(); // outside Office: no evidence
        assert_eq!(office_lang(&c, "en").unwrap(), "es", "uses Ctrl+G to save: Spanish Office");
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
