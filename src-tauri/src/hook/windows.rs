//! `WH_KEYBOARD_LL` hook on a dedicated thread. The callback does the bare
//! minimum (classify, timestamp, send) and never panics.

use std::cell::RefCell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::Sender;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use ::windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use ::windows::Win32::System::LibraryLoader::GetModuleHandleW;
use ::windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use ::windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetForegroundWindow, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT,
    LLKHF_INJECTED, MSG, WH_KEYBOARD_LL,
};
use tapomo_core::KeyClass;

use super::RawKey;
use crate::tracker::Msg;

const WM_KEYDOWN: u32 = 0x0100;
const WM_KEYUP: u32 = 0x0101;
const WM_SYSKEYDOWN: u32 = 0x0104;
const WM_SYSKEYUP: u32 = 0x0105;

const VK_BACK: u32 = 0x08;
const VK_RETURN: u32 = 0x0D;
const VK_SPACE: u32 = 0x20;
const VK_SHIFT: u16 = 0x10;
const VK_CONTROL: u16 = 0x11;
const VK_MENU: u16 = 0x12;
const VK_LWIN: u16 = 0x5B;
const VK_RWIN: u16 = 0x5C;

/// True once a `PasswordFocus` was sent for the current password-field visit.
static PASSWORD_NOTIFIED: AtomicBool = AtomicBool::new(false);

static SENDER: OnceLock<Sender<Msg>> = OnceLock::new();

thread_local! {
    /// Which virtual keys are currently held (hook thread only), to spot auto-repeat.
    /// A lost key-up (e.g. Win+L) only costs that key's next press.
    static DOWN: RefCell<[bool; 256]> = const { RefCell::new([false; 256]) };
    /// The last two character keys (hook thread only): only "same as before?" leaves the hook, to
    /// recognise mashing like "aaaa" or "asasas". The one exception is the key right before a plain
    /// Backspace (see `corrected_vk`), sent as a single number and turned into a daily counter.
    static LAST: RefCell<[u32; 2]> = const { RefCell::new([u32::MAX; 2]) };
}

/// Starts the hook thread. Events are sent as [`Msg::Key`].
pub fn start(tx: Sender<Msg>) {
    if SENDER.set(tx).is_err() {
        log::warn!("keyboard hook already started");
        return;
    }
    let spawned = std::thread::Builder::new().name("tapomo-hook".into()).spawn(run);
    if let Err(e) = spawned {
        log::error!("could not start hook thread: {e}");
    }
}

fn run() {
    // SAFETY: plain Win32 calls; the hook procedure below is a valid `extern "system"` fn.
    unsafe {
        let module = match GetModuleHandleW(None) {
            Ok(m) => m,
            Err(e) => {
                log::error!("GetModuleHandleW failed: {e}");
                return;
            }
        };
        if let Err(e) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), HINSTANCE(module.0), 0) {
            log::error!("SetWindowsHookExW failed: {e}");
            return;
        }
        log::info!("keyboard hook installed");
        // The hook only fires while this thread pumps messages.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
    }
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        // A panic must never unwind across the FFI boundary.
        let _ = catch_unwind(AssertUnwindSafe(|| handle(wparam, lparam)));
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe fn handle(wparam: WPARAM, lparam: LPARAM) {
    let msg = wparam.0 as u32;
    let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    // Macros and auto-typers are not the user typing.
    if kb.flags.0 & LLKHF_INJECTED.0 != 0 {
        return;
    }
    // Password field focused: drop everything here, before any classification.
    if crate::password::in_password_field() {
        if !PASSWORD_NOTIFIED.swap(true, Ordering::Relaxed) {
            if let Some(tx) = SENDER.get() {
                let _ = tx.send(Msg::PasswordFocus);
            }
        }
        return;
    }
    PASSWORD_NOTIFIED.store(false, Ordering::Relaxed);
    let vk = kb.vkCode;
    if vk > 255 {
        return;
    }
    match msg {
        WM_KEYUP | WM_SYSKEYUP => DOWN.with(|d| d.borrow_mut()[vk as usize] = false),
        WM_KEYDOWN | WM_SYSKEYDOWN => {
            let repeat = DOWN.with(|d| std::mem::replace(&mut d.borrow_mut()[vk as usize], true));
            // Modifiers come from Windows, not from our own tracking: key-ups that happen
            // on the secure desktop (Win+L, Ctrl+Alt+Del, UAC) never reach this hook, and
            // a modifier stuck "down" would silently ignore everything typed afterwards.
            let ctrl = is_down(VK_CONTROL);
            let alt = is_down(VK_MENU);
            let win = is_down(VK_LWIN) || is_down(VK_RWIN);
            if repeat {
                return;
            }
            let class = classify(vk, ctrl, alt, win);
            if class == KeyClass::Ignored {
                // A Ctrl/Alt/Win combination becomes one of five kinds right here; the key is dropped.
                let shift = is_down(VK_SHIFT);
                if let Some(kind) = tapomo_core::shortcuts::classify(vk, ctrl, alt, win, shift) {
                    // Phase B: only a combination from the closed catalogue is ever identified.
                    use crate::catalog::{known_combo, ALT, CTRL, SHIFT, WIN};
                    let mods = u8::from(ctrl) * CTRL | u8::from(alt) * ALT | u8::from(win) * WIN | u8::from(shift) * SHIFT;
                    if let Some(tx) = SENDER.get() {
                        let _ = tx.send(Msg::Shortcut(kind, known_combo(mods, vk), GetForegroundWindow().0 as isize));
                    }
                }
                return;
            }
            let repeat = if class == KeyClass::Char {
                LAST.with(|l| {
                    let mut l = l.borrow_mut();
                    let r = tapomo_core::Repeat { same_as_prev: l[0] == vk, same_as_prev2: l[1] == vk };
                    *l = [vk, l[0]];
                    r
                })
            } else {
                // A plain Backspace right after a character key: that one key (and only that one,
                // so held-down backspaces count once) goes out as a number, before LAST is reset.
                if class == KeyClass::Backspace {
                    if let Some(key) = LAST.with(|l| super::corrected_vk(l.borrow()[0])) {
                        if let Some(tx) = SENDER.get() {
                            let _ = tx.send(Msg::Corrected { vk: key, hwnd: GetForegroundWindow().0 as isize });
                        }
                    }
                }
                LAST.with(|l| *l.borrow_mut() = [u32::MAX; 2]);
                tapomo_core::Repeat::default()
            };
            if let Some(tx) = SENDER.get() {
                let _ = tx.send(Msg::Key(RawKey { t_ms: now_ms(), class, hwnd: GetForegroundWindow().0 as isize, repeat }));
            }
        }
        _ => {}
    }
}

