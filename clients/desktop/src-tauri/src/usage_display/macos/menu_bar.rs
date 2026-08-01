#[cfg(target_os = "macos")]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

#[cfg(target_os = "macos")]
use super::super::{show_popover, PopoverAnchor, UsageDisplayHost, POPOVER_LABEL};

#[cfg(target_os = "macos")]
const TRAY_ID: &str = "usage-display";

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, Debug)]
struct TrayAnchor {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
fn monitor_work_area(monitor: &tauri::Monitor) -> (f64, f64, f64, f64) {
    let area = monitor.work_area();
    (
        area.position.x as f64,
        area.position.y as f64,
        area.size.width as f64,
        area.size.height as f64,
    )
}

#[cfg(target_os = "macos")]
fn set_physical_position(window: &WebviewWindow, position: (f64, f64)) -> Result<(), String> {
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.0.round() as i32,
            position.1.round() as i32,
        )))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
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
    let position = clamp_popover_position(
        (anchor.x, anchor.y, anchor.width, anchor.height),
        monitor_work_area(&monitor),
        (size.width as f64, size.height as f64),
    );
    set_physical_position(window, position)
}

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
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
fn tray_template_rgba(source: &[u8]) -> Vec<u8> {
    debug_assert_eq!(source.len() % 4, 0);
    let mut template = Vec::with_capacity(source.len());
    for pixel in source.chunks_exact(4) {
        let coverage = 255_u16 - pixel[0].min(pixel[1]).min(pixel[2]) as u16;
        let alpha = (pixel[3] as u16 * coverage / 255) as u8;
        template.extend_from_slice(&[0, 0, 0, alpha]);
    }
    template
}

#[cfg(target_os = "macos")]
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
fn build(app: &tauri::AppHandle, title: &str) -> Result<(), String> {
    let app_icon = app
        .default_window_icon()
        .ok_or_else(|| "应用图标不可用".to_string())?;
    let icon = tauri::image::Image::new_owned(
        tray_template_rgba(app_icon.rgba()),
        app_icon.width(),
        app_icon.height(),
    );
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .title(title)
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
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn configure(
    app: &tauri::AppHandle,
    _state: &UsageDisplayHost,
    enabled: bool,
    title: &str,
    appearance: &str,
) -> Result<(), String> {
    if !enabled {
        let _ = app.remove_tray_by_id(TRAY_ID);
        if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
            let _ = window.hide();
        }
        return Ok(());
    }
    if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
        super::floating_window::apply_appearance(&window, appearance);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_title(Some(title))
            .map_err(|error| error.to_string())?;
        tray.set_visible(true).map_err(|error| error.to_string())?;
        return Ok(());
    }
    build(app, title)
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn set_title(
    app: &tauri::AppHandle,
    title: &str,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_title(Some(title))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_display_converts_the_app_icon_to_a_macos_template_mask() {
        let source = [
            255, 255, 255, 255, // opaque white background
            39, 90, 220, 255, // LinAI blue mark
            39, 90, 220, 0, // transparent source pixel
        ];

        let template = tray_template_rgba(&source);

        assert_eq!(&template[0..4], &[0, 0, 0, 0]);
        assert_eq!(&template[4..7], &[0, 0, 0]);
        assert!(template[7] > 0);
        assert_eq!(&template[8..12], &[0, 0, 0, 0]);
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
}
