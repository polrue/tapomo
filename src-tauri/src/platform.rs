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

/// True while something fullscreen has the screen: a game, a video player, a browser in
/// F11 / video fullscreen, a presentation. Two signals, either is enough:
/// the shell's "user notification state", and the foreground window covering its whole monitor.
#[cfg(windows)]
pub fn fullscreen_busy() -> bool {
    notification_state_busy() || foreground_covers_monitor()
}

#[cfg(windows)]
fn notification_state_busy() -> bool {
    use ::windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    // SAFETY: no arguments, returns a plain enum.
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

/// The foreground window (not ours, not the desktop or taskbar) covers its monitor completely.
#[cfg(windows)]
fn foreground_covers_monitor() -> bool {
    use ::windows::Win32::Foundation::{HWND, RECT};
    use ::windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use ::windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use ::windows::Win32::System::Threading::GetCurrentProcessId;
    use ::windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    // Shell windows that always span the screen.
    const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

    // SAFETY: plain Win32 queries with valid out-pointers; nothing is retained.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == HWND::default() || !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == GetCurrentProcessId() {
            return false;
        }
        let mut class = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class);
        if len > 0 {
            let name = String::from_utf16_lossy(&class[..len as usize]);
            if SHELL_CLASSES.contains(&name.as_str()) {
                return false;
            }
        }

        // The DWM frame excludes the invisible resize border that GetWindowRect includes.
        let mut rect = RECT::default();
        let dwm = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut std::ffi::c_void,
            std::mem::size_of::<RECT>() as u32,
        );
        if dwm.is_err() && GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }
        let m = info.rcMonitor;
        rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
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

/// Cursor position, physical px, virtual-screen coordinates.
#[cfg(windows)]
pub fn cursor_pos() -> Option<(i32, i32)> {
    use ::windows::Win32::Foundation::POINT;
    use ::windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    // SAFETY: writes one POINT through a valid pointer.
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

#[cfg(not(windows))]
pub fn cursor_pos() -> Option<(i32, i32)> {
    None
}

/// Outer rectangle of a window, physical px: `(left, top, right, bottom)`.
#[cfg(windows)]
pub fn window_rect(hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    use ::windows::Win32::Foundation::{HWND, RECT};
    use ::windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let mut r = RECT::default();
    // SAFETY: writes one RECT through a valid pointer.
    unsafe { GetWindowRect(HWND(hwnd as _), &mut r).ok()? };
    Some((r.left, r.top, r.right, r.bottom))
}

#[cfg(not(windows))]
pub fn window_rect(_hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    None
}

/// Work area (screen minus taskbar) of the monitor nearest to a point, physical px.
#[cfg(windows)]
pub fn work_area_at(x: i32, y: i32) -> Option<(i32, i32, i32, i32)> {
    use ::windows::Win32::Foundation::POINT;
    use ::windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    // SAFETY: valid out-pointer, cbSize set as the API requires.
    unsafe {
        let monitor = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let w = info.rcWork;
        Some((w.left, w.top, w.right, w.bottom))
    }
}

#[cfg(not(windows))]
pub fn work_area_at(_x: i32, _y: i32) -> Option<(i32, i32, i32, i32)> {
    None
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
