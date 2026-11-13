//! The daily goal over time. A goal change never rewrites the past: every day is judged with the
//! goal that was in force on that day ([`GoalPlan`]). The automatic mode ([`next_auto_goal`])
//! re-evaluates the goal once a week from how the previous week went. Design: docs/xp.md, «Objetivo diario».

use crate::{weekday, week_start};

/// Automatic goal: where it starts, the step, the limits (minutes).
pub const AUTO_START_MIN: u32 = 10;
pub const AUTO_STEP_MIN: u32 = 5;
pub const AUTO_MIN: u32 = 5;
pub const AUTO_MAX: u32 = 30;
/// Fewer active days than this in the week and the goal stays as it is.
pub const AUTO_MIN_ACTIVE_DAYS: usize = 3;

/// The goal in force on each day: `(from_day, goal_ms)` entries, `0` meaning the goal was off.
/// Days before the first entry use the first entry's value, so a plan with one entry is a flat goal.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GoalPlan {
    entries: Vec<(i64, u64)>,
}

impl GoalPlan {
    /// The same goal for every day (what there was before the goal had a history).
    pub fn flat(goal_ms: u64) -> Self {
        Self { entries: vec![(0, goal_ms)] }
    }

    /// From `(from_day, goal_ms)` pairs in any order; for repeated days the later pair wins.
    pub fn new(mut entries: Vec<(i64, u64)>) -> Self {
        entries.sort_by_key(|e| e.0); // stable: a later pair for the same day stays later
        let mut out: Vec<(i64, u64)> = Vec::with_capacity(entries.len());
        for e in entries {
            match out.last_mut() {
                Some(last) if last.0 == e.0 => *last = e,
                _ => out.push(e),
            }
        }
        Self { entries: out }
    }

    /// The goal of `day`, in ms (0 = off).
    pub fn at(&self, day: i64) -> u64 {
        self.entries.iter().rev().find(|e| e.0 <= day).or_else(|| self.entries.first()).map_or(0, |e| e.1)
    }

    /// The goal was never on.
    pub fn is_off(&self) -> bool {
        self.entries.iter().all(|e| e.1 == 0)
    }

    pub fn entries(&self) -> &[(i64, u64)] {
        &self.entries
    }
}

impl From<u64> for GoalPlan {
    fn from(goal_ms: u64) -> Self {
        Self::flat(goal_ms)
    }
}

impl From<&GoalPlan> for GoalPlan {
    fn from(p: &GoalPlan) -> Self {
        p.clone()
    }
}

/// The goal (minutes) for the week after `prev_week` (the Monday of the week just ended), judged
/// from `(day, active_ms)` pairs. Active days are those with any goal time; with `weekend_rest`
/// Saturdays and Sundays are not counted at all (they are neither active nor a miss). With at least
/// [`AUTO_MIN_ACTIVE_DAYS`] active days: 80 % or more of them meeting that day's goal raises it one
/// step, under 50 % lowers it one step, anything between leaves it. Always within
/// [`AUTO_MIN`]..=[`AUTO_MAX`].
pub fn next_auto_goal(days: &[(i64, u64)], plan: &GoalPlan, prev_week: i64, weekend_rest: bool, current_min: u32) -> u32 {
    let mut by_day: std::collections::BTreeMap<i64, u64> = std::collections::BTreeMap::new();
    for &(d, ms) in days.iter().filter(|(d, _)| *d >= prev_week && *d < prev_week + 7) {
        *by_day.entry(d).or_insert(0) += ms;
    }
    let counted: Vec<(i64, u64)> = by_day.into_iter().filter(|&(d, ms)| ms > 0 && !(weekend_rest && weekday(d) >= 5)).collect();
    let active = counted.len();
    let current = current_min.clamp(AUTO_MIN, AUTO_MAX);
    if active < AUTO_MIN_ACTIVE_DAYS {
        return current;
    }
    let met = counted.iter().filter(|&&(d, ms)| ms >= plan.at(d)).count();
    if met * 5 >= active * 4 {
        (current + AUTO_STEP_MIN).min(AUTO_MAX)
    } else if met * 2 < active {
        current.saturating_sub(AUTO_STEP_MIN).max(AUTO_MIN)
    } else {
        current
    }
}

