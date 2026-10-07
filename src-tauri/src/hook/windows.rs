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
            let class = if repeat { KeyClass::Ignored } else { classify(vk, ctrl, alt, win) };
            if class == KeyClass::Ignored {
                return;
            }
            if let Some(tx) = SENDER.get() {
                let _ = tx.send(Msg::Key(RawKey { t_ms: now_ms(), class, hwnd: GetForegroundWindow().0 as isize }));
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
