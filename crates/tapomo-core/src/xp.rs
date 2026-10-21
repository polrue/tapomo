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

/// What the challenges know beyond typing (0.7.0): lessons done and the shortcut learnt yesterday.
#[derive(Debug, Clone, Copy, Default)]
pub struct Extras<'a> {
    /// `(day, lessons finished)`.
    pub lessons: &'a [(i64, u64)],
    /// A shortcut from the album was used for the very first time yesterday...
    pub learnt_yesterday: bool,
    /// ...and it has been used again today.
    pub learnt_used_today: bool,
    /// The ids shown yesterday, when the app stored them (exact). `None` replays the choice instead.
    pub shown_yesterday: Option<&'a [&'a str]>,
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
    /// `early_goal` only: the personal deadline, in minutes since local midnight (`target` is then
    /// the daily goal in minutes and `progress` the minutes typed in bursts started before it).
    pub deadline_min: Option<u32>,
}

/// Minimum length of a burst that counts as "long" for the `long_bursts` challenge.
pub const LONG_BURST_MS: u64 = 60_000;
/// A burst must last this long to count for `beat_avg`: a 3-second sprint is not a pace.
pub const BEAT_AVG_MIN_MS: u64 = 20_000;
/// `early_goal`: earliest and latest personal deadline (minutes since midnight): 09:00 and 22:00.
pub const EARLY_DEADLINE_MIN: u32 = 9 * 60;
pub const EARLY_DEADLINE_MAX: u32 = 22 * 60;
/// `early_goal` needs at least this many calibration days on which the goal was met.
pub const EARLY_GOAL_MIN_DAYS: usize = 3;
/// Days back from which the "no repeats from yesterday" rule is replayed, so it stays consistent.
pub const REPEAT_LOOKBACK: i64 = 7;
/// Days of history used to calibrate the challenges.
pub const CALIBRATION_DAYS: i64 = 14;
const WELCOME_IDS: [&str; 3] = ["bursts", "chars", "clean"];
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
    /// Personal `early_goal` deadline (minutes since midnight), when there are enough days to tell.
    early_deadline: Option<u32>,
}

fn history(bursts: &[DayBurst], today: i64, goal_ms: u64) -> History {
    use std::collections::{BTreeMap, HashSet};
    #[derive(Default)]
    struct Day {
        clean: u32,
        long: u32,
        apps: HashSet<u32>,
        ms: u64,
        /// `(start_min, duration_ms)` of each burst.
        spans: Vec<(u32, u64)>,
    }
    let mut days: BTreeMap<i64, Day> = BTreeMap::new();
    let (mut intervals, mut ms_total) = (0.0, 0.0);
    for b in bursts.iter().filter(|b| b.day < today && b.day >= today - CALIBRATION_DAYS) {
        let d = days.entry(b.day).or_default();
        d.clean = d.clean.max(b.best_streak);
        d.long += u32::from(b.duration_ms >= LONG_BURST_MS);
        d.apps.insert(b.app_id);
        d.ms += b.duration_ms;
        d.spans.push((b.start_min, b.duration_ms));
        intervals += f64::from(b.chars.saturating_sub(1));
        ms_total += b.duration_ms as f64;
    }
    let n = days.len();
    let per_day = |f: &dyn Fn(&Day) -> f64| if n == 0 { 0.0 } else { days.values().map(f).sum::<f64>() / n as f64 };
    let mut cleans: Vec<u32> = days.values().map(|d| d.clean).collect();
    cleans.sort_unstable();
    let mut reached: Vec<u32> = if goal_ms == 0 { Vec::new() } else { days.values().filter_map(|d| goal_reached_at(&mut d.spans.clone(), goal_ms)).collect() };
    reached.sort_unstable();
    let early_deadline = (reached.len() >= EARLY_GOAL_MIN_DAYS)
        .then(|| (reached[reached.len() / 2] / 60 * 60).clamp(EARLY_DEADLINE_MIN, EARLY_DEADLINE_MAX));
    History {
        active_days: n,
        avg_wpm: if ms_total > 0.0 { intervals / 5.0 / (ms_total / 60_000.0) } else { 0.0 },
        median_clean: cleans.get(n / 2).copied().unwrap_or(0),
        long_per_day: per_day(&|d| f64::from(d.long)),
        apps_per_day: per_day(&|d| d.apps.len() as f64),
        goal_met_share: if goal_ms == 0 { 0.0 } else { per_day(&|d| f64::from(u8::from(d.ms >= goal_ms))) },
        early_deadline,
    }
}

