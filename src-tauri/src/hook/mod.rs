//! Global keyboard hook. It produces [`RawKey`]s: a timestamp, a key *class* and the foreground
//! window handle. The pressed key itself is dropped, with one narrow exception: when a plain
//! Backspace follows a character key, the virtual-key code of that one key is sent
//! (`Msg::Corrected`) and the tracker immediately turns it into a per-day counter
//! (`corrected_keys`, can be turned off). Never the text, never a sequence of keys; consecutive
//! Backspaces attribute only the first.

use tapomo_core::{KeyClass, Repeat};

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::start;

/// One classified keystroke, before the foreground app has been resolved.
#[derive(Debug, Clone, Copy)]
pub struct RawKey {
    /// Milliseconds since the Unix epoch.
    pub t_ms: u64,
    pub class: KeyClass,
    /// Foreground window handle, as an integer so it is `Send` on every platform.
    pub hwnd: isize,
    /// Same key as the previous one / two back (for spotting mashing). Never which key it was.
    pub repeat: Repeat,
}

/// No keyboard hook outside Windows: the app compiles but measures nothing.
#[cfg(not(windows))]
pub fn start(_tx: std::sync::mpsc::Sender<crate::tracker::Msg>) {
    log::warn!("keyboard hook is only available on Windows");
}

/// Which key does a Backspace correct? `prev` is the virtual key of the previous key if it was a
/// character key (`u32::MAX` when the previous key was anything else, or nothing). Only that single
/// key is ever reported.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn corrected_vk(prev: u32) -> Option<u32> {
    (prev <= 255).then_some(prev)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_backspace_corrects_the_previous_character_key_only() {
        assert_eq!(corrected_vk(0x41), Some(0x41));
        assert_eq!(corrected_vk(u32::MAX), None, "after a space, an enter, another backspace or at the start");
    }
}
