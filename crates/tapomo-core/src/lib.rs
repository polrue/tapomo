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
    fn pause_setting_is_clamped() {
        assert_eq!(Config::default().with_pause_ms(200).pause_ms, 1_000);
        assert_eq!(Config::default().with_pause_ms(9_000).pause_ms, 5_000);
    }
}