/// Maps a virtual key plus modifier state to a [`KeyClass`].
fn classify(vk: u32, ctrl: bool, alt: bool, win: bool) -> KeyClass {
    // Ctrl+Alt together is AltGr on many layouts (@ # € [ ]), so it still types.
    let alt_gr = ctrl && alt;
    if (ctrl || alt || win) && !alt_gr {
        // Ctrl+Backspace is the one shortcut we care about.
        return if ctrl && !alt && !win && vk == VK_BACK { KeyClass::WordDelete } else { KeyClass::Ignored };
    }
    match vk {
        VK_BACK => KeyClass::Backspace,
        VK_SPACE => KeyClass::Space,
        VK_RETURN => KeyClass::Enter,
        0x30..=0x39 | 0x41..=0x5A => KeyClass::Char,
        // OEM_1, PLUS, COMMA, MINUS, PERIOD, OEM_2, OEM_3
        0xBA..=0xC0 => KeyClass::Char,
        // OEM_4 .. OEM_8
        0xDB..=0xDF => KeyClass::Char,
        // OEM_102 (the extra key on ISO keyboards)
        0xE2 => KeyClass::Char,
        _ => KeyClass::Ignored,
    }
}

fn is_down(vk: u16) -> bool {
    // SAFETY: plain Win32 call with no pointers.
    unsafe { GetAsyncKeyState(i32::from(vk)) as u16 & 0x8000 != 0 }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: u32 = 0x41;
    const C: u32 = 0x43;

    #[test]
    fn plain_keys_become_classes() {
        assert_eq!(classify(A, false, false, false), KeyClass::Char);
        assert_eq!(classify(0x31, false, false, false), KeyClass::Char);
        assert_eq!(classify(0xBA, false, false, false), KeyClass::Char); // OEM_1 (ñ on Spanish keyboards)
        assert_eq!(classify(VK_SPACE, false, false, false), KeyClass::Space);
        assert_eq!(classify(VK_RETURN, false, false, false), KeyClass::Enter);
        assert_eq!(classify(VK_BACK, false, false, false), KeyClass::Backspace);
        assert_eq!(classify(0x25, false, false, false), KeyClass::Ignored); // arrows
    }

    #[test]
    fn shortcuts_are_not_typing_but_altgr_is() {
        assert_eq!(classify(C, true, false, false), KeyClass::Ignored); // Ctrl+C
        assert_eq!(classify(VK_BACK, true, false, false), KeyClass::WordDelete); // Ctrl+Backspace
        assert_eq!(classify(0x32, true, true, false), KeyClass::Char); // AltGr+2 = @
        assert_eq!(classify(A, false, false, true), KeyClass::Ignored); // Win+A
    }

    #[test]
    fn only_catalogue_combos_are_ever_identified() {
        use crate::catalog::{known_combo, CTRL, SHIFT};
        assert!(known_combo(CTRL, C).is_some());
        assert!(known_combo(CTRL | SHIFT, 0x4E).is_none(), "incognito never");
        assert!(known_combo(CTRL, 0x51).is_none(), "Ctrl+Q is not in the album");
    }
}
