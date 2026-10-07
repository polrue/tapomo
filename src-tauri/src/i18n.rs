//! Tray-menu labels, read from the same JSON files the UI uses (`ui/locales/`).
//! To add a language: drop `xx.json` in `ui/locales/`, then add it to [`LOCALES`]
//! here and to `LANGUAGES` in `ui/i18n.js`.

use std::collections::HashMap;

const LOCALES: &[(&str, &str)] = &[
    ("es", include_str!("../../ui/locales/es.json")),
    ("en", include_str!("../../ui/locales/en.json")),
];

const FALLBACK: &str = "en";

/// Picks the language: the saved choice if it is known, else the system locale, else English.
pub fn resolve(saved: &str) -> &'static str {
    let wanted = if saved.is_empty() {
        sys_locale::get_locale().unwrap_or_default()
    } else {
        saved.to_string()
    };
    let wanted = wanted.to_lowercase();
    LOCALES
        .iter()
        .map(|(code, _)| *code)
        .find(|code| wanted == *code || wanted.starts_with(&format!("{code}-")) || wanted.starts_with(&format!("{code}_")))
        .unwrap_or(FALLBACK)
}

/// Looks up `key` in `lang`, falling back to English and finally to the key itself.
pub fn tr(lang: &str, key: &str) -> String {
    lookup(lang, key).or_else(|| lookup(FALLBACK, key)).unwrap_or_else(|| key.to_string())
}

fn lookup(lang: &str, key: &str) -> Option<String> {
    let json = LOCALES.iter().find(|(code, _)| *code == lang)?.1;
    let map: HashMap<String, serde_json::Value> = serde_json::from_str(json).ok()?;
    map.get(key)?.as_str().map(str::to_string)
}
