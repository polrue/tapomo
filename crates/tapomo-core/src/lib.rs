//! Tapomo's measuring engine.
//!
//! It works on *key classes* and timestamps only: it never knows which letter
//! was pressed, so no text can ever be rebuilt from what it receives or stores.
//!
//! Typing is split into **bursts**: runs of keystrokes with no gap longer than
//! [`Config::pause_ms`]. Pauses between bursts (thinking time) do not count
//! towards speed, and bursts shorter than [`Config::min_chars`] ("ok", a search,
//! a file rename) are discarded so they don't pollute the stats.

/// What kind of key was pressed. The keyboard hook maps every key to one of these.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyClass {
    /// A key that produces a printable character (letters, digits, punctuation).
    Char,
    Space,
    Enter,
    Backspace,
    /// Ctrl+Backspace: deletes a whole word.
    WordDelete,
    /// Navigation, modifiers, shortcuts, function keys… Ignored entirely.
    Ignored,
}

impl KeyClass {
    fn is_typed(self) -> bool {
        matches!(self, KeyClass::Char | KeyClass::Space | KeyClass::Enter)
    }

    fn is_correction(self) -> bool {
        matches!(self, KeyClass::Backspace | KeyClass::WordDelete)
    }
}

/// One keystroke as seen by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    /// Milliseconds since the Unix epoch.
    pub t_ms: u64,
    pub class: KeyClass,
    /// Caller-interned id of the foreground application. Switching apps closes the burst.
    pub app_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Config {
    /// Silence that closes a burst. Default 2 s, user-adjustable 1–5 s.
    pub pause_ms: u64,
    /// Bursts with fewer typed characters are discarded. Default 15.
    pub min_chars: u32,
    /// Length of the window used for the peak speed. Default 10 s.
    pub peak_window_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self { pause_ms: 2_000, min_chars: 15, peak_window_ms: 10_000 }
    }
}

impl Config {
    pub const PAUSE_MIN_MS: u64 = 1_000;
    pub const PAUSE_MAX_MS: u64 = 5_000;

    /// Sets the pause, clamped to the allowed 1–5 s range.
    pub fn with_pause_ms(mut self, ms: u64) -> Self {
        self.pause_ms = ms.clamp(Self::PAUSE_MIN_MS, Self::PAUSE_MAX_MS);
        self
    }
}

/// A finished burst that passed the minimum-length filter.
#[derive(Debug, Clone, PartialEq)]
pub struct Burst {
    pub app_id: u32,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Characters typed (letters, spaces, enters), including ones later deleted.
    pub chars: u32,
    pub backspaces: u32,
    pub word_deletes: u32,
    /// Best speed held over [`Config::peak_window_ms`], if the burst lasted that long.
    pub peak_wpm: Option<f64>,
    /// Longest run of characters without a correction reached during this burst.
    /// Runs carry over between bursts, so this can exceed `chars`.
    pub best_streak: u32,
}

impl Burst {
    pub fn duration_ms(&self) -> u64 {
        self.end_ms - self.start_ms
    }

    /// Words per minute, with the standard 5 characters per word.
    pub fn gross_wpm(&self) -> f64 {
        wpm(self.chars, self.duration_ms())
    }

    /// Like [`Self::gross_wpm`] but each Backspace takes back one character.
    /// Word deletions are not subtracted: we don't know how many letters they removed.
    pub fn net_wpm(&self) -> f64 {
        wpm(self.chars.saturating_sub(self.backspaces), self.duration_ms())
    }
}

/// `chars` keystrokes spread over `duration_ms` (first to last key) span `chars - 1`
/// intervals, so the rate uses `chars - 1` to avoid inflating short bursts.
fn wpm(chars: u32, duration_ms: u64) -> f64 {
    if chars < 2 || duration_ms == 0 {
        return 0.0;
    }
    let minutes = duration_ms as f64 / 60_000.0;
    ((chars - 1) as f64 / 5.0) / minutes
}

/// Streaming engine: feed it keystrokes in time order, collect finished bursts.
#[derive(Debug)]
pub struct Engine {
    config: Config,
    current: Option<Open>,
    streak: u32,
    best_streak_ever: u32,
}

