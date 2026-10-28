use crate::{
    commands::{self, NativeStore},
    desktop_widget,
    position::{self, Bounds, Point},
    storage::Store,
};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow, WindowEvent};

struct NormalWindowPosition(Mutex<Option<Point>>);

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = desktop_widget::reveal(&window) {
            report_native_error(&window, error);
        }
    }
}

fn clamped_position(
    window: &WebviewWindow,
    point: Point,
    logical_size: (u32, u32),
) -> tauri::Result<Point> {
    let monitors = window
        .available_monitors()?
        .into_iter()
        .map(|monitor| {
            let work = monitor.work_area();
            (
                Bounds {
                    x: work.position.x,
                    y: work.position.y,
                    width: work.size.width,
                    height: work.size.height,
                },
                monitor.scale_factor(),
            )
        })
        .collect::<Vec<_>>();
    Ok(position::clamp_logical(point, logical_size, &monitors))
}

fn clamp_current(window: &WebviewWindow, logical_size: (u32, u32)) -> tauri::Result<Point> {
    let current = window.outer_position()?;
    let point = Point {
        x: current.x,
        y: current.y,
    };
    let clamped = clamped_position(window, point, logical_size)?;
    if point != clamped {
        window.set_position(PhysicalPosition::new(clamped.x, clamped.y))?;
    }
    Ok(clamped)
}

fn track_normal_position(window: &WebviewWindow) -> Result<(), String> {
    let observed = position::normal_window_position(
        window.is_minimized().map_err(|error| error.to_string())?,
        || {
            // Moves and DPI changes can temporarily straddle two monitors or
            // their taskbar gaps. Observing must never reposition the window:
            // clamping each intermediate point traps a drag at that boundary.
            let current = window.outer_position().map_err(|error| error.to_string())?;
            Ok::<_, String>(Point {
                x: current.x,
                y: current.y,
            })
        },
    )?;
    if let Some(point) = observed {
        *window
            .state::<NormalWindowPosition>()
            .0
            .lock()
            .map_err(|_| "창 위치 메모리 잠금 오류입니다.".to_owned())? = Some(point);
    }
    Ok(())
}

#[tauri::command]
fn resize_widget(window: WebviewWindow, compact: bool) -> Result<(), String> {
    // Recover into a work area only for an explicit layout change. In
    // particular, expanding a 36px bar near the bottom must reveal all 380px.
    // This command does not change settings or save game data.
    let height = if compact { 36 } else { 380 };
    window
        .set_size(LogicalSize::new(280.0, f64::from(height)))
        .map_err(|error| error.to_string())?;
    // Use the requested logical size and destination DPI, not outer_size(),
    // which can still describe the previous layout while sizing is queued.
    clamp_current(&window, (280, height)).map_err(|error| error.to_string())?;
    track_normal_position(&window)
}

fn persist_position(window: &WebviewWindow) -> Result<(), String> {
    track_normal_position(window)?;
    let cached = *window
        .state::<NormalWindowPosition>()
        .0
        .lock()
        .map_err(|_| "창 위치 메모리 잠금 오류입니다.".to_owned())?;
    let Some(point) = cached else {
        return Ok(());
    };
    let store = window.state::<NativeStore>();
    let result = store
        .0
        .lock()
        .map_err(|_| "창 위치 저장 잠금 오류입니다.".to_owned())?
        .save_position(point);
    result
}

fn report_native_error(window: &WebviewWindow, error: String) {
    eprintln!("CornerBits: {error}");
    let _ = window.emit("native-error", error);
}

fn tray_image() -> tauri::image::Image<'static> {
    let mut pixels = vec![0u8; 16 * 16 * 4];
    for y in 3..13 {
        for x in 3..13 {
            if x < 6 || y > 9 {
                let offset = (y * 16 + x) * 4;
                pixels[offset..offset + 4].copy_from_slice(&[112, 112, 112, 255]);
            }
        }
    }
    tauri::image::Image::new_owned(pixels, 16, 16)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let store = Store::new(app.path().app_data_dir()?);
            let saved_position = store.load_position();
            let initial_settings = match store.inspect() {
                Ok(state) => state.map(|state| state.settings),
                Err(error) => {
                    // The frontend's state inspection presents recovery UI. Do
                    // not write defaults or hide a data failure by resetting it.
                    eprintln!("CornerBits initial state: {error}");
                    None
                }
            };
            app.manage(NativeStore(Mutex::new(store)));
            app.manage(NormalWindowPosition(Mutex::new(None)));
            let window = app
                .get_webview_window("main")
                .ok_or("main window missing")?;
            let height = if initial_settings
                .as_ref()
                .is_some_and(|settings| settings.compact)
            {
                36
            } else {
                380
            };
            window.set_size(LogicalSize::new(280.0, f64::from(height)))?;
            // alwaysOnTop remains in saved v1/v2 data for backup compatibility;
            // desktop widgets always use their desktop-layer placement policy.
            match saved_position {
                Ok(Some(point)) => {
                    let monitors = window
                        .available_monitors()?
                        .into_iter()
                        .map(|monitor| {
                            let work = monitor.work_area();
                            (
                                Bounds {
                                    x: work.position.x,
                                    y: work.position.y,
                                    width: work.size.width,
                                    height: work.size.height,
                                },
                                monitor.scale_factor(),
                            )
                        })
                        .collect::<Vec<_>>();
                    let point = position::clamp_logical(point, (280, height), &monitors);
                    window.set_position(PhysicalPosition::new(point.x, point.y))?;
                }
                Ok(None) => {}
                Err(error) => report_native_error(&window, error),
            }
            track_normal_position(&window).map_err(std::io::Error::other)?;
            desktop_widget::install(&window).map_err(std::io::Error::other)?;
            let show = MenuItem::with_id(app, "show", "위젯 찾기", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &exit])?;
            TrayIconBuilder::with_id("cornerbits")
                .icon(tray_image())
                .tooltip("CornerBits")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "exit" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if let Err(error) = persist_position(&window) {
                                report_native_error(&window, error);
                            }
                            // The frontend flushes its save queue, then destroys the last window.
                            // Tauri's default last-window behavior exits the process afterward.
                            let _ = window.emit("request-exit", ());
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            window.show()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            let Some(webview) = window.get_webview_window("main") else {
                return;
            };
            match event {
                WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. } => {
                    if let Err(error) = track_normal_position(&webview) {
                        report_native_error(&webview, error);
                    }
                }
                WindowEvent::CloseRequested { .. } => {
                    if let Err(error) = persist_position(&webview) {
                        report_native_error(&webview, error);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            resize_widget,
            commands::inspect_state,
            commands::load_state,
            commands::save_state,
            commands::export_backup,
            commands::read_backup,
            commands::restore_state
        ])
        .run(tauri::generate_context!())
        .expect("CornerBits를 실행하지 못했습니다.");
}
