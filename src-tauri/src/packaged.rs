//! The Microsoft Store build: the same exe, run from an MSIX package. Windows then updates it
//! (so the own updater stays off) and starts it with Windows through the manifest's StartupTask
//! instead of the registry Run key, whose path would point inside a versioned package folder.

use std::sync::OnceLock;

/// `TaskId` of the `desktop:StartupTask` in packaging/msix/AppxManifest.xml.
#[cfg(windows)]
const STARTUP_TASK_ID: &str = "TapomoStartup";

/// Running from an MSIX package (the Microsoft Store build).
pub fn is_packaged() -> bool {
    static PACKAGED: OnceLock<bool> = OnceLock::new();
    *PACKAGED.get_or_init(detect)
}

#[cfg(windows)]
fn detect() -> bool {
    use windows::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
    let mut len = 0u32;
    // With no buffer it answers ERROR_INSUFFICIENT_BUFFER when there is a package.
    let err = unsafe { GetCurrentPackageFullName(&mut len, windows::core::PWSTR::null()) };
    err != APPMODEL_ERROR_NO_PACKAGE
}

#[cfg(not(windows))]
fn detect() -> bool {
    false
}

/// Windows started the package at sign-in (the StartupTask), as opposed to the user opening it.
#[cfg(windows)]
pub fn launched_at_startup() -> bool {
    use windows::ApplicationModel::Activation::ActivationKind;
    use windows::ApplicationModel::AppInstance;
    if !is_packaged() {
        return false;
    }
    on_mta(|| Ok(AppInstance::GetActivatedEventArgs()?.Kind()? == ActivationKind::StartupTask)).unwrap_or(false)
}

#[cfg(not(windows))]
pub fn launched_at_startup() -> bool {
    false
}

/// Whether the StartupTask is on. The user can also switch it in Task Manager or Settings > Apps > Startup.
#[cfg(windows)]
pub fn startup_enabled() -> bool {
    use windows::ApplicationModel::StartupTaskState;
    on_mta(|| {
        let state = startup_task()?.State()?;
        Ok(state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy)
    })
    .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn startup_enabled() -> bool {
    false
}

/// Turns the StartupTask on or off. Turning it on fails when the user disabled it from Windows,
/// which only Windows itself can undo.
#[cfg(windows)]
pub fn set_startup(enable: bool) -> Result<(), String> {
    use windows::ApplicationModel::StartupTaskState;
    on_mta(move || {
        let task = startup_task()?;
        if enable {
            let state = task.RequestEnableAsync()?.get()?;
            if state != StartupTaskState::Enabled && state != StartupTaskState::EnabledByPolicy {
                return Ok(Err(format!("startup task state {}", state.0)));
            }
        } else {
            task.Disable()?;
        }
        Ok(Ok(()))
    })
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
pub fn set_startup(_enable: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn startup_task() -> windows::core::Result<windows::ApplicationModel::StartupTask> {
    windows::ApplicationModel::StartupTask::GetAsync(&windows::core::HSTRING::from(STARTUP_TASK_ID))?.get()
}

/// Runs a WinRT call on its own multithreaded-apartment thread: commands run on the UI thread,
/// where blocking on an async operation is not allowed.
#[cfg(windows)]
fn on_mta<T: Send + 'static>(f: impl FnOnce() -> windows::core::Result<T> + Send + 'static) -> windows::core::Result<T> {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    std::thread::spawn(move || {
        let init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let result = f();
        if init.is_ok() {
            unsafe { CoUninitialize() };
        }
        result
    })
    .join()
    .unwrap_or_else(|_| Err(windows::core::Error::from(windows::Win32::Foundation::E_FAIL)))
}
