#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Layer {
    Bottom,
    Desktop,
    Reveal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Foreground {
    Desktop,
    Widget,
    Other,
    Unknown,
}

fn next_layer(current: Layer, foreground: Foreground, desktop_available: bool) -> Layer {
    let next = match foreground {
        Foreground::Desktop => Layer::Desktop,
        Foreground::Other => Layer::Bottom,
        Foreground::Widget | Foreground::Unknown => current,
    };
    if next == Layer::Desktop && !desktop_available {
        Layer::Bottom
    } else {
        next
    }
}

pub fn install(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    return platform::install(window);
    #[cfg(not(windows))]
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())
}

pub fn reveal(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    return platform::reveal(window);
    #[cfg(not(windows))]
    {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())
    }
}

#[cfg(windows)]
mod platform {
    use super::{next_layer, Foreground, Layer};
    use std::cell::Cell;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, AtomicU32, Ordering};
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_EXCLUDED_FROM_PEEK};
    use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    const SUBCLASS_ID: usize = 0x4342_4457;
    const TIMER_ID: usize = 0x4342_4458;
    const POSITION_FLAGS: u32 = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    static WIDGET: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static REFRESH_MESSAGE: AtomicU32 = AtomicU32::new(0);
    static REVEAL_MESSAGE: AtomicU32 = AtomicU32::new(0);

    struct WidgetState {
        layer: Cell<Layer>,
        changing_order: Cell<bool>,
        event_hook: Cell<HWINEVENTHOOK>,
    }

    pub(super) fn install(window: &tauri::WebviewWindow) -> Result<(), String> {
        // Tauri setup runs on the window thread. The timer and subclass stay on
        // that thread, including cleanup; no shell window is modified or parented.
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
        window
            .set_always_on_bottom(false)
            .map_err(|error| error.to_string())?;
        window
            .set_skip_taskbar(true)
            .map_err(|error| error.to_string())?;
        install_hwnd(window.hwnd().map_err(|error| error.to_string())?.0)
    }

    pub(super) fn reveal(window: &tauri::WebviewWindow) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        let message = REVEAL_MESSAGE.load(Ordering::Relaxed);
        if message == 0 || unsafe { PostMessageW(hwnd, message, 0, 0) } == 0 {
            return Err("바탕화면 위젯을 표시하지 못했습니다.".into());
        }
        Ok(())
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    fn install_hwnd(hwnd: HWND) -> Result<(), String> {
        // WS_EX_TOOLWINDOW excludes both Taskbar and Alt+Tab. skip_taskbar by
        // itself only calls ITaskbarList::DeleteTab in Tao.
        // https://learn.microsoft.com/windows/win32/winmsg/extended-window-styles
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            SetLastError(0);
            if SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                ((style | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW) as isize,
            ) == 0
                && GetLastError() != 0
            {
                return Err("위젯 창 표시 형식을 적용하지 못했습니다.".into());
            }
            let refresh =
                RegisterWindowMessageW(wide("CornerBits.DesktopWidget.Refresh.v1").as_ptr());
            let reveal =
                RegisterWindowMessageW(wide("CornerBits.DesktopWidget.Reveal.v1").as_ptr());
            if refresh == 0 || reveal == 0 {
                return Err("위젯 창 알림을 준비하지 못했습니다.".into());
            }
            REFRESH_MESSAGE.store(refresh, Ordering::Relaxed);
            REVEAL_MESSAGE.store(reveal, Ordering::Relaxed);
            let state = Box::into_raw(Box::new(WidgetState {
                layer: Cell::new(Layer::Bottom),
                changing_order: Cell::new(false),
                event_hook: Cell::new(std::ptr::null_mut()),
            }));
            if SetWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID, state as usize) == 0 {
                drop(Box::from_raw(state));
                return Err("위젯 창 동작을 준비하지 못했습니다.".into());
            }
            if SetTimer(hwnd, TIMER_ID, 500, None) == 0 {
                RemoveWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID);
                drop(Box::from_raw(state));
                return Err("위젯 창 상태 확인을 시작하지 못했습니다.".into());
            }
            WIDGET.store(hwnd, Ordering::Relaxed);
            // Out-of-context events only observe foreground changes. They never
            // inject code into Explorer or any other application.
            (*state).event_hook.set(SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(foreground_changed),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            ));
            // A failed event hook still has the 500 ms recovery timer.
            if (*state).event_hook.get().is_null() {
                eprintln!("CornerBits: foreground hook unavailable; using widget timer");
            }
            let excluded: i32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_EXCLUDED_FROM_PEEK as u32,
                &excluded as *const _ as *const c_void,
                std::mem::size_of_val(&excluded) as u32,
            );
            refresh_placement(hwnd, &*state);
        }
        Ok(())
    }

    unsafe extern "system" fn foreground_changed(
        _hook: HWINEVENTHOOK,
        _event: u32,
        _hwnd: HWND,
        _object: i32,
        _child: i32,
        _thread: u32,
        _time: u32,
    ) {
        let hwnd = WIDGET.load(Ordering::Relaxed);
        if !hwnd.is_null() {
            PostMessageW(hwnd, REFRESH_MESSAGE.load(Ordering::Relaxed), 0, 0);
        }
    }

    unsafe fn process_id(hwnd: HWND) -> u32 {
        let mut process = 0;
        GetWindowThreadProcessId(hwnd, &mut process);
        process
    }

    unsafe fn class_is(hwnd: HWND, name: &str) -> bool {
        let mut class = [0_u16; 64];
        let length = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        length > 0
            && class[..length as usize]
                .iter()
                .copied()
                .eq(name.encode_utf16())
    }

    unsafe fn desktop_host() -> HWND {
        let shell = GetShellWindow();
        if shell.is_null() || !class_is(shell, "Progman") {
            return std::ptr::null_mut();
        }
        let desktop_view = wide("SHELLDLL_DefView");
        if !FindWindowExW(
            shell,
            std::ptr::null_mut(),
            desktop_view.as_ptr(),
            std::ptr::null(),
        )
        .is_null()
        {
            return shell;
        }
        let shell_process = process_id(shell);
        let worker_class = wide("WorkerW");
        let mut worker = std::ptr::null_mut();
        loop {
            worker = FindWindowExW(
                std::ptr::null_mut(),
                worker,
                worker_class.as_ptr(),
                std::ptr::null(),
            );
            if worker.is_null() {
                return worker;
            }
            if process_id(worker) == shell_process
                && IsWindowVisible(worker) != 0
                && !FindWindowExW(
                    worker,
                    std::ptr::null_mut(),
                    desktop_view.as_ptr(),
                    std::ptr::null(),
                )
                .is_null()
            {
                return worker;
            }
        }
    }

    unsafe fn foreground_kind(hwnd: HWND, host: HWND) -> Foreground {
        let foreground = GetForegroundWindow();
        if foreground.is_null() {
            return Foreground::Unknown;
        }
        if process_id(foreground) == process_id(hwnd) {
            return Foreground::Widget;
        }
        if !host.is_null() && (foreground == host || foreground == GetShellWindow()) {
            return Foreground::Desktop;
        }
        Foreground::Other
    }

    unsafe fn place_window(hwnd: HWND, state: &WidgetState, host: HWND) {
        state.changing_order.set(true);
        match state.layer.get() {
            Layer::Bottom => {
                SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, POSITION_FLAGS);
            }
            Layer::Desktop if !host.is_null() => {
                let host_topmost = GetWindowLongPtrW(host, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST != 0;
                let widget_topmost =
                    GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST != 0;
                if host_topmost != widget_topmost {
                    SetWindowPos(
                        hwnd,
                        if host_topmost {
                            HWND_TOPMOST
                        } else {
                            HWND_NOTOPMOST
                        },
                        0,
                        0,
                        0,
                        0,
                        POSITION_FLAGS,
                    );
                }
                // hWndInsertAfter is the preceding sibling, so this inserts our
                // window directly ABOVE the desktop host, never inside it.
                let previous = GetWindow(host, GW_HWNDPREV);
                if previous != hwnd {
                    let previous_topmost = !previous.is_null()
                        && GetWindowLongPtrW(previous, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST != 0;
                    let insert_after = if previous.is_null() || (!host_topmost && previous_topmost)
                    {
                        HWND_TOP
                    } else {
                        previous
                    };
                    SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, POSITION_FLAGS);
                }
            }
            Layer::Desktop => {
                state.layer.set(Layer::Bottom);
                SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, POSITION_FLAGS);
            }
            Layer::Reveal => {}
        }
        state.changing_order.set(false);
    }

    unsafe fn refresh_placement(hwnd: HWND, state: &WidgetState) {
        // Explicitly hidden widgets stay hidden. Win+D's iconic/covered state
        // is separate from a user's hide request.
        if IsWindowVisible(hwnd) == 0 {
            return;
        }
        let host = desktop_host();
        state.layer.set(next_layer(
            state.layer.get(),
            foreground_kind(hwnd, host),
            !host.is_null(),
        ));
        if state.layer.get() == Layer::Desktop && IsIconic(hwnd) != 0 {
            state.changing_order.set(true);
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            state.changing_order.set(false);
        }
        place_window(hwnd, state, host);
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        data: usize,
    ) -> LRESULT {
        let state = &*(data as *const WidgetState);
        if message == WM_NCDESTROY {
            KillTimer(hwnd, TIMER_ID);
            let hook = state.event_hook.get();
            if !hook.is_null() {
                UnhookWinEvent(hook);
            }
            let _ = WIDGET.compare_exchange(
                hwnd,
                std::ptr::null_mut(),
                Ordering::Relaxed,
                Ordering::Relaxed,
            );
            RemoveWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID);
            drop(Box::from_raw(data as *mut WidgetState));
            return DefSubclassProc(hwnd, message, wparam, lparam);
        }
        if message == WM_STYLECHANGING && wparam as i32 == GWL_EXSTYLE && lparam != 0 {
            // Tao rebuilds extended styles from its cached window flags on show
            // and other state changes. Preserve only our task-switcher policy;
            // let all unrelated styles (transparency, DPI, etc.) pass through.
            let styles = &mut *(lparam as *mut STYLESTRUCT);
            styles.styleNew = (styles.styleNew | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW;
        } else if message == WM_WINDOWPOSCHANGING
            && !state.changing_order.get()
            && state.layer.get() != Layer::Reveal
            && lparam != 0
        {
            (*(lparam as *mut WINDOWPOS)).flags |= SWP_NOZORDER;
        } else if message == WM_SYSCOMMAND && wparam & 0xfff0 == SC_MINIMIZE as usize {
            return 0;
        } else if (message == WM_TIMER && wparam == TIMER_ID)
            || message == REFRESH_MESSAGE.load(Ordering::Relaxed)
        {
            refresh_placement(hwnd, state);
            return 0;
        } else if message == REVEAL_MESSAGE.load(Ordering::Relaxed) {
            state.layer.set(Layer::Reveal);
            state.changing_order.set(true);
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, POSITION_FLAGS);
            SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, POSITION_FLAGS);
            SetForegroundWindow(hwnd);
            state.changing_order.set(false);
            return 0;
        } else if matches!(message, WM_ACTIVATE | WM_SHOWWINDOW | WM_DISPLAYCHANGE) {
            PostMessageW(hwnd, REFRESH_MESSAGE.load(Ordering::Relaxed), 0, 0);
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn native_install_only_changes_our_hidden_window_and_keeps_it_unparented() {
            let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
            let hwnd = unsafe {
                CreateWindowExW(
                    WS_EX_APPWINDOW,
                    class.as_ptr(),
                    std::ptr::null(),
                    WS_POPUP,
                    0,
                    0,
                    100,
                    100,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                )
            };
            assert!(!hwnd.is_null());
            install_hwnd(hwnd).unwrap();
            // Tao reapplies its cached extended styles when showing the window.
            // The widget style must survive that complete replacement.
            unsafe {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_APPWINDOW as isize);
            }
            let mut position: WINDOWPOS = unsafe { std::mem::zeroed() };
            position.hwnd = hwnd;
            position.hwndInsertAfter = HWND_TOP;
            unsafe {
                SendMessageW(
                    hwnd,
                    WM_WINDOWPOSCHANGING,
                    0,
                    &mut position as *mut _ as isize,
                );
                SendMessageW(hwnd, REFRESH_MESSAGE.load(Ordering::Relaxed), 0, 0);
            }
            let style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
            let tool_window = style & WS_EX_TOOLWINDOW != 0;
            let app_window = style & WS_EX_APPWINDOW != 0;
            let remains_hidden = unsafe { IsWindowVisible(hwnd) } == 0;
            let no_owner = unsafe { GetWindow(hwnd, GW_OWNER) }.is_null();
            unsafe {
                DestroyWindow(hwnd);
            }
            assert!(WIDGET.load(Ordering::Relaxed).is_null());
            assert_ne!(position.flags & SWP_NOZORDER, 0);
            assert!(tool_window);
            assert!(!app_window);
            assert!(remains_hidden);
            assert!(no_owner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_visibility_survives_widget_clicks_but_ends_on_another_application() {
        assert_eq!(
            next_layer(Layer::Bottom, Foreground::Desktop, true),
            Layer::Desktop
        );
        assert_eq!(
            next_layer(Layer::Desktop, Foreground::Widget, true),
            Layer::Desktop
        );
        assert_eq!(
            next_layer(Layer::Desktop, Foreground::Other, true),
            Layer::Bottom
        );
        assert_eq!(
            next_layer(Layer::Bottom, Foreground::Widget, true),
            Layer::Bottom
        );
    }

    #[test]
    fn tray_reveal_lasts_until_an_external_window_takes_focus() {
        assert_eq!(
            next_layer(Layer::Reveal, Foreground::Widget, true),
            Layer::Reveal
        );
        assert_eq!(
            next_layer(Layer::Reveal, Foreground::Other, true),
            Layer::Bottom
        );
        assert_eq!(
            next_layer(Layer::Reveal, Foreground::Desktop, true),
            Layer::Desktop
        );
    }

    #[test]
    fn transient_missing_foreground_does_not_cancel_current_placement() {
        for layer in [Layer::Bottom, Layer::Desktop, Layer::Reveal] {
            assert_eq!(next_layer(layer, Foreground::Unknown, true), layer);
        }
    }

    #[test]
    fn missing_shell_drops_desktop_topmost_state_but_keeps_explicit_tray_reveal() {
        assert_eq!(
            next_layer(Layer::Desktop, Foreground::Widget, false),
            Layer::Bottom
        );
        assert_eq!(
            next_layer(Layer::Desktop, Foreground::Unknown, false),
            Layer::Bottom
        );
        assert_eq!(
            next_layer(Layer::Bottom, Foreground::Desktop, false),
            Layer::Bottom
        );
        assert_eq!(
            next_layer(Layer::Reveal, Foreground::Widget, false),
            Layer::Reveal
        );
    }
}
