//! Global keyboard hook. It only ever produces [`RawKey`]s: a timestamp, a key
//! *class* and the foreground window handle. The pressed key itself is dropped.

use tapomo_core::KeyClass;

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
}

/// No keyboard hook outside Windows: the app compiles but measures nothing.
#[cfg(not(windows))]
pub fn start(_tx: std::sync::mpsc::Sender<crate::tracker::Msg>) {
    log::warn!("keyboard hook is only available on Windows");
}