/// Minute of the day at which a day's bursts (`(start_min, duration_ms)`) added up to `goal_ms`:
/// the start of the burst that crossed the goal plus the part of it that was needed.
fn goal_reached_at(spans: &mut [(u32, u64)], goal_ms: u64) -> Option<u32> {
    spans.sort_unstable();
    let mut acc = 0u64;
    for &(start, dur) in spans.iter() {
        if acc + dur >= goal_ms {
            return Some(start + ((goal_ms - acc) / 60_000) as u32);
        }
        acc += dur;
    }
    None
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

/// The picks of one day: id and target of each challenge, whether they are the welcome trio, and
/// the `early_goal` deadline. Pure and only dependent on days before `day`.
struct Picks {
    items: [(&'static str, u32); 3],
    welcome: bool,
    deadline: Option<u32>,
}

/// Chooses the three challenges of `day`. Ids in `avoid` (yesterday's) go last, so they only come
/// back when the pool has fewer than three other ids.
fn choose(bursts: &[DayBurst], day: i64, history_days: usize, goal_ms: u64, shortcuts: &[(i64, u64)], lessons: &[(i64, u64)], learnt_yesterday: bool, avoid: &[&str]) -> Picks {
    let h = history(bursts, day, goal_ms);
    if history_days < WELCOME_DAYS || h.active_days == 0 {
        return Picks { items: [("bursts", 3), ("chars", 1_000), ("clean", 100)], welcome: true, deadline: None };
    }
    let shortcut_avg = shortcuts.iter().filter(|(d, _)| *d < day && *d >= day - CALIBRATION_DAYS).map(|(_, n)| *n as f64).sum::<f64>() / h.active_days as f64;
    let mut pool: Vec<(&'static str, u32)> = vec![
        ("long_bursts", (h.long_per_day.round() as u32).clamp(1, 3)),
        ("beat_avg", h.avg_wpm.round() as u32),
        ("clean", step_clamp((f64::from(h.median_clean) * 0.8) as u32, 50, 100, 1_500)),
    ];
    let mut deadline = None;
    if goal_ms > 0 && h.goal_met_share >= 0.5 && h.early_deadline.is_some() {
        pool.push(("early_goal", (goal_ms / 60_000) as u32));
        deadline = h.early_deadline;
    }
    if h.apps_per_day >= 1.5 {
        pool.push(("apps", 3));
    }
    // Only for people who already use a few shortcuts a day: it nudges, it doesn't demand.
    if shortcut_avg >= 5.0 {
        pool.push(("shortcuts", step_clamp(shortcut_avg as u32, 5, 10, 50)));
    }
    // Only for people who already do lessons (on 2+ of the last 14 days).
    let lesson_days = lessons.iter().filter(|(d, n)| *d < day && *d >= day - CALIBRATION_DAYS && *n > 0).count();
    if lesson_days >= 2 {
        pool.push(("lesson", 1));
    }
    // A shortcut first used yesterday: using it again today turns it into a habit.
    if learnt_yesterday {
        pool.push(("learnt", 1));
    }
    // Fisher–Yates with a day-seeded generator.
    let mut seed = mix(day as u64);
    for i in (1..pool.len()).rev() {
        seed = mix(seed);
        pool.swap(i, (seed % (i as u64 + 1)) as usize);
    }
    // Yesterday's ids go to the back (stable), so they are only used when nothing else is left.
    pool.sort_by_key(|(id, _)| avoid.contains(id));
    let items = [pool[0], pool[1], pool[2]];
    Picks { items, welcome: false, deadline: items.iter().any(|(id, _)| *id == "early_goal").then_some(deadline).flatten() }
}

/// The three challenges of `today`, with their progress.
///
/// `bursts` holds the last [`CALIBRATION_DAYS`] + [`REPEAT_LOOKBACK`] days and today; `history_days` is the
/// number of distinct days with bursts before today (all time). The choice only depends on days
/// before today, so it stays fixed during the day. `goal_ms == 0` means the daily goal is off.
/// `shortcuts` holds `(day, count)` pairs, empty when shortcut counting is off.
///
/// A challenge shown yesterday is not picked again while the pool has enough others (the welcome
/// trio is exempt). Yesterday's picks are recomputed with the same pure choice, replayed from
/// [`REPEAT_LOOKBACK`] days back (the "shortcut learnt yesterday" of past days is unknown there),
/// unless the app passes what it really showed (`extras.shown_yesterday`, exact).
pub fn daily_challenges(bursts: &[DayBurst], today: i64, history_days: usize, goal_ms: u64, shortcuts: &[(i64, u64)], extras: Extras) -> [Challenge; 3] {
    let mut prev: Vec<&str> = Vec::new();
    if let Some(shown) = extras.shown_yesterday {
        // The welcome trio is exempt from the rule.
        prev = if shown == WELCOME_IDS { Vec::new() } else { shown.to_vec() };
    } else {
        for d in today - REPEAT_LOOKBACK..today {
            // Days with bursts from `d` up to yesterday were not yet history on day `d`.
            let later: std::collections::HashSet<i64> = bursts.iter().filter(|b| b.day >= d && b.day < today).map(|b| b.day).collect();
            let p = choose(bursts, d, history_days.saturating_sub(later.len()), goal_ms, shortcuts, extras.lessons, false, &prev);
            prev = if p.welcome { Vec::new() } else { p.items.iter().map(|(id, _)| *id).collect() };
        }
    }
    let picks = choose(bursts, today, history_days, goal_ms, shortcuts, extras.lessons, extras.learnt_yesterday, &prev);
    let today_bursts: Vec<&DayBurst> = bursts.iter().filter(|b| b.day == today).collect();
    picks.items.map(|(id, target)| {
        let mut deadline_min = None;
        let progress = match id {
            "long_bursts" => today_bursts.iter().filter(|b| b.duration_ms >= LONG_BURST_MS).count() as u32,
            "beat_avg" => u32::from(today_bursts.iter().any(|b| b.duration_ms >= BEAT_AVG_MIN_MS && b.wpm() > f64::from(target))),
            "clean" => today_bursts.iter().map(|b| b.best_streak).max().unwrap_or(0),
            "early_goal" => {
                // Minutes typed in bursts that started before the personal deadline.
                deadline_min = picks.deadline;
                let limit = picks.deadline.unwrap_or(0);
                let ms: u64 = today_bursts.iter().filter(|b| b.start_min < limit).map(|b| b.duration_ms).sum();
                if goal_ms > 0 && ms >= goal_ms { target } else { (ms / 60_000) as u32 }
            }
            "apps" => today_bursts.iter().map(|b| b.app_id).collect::<std::collections::HashSet<_>>().len() as u32,
            "bursts" => today_bursts.len() as u32,
            "chars" => today_bursts.iter().map(|b| b.chars).sum(),
            "shortcuts" => shortcuts.iter().filter(|(d, _)| *d == today).map(|(_, n)| *n as u32).sum(),
            "lesson" => extras.lessons.iter().filter(|(d, _)| *d == today).map(|(_, n)| *n as u32).sum(),
            "learnt" => u32::from(extras.learnt_used_today),
            _ => 0,
        };
        // beat_avg and learnt are yes/no: their target is shown as a pace or not at all.
        let goal = if matches!(id, "beat_avg" | "learnt") { 1 } else { target };
        let done = if id == "early_goal" { progress >= target && target > 0 } else { progress >= goal };
        Challenge { id, target, progress: progress.min(goal), done, deadline_min }
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
        let c = daily_challenges(&today, TODAY, 0, 20 * 60_000, &[], Extras::default());
        assert_eq!(c.map(|c| c.id), ["bursts", "chars", "clean"]);
        assert_eq!((c[0].progress, c[0].done), (1, false));
        assert_eq!((c[2].progress, c[2].done), (100, true));
    }

    #[test]
    fn challenges_are_stable_for_a_day_and_calibrated() {
        let mut bursts = routine();
        let goal = 2 * 60_000; // met every day by 170 s of typing
        let a = daily_challenges(&bursts, TODAY, 10, goal, &[], Extras::default());
        bursts.push(b(TODAY, 900, 120, 700, 600, 3));
        let c = daily_challenges(&bursts, TODAY, 10, goal, &[], Extras::default());
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
            let mut ids = daily_challenges(&bursts, day, 10, 0, &[], Extras::default()).map(|c| c.id);
            ids.sort_unstable();
            assert_eq!(ids, ["beat_avg", "clean", "long_bursts"]);
        }
    }

    #[test]
    fn shortcut_users_may_get_a_shortcut_challenge() {
        let bursts: Vec<DayBurst> = (1..=10).map(|k| b(TODAY - k, 600, 90, 451, 500, 1)).collect();
        let used: Vec<(i64, u64)> = (1..=10).map(|k| (TODAY - k, 23)).chain([(TODAY, 7)]).collect();
        let found = (TODAY..TODAY + 4).find_map(|d| {
            let shifted: Vec<DayBurst> = bursts.iter().map(|x| DayBurst { day: x.day + d - TODAY, ..*x }).collect();
            let sc: Vec<(i64, u64)> = used.iter().map(|(x, n)| (x + d - TODAY, *n)).collect();
            daily_challenges(&shifted, d, 10, 0, &sc, Extras::default()).into_iter().find(|c| c.id == "shortcuts")
        });
        let c = found.expect("offered on some day");
        assert_eq!((c.target, c.progress, c.done), (20, 7, false));
        // Nobody gets it without the habit.
        assert!((TODAY..TODAY + 4).all(|d| daily_challenges(&bursts, d, 10, 0, &[], Extras::default()).iter().all(|c| c.id != "shortcuts")));
    }

    #[test]
    fn lesson_and_learnt_challenges_need_the_habit() {
        let bursts: Vec<DayBurst> = (1..=10).map(|k| b(TODAY - k, 600, 90, 451, 500, 1)).collect();
        let lessons = [(TODAY - 3, 1), (TODAY - 1, 2), (TODAY, 1)];
        let extras = Extras { lessons: &lessons, learnt_yesterday: true, learnt_used_today: false, shown_yesterday: None };
        let mut seen = std::collections::HashSet::new();
        for d in TODAY..TODAY + 1 {
            for c in daily_challenges(&bursts, d, 10, 0, &[], extras) {
                seen.insert(c.id);
                if c.id == "lesson" { assert_eq!((c.progress, c.done), (1, true)); }
                if c.id == "learnt" { assert!(!c.done); }
            }
        }
        // Pool of 5 (3 base + lesson + learnt): over a few days both show up.
        let all: std::collections::HashSet<&str> = (0..12)
            .flat_map(|k| {
                let shifted: Vec<DayBurst> = bursts.iter().map(|x| DayBurst { day: x.day + k, ..*x }).collect();
                let ls: Vec<(i64, u64)> = lessons.iter().map(|(d, n)| (d + k, *n)).collect();
                daily_challenges(&shifted, TODAY + k, 10, 0, &[], Extras { lessons: &ls, ..extras }).map(|c| c.id)
            })
            .collect();
        assert!(all.contains("lesson") && all.contains("learnt"), "{all:?}");
        // Without lessons or a learnt shortcut they never appear.
        for d in TODAY..TODAY + 4 {
            assert!(daily_challenges(&bursts, d, 10, 0, &[], Extras::default()).iter().all(|c| c.id != "lesson" && c.id != "learnt"));
        }
    }

    #[test]
    fn the_choice_varies_between_days() {
        let bursts = routine();
        let sets: std::collections::HashSet<[&str; 3]> =
            (0..20).map(|k| daily_challenges(&bursts, TODAY + k, 10, 2 * 60_000, &[], Extras::default()).map(|c| c.id)).collect();
        assert!(sets.len() > 3, "only {} different sets", sets.len());
    }

    #[test]
    fn beat_avg_needs_a_real_burst_above_the_average() {
        let mut bursts: Vec<DayBurst> = (1..=10).map(|k| b(TODAY - k, 600, 60, 301, 50, 1)).collect(); // 60 wpm
        bursts.push(b(TODAY, 600, 10, 121, 50, 1)); // 72 wpm but only 10 s
        let find = |bs: &[DayBurst]| (TODAY..TODAY + 60).find_map(|d| {
            let shifted: Vec<DayBurst> = bs.iter().map(|x| DayBurst { day: x.day + d - TODAY, ..*x }).collect();
            daily_challenges(&shifted, d, 10, 0, &[], Extras::default()).into_iter().find(|c| c.id == "beat_avg")
        });
        assert!(!find(&bursts).unwrap().done);
        bursts.push(b(TODAY, 700, 30, 181, 50, 1)); // 72 wpm over 30 s
        assert!(find(&bursts).unwrap().done);
    }

    /// `days` past days, each with one burst of `secs` seconds starting at `start`.
    fn habit(days: i64, start: u32, secs: u64) -> Vec<DayBurst> {
        (1..=days).map(|k| b(TODAY - k, start, secs, 451, 500, 1)).collect()
    }

    fn early(bursts: &[DayBurst], day: i64, goal_min: u64) -> Option<Challenge> {
        // Looks over some days: the picks rotate, but the deadline must be the same whenever offered.
        daily_challenges(bursts, day, 10, goal_min * 60_000, &[], Extras::default()).into_iter().find(|c| c.id == "early_goal")
    }

    fn deadline_of(bursts: &[DayBurst], goal_min: u64) -> Option<u32> {
        let shifted = |d: i64| -> Vec<DayBurst> { bursts.iter().map(|x| DayBurst { day: x.day + d - TODAY, ..*x }).collect() };
        (TODAY..TODAY + 40).find_map(|d| early(&shifted(d), d, goal_min)).and_then(|c| c.deadline_min)
    }

    #[test]
    fn early_goal_deadline_follows_the_typist() {
        // Morning typist: 20 min burst at 08:10 reaches a 10 min goal at 08:20 -> 09:00 (the floor clamp).
        assert_eq!(deadline_of(&habit(10, 8 * 60 + 10, 1200), 10), Some(9 * 60));
        // 10:00 start, goal reached at 10:20 -> 10:00.
        assert_eq!(deadline_of(&habit(10, 10 * 60, 1200), 20), Some(10 * 60));
        // Afternoon typist: goal reached at 18:40 -> 18:00.
        assert_eq!(deadline_of(&habit(10, 18 * 60 + 30, 1200), 10), Some(18 * 60));
        // Night owl: reached at 23:30 -> clamped to 22:00.
        assert_eq!(deadline_of(&habit(10, 23 * 60, 1800), 30), Some(22 * 60));
    }

    #[test]
    fn early_goal_reach_minute_uses_the_crossing_burst() {
        // Two bursts: 5 min at 09:00, then 20 min at 15:00. A 10 min goal is crossed 5 min into the second.
        let mut spans = [(15 * 60, 20 * 60_000), (9 * 60, 5 * 60_000)];
        assert_eq!(goal_reached_at(&mut spans, 10 * 60_000), Some(15 * 60 + 5));
        assert_eq!(goal_reached_at(&mut spans, 60 * 60_000), None);
    }

    #[test]
    fn early_goal_needs_three_days_with_a_reach_minute() {
        // Only two days met the goal (the other eight fell short): not offered, whatever the day.
        let mut bursts = habit(2, 600, 1200);
        bursts.extend((3..=10).map(|k| b(TODAY - k, 600, 60, 100, 50, 1)));
        assert_eq!(deadline_of(&bursts, 10), None);
        // Three met days are enough.
        let mut bursts = habit(3, 600, 1200);
        bursts.extend((4..=10).map(|k| b(TODAY - k, 600, 60, 100, 50, 1)));
        let _ = deadline_of(&bursts, 10); // goal_met_share is 0.3 < 0.5: still not offered
        assert_eq!(deadline_of(&bursts, 10), None);
        let mut bursts = habit(6, 600, 1200);
        bursts.extend((7..=10).map(|k| b(TODAY - k, 600, 60, 100, 50, 1)));
        assert_eq!(deadline_of(&bursts, 10), Some(10 * 60));
    }

    #[test]
    fn early_goal_only_counts_bursts_started_before_the_deadline() {
        let past = habit(10, 10 * 60, 1200); // goal 10 min, deadline 10:00... reached 10:10
        let find = |today_bursts: &[DayBurst]| {
            (TODAY..TODAY + 40).find_map(|d| {
                let mut v: Vec<DayBurst> = past.iter().map(|x| DayBurst { day: x.day + d - TODAY, ..*x }).collect();
                v.extend(today_bursts.iter().map(|x| DayBurst { day: d, ..*x }));
                early(&v, d, 10)
            })
        };
        assert_eq!(find(&[]).unwrap().deadline_min, Some(600));
        // 6 min at 09:50 (counts) + 9 min at 10:00 (starts at the deadline: does not count).
        let c = find(&[b(0, 590, 360, 100, 50, 1), b(0, 600, 540, 100, 50, 1)]).unwrap();
        assert_eq!((c.target, c.progress, c.done), (10, 6, false));
        // Add 4 more minutes before the deadline: done, with the exact goal reached.
        let c = find(&[b(0, 590, 360, 100, 50, 1), b(0, 595, 240, 100, 50, 1)]).unwrap();
        assert_eq!((c.progress, c.done), (10, true));
        // A big burst after the deadline can never complete it.
        let c = find(&[b(0, 700, 3600, 100, 50, 1)]).unwrap();
        assert_eq!((c.progress, c.done), (0, false));
    }

    /// Replays `days` consecutive days like the app does: each day gets what the previous one
    /// really showed (stored), the first one is replayed.
    fn run_days(bursts: &[DayBurst], goal_min: u64, sc: &[(i64, u64)], ls: &[(i64, u64)], days: i64) -> Vec<[&'static str; 3]> {
        let mut out: Vec<[&'static str; 3]> = Vec::new();
        for k in 0..days {
            let d = TODAY + k;
            let v: Vec<DayBurst> = bursts.iter().map(|x| DayBurst { day: x.day + k, ..*x }).collect();
            let shown: Option<Vec<&str>> = out.last().map(|y| y.to_vec());
            let extras = Extras { lessons: ls, shown_yesterday: shown.as_deref(), ..Extras::default() };
            out.push(daily_challenges(&v, d, 30, goal_min * 60_000, sc, extras).map(|c| c.id));
        }
        out
    }

    fn month() -> Vec<DayBurst> {
        (1..=30).flat_map(|k| [b(TODAY - k, 600, 90, 451, 500, 1), b(TODAY - k, 700, 70, 351, 300, 2)]).collect()
    }

    #[test]
    fn yesterdays_challenges_do_not_come_back() {
        // Pool of 5 (base 3 + early_goal + apps): yesterday's 3 leave only 2, so exactly one may repeat.
        for w in run_days(&month(), 2, &[], &[], 30).windows(2) {
            let repeats = w[1].iter().filter(|id| w[0].contains(id)).count();
            assert_eq!(repeats, 1, "{:?} then {:?}", w[0], w[1]);
        }
        // Pool of 7 (+ shortcuts + lesson): 4 are left, so no repeats at all.
        let sc: Vec<(i64, u64)> = (-40..=40).map(|k| (TODAY + k, 20)).collect();
        let ls: Vec<(i64, u64)> = (-40..=40).map(|k| (TODAY + k, 1)).collect();
        for w in run_days(&month(), 2, &sc, &ls, 30).windows(2) {
            assert!(w[1].iter().all(|id| !w[0].contains(id)), "{:?} then {:?}", w[0], w[1]);
        }
    }

    #[test]
    fn the_replay_is_deterministic_and_welcome_days_are_exempt() {
        let sc: Vec<(i64, u64)> = (-40..=40).map(|k| (TODAY + k, 20)).collect();
        let ls: Vec<(i64, u64)> = (-40..=40).map(|k| (TODAY + k, 1)).collect();
        let f = || daily_challenges(&month(), TODAY, 30, 2 * 60_000, &sc, Extras { lessons: &ls, ..Extras::default() }).map(|c| c.id);
        assert_eq!(f(), f());
        // The welcome trio shown yesterday does not constrain a user who just left the welcome phase.
        let with = |shown: &[&str]| daily_challenges(&month(), TODAY, 30, 2 * 60_000, &sc, Extras { lessons: &ls, shown_yesterday: Some(shown), ..Extras::default() }).map(|c| c.id);
        assert_eq!(with(&["bursts", "chars", "clean"]), with(&[]));
        let real = ["long_bursts", "beat_avg", "clean"];
        assert!(with(&real).iter().all(|id| !real.contains(id)), "a real yesterday does constrain");
    }
}
