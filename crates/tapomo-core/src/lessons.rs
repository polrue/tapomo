//! Typing lessons (0.4): stars and XP. The lesson text is ours, so here (and only here) knowing which
//! key was missed is fine; the page sends the counts, never anything typed elsewhere.

/// Accuracy (0–1) for two stars, and for three (with the target pace).
pub const TWO_STARS: f64 = 0.95;
pub const THREE_STARS: f64 = 0.98;

/// Stars for a finished lesson: 1 for finishing, 2 with 95 % accuracy, 3 with 98 % and the target pace.
/// A lesson is never failed: the worst result is one star and "repeat for more".
pub fn stars(accuracy: f64, wpm: f64, target_wpm: f64) -> u8 {
    if accuracy >= THREE_STARS && wpm >= target_wpm {
        3
    } else if accuracy >= TWO_STARS {
        2
    } else {
        1
    }
}

/// XP for a lesson: 10 for finishing it, plus 10 the first time it is done with 95 % accuracy.
pub const LESSON_XP: u32 = 10;
pub const FIRST_ACCURATE_XP: u32 = 10;
/// Lessons give XP at most this many times a day (repeating one lesson 50 times is not a habit).
pub const LESSON_XP_DAILY_CAP: u32 = 10;

pub fn lesson_xp(first_accurate: bool) -> u32 {
    LESSON_XP + if first_accurate { FIRST_ACCURATE_XP } else { 0 }
}

/// Target pace of a lesson: the unit's base, but never above 80 % of the user's own everyday average
/// (people who type slowly still get their three stars), and at least 5 wpm.
pub fn target_wpm(unit_base: f64, everyday_avg: Option<f64>) -> f64 {
    let cap = everyday_avg.filter(|a| *a > 0.0).map_or(unit_base, |a| a * 0.8);
    unit_base.min(cap).max(5.0).round()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn star_rules() {
        assert_eq!(stars(0.50, 80.0, 20.0), 1);
        assert_eq!(stars(0.95, 10.0, 20.0), 2);
        assert_eq!(stars(0.979, 30.0, 20.0), 2);
        assert_eq!(stars(0.98, 19.0, 20.0), 2);
        assert_eq!(stars(0.98, 20.0, 20.0), 3);
        assert_eq!(stars(1.0, 50.0, 20.0), 3);
    }

    #[test]
    fn xp() {
        assert_eq!(lesson_xp(false), 10);
        assert_eq!(lesson_xp(true), 20);
    }

    #[test]
    fn targets_respect_slow_typists() {
        assert_eq!(target_wpm(25.0, None), 25.0);
        assert_eq!(target_wpm(25.0, Some(60.0)), 25.0);
        assert_eq!(target_wpm(25.0, Some(20.0)), 16.0);
        assert_eq!(target_wpm(25.0, Some(3.0)), 5.0);
    }
}