#[derive(Debug)]
struct Open {
    app_id: u32,
    last_ms: u64,
    typed_times: Vec<u64>,
    backspaces: u32,
    word_deletes: u32,
    best_streak: u32,
}

impl Engine {
    pub fn new(config: Config) -> Self {
        Self { config, current: None, streak: 0, best_streak_ever: 0 }
    }

    pub fn config(&self) -> Config {
        self.config
    }

    /// Takes effect from the next burst on.
    pub fn set_config(&mut self, config: Config) {
        self.config = config;
    }

    /// Current run of characters since the last correction.
    pub fn current_streak(&self) -> u32 {
        self.streak
    }

    pub fn best_streak_ever(&self) -> u32 {
        self.best_streak_ever
    }

    /// Restores the all-time record (e.g. loaded from the database at startup).
    pub fn set_best_streak_ever(&mut self, best: u32) {
        self.best_streak_ever = self.best_streak_ever.max(best);
    }

    /// Speed right now, for the live bar: characters typed in the last
    /// [`Config::peak_window_ms`] of the open burst. The time base runs up to `now_ms`,
    /// so the value eases down while you pause instead of freezing. `None` when no
    /// burst is open or it is younger than [`LIVE_MIN_MS`] (too noisy to show).
    pub fn live_wpm(&self, now_ms: u64) -> Option<f64> {
        let open = self.current.as_ref()?;
        let first = *open.typed_times.first()?;
        if now_ms.saturating_sub(open.last_ms) > self.config.pause_ms {
            return None;
        }
        let elapsed = now_ms.saturating_sub(first);
        if elapsed < LIVE_MIN_MS {
            return None;
        }
        let window = elapsed.min(self.config.peak_window_ms);
        let since = now_ms - window;
        let keys = open.typed_times.iter().rev().take_while(|&&t| t >= since).count();
        let minutes = window as f64 / 60_000.0;
        Some((keys as f64 / 5.0) / minutes)
    }

    /// Duration of the open burst (first to last typed key), or 0 when none is open or it is
    /// still too short to be stored. This is what the burst will add to the day's active time.
    pub fn open_burst_ms(&self) -> u64 {
        let Some(open) = &self.current else { return 0 };
        match (open.typed_times.first(), open.typed_times.last()) {
            (Some(first), Some(last)) if open.typed_times.len() as u32 >= self.config.min_chars => last - first,
            _ => 0,
        }
    }

    /// Processes one keystroke. Returns a burst if this keystroke closed one.
    pub fn push(&mut self, ev: KeyEvent) -> Option<Burst> {
        if ev.class == KeyClass::Ignored {
            return None;
        }

        let closed = match &self.current {
            Some(open)
                if ev.app_id != open.app_id
                    || ev.t_ms.saturating_sub(open.last_ms) > self.config.pause_ms =>
            {
                self.close()
            }
            _ => None,
        };

        if ev.class.is_typed() {
            self.streak += 1;
            self.best_streak_ever = self.best_streak_ever.max(self.streak);
        } else if ev.class.is_correction() {
            self.streak = 0;
        }

        let open = self.current.get_or_insert_with(|| Open {
            app_id: ev.app_id,
            last_ms: ev.t_ms,
            typed_times: Vec::new(),
            backspaces: 0,
            word_deletes: 0,
            best_streak: 0,
        });
        open.last_ms = ev.t_ms;
        match ev.class {
            KeyClass::Backspace => open.backspaces += 1,
            KeyClass::WordDelete => open.word_deletes += 1,
            _ => open.typed_times.push(ev.t_ms),
        }
        open.best_streak = open.best_streak.max(self.streak);

        closed
    }

    /// Closes the open burst if the pause has elapsed by `now_ms`.
    /// Call it from a timer so a burst doesn't wait for the next keystroke to finish.
    pub fn tick(&mut self, now_ms: u64) -> Option<Burst> {
        match &self.current {
            Some(open) if now_ms.saturating_sub(open.last_ms) > self.config.pause_ms => self.close(),
            _ => None,
        }
    }

    /// Closes the open burst unconditionally (app exit, pause button, sleep).
    pub fn flush(&mut self) -> Option<Burst> {
        self.close()
    }

