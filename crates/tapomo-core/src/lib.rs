//! Tapomo's measuring engine.
//!
//! It works on *key classes* and timestamps only: it never knows which letter
//! was pressed, so no text can ever be rebuilt from what it receives or stores.
//!
//! Typing is split into **bursts**: runs of keystrokes with no gap longer than
//! [`Config::pause_ms`]. Pauses between bursts (thinking time) do not count
//! towards speed, and bursts shorter than [`Config::min_chars`] ("ok", a search,
//! a file rename) are discarded so they don't pollute the stats.

pub mod badges;
pub mod league;
pub mod lessons;
pub mod shortcuts;
pub mod xp;

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
    fn is_correction(self) -> bool {
        matches!(self, KeyClass::Backspace | KeyClass::WordDelete)
    }
}

/// What the keyboard hook can say about a key compared with the previous ones, without ever saying which
/// key it was: the comparison happens inside the hook and only these two yes/no answers leave it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Repeat {
    /// Same key as the previous one ("aaaa").
    pub same_as_prev: bool,
    /// Same key as two keys back ("asasas").
    pub same_as_prev2: bool,
}

/// One keystroke as seen by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    /// Milliseconds since the Unix epoch.
    pub t_ms: u64,
    pub class: KeyClass,
    /// Caller-interned id of the foreground application. Switching apps closes the burst.
    pub app_id: u32,
    pub repeat: Repeat,
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
    /// Looks like keyboard mashing ("dasjkdlas…", "aaaaaa", "asasas", impossible speed): see
    /// [`MASH_SHARE`]. Callers drop these bursts so they never count as typing.
    pub mash: bool,
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
    /// Per typed key: part of a mashing pattern (parallel to `typed_times`).
    suspicious: Vec<bool>,
    no_space_run: u32,
    same_run: u32,
    alt_run: u32,
}

/// Mashing patterns: a run of letters this long without a space or Enter…
pub const MASH_NO_SPACE_RUN: u32 = 40;
/// …the same key pressed this many times in a row…
pub const MASH_SAME_RUN: u32 = 8;
/// …two keys alternating for this many keys…
pub const MASH_ALT_RUN: u32 = 20; // "jajajaja" laughs stay well below
/// …or a sustained speed no human types at.
pub const MASH_WPM: f64 = 250.0;
/// A burst is mashing when more than this share of its characters belongs to such patterns.
pub const MASH_SHARE: f64 = 0.5;

impl Open {
    /// Marks the last `n` keys as suspicious (a pattern just reached its threshold). Returns how many of
    /// them were not flagged yet.
    fn flag_last(&mut self, n: u32) -> u32 {
        let len = self.suspicious.len();
        let mut newly = 0;
        for f in &mut self.suspicious[len.saturating_sub(n as usize)..] {
            newly += u32::from(!*f);
            *f = true;
        }
        newly
    }

    /// Records a typed key and updates the patterns. Returns how many keys became suspicious just now.
    fn note_typed(&mut self, class: KeyClass, repeat: Repeat) -> u32 {
        self.suspicious.push(false);
        if class != KeyClass::Char {
            // Spaces and Enter break every pattern: real words are short.
            self.no_space_run = 0;
            self.same_run = 0;
            self.alt_run = 0;
            return 0;
        }
        let mut newly = 0;
        self.no_space_run += 1;
        self.same_run = if repeat.same_as_prev { self.same_run + 1 } else { 1 };
        self.alt_run = if repeat.same_as_prev2 && !repeat.same_as_prev { self.alt_run.max(2) + 1 } else { 0 };
        if self.no_space_run >= MASH_NO_SPACE_RUN {
            newly += self.flag_last(if self.no_space_run == MASH_NO_SPACE_RUN { MASH_NO_SPACE_RUN } else { 1 });
        }
        if self.same_run >= MASH_SAME_RUN {
            newly += self.flag_last(if self.same_run == MASH_SAME_RUN { MASH_SAME_RUN } else { 1 });
        }
        if self.alt_run >= MASH_ALT_RUN {
            newly += self.flag_last(if self.alt_run == MASH_ALT_RUN { MASH_ALT_RUN } else { 1 });
        }
        newly
    }

