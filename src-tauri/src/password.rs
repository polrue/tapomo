//! Password-field detection through UI Automation.
//!
//! A dedicated MTA thread registers a focus-changed handler and keeps
//! [`IN_PASSWORD`] up to date. The keyboard hook only does one atomic load.
//! Any UIA error counts as "not a password field" (logged at debug level).

use std::sync::atomic::{AtomicBool, Ordering};

static IN_PASSWORD: AtomicBool = AtomicBool::new(false);

/// True while the focused UI element is a password field.
#[inline]
pub fn in_password_field() -> bool {
    IN_PASSWORD.load(Ordering::Relaxed)
}

#[cfg(windows)]
pub use imp::start;

/// No password detection outside Windows.
#[cfg(not(windows))]
pub fn start() {}

#[cfg(windows)]
mod imp {
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::sync::atomic::Ordering;

    use ::windows::core::{implement, Result as WinResult};
    use ::windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use ::windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationFocusChangedEventHandler,
        IUIAutomationFocusChangedEventHandler_Impl, UIA_IsPasswordPropertyId,
    };

    use super::IN_PASSWORD;

    #[implement(IUIAutomationFocusChangedEventHandler)]
    struct FocusHandler;

    impl IUIAutomationFocusChangedEventHandler_Impl for FocusHandler_Impl {
        fn HandleFocusChangedEvent(&self, sender: Option<&IUIAutomationElement>) -> WinResult<()> {
            // Never unwind into COM.
            let _ = catch_unwind(AssertUnwindSafe(|| update(sender)));
            Ok(())
        }
    }

    fn update(element: Option<&IUIAutomationElement>) {
        let is_password = match element.map(is_password) {
            Some(Ok(v)) => v,
            Some(Err(e)) => {
                log::debug!("UIA IsPassword read failed: {e}");
                false
            }
            None => false,
        };
        IN_PASSWORD.store(is_password, Ordering::Relaxed);
    }

    fn is_password(element: &IUIAutomationElement) -> WinResult<bool> {
        // SAFETY: plain COM call on a live element.
        let value = unsafe { element.GetCurrentPropertyValue(UIA_IsPasswordPropertyId)? };
        Ok(bool::try_from(&value).unwrap_or(false))
    }

    /// Starts the UIA thread.
    pub fn start() {
        let spawned = std::thread::Builder::new().name("tapomo-uia".into()).spawn(run);
        if let Err(e) = spawned {
            log::error!("could not start password-detection thread: {e}");
        }
    }

    fn run() {
        let _ = catch_unwind(|| {
            // SAFETY: COM initialised once on this thread, which never exits.
            unsafe {
                if let Err(e) = CoInitializeEx(None, COINIT_MULTITHREADED).ok() {
                    log::error!("CoInitializeEx failed: {e}");
                    return;
                }
                let automation: IUIAutomation = match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                    Ok(a) => a,
                    Err(e) => {
                        log::error!("could not create UI Automation: {e}");
                        return;
                    }
                };
                // Initial state: whatever is focused right now.
                match automation.GetFocusedElement() {
                    Ok(el) => update(Some(&el)),
                    Err(e) => log::debug!("GetFocusedElement failed: {e}"),
                }
                let handler: IUIAutomationFocusChangedEventHandler = FocusHandler.into();
                if let Err(e) = automation.AddFocusChangedEventHandler(None, &handler) {
                    log::error!("AddFocusChangedEventHandler failed: {e}");
                    return;
                }
                // Events arrive on UIA's own threads; keep this one (and the objects) alive.
                loop {
                    std::thread::park();
                }
            }
        });
    }
}
