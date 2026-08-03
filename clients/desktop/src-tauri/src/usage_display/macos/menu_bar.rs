#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSColor, NSForegroundColorAttributeName};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSAttributedString, NSDictionary, NSString};

#[cfg(target_os = "windows")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use super::super::{show_popover, PopoverAnchor, UsageDisplayHost, POPOVER_LABEL};

#[cfg(any(target_os = "macos", target_os = "windows"))]
const TRAY_ID: &str = "usage-display";
#[cfg(target_os = "macos")]
const TRAY_AUTOSAVE_NAME: &str = "com.linai.desktop.usage-display";
#[cfg(target_os = "windows")]
const MENU_OPEN_USAGE: &str = "usage-display-open";
#[cfg(target_os = "windows")]
const MENU_OPEN_MAIN: &str = "usage-display-main";
#[cfg(target_os = "windows")]
const MENU_QUIT: &str = "usage-display-quit";
#[cfg(any(target_os = "macos", test))]
const RING_ICON_PIXELS: usize = 36;
#[cfg(any(target_os = "macos", test))]
const RING_SUPERSAMPLE: usize = 4;
#[cfg(any(target_os = "macos", test))]
const RING_OUTLINE_RGBA: [u8; 4] = [255, 255, 255, 64];
#[cfg(any(target_os = "macos", test))]
const RING_TRACK_RGBA: [u8; 4] = [255, 255, 255, 150];

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, PartialEq, Eq)]
enum TrayMetricIcon {
    WhiteMark,
    QuotaRing { percent: u8, color: (u8, u8, u8) },
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct NativeIconUpdate {
    is_template: bool,
    title_opacity: u8,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, PartialEq, Eq)]
struct TrayMetricPresentation {
    text: String,
    icon: TrayMetricIcon,
}

#[cfg(any(target_os = "macos", test))]
fn quota_metric_color(percent: u8) -> (u8, u8, u8) {
    match percent.min(100) {
        0..=59 => (67, 168, 112),
        60..=79 => (230, 145, 49),
        _ => (218, 75, 69),
    }
}

#[cfg(any(target_os = "macos", test))]
fn tray_metric_presentation(title: &str) -> TrayMetricPresentation {
    let trimmed = title.trim();
    let percentage = trimmed
        .strip_suffix('%')
        .and_then(|value| value.parse::<u8>().ok())
        .map(|value| value.min(100));
    match percentage {
        Some(percent) => TrayMetricPresentation {
            text: format!("{percent}%"),
            icon: TrayMetricIcon::QuotaRing {
                percent,
                color: quota_metric_color(percent),
            },
        },
        None => TrayMetricPresentation {
            text: trimmed.to_string(),
            icon: TrayMetricIcon::WhiteMark,
        },
    }
}

#[cfg(any(target_os = "macos", test))]
fn native_icon_update(icon: &TrayMetricIcon) -> NativeIconUpdate {
    match icon {
        TrayMetricIcon::WhiteMark => NativeIconUpdate {
            is_template: false,
            title_opacity: 210,
        },
        TrayMetricIcon::QuotaRing { .. } => NativeIconUpdate {
            is_template: false,
            title_opacity: 255,
        },
    }
}

