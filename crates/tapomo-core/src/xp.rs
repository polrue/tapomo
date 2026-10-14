//! XP, levels and the daily challenges ("Retos del día"). Design: docs/xp.md.
//!
//! Everything here is pure: the caller reads bursts from the database and stores the awards.
//! Principles: XP is never lost, every source has a daily cap or is given once, and challenges
//! are calibrated with the user's own last 14 days, never with absolute figures.

/// Cumulative XP needed to reach level `n` (level 1 needs 0): `47 × (n − 1)^1.8`, rounded.
pub fn xp_for_level(n: u32) -> u64 {
    if n <= 1 {
        return 0;
    }
    (47.0 * f64::from(n - 1).powf(1.8)).round() as u64
}

/// Level reached with `xp` cumulative XP. Levels have no cap.
pub fn level_for_xp(xp: u64) -> u32 {
    let mut n = 1;
    while xp_for_level(n + 1) <= xp {
        n += 1;
    }
    n
}

/// Where the user stands inside their current level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LevelInfo {
    pub xp: u64,
    pub level: u32,
    /// Cumulative XP at which the current level started.
    pub level_start: u64,
    /// Cumulative XP needed for the next level.
    pub next_level_at: u64,
}

pub fn level_info(xp: u64) -> LevelInfo {
    let level = level_for_xp(xp);
    LevelInfo { xp, level, level_start: xp_for_level(level), next_level_at: xp_for_level(level + 1) }
}

// ------------------------------------------------------------------ sources

/// Typing: 1 XP per 100 characters up to 10,000, then 1 per 500, at most [`TYPING_CAP`] a day.
pub const TYPING_CAP: u32 = 150;
pub const GOAL_XP: u32 = 30;
pub const STREAK_XP_PER_DAY: u32 = 2;
pub const STREAK_XP_CAP: u32 = 20;
pub const RECORD_XP: u32 = 10;
/// Records give XP at most twice a day.
pub const RECORD_XP_CAP: u32 = 2 * RECORD_XP;
pub const CHALLENGE_XP: u32 = 15;
/// Bonus for completing the three challenges of the day ("pleno").
pub const FULL_HOUSE_XP: u32 = 15;

/// XP for the characters typed (inside bursts) in one day.
pub fn typing_xp(chars: u64) -> u32 {
    let first = chars.min(10_000) / 100;
    let rest = chars.saturating_sub(10_000) / 500;
    (first + rest).min(u64::from(TYPING_CAP)) as u32
}

/// XP for a day on which the goal was met with a day streak of `streak_days` (today included).
pub fn streak_xp(streak_days: u32) -> u32 {
    streak_days.saturating_mul(STREAK_XP_PER_DAY).min(STREAK_XP_CAP)
}

// ------------------------------------------------------------- challenges

/// One stored burst, reduced to what the challenges need. Times are local.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DayBurst {
    /// Local day number (see [`crate::weekday`]).
    pub day: i64,
    /// Local minute of the day the burst started at (0–1439).
    pub start_min: u32,
    pub duration_ms: u64,
    pub chars: u32,
    pub best_streak: u32,
    pub app_id: u32,
}

impl DayBurst {
    fn wpm(&self) -> f64 {
        if self.chars < 2 || self.duration_ms == 0 {
            return 0.0;
        }
        (f64::from(self.chars - 1) / 5.0) / (self.duration_ms as f64 / 60_000.0)
    }
}

/// A challenge of the day and how far today's bursts have got.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Challenge {
    /// Stable id, also the i18n key suffix: `long_bursts`, `beat_avg`, `clean`, `early_goal`,
    /// `apps`, and the welcome ones `bursts`, `chars`.
    pub id: &'static str,
    pub target: u32,
    pub progress: u32,
    pub done: bool,
}

