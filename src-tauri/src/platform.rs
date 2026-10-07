//! OS queries made by the worker thread (never by the keyboard hook).

/// File name of the executable that owns window `hwnd` (e.g. `WINWORD.EXE`).
/// Window titles are never read.
#[cfg(windows)]
pub fn exe_name(hwnd: isize) -> Option<String> {
    use ::windows::core::PWSTR;
    use ::windows::Win32::Foundation::{CloseHandle, HWND};
    use ::windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use ::windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    if hwnd == 0 {
        return None;
    }
    // SAFETY: plain Win32 calls with valid out-pointers; the process handle is closed below.
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(HWND(hwnd as _), Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let queried = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        queried.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit('\\').next().filter(|n| !n.is_empty()).map(str::to_string)
    }
}

/// True while a fullscreen Direct3D game or a presentation is running.
#[cfg(windows)]
pub fn fullscreen_busy() -> bool {
    use ::windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    // SAFETY: no arguments, returns a plain enum.
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

#[cfg(not(windows))]
pub fn exe_name(_hwnd: isize) -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn fullscreen_busy() -> bool {
    false
}