    /// Keys of runs that could still turn out to be mashing (not yet at their threshold). They only
    /// count towards the run without deleting once the word ends, so a record can never be inflated.
    fn pending(&self) -> u32 {
        let below = |run: u32, at: u32| if run < at { run } else { 0 };
        below(self.no_space_run, MASH_NO_SPACE_RUN).max(below(self.same_run, MASH_SAME_RUN)).max(below(self.alt_run, MASH_ALT_RUN))
    }

    fn looks_mashed(&self) -> bool {
        let n = self.suspicious.len();
        n > 0 && self.suspicious.iter().filter(|&&f| f).count() as f64 > n as f64 * MASH_SHARE
    }
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

    /// Current run of characters since the last correction, counting only confirmed keys (see
    /// `Open::pending`): it catches up at the end of each word.
    pub fn current_streak(&self) -> u32 {
        self.confirmed_streak()
    }

    fn confirmed_streak(&self) -> u32 {
        self.streak.saturating_sub(self.current.as_ref().map_or(0, Open::pending))
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
        if open.typed_times.len() >= 20 && open.looks_mashed() {
            return None; // mashing never fills the live bar (or triggers Supermochi)
        }
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
        let mut keys = open.typed_times.iter().rev().take_while(|&&t| t >= since).count();
        // While the window still starts at the first key, count the gaps between keys, not the keys:
        // n keys span n − 1 gaps, and the extra one inflated the first seconds by ~10 %.
        if window == elapsed {
            keys = keys.saturating_sub(1);
        }
        let minutes = window as f64 / 60_000.0;
        Some((keys as f64 / 5.0) / minutes)
    }