#[cfg(any(target_os = "macos", test))]
fn quota_ring_rgba(percent: u8, color: (u8, u8, u8)) -> Vec<u8> {
    let percent = percent.min(100);
    let mut rgba = vec![0; RING_ICON_PIXELS * RING_ICON_PIXELS * 4];
    let center = RING_ICON_PIXELS as f64 / 2.0;
    let progress_angle = std::f64::consts::TAU * percent as f64 / 100.0;
    let sample_count = (RING_SUPERSAMPLE * RING_SUPERSAMPLE) as f64;

    // Supersampling keeps the 18-point native ring crisp on Retina and non-Retina displays.
    for y in 0..RING_ICON_PIXELS {
        for x in 0..RING_ICON_PIXELS {
            let mut outline_samples = 0_u8;
            let mut track_samples = 0_u8;
            let mut arc_samples = 0_u8;
            for sample_y in 0..RING_SUPERSAMPLE {
                for sample_x in 0..RING_SUPERSAMPLE {
                    let px = x as f64 + (sample_x as f64 + 0.5) / RING_SUPERSAMPLE as f64;
                    let py = y as f64 + (sample_y as f64 + 0.5) / RING_SUPERSAMPLE as f64;
                    let dx = px - center;
                    let dy = py - center;
                    let radius = dx.hypot(dy);
                    if (10.75..=16.25).contains(&radius) {
                        outline_samples += 1;
                    }
                    if !(11.5..=15.5).contains(&radius) {
                        continue;
                    }
                    track_samples += 1;
                    let mut angle = dy.atan2(dx) + std::f64::consts::FRAC_PI_2;
                    if angle < 0.0 {
                        angle += std::f64::consts::TAU;
                    }
                    if percent == 100 || (percent > 0 && angle <= progress_angle) {
                        arc_samples += 1;
                    }
                }
            }

            let offset = (y * RING_ICON_PIXELS + x) * 4;
            let write_pixel = |rgba: &mut [u8], source: [u8; 4], coverage: u8| {
                rgba[offset..offset + 4].copy_from_slice(&[
                    source[0],
                    source[1],
                    source[2],
                    (source[3] as f64 * coverage as f64 / sample_count).round() as u8,
                ]);
            };
            if outline_samples > 0 {
                write_pixel(&mut rgba, RING_OUTLINE_RGBA, outline_samples);
            }
            if track_samples > 0 {
                write_pixel(&mut rgba, RING_TRACK_RGBA, track_samples);
            }
            if arc_samples > 0 {
                write_pixel(&mut rgba, [color.0, color.1, color.2, 255], arc_samples);
            }
        }
    }
    rgba
}

#[cfg(test)]
fn pixel_at(rgba: &[u8], x: usize, y: usize) -> [u8; 4] {
    let offset = (y * RING_ICON_PIXELS + x) * 4;
    rgba[offset..offset + 4]
        .try_into()
        .expect("valid ring pixel")
}

