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

/// Work area (screen minus taskbar) of the primary monitor, physical px: `(left, top, right, bottom)`.
#[cfg(windows)]
pub fn primary_work_area() -> Option<(i32, i32, i32, i32)> {
    use ::windows::Win32::Foundation::RECT;
    use ::windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETWORKAREA, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };
    let mut rect = RECT::default();
    // SAFETY: SPI_GETWORKAREA writes one RECT through the pointer, which outlives the call.
    unsafe {
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some(&mut rect as *mut RECT as *mut std::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    Some((rect.left, rect.top, rect.right, rect.bottom))
}

#[cfg(not(windows))]
pub fn primary_work_area() -> Option<(i32, i32, i32, i32)> {
    None
}

/// Makes the window never take focus and keeps it out of Alt+Tab (`WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`).
#[cfg(windows)]
pub fn make_noactivate(hwnd: isize) {
    use ::windows::Win32::Foundation::HWND;
    use ::windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    let hwnd = HWND(hwnd as _);
    // SAFETY: plain read-modify-write of the extended style of a window we own.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
    }
}

#[cfg(not(windows))]
pub fn make_noactivate(_hwnd: isize) {}
