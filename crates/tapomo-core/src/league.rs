//! League with yourself ("Liga contigo mismo", 0.3.4). Each ISO week (Monday to Sunday) counts the
//! XP earned that week. You go up a league when a finished week beats the average of your previous
//! (up to) four weeks. You never go down: at worst you stay.

/// Bronce → Plata → Oro → Diamante → Mochi legendario.
pub const LEAGUES: [&str; 5] = ["bronze", "silver", "gold", "diamond", "legend"];

/// Weeks averaged to decide a promotion.
pub const WINDOW: usize = 4;

/// How a finished week went.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Went up to the league with this index.
    Up(usize),
    /// Stayed in the league with this index.
    Stay(usize),
}

#[derive(Debug, Clone, PartialEq)]
pub struct LeagueState {
    /// Index into [`LEAGUES`].
    pub league: usize,
    /// XP of the current (unfinished) week so far.
    pub week_xp: u64,
    /// XP the current week has to beat to go up (`None` at the top league or with no history yet).
    pub target: Option<u64>,
    /// Monday (day number) of the last finished week and how it went, if any week has finished.
    pub last: Option<(i64, Outcome, u64)>,
}

/// Replays every finished week since `first_week` (a Monday). `weekly` holds `(monday, xp)` pairs;
/// missing weeks count as 0 XP once the user has started. `this_week` is the Monday of the current week.
pub fn league_state(weekly: &[(i64, u64)], first_week: i64, this_week: i64) -> LeagueState {
    let xp_of = |w: i64| weekly.iter().filter(|(m, _)| *m == w).map(|(_, x)| x).sum::<u64>();
    let mut league = 0;
    let mut history: Vec<u64> = Vec::new();
    let mut last = None;
    let mut week = first_week;
    while week < this_week {
        let xp = xp_of(week);
        let outcome = match target(&history) {
            Some(t) if xp > t && league + 1 < LEAGUES.len() => {
                league += 1;
                Outcome::Up(league)
            }
            _ => Outcome::Stay(league),
        };
        last = Some((week, outcome, xp));
        history.push(xp);
        week += 7;
    }
    LeagueState {
        league,
        week_xp: xp_of(this_week),
        target: if league + 1 < LEAGUES.len() { target(&history) } else { None },
        last,
    }
}

/// Average of the last [`WINDOW`] weeks, rounded down; `None` before the first finished week.
fn target(history: &[u64]) -> Option<u64> {
    let recent = &history[history.len().saturating_sub(WINDOW)..];
    (!recent.is_empty()).then(|| recent.iter().sum::<u64>() / recent.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    const W0: i64 = 4 + 7 * 2_900; // some Monday

    #[test]
    fn the_first_week_never_promotes_and_sets_the_bar() {
        let s = league_state(&[(W0, 900)], W0, W0);
        assert_eq!((s.league, s.week_xp, s.target, s.last), (0, 900, None, None));
        let s = league_state(&[(W0, 900), (W0 + 7, 100)], W0, W0 + 7);
        assert_eq!((s.league, s.target, s.last), (0, Some(900), Some((W0, Outcome::Stay(0), 900))));
    }

    #[test]
    fn beating_the_average_goes_up_and_a_bad_week_only_stays() {
        let weekly = [(W0, 700), (W0 + 7, 800), (W0 + 14, 100), (W0 + 21, 900)];
        let s = league_state(&weekly, W0, W0 + 28);
        // 800 > 700 up; 100 stays; 900 > avg(700, 800, 100) = 533 up.
        assert_eq!(s.league, 2);
        assert_eq!(s.last, Some((W0 + 21, Outcome::Up(2), 900)));
        assert_eq!(s.target, Some((700 + 800 + 100 + 900) / 4));
    }

    #[test]
    fn missing_weeks_count_as_zero_and_the_window_slides() {
        // Two empty weeks after a busy one lower the bar: coming back is rewarded.
        let s = league_state(&[(W0, 1_000), (W0 + 21, 400)], W0, W0 + 28);
        assert_eq!(s.league, 1, "400 > avg(1000, 0, 0) = 333");
        let s = league_state(&[(W0, 1_000)], W0, W0 + 7 * 6);
        assert_eq!(s.target, Some(0));
    }

    #[test]
    fn the_top_league_is_kept() {
        let weekly: Vec<(i64, u64)> = (0..10).map(|k| (W0 + 7 * k, 100 * (k as u64 + 1))).collect();
        let s = league_state(&weekly, W0, W0 + 70);
        assert_eq!(s.league, LEAGUES.len() - 1);
        assert_eq!(s.target, None);
        assert_eq!(s.last.unwrap().1, Outcome::Stay(4));
    }
}