    /// The open burst has lasted a full peak window, so its live speed is steady enough for Supermochi.
    /// Before that a fast first word could trigger it (and Supermochi holds for half a minute).
    pub fn live_settled(&self, now_ms: u64) -> bool {
        self.current
            .as_ref()
            .and_then(|o| o.typed_times.first())
            .is_some_and(|&first| now_ms.saturating_sub(first) >= self.config.peak_window_ms)
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

        if ev.class.is_correction() {
            self.streak = 0;
        }

        let open = self.current.get_or_insert_with(|| Open {
            app_id: ev.app_id,
            last_ms: ev.t_ms,
            typed_times: Vec::new(),
            backspaces: 0,
            word_deletes: 0,
            best_streak: 0,
            suspicious: Vec::new(),
            no_space_run: 0,
            same_run: 0,
            alt_run: 0,
        });
        open.last_ms = ev.t_ms;
        match ev.class {
            KeyClass::Backspace => open.backspaces += 1,
            KeyClass::WordDelete => open.word_deletes += 1,
            _ => {
                open.typed_times.push(ev.t_ms);
                // Mashed keys never grow the run without deleting; when a pattern is recognised, the keys
                // it already counted are taken back too.
                let newly = open.note_typed(ev.class, ev.repeat);
                self.streak = (self.streak + 1).saturating_sub(newly);
            }
        }
        let confirmed = self.streak.saturating_sub(open.pending());
        open.best_streak = open.best_streak.max(confirmed);
        self.best_streak_ever = self.best_streak_ever.max(confirmed);

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
        let mash = open.looks_mashed() || (wpm(chars, end_ms - start_ms) > MASH_WPM && end_ms - start_ms >= 3_000);
        // The last word is over: its keys count now, unless the burst was mashing.
        let mut best_streak = open.best_streak;
        if mash {
            self.streak = self.streak.saturating_sub(open.pending()); // the unconfirmed tail was mashing too
        } else {
            best_streak = best_streak.max(self.streak);
            self.best_streak_ever = self.best_streak_ever.max(self.streak);
        }
        Some(Burst {
            app_id: open.app_id,
            start_ms,
            end_ms,
            chars,
            backspaces: open.backspaces,
            word_deletes: open.word_deletes,
            peak_wpm: peak_wpm(&open.typed_times, self.config.peak_window_ms),
            best_streak,
            mash,
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

/// Bar zones, by percentage of the personal reference. Each zone starts at its lower bound
/// (inclusive). The UI mirrors these thresholds in `zoneOfPct` (ui/app.js, ui/pet.js).
///
/// The floating pet keeps Supermochi for at least 35 s once entered and ignores backspaces
/// meanwhile; that hold is only the pet's reaction and lives in ui/pet.js, not here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    /// Below 40 %.
    WarmingUp,
    /// 40–60 %: finding your rhythm.
    Rhythm,
    /// 60–80 %.
    Good,
    /// 80–95 %: on a roll.
    OnFire,
    /// 95–108 %: beating your own pace.
    BeatingYourself,
    /// 108 % and above: Supermochi mode.
    Supermochi,
}

impl Zone {
    pub fn of(percent: f64) -> Self {
        match percent {
            p if p >= 108.0 => Zone::Supermochi,
            p if p >= 95.0 => Zone::BeatingYourself,
            p if p >= 80.0 => Zone::OnFire,
            p if p >= 60.0 => Zone::Good,
            p if p >= 40.0 => Zone::Rhythm,
            _ => Zone::WarmingUp,
        }
    }

    /// Stable id sent to the UI (`zone.<id>` locale keys, `data-zone` styles).
    pub fn id(self) -> &'static str {
        match self {
            Zone::WarmingUp => "warming",
            Zone::Rhythm => "rhythm",
            Zone::Good => "good",
            Zone::OnFire => "fire",
            Zone::BeatingYourself => "beating",
            Zone::Supermochi => "super",
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
    /// The last scheduled day before today was a miss that the comodín or a protector covered.
    pub freeze_saved_streak_recently: bool,
    /// Streak protectors in the bank (0..=[`MAX_PROTECTORS`]); 0 while the protectors are not on.
    pub protectors: u8,
}

/// Most streak protectors one can hold.
pub const MAX_PROTECTORS: u8 = 2;

/// Progress of the daily goal from `(day, active_ms)` pairs (one per day; repeats add up).
///
/// The streak is replayed forward from the first day the goal was met: a met day adds one;
/// a missed day is covered if there is cover left (the streak neither grows nor breaks),
/// otherwise the streak restarts. With `weekend_rest`, Saturdays and Sundays only count when
/// met and are never misses. Today never breaks anything: while it is unmet it is simply still
/// in progress. `goal_ms == 0` means the goal is off.
///
/// Cover: before `protectors_since` (and always when it is `None`) it is the weekly comodín, one
/// free miss per ISO week that does not carry over. From `protectors_since` on it is the streak
/// protectors: one in the bank on that day, one more for every full week (Monday to Sunday)
/// with the streak alive and no protector spent, never more than [`MAX_PROTECTORS`]. Past
/// streaks keep the rule they were made under.
pub fn goal_status(days: &[(i64, u64)], today: i64, goal_ms: u64, weekend_rest: bool, protectors_since: Option<i64>) -> GoalStatus {
    let mut by_day: std::collections::HashMap<i64, u64> = std::collections::HashMap::new();
    for &(d, ms) in days.iter().filter(|(d, _)| *d <= today) {
        *by_day.entry(d).or_insert(0) += ms;
    }
    let today_ms = by_day.get(&today).copied().unwrap_or(0);
    if goal_ms == 0 {
        return GoalStatus { today_ms, ..GoalStatus::default() };
    }
    let met = |d: i64| by_day.get(&d).is_some_and(|&ms| ms >= goal_ms);
    let since = protectors_since.unwrap_or(i64::MAX);

    let mut streak = 0u32;
    let mut spent: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let mut last_covered = false;
    let mut bank = 0u8;
    // This week can still earn a protector: it started on its Monday with the protectors on and
    // nothing broke or was spent since.
    let mut week_ok = false;
    let first = by_day.keys().copied().filter(|&d| d < today && met(d)).min();
    if let Some(first) = first {
        if first >= since {
            bank = 1;
        }
        for d in first..today {
            if d == since {
                bank = 1;
            }
            if d >= since && weekday(d) == 0 {
                week_ok = true;
            }
            if met(d) {
                streak += 1;
                last_covered = false;
            } else if weekend_rest && weekday(d) >= 5 {
                // a rest day: neither a miss nor a met day
            } else if d < since && spent.insert(week_start(d)) {
                last_covered = true;
            } else if d >= since && bank > 0 {
                bank -= 1;
                last_covered = true;
                week_ok = false;
            } else {
                streak = 0;
                last_covered = false;
                week_ok = false;
            }
            if weekday(d) == 6 && week_ok && streak > 0 {
                bank = (bank + 1).min(MAX_PROTECTORS);
            }
        }
    }
    // With no met day yet, or protectors that start today, the first one is simply waiting.
    if (first.is_none() && since <= today) || since == today {
        bank = 1;
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
        protectors: if today >= since { bank } else { 0 },
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
        KeyEvent { t_ms, class, app_id: APP, repeat: Repeat::default() }
    }

    /// Types `n` characters starting at `t0`, one every `gap_ms`. Returns the next free time.
    fn type_chars(e: &mut Engine, out: &mut Vec<Burst>, t0: u64, n: u32, gap_ms: u64) -> u64 {
        let mut t = t0;
        for i in 0..n {
            // Real text: a space every few letters (long runs without one look like mashing).
            out.extend(e.push(ev(t, if i % 6 == 5 { KeyClass::Space } else { KeyClass::Char })));
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
        out.extend(e.push(KeyEvent { t_ms: t, class: KeyClass::Char, app_id: 2, repeat: Repeat::default() }));
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
        assert_eq!(Zone::of(0.0), Zone::WarmingUp);
        assert_eq!(Zone::of(30.0), Zone::WarmingUp);
        assert_eq!(Zone::of(39.9), Zone::WarmingUp);
        assert_eq!(Zone::of(40.0), Zone::Rhythm);
        assert_eq!(Zone::of(50.0), Zone::Rhythm);
        assert_eq!(Zone::of(60.0), Zone::Good);
        assert_eq!(Zone::of(70.0), Zone::Good);
        assert_eq!(Zone::of(80.0), Zone::OnFire);
        assert_eq!(Zone::of(90.0), Zone::OnFire);
        assert_eq!(Zone::of(94.9), Zone::OnFire);
        assert_eq!(Zone::of(95.0), Zone::BeatingYourself);
        assert_eq!(Zone::of(100.0), Zone::BeatingYourself);
        assert_eq!(Zone::of(107.9), Zone::BeatingYourself);
        assert_eq!(Zone::of(108.0), Zone::Supermochi);
        assert_eq!(Zone::of(115.0), Zone::Supermochi);
    }

    #[test]
    fn zone_ids_match_the_ui() {
        let ids: Vec<&str> = [30.0, 50.0, 70.0, 90.0, 100.0, 115.0].iter().map(|&p| Zone::of(p).id()).collect();
        assert_eq!(ids, ["warming", "rhythm", "good", "fire", "beating", "super"]);
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
        assert_eq!(goal_status(&[], MON, 20 * MIN, false, None), GoalStatus::default());
        let off = goal_status(&[met(MON - 1), met(MON)], MON, 0, false, None);
        assert_eq!((off.streak_days, off.met_today), (0, false));
        assert_eq!(off.today_ms, 20 * MIN);
    }

    #[test]
    fn goal_today_in_progress_does_not_break_the_streak() {
        let s = goal_status(&[met(MON - 2), met(MON - 1), (MON, 5 * MIN)], MON, 20 * MIN, false, None);
        assert_eq!((s.streak_days, s.met_today, s.today_ms), (2, false, 5 * MIN));
        let s = goal_status(&[met(MON - 2), met(MON - 1), met(MON)], MON, 20 * MIN, false, None);
        assert_eq!((s.streak_days, s.met_today), (3, true));
    }

    #[test]
    fn goal_one_miss_is_covered() {
        // Mon met, Tue missed, Wed met; today Thursday in progress.
        let s = goal_status(&[met(MON), met(MON + 2)], MON + 3, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 2);
        assert!(s.freeze_used_this_week && !s.freeze_saved_streak_recently);
        // Same, but yesterday was the miss: the comodín just saved the streak.
        let s = goal_status(&[met(MON)], MON + 2, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 1);
        assert!(s.freeze_saved_streak_recently);
    }

    #[test]
    fn goal_two_misses_in_one_week_break() {
        // Mon met, Tue covered, Wed met, Thu missed (breaks), Fri met; today Saturday in progress.
        let s = goal_status(&[met(MON), met(MON + 2), met(MON + 4)], MON + 5, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 1);
        assert!(!s.freeze_saved_streak_recently);
    }

    #[test]
    fn goal_new_week_gives_a_new_comodin() {
        // Fri, Sat met; Sun missed (covered, previous week); Mon met; Tue missed (covered, new week); Wed met.
        let days = [met(MON - 3), met(MON - 2), met(MON), met(MON + 2)];
        let s = goal_status(&days, MON + 3, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 4);
        assert!(s.freeze_used_this_week);
        // The Sunday miss belongs to the previous ISO week, so it does not use this week's comodín.
        let s = goal_status(&[met(MON - 2), met(MON)], MON + 1, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 2);
        assert!(!s.freeze_used_this_week);
    }

    #[test]
    fn goal_weekend_rest_skips_saturday_and_sunday() {
        // Fri met, weekend untouched, Mon met; today Tuesday in progress.
        let days = [met(MON - 3), met(MON)];
        assert_eq!(goal_status(&days, MON + 1, 20 * MIN, true, None).streak_days, 2);
        // Without the rest option Sat is covered and Sun breaks the streak.
        assert_eq!(goal_status(&days, MON + 1, 20 * MIN, false, None).streak_days, 1);
        // A weekend day that is met still counts.
        assert_eq!(goal_status(&[met(MON - 3), met(MON - 2), met(MON)], MON + 1, 20 * MIN, true, None).streak_days, 3);
    }

    #[test]
    fn goal_misses_after_a_long_gap_and_future_days_are_ignored() {
        let s = goal_status(&[met(MON - 30), met(MON - 29)], MON, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 0);
        let s = goal_status(&[met(MON), met(MON + 1)], MON, 20 * MIN, false, None);
        assert_eq!(s.streak_days, 1);
        // Pieces of the same day add up.
        let s = goal_status(&[(MON, 12 * MIN), (MON, 9 * MIN)], MON, 20 * MIN, false, None);
        assert!(s.met_today);
    }

    #[test]
    fn protectors_start_with_one_and_cover_a_miss() {
        // Protectors on since Monday: Mon met, Tue missed (spends the one), Wed met; today Thursday.
        let s = goal_status(&[met(MON), met(MON + 2)], MON + 3, 20 * MIN, false, Some(MON));
        assert_eq!((s.streak_days, s.protectors), (2, 0));
        // A second miss with the bank empty breaks the streak.
        let s = goal_status(&[met(MON), met(MON + 2), met(MON + 4)], MON + 5, 20 * MIN, false, Some(MON));
        assert_eq!((s.streak_days, s.protectors), (1, 0));
        // No history yet: the first protector is already waiting.
        assert_eq!(goal_status(&[], MON + 3, 20 * MIN, false, Some(MON)).protectors, 1);
        // Before the protectors start there are none to show.
        assert_eq!(goal_status(&[met(MON)], MON + 1, 20 * MIN, false, Some(MON + 5)).protectors, 0);
    }

    #[test]
    fn a_clean_week_earns_a_protector_up_to_two() {
        let week = |from: i64, n: i64| (from..from + n).map(met).collect::<Vec<_>>();
        // One full week met: 1 + 1 = 2, and two misses in a row are then covered.
        let mut days = week(MON - 7, 7);
        assert_eq!(goal_status(&days, MON, 20 * MIN, false, Some(MON - 7)).protectors, 2);
        days.push(met(MON + 2));
        let s = goal_status(&days, MON + 3, 20 * MIN, false, Some(MON - 7));
        assert_eq!((s.streak_days, s.protectors), (8, 0));
        // Two clean weeks still give only two.
        assert_eq!(goal_status(&week(MON - 14, 14), MON, 20 * MIN, false, Some(MON - 14)).protectors, 2);
        // A week that started on Wednesday is not a full week.
        assert_eq!(goal_status(&week(MON + 2, 5), MON + 7, 20 * MIN, false, Some(MON + 2)).protectors, 1);
        // A week where one was spent earns nothing.
        let mut days = week(MON - 7, 7);
        days.remove(2);
        assert_eq!(goal_status(&days, MON, 20 * MIN, false, Some(MON - 7)).protectors, 0);
        // With weekend rest, Monday to Friday met is a full week.
        let s = goal_status(&week(MON - 7, 5), MON, 20 * MIN, true, Some(MON - 7));
        assert_eq!((s.streak_days, s.protectors), (5, 2));
    }

    #[test]
    fn days_before_the_protectors_keep_the_weekly_comodin() {
        // Fri, Sat met; Sun missed (comodín); Mon met; Tue missed (comodín); Wed met. Protectors
        // start today, Thursday: the streak made under the old rule stays whole.
        let days = [met(MON - 3), met(MON - 2), met(MON), met(MON + 2)];
        let s = goal_status(&days, MON + 3, 20 * MIN, false, Some(MON + 3));
        assert_eq!((s.streak_days, s.protectors), (4, 1));
    }

    /// Feeds keys described as (class, same as prev, same as prev2) at `gap_ms` apart.
    fn feed(e: &mut Engine, keys: &[(KeyClass, bool, bool)], gap_ms: u64) -> Option<Burst> {
        let mut t = 1_000;
        let mut out = None;
        for &(class, a, b) in keys {
            out = out.or(e.push(KeyEvent { t_ms: t, class, app_id: APP, repeat: Repeat { same_as_prev: a, same_as_prev2: b } }));
            t += gap_ms;
        }
        out.or(e.flush())
    }

    /// Plain text: words of 5 letters and a space, no repeats.
    fn words(n_words: usize) -> Vec<(KeyClass, bool, bool)> {
        (0..n_words).flat_map(|_| [(KeyClass::Char, false, false); 5].into_iter().chain([(KeyClass::Space, false, false)])).collect()
    }

    #[test]
    fn normal_text_is_not_mashing() {
        let mut e = Engine::new(Config::default());
        let b = feed(&mut e, &words(30), 180).unwrap();
        assert!(!b.mash);
        // A few doubled letters ("llamar", "carro") are normal too.
        let mut keys = words(20);
        keys[2] = (KeyClass::Char, true, false);
        let b = feed(&mut Engine::new(Config::default()), &keys, 180).unwrap();
        assert!(!b.mash);
    }

    #[test]
    fn long_runs_without_spaces_are_mashing() {
        let keys = vec![(KeyClass::Char, false, false); 90];
        let b = feed(&mut Engine::new(Config::default()), &keys, 60).unwrap();
        assert!(b.mash, "dasjkdlajsdklj…");
        // A long word (35 letters) inside normal text is not.
        let mut keys = words(15);
        keys.extend(vec![(KeyClass::Char, false, false); 35]);
        keys.extend(words(15));
        assert!(!feed(&mut Engine::new(Config::default()), &keys, 150).unwrap().mash);
    }

    #[test]
    fn repeated_and_alternating_keys_are_mashing() {
        let mut keys: Vec<_> = (0..30).map(|i| (KeyClass::Char, i > 0, i > 1)).collect(); // aaaaaa…
        assert!(feed(&mut Engine::new(Config::default()), &keys, 120).unwrap().mash);
        keys = (0..30).map(|i| (KeyClass::Char, false, i > 1)).collect(); // asasas…
        assert!(feed(&mut Engine::new(Config::default()), &keys, 120).unwrap().mash);
    }

    #[test]
    fn live_speed_counts_gaps_at_the_start_and_settles_after_the_window() {
        let mut e = Engine::new(Config::default());
        // 60 wpm = 5 keys a second = one key every 200 ms; 11 keys span exactly 2 s.
        for i in 0..11 {
            e.push(ev(i * 200, KeyClass::Char));
        }
        let w = e.live_wpm(2_000).unwrap();
        assert!((w - 60.0).abs() < 0.01, "{w}");
        assert!(!e.live_settled(2_000));
        for i in 11..60 {
            e.push(ev(i * 200, KeyClass::Char));
        }
        assert!(e.live_settled(11_800));
    }

    #[test]
    fn mashing_never_grows_the_run_without_deleting() {
        let mut e = Engine::new(Config::default());
        feed(&mut e, &words(5), 150); // 30 real keys
        let before = e.current_streak();
        let mash: Vec<_> = (0..60).map(|i| (KeyClass::Char, i > 0, i > 1)).collect(); // aaaa…
        feed(&mut e, &mash, 80);
        assert!(e.current_streak() <= before + MASH_SAME_RUN, "streak went from {before} to {}", e.current_streak());
        let mut e = Engine::new(Config::default());
        feed(&mut e, &vec![(KeyClass::Char, false, false); 120], 60); // no spaces
        assert!(e.current_streak() < MASH_NO_SPACE_RUN, "streak {}", e.current_streak());
    }

    #[test]
    fn impossible_speed_is_mashing_and_mashing_never_shows_live() {
        // 300 wpm with spaces: 25 ms per key for 6 s.
        let b = feed(&mut Engine::new(Config::default()), &words(40), 40).unwrap();
        assert!(b.gross_wpm() > MASH_WPM && b.mash);
        let mut e = Engine::new(Config::default());
        let mut t = 0;
        for _ in 0..60 {
            e.push(KeyEvent { t_ms: t, class: KeyClass::Char, app_id: APP, repeat: Repeat::default() });
            t += 50;
        }
        assert_eq!(e.live_wpm(t), None);
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