/// The Monday of the week `day` belongs to.
pub fn week_of(day: i64) -> i64 {
    week_start(day)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: u64 = 60_000;
    const MON: i64 = 4 + 7 * 100; // a Monday

    fn week(mins: [u64; 7]) -> Vec<(i64, u64)> {
        mins.iter().enumerate().map(|(i, m)| (MON + i as i64, m * MIN)).collect()
    }

    #[test]
    fn plan_judges_each_day_with_its_own_goal() {
        let p = GoalPlan::new(vec![(100, 10 * MIN), (200, 20 * MIN)]);
        assert_eq!((p.at(50), p.at(100), p.at(199), p.at(200), p.at(900)), (10 * MIN, 10 * MIN, 10 * MIN, 20 * MIN, 20 * MIN));
        assert_eq!(GoalPlan::flat(5 * MIN).at(-3), 5 * MIN);
        assert!(GoalPlan::flat(0).is_off() && !p.is_off());
        assert_eq!(GoalPlan::new(vec![(5, 1), (5, 2)]).entries(), [(5, 2)]);
    }

    #[test]
    fn rises_with_eighty_percent_met() {
        let p = GoalPlan::flat(10 * MIN);
        // 5 active days, 4 met = 80 %
        assert_eq!(next_auto_goal(&week([10, 12, 10, 3, 15, 0, 0]), &p, MON, false, 10), 15);
    }

    #[test]
    fn drops_under_half_met() {
        let p = GoalPlan::flat(10 * MIN);
        // 4 active, 1 met = 25 %
        assert_eq!(next_auto_goal(&week([10, 3, 2, 4, 0, 0, 0]), &p, MON, false, 15), 10);
    }

    #[test]
    fn unchanged_in_between() {
        let p = GoalPlan::flat(10 * MIN);
        // 4 active, 2 met = 50 %: neither rises nor drops; 3 of 4 = 75 % too
        assert_eq!(next_auto_goal(&week([10, 10, 2, 4, 0, 0, 0]), &p, MON, false, 10), 10);
        assert_eq!(next_auto_goal(&week([10, 10, 10, 4, 0, 0, 0]), &p, MON, false, 10), 10);
    }

    #[test]
    fn floor_five_and_cap_thirty() {
        let low = GoalPlan::flat(5 * MIN);
        assert_eq!(next_auto_goal(&week([1, 1, 1, 0, 0, 0, 0]), &low, MON, false, 5), 5);
        let high = GoalPlan::flat(30 * MIN);
        assert_eq!(next_auto_goal(&week([40, 40, 40, 40, 40, 40, 40]), &high, MON, false, 30), 30);
        assert_eq!(next_auto_goal(&week([40, 40, 40, 0, 0, 0, 0]), &GoalPlan::flat(25 * MIN), MON, false, 25), 30);
    }

    #[test]
    fn fewer_than_three_active_days_changes_nothing() {
        let p = GoalPlan::flat(10 * MIN);
        assert_eq!(next_auto_goal(&week([60, 60, 0, 0, 0, 0, 0]), &p, MON, false, 10), 10);
        assert_eq!(next_auto_goal(&week([1, 1, 0, 0, 0, 0, 0]), &p, MON, false, 10), 10);
    }

    #[test]
    fn weekend_rest_days_are_not_active_nor_misses() {
        let p = GoalPlan::flat(10 * MIN);
        // Mon-Wed met, Sat/Sun with a little typing: with rest they do not count (3 of 3 -> rise);
        // without rest they are 2 misses out of 5 (60 %: unchanged).
        let w = week([10, 10, 10, 0, 0, 2, 3]);
        assert_eq!(next_auto_goal(&w, &p, MON, true, 10), 15);
        assert_eq!(next_auto_goal(&w, &p, MON, false, 10), 10);
        // Weekend typing alone is not enough active days when resting.
        assert_eq!(next_auto_goal(&week([10, 10, 0, 0, 0, 20, 20]), &p, MON, true, 10), 10);
    }

    #[test]
    fn the_week_is_judged_with_its_own_goals() {
        // Goal went 10 -> 20 on Wednesday: 12 min counts on Monday but not on Thursday.
        let p = GoalPlan::new(vec![(0, 10 * MIN), (MON + 2, 20 * MIN)]);
        // Mon 12 met, Tue 12 met, Wed 12 miss, Thu 12 miss -> 50 %: unchanged
        assert_eq!(next_auto_goal(&week([12, 12, 12, 12, 0, 0, 0]), &p, MON, false, 20), 20);
    }
}
