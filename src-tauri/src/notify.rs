//! Windows notifications (toasts) for the daily challenges. Opt-in (`notify_challenges`).
//!
//! The "was it just completed?" question is answered by the XP ledger, not here: `xp::settle`
//! reports a challenge only the first time its `challenge:<id>` row is written (one row per day and
//! challenge, persisted), so a restart can never repeat a toast. This module only decides what to
//! say and whether the window already shows it. Nothing typed ever reaches a notification, only the
//! challenge's own text.

use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::{db, i18n, xp};
use tapomo_core::xp as core;

/// A notification ready to show.
#[derive(Debug, PartialEq, Eq)]
pub struct Toast {
    pub title: String,
    pub body: String,
}

fn fill(mut s: String, vars: &[(&str, String)]) -> String {
    for (k, v) in vars {
        s = s.replace(&format!("{{{k}}}"), v);
    }
    s
}

/// "18:00" (English: "06:00 PM").
fn clock(lang: &str, min: u32) -> String {
    let (h, m) = (min / 60 % 24, min % 60);
    if lang == "en" {
        format!("{:02}:{m:02} {}", if h % 12 == 0 { 12 } else { h % 12 }, if h < 12 { "AM" } else { "PM" })
    } else {
        format!("{h:02}:{m:02}")
    }
}

/// The challenge's text as the Today view shows it (same `ch.*` keys as `ui/xp.js`).
pub fn challenge_name(lang: &str, c: &core::Challenge) -> String {
    let n = c.target.to_string();
    let plural = |base: &str| i18n::tr(lang, &format!("{base}_{}", if c.target == 1 { "one" } else { "other" }));
    match c.id {
        "beat_avg" => fill(i18n::tr(lang, "ch.beat_avg"), &[("wpm", n)]),
        "early_goal" => fill(i18n::tr(lang, "ch.early_goal"), &[("goal", n), ("time", clock(lang, c.deadline_min.unwrap_or(0)))]),
        "long_bursts" | "bursts" => fill(plural(&format!("ch.{}", c.id)), &[("n", n)]),
        "lesson" | "learnt" => i18n::tr(lang, &format!("ch.{}", c.id)),
        id => fill(i18n::tr(lang, &format!("ch.{id}")), &[("n", n)]),
    }
}

/// What to announce for a settle: the full house wins over the single challenge (never two at once).
pub fn toast_for(conn: &Connection, lang: &str, settled: &xp::Settled) -> rusqlite::Result<Option<Toast>> {
    if settled.full_house {
        return Ok(Some(Toast { title: i18n::tr(lang, "notify.all.title"), body: i18n::tr(lang, "notify.all.body") }));
    }
    let Some(id) = settled.new_challenges.first() else { return Ok(None) };
    let settings = db::get_settings(conn)?;
    let today = db::today_day(conn)?;
    let Some(c) = xp::challenges(conn, today, &settings)?.into_iter().find(|c| c.id == *id) else { return Ok(None) };
    Ok(Some(Toast {
        title: i18n::tr(lang, "notify.challenge.title"),
        body: fill(i18n::tr(lang, "notify.challenge.body"), &[("name", challenge_name(lang, &c)), ("xp", core::CHALLENGE_XP.to_string())]),
    }))
}

/// The main window is open, in front and has the focus: its own UI already shows the news.
fn window_in_use(app: &AppHandle, window_visible: bool) -> bool {
    window_visible
        && app.get_webview_window("main").is_some_and(|w| {
            w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
        })
}

/// Shows the toast for a settle when the user asked for them and is not looking at the window.
pub fn announce(app: &AppHandle, conn: &Connection, settled: &xp::Settled, window_visible: bool) {
    if settled.new_challenges.is_empty() && !settled.full_house {
        return;
    }
    let settings = match db::get_settings(conn) {
        Ok(s) => s,
        Err(e) => return log::error!("could not read settings for the notification: {e}"),
    };
    if !settings.notify_challenges || window_in_use(app, window_visible) {
        return;
    }
    let lang = i18n::resolve(&settings.language);
    match toast_for(conn, lang, settled) {
        Ok(Some(t)) => {
            if let Err(e) = app.notification().builder().title(t.title).body(t.body).show() {
                log::warn!("could not show the notification: {e}");
            }
        }
        Ok(None) => {}
        Err(e) => log::error!("could not build the notification: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(id: &'static str, target: u32, deadline_min: Option<u32>) -> core::Challenge {
        core::Challenge { id, target, progress: target, done: true, deadline_min }
    }

    #[test]
    fn names_use_the_real_challenge_text() {
        assert_eq!(challenge_name("es", &ch("chars", 3000, None)), "Escribe 3000 caracteres hoy");
        assert_eq!(challenge_name("es", &ch("bursts", 1, None)), "Haz una ráfaga de escritura");
        assert_eq!(challenge_name("es", &ch("early_goal", 20, Some(18 * 60))), "Cumple tu objetivo diario (20 min) antes de las 18:00");
        assert!(challenge_name("en", &ch("early_goal", 20, Some(18 * 60))).ends_with("06:00 PM"));
        assert!(!challenge_name("de", &ch("lesson", 1, None)).contains("ch."));
    }

    #[test]
    fn full_house_replaces_the_single_toast() {
        let c = db::open(&std::env::temp_dir().join(format!("tapomo-notify-{}.db", std::process::id()))).unwrap();
        let both = xp::Settled { total: 0, new_challenges: vec!["chars"], full_house: true };
        let t = toast_for(&c, "es", &both).unwrap().unwrap();
        assert_eq!(t.title, "¡Retos del día completados!");
        let none = xp::Settled::default();
        assert_eq!(toast_for(&c, "es", &none).unwrap(), None);
    }
}