    fn close(&mut self) -> Option<Burst> {
        let open = self.current.take()?;
        let chars = open.typed_times.len() as u32;
        if chars < self.config.min_chars {
            return None;
        }
        // A burst can't start or end on a correction we'd measure: time runs
        // from the first to the last *typed* key.
        let start_ms = *open.typed_times.first()?;
        let end_ms = *open.typed_times.last()?;
        Some(Burst {
            app_id: open.app_id,
            start_ms,
            end_ms,
            chars,
            backspaces: open.backspaces,
            word_deletes: open.word_deletes,
            peak_wpm: peak_wpm(&open.typed_times, self.config.peak_window_ms),
            best_streak: open.best_streak,
        })
    }
}

/// Minimum age of a burst before [`Engine::live_wpm`] reports anything.
pub const LIVE_MIN_MS: u64 = 2_000;

/// Peaks needed before the personal reference is trusted ("calibrating" until then).
pub const REFERENCE_MIN_PEAKS: usize = 20;

/// The user's own 100 % for the live bar: the 90th percentile of their 10 s peaks
/// (the caller passes the last 30 days). A good habitual pace, not the all-time
/// record, so typing well lands high on the bar while beating it stays possible.
/// `None` while calibrating.
pub fn personal_reference(peaks: &[f64]) -> Option<f64> {
    if peaks.len() < REFERENCE_MIN_PEAKS {
        return None;
    }
    let mut sorted: Vec<f64> = peaks.iter().copied().filter(|p| p.is_finite()).collect();
    sorted.sort_by(f64::total_cmp);
    // Nearest-rank percentile.
    let rank = ((0.9 * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len());
    Some(sorted[rank - 1])
}

/// Bar zones, by percentage of the personal reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    /// Below 60 %.
    WarmingUp,
    /// 60–85 %.
    Good,
    /// 85–100 %.
    OnFire,
    /// Above 100 %: beating your own pace.
    BeatingYourself,
}

impl Zone {
    pub fn of(percent: f64) -> Self {
        match percent {
            p if p > 100.0 => Zone::BeatingYourself,
            p if p >= 85.0 => Zone::OnFire,
            p if p >= 60.0 => Zone::Good,
            _ => Zone::WarmingUp,
        }
    }
}

/// Daily goal and day streak. Days are whole local days counted from 1970-01-01 (day 0,
/// a Thursday), so the maths needs no calendar and no time zone: the caller maps dates to
/// these numbers. Weeks are ISO weeks (Monday to Sunday).
pub fn weekday(day: i64) -> u8 {
    (day + 3).rem_euclid(7) as u8 // 0 = Monday … 6 = Sunday
}

/// The Monday of the week `day` belongs to; it identifies the week.
fn week_start(day: i64) -> i64 {
    day - i64::from(weekday(day))
}

/// Where the daily goal stands, as computed by [`goal_status`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GoalStatus {
    pub today_ms: u64,
    pub met_today: bool,
    /// Consecutive days with the goal met, today included once it is met.
    pub streak_days: u32,
    /// The weekly "comodín" (one free miss per ISO week) has already been spent this week.
    pub freeze_used_this_week: bool,
    /// The last scheduled day before today was a miss that the comodín covered.
    pub freeze_saved_streak_recently: bool,
}

/// Progress of the daily goal from `(day, active_ms)` pairs (one per day; repeats add up).
///
/// The streak is replayed forward from the first day the goal was met: a met day adds one;
/// a missed day is covered by the week's comodín if it is still unspent (the streak neither
/// grows nor breaks), otherwise the streak restarts. With `weekend_rest`, Saturdays and
/// Sundays only count when met and are never misses. Today never breaks anything: while it
/// is unmet it is simply still in progress. `goal_ms == 0` means the goal is off.
pub fn goal_status(days: &[(i64, u64)], today: i64, goal_ms: u64, weekend_rest: bool) -> GoalStatus {
    let mut by_day: std::collections::HashMap<i64, u64> = std::collections::HashMap::new();
    for &(d, ms) in days.iter().filter(|(d, _)| *d <= today) {
        *by_day.entry(d).or_insert(0) += ms;
    }
    let today_ms = by_day.get(&today).copied().unwrap_or(0);
    if goal_ms == 0 {
        return GoalStatus { today_ms, ..GoalStatus::default() };
    }
    let met = |d: i64| by_day.get(&d).is_some_and(|&ms| ms >= goal_ms);

    let mut streak = 0u32;
    let mut spent: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let mut last_covered = false;
    if let Some(first) = by_day.keys().copied().filter(|&d| d < today && met(d)).min() {
        for d in first..today {
            if met(d) {
                streak += 1;
                last_covered = false;
            } else if weekend_rest && weekday(d) >= 5 {
                continue;
            } else if spent.insert(week_start(d)) {
                last_covered = true;
            } else {
                streak = 0;
                last_covered = false;
            }
        }
    }
    let met_today = met(today);
    if met_today {
        streak += 1;
    }
    GoalStatus {
        today_ms,
        met_today,
        streak_days: streak,
        freeze_used_this_week: spent.contains(&week_start(today)),
        freeze_saved_streak_recently: last_covered && streak > 0,
    }
}