#[cfg(test)]
fn pixel_rgb_at(rgba: &[u8], x: usize, y: usize) -> (u8, u8, u8) {
    let pixel = pixel_at(rgba, x, y);
    (pixel[0], pixel[1], pixel[2])
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[derive(Clone, Copy, Debug)]
struct TrayAnchor {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[derive(Default)]
pub(in crate::usage_display) struct MenuBarState {
    tray_anchor: Mutex<Option<TrayAnchor>>,
}

fn clamp_popover_position(
    anchor: (f64, f64, f64, f64),
    work_area: (f64, f64, f64, f64),
    popover: (f64, f64),
) -> (f64, f64) {
    const MARGIN: f64 = 8.0;
    const GAP: f64 = 4.0;
    let (anchor_x, anchor_y, anchor_width, anchor_height) = anchor;
    let (area_x, area_y, area_width, area_height) = work_area;
    let (popover_width, popover_height) = popover;
    let min_x = area_x + MARGIN;
    let max_x = area_x + area_width - popover_width - MARGIN;
    let min_y = area_y + MARGIN;
    let max_y = area_y + area_height - popover_height - MARGIN;
    let target_x = anchor_x + anchor_width / 2.0 - popover_width / 2.0;
    let target_y = anchor_y + anchor_height + GAP;
    (
        target_x.clamp(min_x, max_x.max(min_x)),
        target_y.clamp(min_y, max_y.max(min_y)),
    )
}

#[cfg(any(target_os = "windows", test))]
fn clamp_windows_tray_position(
    anchor: (f64, f64, f64, f64),
    work_area: (f64, f64, f64, f64),
    popover: (f64, f64),
) -> (f64, f64) {
    const MARGIN: f64 = 8.0;
    const GAP: f64 = 4.0;
    let (anchor_x, anchor_y, anchor_width, anchor_height) = anchor;
    let (area_x, area_y, area_width, area_height) = work_area;
    let (popover_width, popover_height) = popover;
    let area_right = area_x + area_width;
    let area_bottom = area_y + area_height;
    let centered_x = anchor_x + anchor_width / 2.0 - popover_width / 2.0;
    let centered_y = anchor_y + anchor_height / 2.0 - popover_height / 2.0;
    let (target_x, target_y) = if anchor_y >= area_bottom {
        (centered_x, anchor_y - popover_height - GAP)
    } else if anchor_y + anchor_height <= area_y {
        (centered_x, anchor_y + anchor_height + GAP)
    } else if anchor_x >= area_right {
        (anchor_x - popover_width - GAP, centered_y)
    } else if anchor_x + anchor_width <= area_x {
        (anchor_x + anchor_width + GAP, centered_y)
    } else {
        (centered_x, anchor_y - popover_height - GAP)
    };
    let min_x = area_x + MARGIN;
    let max_x = area_right - popover_width - MARGIN;
    let min_y = area_y + MARGIN;
    let max_y = area_bottom - popover_height - MARGIN;
    (
        target_x.clamp(min_x, max_x.max(min_x)),
        target_y.clamp(min_y, max_y.max(min_y)),
    )
}

#[cfg(target_os = "windows")]
fn tray_tooltip(title: &str) -> String {
    if title.trim().is_empty() {
        "LinAI 用量显示".to_string()
    } else {
        format!("LinAI · {title}")
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn monitor_work_area(monitor: &tauri::Monitor) -> (f64, f64, f64, f64) {
    let area = monitor.work_area();
    (
        area.position.x as f64,
        area.position.y as f64,
        area.size.width as f64,
        area.size.height as f64,
    )
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn set_physical_position(window: &WebviewWindow, position: (f64, f64)) -> Result<(), String> {
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.0.round() as i32,
            position.1.round() as i32,
        )))
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn tray_rect_values(rect: tauri::Rect) -> TrayAnchor {
    let (x, y) = match rect.position {
        Position::Physical(position) => (position.x as f64, position.y as f64),
        Position::Logical(position) => (position.x, position.y),
    };
    let (width, height) = match rect.size {
        Size::Physical(size) => (size.width as f64, size.height as f64),
        Size::Logical(size) => (size.width, size.height),
    };
    TrayAnchor {
        x,
        y,
        width,
        height,
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn position_under_tray(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    anchor: TrayAnchor,
) -> Result<(), String> {
    let center_x = anchor.x + anchor.width / 2.0;
    let center_y = anchor.y + anchor.height / 2.0;
    let monitor = app
        .monitor_from_point(center_x, center_y)
        .map_err(|error| error.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "无法确定菜单栏所在显示器".to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let anchor_rect = (anchor.x, anchor.y, anchor.width, anchor.height);
    let area = monitor_work_area(&monitor);
    let popover = (size.width as f64, size.height as f64);
    #[cfg(target_os = "macos")]
    let position = clamp_popover_position(anchor_rect, area, popover);
    #[cfg(target_os = "windows")]
    let position = clamp_windows_tray_position(anchor_rect, area, popover);
    set_physical_position(window, position)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn position_over_main(app: &tauri::AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let Some(main) = app.get_webview_window("main") else {
        return window.center().map_err(|error| error.to_string());
    };
    let main_position = main.outer_position().map_err(|error| error.to_string())?;
    let main_size = main.outer_size().map_err(|error| error.to_string())?;
    let popover_size = window.outer_size().map_err(|error| error.to_string())?;
    let center_x = main_position.x as f64 + main_size.width as f64 / 2.0;
    let center_y = main_position.y as f64 + main_size.height as f64 / 2.0;
    let monitor = app
        .monitor_from_point(center_x, center_y)
        .map_err(|error| error.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "无法确定主窗口所在显示器".to_string())?;
    let area = monitor_work_area(&monitor);
    let anchor = (center_x, center_y - 2.0, 0.0, 0.0);
    let mut position = clamp_popover_position(
        anchor,
        area,
        (popover_size.width as f64, popover_size.height as f64),
    );
    position.1 = (center_y - popover_size.height as f64 / 2.0).clamp(
        area.1 + 8.0,
        area.1 + area.3 - popover_size.height as f64 - 8.0,
    );
    set_physical_position(window, position)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(in crate::usage_display) fn position_popover(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    anchor: PopoverAnchor,
) -> Result<(), String> {
    match anchor {
        PopoverAnchor::Main => position_over_main(app, window),
        PopoverAnchor::Tray => {
            let state = app.state::<UsageDisplayHost>();
            let tray_anchor = *state
                .menu_bar
                .tray_anchor
                .lock()
                .map_err(|_| "菜单栏位置状态不可用".to_string())?;
            drop(state);
            match tray_anchor {
                Some(tray_anchor) => position_under_tray(app, window, tray_anchor),
                None => position_over_main(app, window),
            }
        }
    }
}

#[cfg(any(target_os = "macos", test))]
fn tray_white_rgba(source: &[u8]) -> Vec<u8> {
    debug_assert_eq!(source.len() % 4, 0);
    let mut white = Vec::with_capacity(source.len());
    for pixel in source.chunks_exact(4) {
        let coverage = 255_u16 - pixel[0].min(pixel[1]).min(pixel[2]) as u16;
        let alpha = (pixel[3] as u16 * coverage / 255) as u8;
        white.extend_from_slice(&[255, 255, 255, alpha]);
    }
    white
}

#[cfg(target_os = "macos")]
fn white_app_icon(app: &tauri::AppHandle) -> Result<tauri::image::Image<'static>, String> {
    let app_icon = app
        .default_window_icon()
        .ok_or_else(|| "应用图标不可用".to_string())?;
    Ok(tauri::image::Image::new_owned(
        tray_white_rgba(app_icon.rgba()),
        app_icon.width(),
        app_icon.height(),
    ))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn toggle_popover(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(POPOVER_LABEL)
        .ok_or_else(|| "用量浮窗尚未初始化".to_string())?;
    if window.is_visible().map_err(|error| error.to_string())? {
        return window.hide().map_err(|error| error.to_string());
    }
    show_popover(app, PopoverAnchor::Tray)
}

#[cfg(target_os = "macos")]
fn apply_native_metric(
    app: &tauri::AppHandle,
    tray: &tauri::tray::TrayIcon,
    title: &str,
) -> Result<(), String> {
    let presentation = tray_metric_presentation(title);
    let update = native_icon_update(&presentation.icon);
    let icon = match presentation.icon {
        TrayMetricIcon::WhiteMark => white_app_icon(app)?,
        TrayMetricIcon::QuotaRing { percent, color } => tauri::image::Image::new_owned(
            quota_ring_rgba(percent, color),
            RING_ICON_PIXELS as u32,
            RING_ICON_PIXELS as u32,
        ),
    };
    tray.set_icon_with_as_template(Some(icon), update.is_template)
        .map_err(|error| error.to_string())?;
    tray.set_title(Some(&presentation.text))
        .map_err(|error| error.to_string())?;
    tray.with_inner_tray_icon(move |inner| {
        let mtm =
            MainThreadMarker::new().ok_or_else(|| "状态栏更新必须在主线程执行".to_string())?;
        let status_item = inner
            .ns_status_item()
            .ok_or_else(|| "macOS 状态栏项目不可用".to_string())?;
        let autosave_name = NSString::from_str(TRAY_AUTOSAVE_NAME);
        status_item.setAutosaveName(Some(&autosave_name));
        let button = status_item
            .button(mtm)
            .ok_or_else(|| "macOS 状态栏按钮不可用".to_string())?;
        let color = NSColor::colorWithWhite_alpha(1.0, update.title_opacity as f64 / 255.0);
        let color_object = color.into_super().into_super();
        let title = NSString::from_str(&presentation.text);
        // SAFETY: AppKit initializes this exported key, and it accepts an NSColor value.
        let attributed_title = unsafe {
            let attributes = NSDictionary::from_retained_objects(
                &[NSForegroundColorAttributeName],
                &[color_object],
            );
            NSAttributedString::new_with_attributes(&title, &attributes)
        };
        button.setAttributedTitle(&attributed_title);
        Ok::<(), String>(())
    })
    .map_err(|error| error.to_string())?
}

#[cfg(target_os = "macos")]
fn build(app: &tauri::AppHandle, title: &str) -> Result<(), String> {
    let icon = white_app_icon(app)?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(false)
        .tooltip("LinAI 用量显示")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<UsageDisplayHost>();
                if let Ok(mut anchor) = state.menu_bar.tray_anchor.lock() {
                    *anchor = Some(tray_rect_values(rect));
                }
                drop(state);
                let _ = toggle_popover(app);
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;
    apply_native_metric(app, &tray, title)
}

#[cfg(target_os = "windows")]
fn build(app: &tauri::AppHandle, title: &str) -> Result<(), String> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| "应用图标不可用".to_string())?
        .clone();
    let open_usage = MenuItem::with_id(app, MENU_OPEN_USAGE, "打开用量", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let open_main = MenuItem::with_id(app, MENU_OPEN_MAIN, "打开主窗口", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出 LinAI", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&open_usage, &open_main, &separator, &quit])
        .map_err(|error| error.to_string())?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(tray_tooltip(title))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<UsageDisplayHost>();
                if let Ok(mut anchor) = state.menu_bar.tray_anchor.lock() {
                    *anchor = Some(tray_rect_values(rect));
                }
                drop(state);
                if button == MouseButton::Left {
                    let _ = toggle_popover(app);
                }
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_OPEN_USAGE => {
                let _ = show_popover(app, PopoverAnchor::Tray);
            }
            MENU_OPEN_MAIN => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .build(app)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
pub(in crate::usage_display) fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    build(app, "")
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(in crate::usage_display) fn configure(
    app: &tauri::AppHandle,
    _state: &UsageDisplayHost,
    enabled: bool,
    title: &str,
    appearance: super::super::Appearance,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    setup(app)?;

    if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
        let logical_size = super::super::popover_logical_size(appearance);
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                logical_size.0,
                logical_size.1,
            )))
            .map_err(|error| error.to_string())?;
        super::apply_window_material(&window, appearance, 23.0);
    }
    #[cfg(target_os = "macos")]
    if !enabled {
        let _ = app.remove_tray_by_id(TRAY_ID);
        if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
            let _ = window.hide();
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    if !enabled {
        if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
            let _ = window.hide();
        }
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        apply_native_metric(app, &tray, title)?;
        #[cfg(target_os = "windows")]
        tray.set_tooltip(Some(tray_tooltip(title)))
            .map_err(|error| error.to_string())?;
        tray.set_visible(true).map_err(|error| error.to_string())?;
        return Ok(());
    }
    build(app, title)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(in crate::usage_display) fn set_title(
    app: &tauri::AppHandle,
    title: &str,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        apply_native_metric(app, &tray, title)?;
        #[cfg(target_os = "windows")]
        tray.set_tooltip(Some(tray_tooltip(title)))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_display_converts_the_app_icon_to_a_white_mark() {
        let source = [
            255, 255, 255, 255, // opaque white background
            39, 90, 220, 255, // LinAI blue mark
            39, 90, 220, 0, // transparent source pixel
        ];

        let white = tray_white_rgba(&source);

        assert_eq!(&white[0..4], &[255, 255, 255, 0]);
        assert_eq!(&white[4..7], &[255, 255, 255]);
        assert!(white[7] > 0);
        assert_eq!(&white[8..12], &[255, 255, 255, 0]);
    }

    #[test]
    fn usage_display_clamps_below_a_right_edge_tray_item() {
        assert_eq!(
            clamp_popover_position(
                (1400.0, 24.0, 28.0, 22.0),
                (0.0, 0.0, 1440.0, 900.0),
                (360.0, 500.0),
            ),
            (1072.0, 50.0),
        );
    }

    #[test]
    fn usage_display_clamps_below_a_left_edge_tray_item() {
        assert_eq!(
            clamp_popover_position(
                (0.0, 24.0, 24.0, 22.0),
                (0.0, 0.0, 1440.0, 900.0),
                (360.0, 500.0),
            ),
            (8.0, 50.0),
        );
    }

    #[test]
    fn usage_display_supports_negative_monitor_coordinates() {
        assert_eq!(
            clamp_popover_position(
                (-920.0, 24.0, 24.0, 22.0),
                (-1280.0, 0.0, 1280.0, 800.0),
                (360.0, 500.0),
            ),
            (-1088.0, 50.0),
        );
    }

    #[test]
    fn usage_display_builds_balance_and_subscription_ring_presentations() {
        let balance = tray_metric_presentation("$128.60");
        assert_eq!(balance.text, "$128.60");
        assert_eq!(balance.icon, TrayMetricIcon::WhiteMark);

        let subscription = tray_metric_presentation("73%");
        assert_eq!(subscription.text, "73%");
        assert_eq!(
            subscription.icon,
            TrayMetricIcon::QuotaRing {
                percent: 73,
                color: quota_metric_color(73),
            }
        );
    }

    #[test]
    fn quota_ring_raster_distinguishes_empty_partial_and_full_progress() {
        let empty = quota_ring_rgba(0, quota_metric_color(0));
        let partial = quota_ring_rgba(45, quota_metric_color(45));
        let full = quota_ring_rgba(100, quota_metric_color(100));

        assert_eq!(empty.len(), RING_ICON_PIXELS * RING_ICON_PIXELS * 4);
        assert_eq!(pixel_rgb_at(&empty, 18, 3), (255, 255, 255));
        assert_eq!(pixel_rgb_at(&partial, 32, 18), quota_metric_color(45));
        assert_eq!(pixel_rgb_at(&partial, 3, 18), (255, 255, 255));
        assert_eq!(pixel_rgb_at(&full, 3, 18), quota_metric_color(100));
        assert_eq!(&RING_OUTLINE_RGBA[0..3], &[255, 255, 255]);
        assert_eq!(pixel_at(&full, 18, 18)[3], 0);
    }

    #[test]
    fn native_icon_update_keeps_both_sources_white_and_non_template() {
        let balance_presentation = tray_metric_presentation("$128.60");
        let balance = native_icon_update(&balance_presentation.icon);
        assert!(!balance.is_template);
        assert_eq!(balance.title_opacity, 210);

        let subscription_presentation = tray_metric_presentation("45%");
        let subscription = native_icon_update(&subscription_presentation.icon);
        assert!(!subscription.is_template);
        assert_eq!(subscription.title_opacity, 255);
    }

    #[test]
    fn usage_display_sets_an_attributed_title_for_white_menu_bar_text() {
        let implementation = include_str!("menu_bar.rs");
        let production_code = implementation
            .split("#[cfg(test)]\nmod tests")
            .next()
            .expect("production section");

        assert!(
            production_code.contains("button.setAttributedTitle("),
            "contentTintColor does not color an NSStatusBarButton's plain title"
        );
    }

    #[test]
    fn usage_display_colors_used_quota_from_green_to_orange_and_red() {
        let healthy = quota_metric_color(10);
        let warning = quota_metric_color(60);
        let danger = quota_metric_color(80);

        assert!(healthy.1 > healthy.0);
        assert!(warning.0 > warning.1 && warning.1 > warning.2);
        assert!(danger.0 > danger.1);
        assert_eq!(quota_metric_color(59), healthy);
        assert_eq!(quota_metric_color(79), warning);
        assert_eq!(quota_metric_color(100), danger);
    }

    #[test]
    fn windows_tray_popover_opens_above_a_bottom_taskbar() {
        assert_eq!(
            clamp_windows_tray_position(
                (1800.0, 1040.0, 24.0, 40.0),
                (0.0, 0.0, 1920.0, 1040.0),
                (352.0, 352.0),
            ),
            (1560.0, 680.0),
        );
    }

    #[test]
    fn windows_tray_popover_opens_inside_a_left_taskbar() {
        assert_eq!(
            clamp_windows_tray_position(
                (-80.0, 620.0, 80.0, 24.0),
                (0.0, 0.0, 1840.0, 1080.0),
                (352.0, 352.0),
            ),
            (8.0, 456.0),
        );
    }
}