/// Minimum length of a burst that counts as "long" for the `long_bursts` challenge.
pub const LONG_BURST_MS: u64 = 60_000;
/// A burst must last this long to count for `beat_avg`: a 3-second sprint is not a pace.
pub const BEAT_AVG_MIN_MS: u64 = 20_000;
/// `early_goal`: the goal met with bursts started before 13:00.
pub const EARLY_GOAL_MIN: u32 = 13 * 60;
/// Days of history used to calibrate the challenges.
pub const CALIBRATION_DAYS: i64 = 14;
/// With fewer active days than this, the user gets the easy welcome challenges.
pub const WELCOME_DAYS: usize = 3;

/// Calibration taken from the last [`CALIBRATION_DAYS`] days before `today`.
#[derive(Debug, Clone, Copy, PartialEq)]
struct History {
    active_days: usize,
    avg_wpm: f64,
    median_clean: u32,
    long_per_day: f64,
    apps_per_day: f64,
    goal_met_share: f64,
}

fn history(bursts: &[DayBurst], today: i64, goal_ms: u64) -> History {
    use std::collections::{BTreeMap, HashSet};
    #[derive(Default)]
    struct Day {
        clean: u32,
        long: u32,
        apps: HashSet<u32>,
        ms: u64,
    }
    let mut days: BTreeMap<i64, Day> = BTreeMap::new();
    let (mut intervals, mut ms_total) = (0.0, 0.0);
    for b in bursts.iter().filter(|b| b.day < today && b.day >= today - CALIBRATION_DAYS) {
        let d = days.entry(b.day).or_default();
        d.clean = d.clean.max(b.best_streak);
        d.long += u32::from(b.duration_ms >= LONG_BURST_MS);
        d.apps.insert(b.app_id);
        d.ms += b.duration_ms;
        intervals += f64::from(b.chars.saturating_sub(1));
        ms_total += b.duration_ms as f64;
    }
    let n = days.len();
    let per_day = |f: &dyn Fn(&Day) -> f64| if n == 0 { 0.0 } else { days.values().map(f).sum::<f64>() / n as f64 };
    let mut cleans: Vec<u32> = days.values().map(|d| d.clean).collect();
    cleans.sort_unstable();
    History {
        active_days: n,
        avg_wpm: if ms_total > 0.0 { intervals / 5.0 / (ms_total / 60_000.0) } else { 0.0 },
        median_clean: cleans.get(n / 2).copied().unwrap_or(0),
        long_per_day: per_day(&|d| f64::from(d.long)),
        apps_per_day: per_day(&|d| d.apps.len() as f64),
        goal_met_share: if goal_ms == 0 { 0.0 } else { per_day(&|d| f64::from(u8::from(d.ms >= goal_ms))) },
    }
}

/// splitmix64: a tiny deterministic generator, so a day always gets the same challenges.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// Rounds down to a multiple of `step`, within `lo..=hi`.
fn step_clamp(v: u32, step: u32, lo: u32, hi: u32) -> u32 {
    (v / step * step).clamp(lo, hi)
}

