//! Badges ("insignias"), 0.3.3. Pure: the caller gathers [`Facts`] from the database and stores
//! what is unlocked. A badge, once earned, is never taken back. Design: docs/xp.md, "Logros".

/// How rare a badge is; it sets the one-off XP it gives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rarity {
    Bronze,
    Silver,
    Gold,
}

impl Rarity {
    pub fn xp(self) -> u32 {
        match self {
            Rarity::Bronze => 25,
            Rarity::Silver => 50,
            Rarity::Gold => 100,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Rarity::Bronze => "bronze",
            Rarity::Silver => "silver",
            Rarity::Gold => "gold",
        }
    }
}

/// Everything the badges look at. All counts are all-time.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Facts {
    pub bursts: u64,
    /// Longest run of characters without deleting, ever.
    pub best_clean_run: u32,
    /// Most characters typed in a single local day.
    pub best_day_chars: u64,
    /// Times a 10 s peak beat every earlier peak (the very first peak does not count).
    pub peak_records: u32,
    /// Times a clean run beat the earlier all-time best: each one is a crown face.
    pub crown_records: u32,
    /// Bursts that reached the "¡Superándote!" zone (95 % of the personal pace or more).
    pub beating_bursts: u32,
    /// Longest day streak ever reached with the daily goal.
    pub best_day_streak: u32,
    /// Some burst started before 08:00 / at 23:00 or later (local time).
    pub early_bird: bool,
    pub night_owl: bool,
    /// Some ISO week had the goal met every day (Monday to Friday with weekend rest).
    pub full_goal_week: bool,
    /// Days with all three challenges done.
    pub full_houses: u32,
    /// Shortcuts counted, all time and on the best day.
    pub shortcuts: u64,
    pub best_day_shortcuts: u64,
}

/// A badge: id (also the i18n key `badge.<id>`), rarity, and the test that unlocks it.
pub struct Badge {
    pub id: &'static str,
    pub rarity: Rarity,
    /// `(have, need)`: progress towards it, for the gentle hint on pending badges.
    pub progress: fn(&Facts) -> (u64, u64),
}

impl Badge {
    pub fn earned(&self, f: &Facts) -> bool {
        let (have, need) = (self.progress)(f);
        have >= need
    }
}

const fn flag(b: bool) -> (u64, u64) {
    (b as u64, 1)
}

/// The catalogue, in display order.
pub const BADGES: &[Badge] = &[
    Badge { id: "first_burst", rarity: Rarity::Bronze, progress: |f| (f.bursts.min(1), 1) },
    Badge { id: "bursts_100", rarity: Rarity::Bronze, progress: |f| (f.bursts, 100) },
    Badge { id: "bursts_1000", rarity: Rarity::Silver, progress: |f| (f.bursts, 1_000) },
    Badge { id: "bursts_10000", rarity: Rarity::Gold, progress: |f| (f.bursts, 10_000) },
    Badge { id: "clean_1000", rarity: Rarity::Silver, progress: |f| (u64::from(f.best_clean_run), 1_000) },
    Badge { id: "clean_5000", rarity: Rarity::Gold, progress: |f| (u64::from(f.best_clean_run), 5_000) },
    Badge { id: "day_10000", rarity: Rarity::Silver, progress: |f| (f.best_day_chars, 10_000) },
    Badge { id: "first_record", rarity: Rarity::Bronze, progress: |f| (u64::from(f.peak_records.min(1)), 1) },
    Badge { id: "beating_5", rarity: Rarity::Silver, progress: |f| (u64::from(f.beating_bursts), 5) },
    Badge { id: "streak_7", rarity: Rarity::Bronze, progress: |f| (u64::from(f.best_day_streak), 7) },
    Badge { id: "streak_30", rarity: Rarity::Silver, progress: |f| (u64::from(f.best_day_streak), 30) },
    Badge { id: "streak_100", rarity: Rarity::Gold, progress: |f| (u64::from(f.best_day_streak), 100) },
    Badge { id: "early_bird", rarity: Rarity::Bronze, progress: |f| flag(f.early_bird) },
    Badge { id: "night_owl", rarity: Rarity::Bronze, progress: |f| flag(f.night_owl) },
    Badge { id: "goal_week", rarity: Rarity::Silver, progress: |f| flag(f.full_goal_week) },
    Badge { id: "first_full", rarity: Rarity::Bronze, progress: |f| (u64::from(f.full_houses.min(1)), 1) },
    Badge { id: "full_30", rarity: Rarity::Silver, progress: |f| (u64::from(f.full_houses), 30) },
    Badge { id: "crowned", rarity: Rarity::Silver, progress: |f| (u64::from(f.crown_records.min(1)), 1) },
    Badge { id: "shortcuts_day_100", rarity: Rarity::Silver, progress: |f| (f.best_day_shortcuts, 100) },
    Badge { id: "shortcuts_1000", rarity: Rarity::Gold, progress: |f| (f.shortcuts, 1_000) },
];

pub fn find(id: &str) -> Option<&'static Badge> {
    BADGES.iter().find(|b| b.id == id)
}

/// Ids of the badges `facts` earns that are not in `have` yet, in catalogue order.
pub fn newly_earned(facts: &Facts, have: &[String]) -> Vec<&'static str> {
    BADGES.iter().filter(|b| b.earned(facts) && !have.iter().any(|h| h == b.id)).map(|b| b.id).collect()
}