/// Best speed over any stretch lasting at least `window_ms`.
/// For each key, the window ends there and starts at the latest key that is
/// still `window_ms` or more earlier, so every measured window is long enough.
fn peak_wpm(times: &[u64], window_ms: u64) -> Option<f64> {
    let mut best: Option<f64> = None;
    let mut start = 0;
    for end in 0..times.len() {
        while start + 1 < end && times[end] - times[start + 1] >= window_ms {
            start += 1;
        }
        let span = times[end] - times[start];
        if span >= window_ms && span > 0 {
            let keys = (end - start + 1) as u32;
            let rate = wpm(keys, span);
            best = Some(best.map_or(rate, |b: f64| b.max(rate)));
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    const APP: u32 = 1;

    fn ev(t_ms: u64, class: KeyClass) -> KeyEvent {
        KeyEvent { t_ms, class, app_id: APP }
    }

    /// Types `n` characters starting at `t0`, one every `gap_ms`. Returns the next free time.
    fn type_chars(e: &mut Engine, out: &mut Vec<Burst>, t0: u64, n: u32, gap_ms: u64) -> u64 {
        let mut t = t0;
        for _ in 0..n {
            out.extend(e.push(ev(t, KeyClass::Char)));
            t += gap_ms;
        }
        t
    }

    #[test]
    fn steady_typing_gives_expected_wpm() {
        // 100 ms per key = 10 keys/s = 600 keys/min = 120 WPM.
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 0, 50, 100);
        out.extend(e.flush());
        assert_eq!(out.len(), 1);
        assert!((out[0].gross_wpm() - 120.0).abs() < 1e-9);
    }

    #[test]
    fn short_bursts_are_discarded() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 0, 14, 100);
        out.extend(e.flush());
        assert!(out.is_empty());
    }

    #[test]
    fn pause_longer_than_threshold_splits_bursts() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        let t = type_chars(&mut e, &mut out, 0, 20, 100);
        // last key at t-100; next key 2.1 s later closes the first burst.
        type_chars(&mut e, &mut out, t - 100 + 2_100, 20, 100);
        out.extend(e.flush());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].chars, 20);
        assert_eq!(out[1].chars, 20);
    }

    #[test]
    fn pause_at_threshold_keeps_burst_together() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        let t = type_chars(&mut e, &mut out, 0, 10, 100);
        type_chars(&mut e, &mut out, t - 100 + 2_000, 10, 100);
        out.extend(e.flush());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].chars, 20);
    }

    #[test]
    fn tick_closes_burst_after_pause() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 0, 20, 100);
        assert!(e.tick(1_900 + 2_000).is_none());
        assert!(e.tick(1_900 + 2_001).is_some());
    }

    #[test]
    fn switching_app_closes_burst() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        let t = type_chars(&mut e, &mut out, 0, 20, 100);
        out.extend(e.push(KeyEvent { t_ms: t, class: KeyClass::Char, app_id: 2 }));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].app_id, APP);
    }

    #[test]
    fn ignored_keys_neither_count_nor_extend() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 0, 20, 100);
        // Arrow keys during the pause must not keep the burst alive.
        e.push(ev(3_000, KeyClass::Ignored));
        assert!(e.tick(1_900 + 2_001).is_some());
    }

    #[test]
    fn backspace_resets_streak_and_lowers_net_wpm() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        let t = type_chars(&mut e, &mut out, 0, 30, 100);
        e.push(ev(t, KeyClass::Backspace));
        assert_eq!(e.current_streak(), 0);
        type_chars(&mut e, &mut out, t + 100, 10, 100);
        out.extend(e.flush());
        let b = &out[0];
        assert_eq!(b.backspaces, 1);
        assert_eq!(b.best_streak, 30);
        assert!(b.net_wpm() < b.gross_wpm());
        assert_eq!(e.best_streak_ever(), 30);
    }

    #[test]
    fn streak_survives_pauses_between_bursts() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        let t = type_chars(&mut e, &mut out, 0, 20, 100);
        type_chars(&mut e, &mut out, t + 10_000, 20, 100);
        out.extend(e.flush());
        assert_eq!(out[1].best_streak, 40);
    }

    #[test]
    fn peak_needs_a_full_window() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        // 50 keys at 100 ms = 4.9 s: shorter than the 10 s window.
        type_chars(&mut e, &mut out, 0, 50, 100);
        out.extend(e.flush());
        assert_eq!(out[0].peak_wpm, None);
    }

    #[test]
    fn peak_finds_the_fast_stretch() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        // 15 s slow (200 ms/key = 60 WPM), then 15 s fast (100 ms/key = 120 WPM).
        let t = type_chars(&mut e, &mut out, 0, 75, 200);
        type_chars(&mut e, &mut out, t, 150, 100);
        out.extend(e.flush());
        let peak = out[0].peak_wpm.unwrap();
        assert!((peak - 120.0).abs() < 1.0, "peak was {peak}");
        assert!(out[0].gross_wpm() < peak);
    }

    #[test]
    fn live_wpm_tracks_current_pace_and_eases_down() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        assert_eq!(e.live_wpm(0), None);
        // 150 keys at 100 ms = 120 WPM over 15 s.
        let t = type_chars(&mut e, &mut out, 0, 150, 100);
        let now = t - 100;
        let live = e.live_wpm(now).unwrap();
        assert!((live - 120.0).abs() < 2.0, "live was {live}");
        // One second of silence lowers it, past the pause it disappears.
        assert!(e.live_wpm(now + 1_000).unwrap() < live);
        assert_eq!(e.live_wpm(now + 2_001), None);
    }

    #[test]
    fn live_wpm_waits_for_a_few_seconds_of_typing() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 0, 10, 100);
        assert_eq!(e.live_wpm(900), None);
    }

    #[test]
    fn reference_is_p90_after_calibration() {
        assert_eq!(personal_reference(&[60.0; 19]), None);
        let peaks: Vec<f64> = (1..=20).map(|i| i as f64 * 5.0).collect();
        // 90th percentile of 5..=100 by nearest rank is the 18th value.
        assert_eq!(personal_reference(&peaks), Some(90.0));
    }

    #[test]
    fn zones_follow_percent() {
        assert_eq!(Zone::of(30.0), Zone::WarmingUp);
        assert_eq!(Zone::of(60.0), Zone::Good);
        assert_eq!(Zone::of(90.0), Zone::OnFire);
        assert_eq!(Zone::of(100.0), Zone::OnFire);
        assert_eq!(Zone::of(100.1), Zone::BeatingYourself);
    }

    #[test]
    fn pause_setting_is_clamped() {
        assert_eq!(Config::default().with_pause_ms(200).pause_ms, 1_000);
        assert_eq!(Config::default().with_pause_ms(9_000).pause_ms, 5_000);
    }

    // ---- daily goal
    const MIN: u64 = 60_000;
    /// A Monday (day 4 is 1970-01-05).
    const MON: i64 = 4 + 7 * 100;

    fn met(d: i64) -> (i64, u64) {
        (d, 20 * MIN)
    }

    #[test]
    fn goal_weekday_is_monday_based() {
        assert_eq!(weekday(MON), 0);
        assert_eq!(weekday(MON + 6), 6);
        assert_eq!(weekday(0), 3); // 1970-01-01 was a Thursday
        assert_eq!(weekday(-1), 2);
    }

    #[test]
    fn goal_empty_and_off() {
        assert_eq!(goal_status(&[], MON, 20 * MIN, false), GoalStatus::default());
        let off = goal_status(&[met(MON - 1), met(MON)], MON, 0, false);
        assert_eq!((off.streak_days, off.met_today), (0, false));
        assert_eq!(off.today_ms, 20 * MIN);
    }

    #[test]
    fn goal_today_in_progress_does_not_break_the_streak() {
        let s = goal_status(&[met(MON - 2), met(MON - 1), (MON, 5 * MIN)], MON, 20 * MIN, false);
        assert_eq!((s.streak_days, s.met_today, s.today_ms), (2, false, 5 * MIN));
        let s = goal_status(&[met(MON - 2), met(MON - 1), met(MON)], MON, 20 * MIN, false);
        assert_eq!((s.streak_days, s.met_today), (3, true));
    }

    #[test]
    fn goal_one_miss_is_covered() {
        // Mon met, Tue missed, Wed met; today Thursday in progress.
        let s = goal_status(&[met(MON), met(MON + 2)], MON + 3, 20 * MIN, false);
        assert_eq!(s.streak_days, 2);
        assert!(s.freeze_used_this_week && !s.freeze_saved_streak_recently);
        // Same, but yesterday was the miss: the comodín just saved the streak.
        let s = goal_status(&[met(MON)], MON + 2, 20 * MIN, false);
        assert_eq!(s.streak_days, 1);
        assert!(s.freeze_saved_streak_recently);
    }

    #[test]
    fn goal_two_misses_in_one_week_break() {
        // Mon met, Tue covered, Wed met, Thu missed (breaks), Fri met; today Saturday in progress.
        let s = goal_status(&[met(MON), met(MON + 2), met(MON + 4)], MON + 5, 20 * MIN, false);
        assert_eq!(s.streak_days, 1);
        assert!(!s.freeze_saved_streak_recently);
    }

    #[test]
    fn goal_new_week_gives_a_new_comodin() {
        // Fri, Sat met; Sun missed (covered, previous week); Mon met; Tue missed (covered, new week); Wed met.
        let days = [met(MON - 3), met(MON - 2), met(MON), met(MON + 2)];
        let s = goal_status(&days, MON + 3, 20 * MIN, false);
        assert_eq!(s.streak_days, 4);
        assert!(s.freeze_used_this_week);
        // The Sunday miss belongs to the previous ISO week, so it does not use this week's comodín.
        let s = goal_status(&[met(MON - 2), met(MON)], MON + 1, 20 * MIN, false);
        assert_eq!(s.streak_days, 2);
        assert!(!s.freeze_used_this_week);
    }

    #[test]
    fn goal_weekend_rest_skips_saturday_and_sunday() {
        // Fri met, weekend untouched, Mon met; today Tuesday in progress.
        let days = [met(MON - 3), met(MON)];
        assert_eq!(goal_status(&days, MON + 1, 20 * MIN, true).streak_days, 2);
        // Without the rest option Sat is covered and Sun breaks the streak.
        assert_eq!(goal_status(&days, MON + 1, 20 * MIN, false).streak_days, 1);
        // A weekend day that is met still counts.
        assert_eq!(goal_status(&[met(MON - 3), met(MON - 2), met(MON)], MON + 1, 20 * MIN, true).streak_days, 3);
    }

    #[test]
    fn goal_misses_after_a_long_gap_and_future_days_are_ignored() {
        let s = goal_status(&[met(MON - 30), met(MON - 29)], MON, 20 * MIN, false);
        assert_eq!(s.streak_days, 0);
        let s = goal_status(&[met(MON), met(MON + 1)], MON, 20 * MIN, false);
        assert_eq!(s.streak_days, 1);
        // Pieces of the same day add up.
        let s = goal_status(&[(MON, 12 * MIN), (MON, 9 * MIN)], MON, 20 * MIN, false);
        assert!(s.met_today);
    }

    #[test]
    fn open_burst_counts_only_once_it_is_long_enough() {
        let mut e = Engine::new(Config::default());
        let mut out = Vec::new();
        type_chars(&mut e, &mut out, 1_000, 10, 100);
        assert_eq!(e.open_burst_ms(), 0);
        type_chars(&mut e, &mut out, 2_000, 10, 100);
        assert_eq!(e.open_burst_ms(), 2_000 + 9 * 100 - 1_000);
    }
}