/// The three challenges of `today`, with their progress.
///
/// `bursts` holds at least the last [`CALIBRATION_DAYS`] days and today; `history_days` is the
/// number of distinct days with bursts before today (all time). The choice only depends on days
/// before today, so it stays fixed during the day. `goal_ms == 0` means the daily goal is off.
pub fn daily_challenges(bursts: &[DayBurst], today: i64, history_days: usize, goal_ms: u64) -> [Challenge; 3] {
    let h = history(bursts, today, goal_ms);
    let picks: [(&'static str, u32); 3] = if history_days < WELCOME_DAYS || h.active_days == 0 {
        [("bursts", 3), ("chars", 1_000), ("clean", 100)]
    } else {
        let mut pool: Vec<(&'static str, u32)> = vec![
            ("long_bursts", (h.long_per_day.round() as u32).clamp(1, 3)),
            ("beat_avg", h.avg_wpm.round() as u32),
            ("clean", step_clamp((f64::from(h.median_clean) * 0.8) as u32, 50, 100, 1_500)),
        ];
        if goal_ms > 0 && h.goal_met_share >= 0.5 {
            pool.push(("early_goal", 1));
        }
        if h.apps_per_day >= 1.5 {
            pool.push(("apps", 3));
        }
        // Fisher–Yates with a day-seeded generator.
        let mut seed = mix(today as u64);
        for i in (1..pool.len()).rev() {
            seed = mix(seed);
            pool.swap(i, (seed % (i as u64 + 1)) as usize);
        }
        [pool[0], pool[1], pool[2]]
    };
    let today_bursts: Vec<&DayBurst> = bursts.iter().filter(|b| b.day == today).collect();
    picks.map(|(id, target)| {
        let progress = match id {
            "long_bursts" => today_bursts.iter().filter(|b| b.duration_ms >= LONG_BURST_MS).count() as u32,
            "beat_avg" => u32::from(today_bursts.iter().any(|b| b.duration_ms >= BEAT_AVG_MIN_MS && b.wpm() > f64::from(target))),
            "clean" => today_bursts.iter().map(|b| b.best_streak).max().unwrap_or(0),
            "early_goal" => {
                let ms: u64 = today_bursts.iter().filter(|b| b.start_min < EARLY_GOAL_MIN).map(|b| b.duration_ms).sum();
                u32::from(goal_ms > 0 && ms >= goal_ms)
            }
            "apps" => today_bursts.iter().map(|b| b.app_id).collect::<std::collections::HashSet<_>>().len() as u32,
            "bursts" => today_bursts.len() as u32,
            "chars" => today_bursts.iter().map(|b| b.chars).sum(),
            _ => 0,
        };
        // beat_avg and early_goal are yes/no: their target is shown as a pace or not at all.
        let goal = if matches!(id, "beat_avg" | "early_goal") { 1 } else { target };
        Challenge { id, target, progress: progress.min(goal), done: progress >= goal }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve_matches_the_approved_table() {
        assert_eq!(xp_for_level(1), 0);
        assert_eq!(xp_for_level(4), 340);
        assert_eq!(xp_for_level(7), 1_182);
        assert_eq!(xp_for_level(10), 2_453);
        assert_eq!(xp_for_level(46), 44_451);
        assert_eq!(xp_for_level(50), 51_814);
    }

    #[test]
    fn levels_from_xp() {
        assert_eq!(level_for_xp(0), 1);
        assert_eq!(level_for_xp(46), 1);
        assert_eq!(level_for_xp(47), 2);
        assert_eq!(level_for_xp(339), 3);
        assert_eq!(level_for_xp(340), 4);
        assert_eq!(level_for_xp(51_814), 50);
        assert!(level_for_xp(10_000_000) > 50, "no cap after 50");
        let i = level_info(400);
        assert_eq!((i.level, i.level_start, i.next_level_at), (4, 340, xp_for_level(5)));
    }

    #[test]
    fn typing_has_diminishing_returns_and_a_cap() {
        assert_eq!(typing_xp(0), 0);
        assert_eq!(typing_xp(99), 0);
        assert_eq!(typing_xp(4_000), 40);
        assert_eq!(typing_xp(10_000), 100);
        assert_eq!(typing_xp(15_000), 110);
        assert_eq!(typing_xp(35_000), 150);
        assert_eq!(typing_xp(1_000_000), TYPING_CAP);
    }

    #[test]
    fn streak_xp_is_small_and_capped() {
        assert_eq!(streak_xp(0), 0);
        assert_eq!(streak_xp(3), 6);
        assert_eq!(streak_xp(10), 20);
        assert_eq!(streak_xp(400), 20);
    }

    /// One burst per (day, minutes long, chars, clean run, app).
    fn b(day: i64, start_min: u32, secs: u64, chars: u32, clean: u32, app: u32) -> DayBurst {
        DayBurst { day, start_min, duration_ms: secs * 1000, chars, best_streak: clean, app_id: app }
    }

    const TODAY: i64 = 20_000;

    /// Ten active days: 2 long bursts a day at ~60 wpm (300 chars a minute), clean runs of 500, two apps.
    fn routine() -> Vec<DayBurst> {
        (1..=10)
            .flat_map(|k| [b(TODAY - k, 600, 90, 451, 500, 1), b(TODAY - k, 700, 70, 351, 300, 2), b(TODAY - k, 800, 10, 40, 40, 1)])
            .collect()
    }

    #[test]
    fn newcomers_get_welcome_challenges() {
        let today = [b(TODAY, 600, 30, 200, 120, 1)];
        let c = daily_challenges(&today, TODAY, 0, 20 * 60_000);
        assert_eq!(c.map(|c| c.id), ["bursts", "chars", "clean"]);
        assert_eq!((c[0].progress, c[0].done), (1, false));
        assert_eq!((c[2].progress, c[2].done), (100, true));
    }

    #[test]
    fn challenges_are_stable_for_a_day_and_calibrated() {
        let mut bursts = routine();
        let goal = 2 * 60_000; // met every day by 170 s of typing
        let a = daily_challenges(&bursts, TODAY, 10, goal);
        bursts.push(b(TODAY, 900, 120, 700, 600, 3));
        let c = daily_challenges(&bursts, TODAY, 10, goal);
        assert_eq!(a.map(|c| c.id), c.map(|c| c.id), "typing today must not change today's picks");
        let ids = c.map(|c| c.id);
        assert_eq!(ids.iter().collect::<std::collections::HashSet<_>>().len(), 3, "no repeats");
        for ch in c {
            match ch.id {
                "long_bursts" => assert_eq!((ch.target, ch.progress, ch.done), (2, 1, false)),
                "beat_avg" => assert!(ch.target > 55 && ch.target < 65, "avg pace {}", ch.target),
                "clean" => assert_eq!((ch.target, ch.done), (400, true)), // 80 % of a 500 median
                "early_goal" => assert!(!ch.done, "today's burst starts at 15:00"),
                "apps" => assert_eq!((ch.target, ch.progress), (3, 1)),
                other => panic!("unexpected challenge {other}"),
            }
        }
    }

    #[test]
    fn conditional_challenges_need_the_habit() {
        // One app, goal off: early_goal and apps are never offered, the three base ones always are.
        let bursts: Vec<DayBurst> = (1..=10).map(|k| b(TODAY - k, 600, 90, 451, 500, 1)).collect();
        for day in TODAY..TODAY + 4 {
            let mut ids = daily_challenges(&bursts, day, 10, 0).map(|c| c.id);
            ids.sort_unstable();
            assert_eq!(ids, ["beat_avg", "clean", "long_bursts"]);
        }
    }

    #[test]
    fn the_choice_varies_between_days() {
        let bursts = routine();
        let sets: std::collections::HashSet<[&str; 3]> =
            (0..20).map(|k| daily_challenges(&bursts, TODAY + k, 10, 2 * 60_000).map(|c| c.id)).collect();
        assert!(sets.len() > 3, "only {} different sets", sets.len());
    }

    #[test]
    fn beat_avg_needs_a_real_burst_above_the_average() {
        let mut bursts: Vec<DayBurst> = (1..=10).map(|k| b(TODAY - k, 600, 60, 301, 50, 1)).collect(); // 60 wpm
        bursts.push(b(TODAY, 600, 10, 121, 50, 1)); // 72 wpm but only 10 s
        let find = |bs: &[DayBurst]| (TODAY..TODAY + 60).find_map(|d| {
            let shifted: Vec<DayBurst> = bs.iter().map(|x| DayBurst { day: x.day + d - TODAY, ..*x }).collect();
            daily_challenges(&shifted, d, 10, 0).into_iter().find(|c| c.id == "beat_avg")
        });
        assert!(!find(&bursts).unwrap().done);
        bursts.push(b(TODAY, 700, 30, 181, 50, 1)); // 72 wpm over 30 s
        assert!(find(&bursts).unwrap().done);
    }
}