/// How many times a running maximum was beaten, ignoring the first value (it beats nothing).
pub fn record_count<I: IntoIterator<Item = f64>>(values: I) -> u32 {
    let mut best: Option<f64> = None;
    let mut n = 0;
    for v in values {
        match best {
            Some(b) if v > b => {
                n += 1;
                best = Some(v);
            }
            None => best = Some(v),
            _ => {}
        }
    }
    n
}

/// Longest day streak ever, replaying [`crate::goal_status`] rules day by day (with the weekly comodín).
pub fn best_day_streak(days: &[(i64, u64)], today: i64, goal_ms: u64, weekend_rest: bool) -> u32 {
    if goal_ms == 0 {
        return 0;
    }
    let mut met: Vec<i64> = days.iter().filter(|(d, ms)| *d <= today && *ms >= goal_ms).map(|(d, _)| *d).collect();
    met.sort_unstable();
    met.dedup();
    // The streak can only peak on a met day; checking each met day as "today" finds the maximum.
    met.iter().map(|&d| crate::goal_status(days, d, goal_ms, weekend_rest).streak_days).max().unwrap_or(0)
}

/// Some ISO week with the goal met on all its required days (all 7, or Monday–Friday with weekend rest).
pub fn full_goal_week(days: &[(i64, u64)], goal_ms: u64, weekend_rest: bool) -> bool {
    use std::collections::{HashMap, HashSet};
    if goal_ms == 0 {
        return false;
    }
    let mut by_day: HashMap<i64, u64> = HashMap::new();
    for &(d, ms) in days {
        *by_day.entry(d).or_insert(0) += ms;
    }
    let mut weeks: HashMap<i64, HashSet<u8>> = HashMap::new();
    for (&d, &ms) in &by_day {
        if ms >= goal_ms {
            weeks.entry(d - i64::from(crate::weekday(d))).or_default().insert(crate::weekday(d));
        }
    }
    let need: &[u8] = if weekend_rest { &[0, 1, 2, 3, 4] } else { &[0, 1, 2, 3, 4, 5, 6] };
    weeks.values().any(|w| need.iter().all(|d| w.contains(d)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: u64 = 60_000;
    const MON: i64 = 4 + 7 * 100;

    #[test]
    fn rarity_xp() {
        assert_eq!([Rarity::Bronze.xp(), Rarity::Silver.xp(), Rarity::Gold.xp()], [25, 50, 100]);
    }

    #[test]
    fn ids_are_unique() {
        let ids: std::collections::HashSet<_> = BADGES.iter().map(|b| b.id).collect();
        assert_eq!(ids.len(), BADGES.len());
    }

    #[test]
    fn nothing_for_a_blank_slate_and_the_first_burst_after() {
        assert!(newly_earned(&Facts::default(), &[]).is_empty());
        let f = Facts { bursts: 1, ..Facts::default() };
        assert_eq!(newly_earned(&f, &[]), ["first_burst"]);
        assert!(newly_earned(&f, &["first_burst".into()]).is_empty());
    }

    #[test]
    fn thresholds() {
        let f = Facts { bursts: 1_000, best_clean_run: 1_200, best_day_chars: 10_000, best_day_streak: 30, full_houses: 1, ..Facts::default() };
        let got = newly_earned(&f, &[]);
        for id in ["first_burst", "bursts_100", "bursts_1000", "clean_1000", "day_10000", "streak_7", "streak_30", "first_full"] {
            assert!(got.contains(&id), "{id} missing from {got:?}");
        }
        for id in ["bursts_10000", "clean_5000", "streak_100", "full_30", "crowned", "first_record"] {
            assert!(!got.contains(&id), "{id} should be pending");
        }
        assert_eq!((find("bursts_10000").unwrap().progress)(&f), (1_000, 10_000));
    }

    #[test]
    fn records_ignore_the_first_value() {
        assert_eq!(record_count([]), 0);
        assert_eq!(record_count([50.0]), 0);
        assert_eq!(record_count([50.0, 40.0, 55.0, 55.0, 60.0]), 2);
    }

    #[test]
    fn best_streak_survives_a_later_break() {
        let met = |d: i64| (d, 20 * MIN);
        // 8 met days in a row, a two-miss break, then 2 days.
        let mut days: Vec<(i64, u64)> = (0..8).map(|k| met(MON - 20 + k)).collect();
        days.extend([met(MON - 5), met(MON - 4)]);
        assert_eq!(best_day_streak(&days, MON, 20 * MIN, false), 8);
        assert_eq!(best_day_streak(&days, MON, 0, false), 0);
    }

    #[test]
    fn a_full_week() {
        let met = |d: i64| (d, 20 * MIN);
        let workweek: Vec<(i64, u64)> = (0..5).map(|k| met(MON + k)).collect();
        assert!(!full_goal_week(&workweek, 20 * MIN, false));
        assert!(full_goal_week(&workweek, 20 * MIN, true));
        let spread: Vec<(i64, u64)> = (3..10).map(|k| met(MON + k)).collect(); // Thu to Wed: two half weeks
        assert!(!full_goal_week(&spread, 20 * MIN, false));
        let whole: Vec<(i64, u64)> = (0..7).map(|k| met(MON + k)).collect();
        assert!(full_goal_week(&whole, 20 * MIN, false));
    }
}
