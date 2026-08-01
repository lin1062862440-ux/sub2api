use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};

use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use tauri::{
    Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
};
#[cfg(target_os = "macos")]
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
use super::super::{FLOATING_LABEL, UsageDisplayHost};

pub(in crate::usage_display) const COLLAPSED_LOGICAL_SIZE: f64 = 72.0;
pub(in crate::usage_display) const EXPANDED_LOGICAL_SIZE: f64 = 336.0;
const EDGE_MARGIN_LOGICAL: f64 = 20.0;
const POSITION_KEY: &str = "usage_display:floating_position";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowPoint {
    x: i32,
    y: i32,
}

impl WindowPoint {
    const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowSize {
    width: u32,
    height: u32,
}

impl WindowSize {
    const fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowRect {
    point: WindowPoint,
    size: WindowSize,
}

impl WindowRect {
    const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            point: WindowPoint::new(x, y),
            size: WindowSize::new(width, height),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WorkArea {
    point: WindowPoint,
    size: WindowSize,
}

impl WorkArea {
    const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            point: WindowPoint::new(x, y),
            size: WindowSize::new(width, height),
        }
    }
}

fn clamp_to_work_area(point: WindowPoint, size: WindowSize, area: WorkArea) -> WindowPoint {
    let max_x = area.point.x + area.size.width as i32 - size.width as i32;
    let max_y = area.point.y + area.size.height as i32 - size.height as i32;
    WindowPoint::new(
        point.x.clamp(area.point.x, max_x.max(area.point.x)),
        point.y.clamp(area.point.y, max_y.max(area.point.y)),
    )
}

fn bottom_right(area: WorkArea, size: WindowSize, margin: i32) -> WindowPoint {
    clamp_to_work_area(
        WindowPoint::new(
            area.point.x + area.size.width as i32 - size.width as i32 - margin,
            area.point.y + area.size.height as i32 - size.height as i32 - margin,
        ),
        size,
        area,
    )
}

fn expand_from_anchor(collapsed: WindowRect, expanded: WindowSize, area: WorkArea) -> WindowPoint {
    let area_right = area.point.x + area.size.width as i32;
    let area_bottom = area.point.y + area.size.height as i32;
    let collapsed_right = collapsed.point.x + collapsed.size.width as i32;
    let collapsed_bottom = collapsed.point.y + collapsed.size.height as i32;
    let grow_left = collapsed.point.x + expanded.width as i32 > area_right;
    let grow_up = collapsed.point.y + expanded.height as i32 > area_bottom;
    let point = WindowPoint::new(
        if grow_left { collapsed_right - expanded.width as i32 } else { collapsed.point.x },
        if grow_up { collapsed_bottom - expanded.height as i32 } else { collapsed.point.y },
    );
    clamp_to_work_area(point, expanded, area)
}

#[derive(Default)]
pub(in crate::usage_display) struct FloatingWindowState {
    expanded: AtomicBool,
    collapsed_anchor: Mutex<Option<WindowPoint>>,
    expand_offset: Mutex<WindowPoint>,
    persist_generation: AtomicU64,
}

impl Default for WindowPoint {
    fn default() -> Self {
        Self::new(0, 0)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
struct FloatingPositionRecord {
    x: i32,
    y: i32,
    scale_factor: f64,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
}

#[cfg(target_os = "macos")]
fn physical_size(logical: f64, scale: f64) -> WindowSize {
    let value = (logical * scale).round().max(1.0) as u32;
    WindowSize::new(value, value)
}

#[cfg(target_os = "macos")]
fn work_area(monitor: &Monitor) -> WorkArea {
    let area = monitor.work_area();
    WorkArea::new(
        area.position.x,
        area.position.y,
        area.size.width,
        area.size.height,
    )
}

#[cfg(target_os = "macos")]
fn as_physical(point: WindowPoint) -> PhysicalPosition<i32> {
    PhysicalPosition::new(point.x, point.y)
}

#[cfg(target_os = "macos")]
fn monitor_for_point(app: &tauri::AppHandle, point: WindowPoint) -> Result<Monitor, String> {
    app.monitor_from_point(point.x as f64, point.y as f64)
        .map_err(|error| error.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "无法确定悬浮窗所在显示器".to_string())
}

#[cfg(target_os = "macos")]
fn default_monitor(app: &tauri::AppHandle) -> Result<Monitor, String> {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = main.current_monitor() {
            return Ok(monitor);
        }
    }
    app.primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "无法确定主显示器".to_string())
}

#[cfg(target_os = "macos")]
fn load_position(app: &tauri::AppHandle) -> Option<FloatingPositionRecord> {
    let store = app.store("linai.json").ok()?;
    serde_json::from_value(store.get(POSITION_KEY)?).ok()
}

#[cfg(target_os = "macos")]
fn persist_position(app: tauri::AppHandle, record: FloatingPositionRecord, generation: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let state = app.state::<UsageDisplayHost>();
        if state.floating.persist_generation.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Ok(store) = app.store("linai.json") {
            if let Ok(value) = serde_json::to_value(record) {
                store.set(POSITION_KEY, value);
                let _ = store.save();
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn restored_anchor(
    app: &tauri::AppHandle,
    record: FloatingPositionRecord,
    collapsed_size: WindowSize,
) -> Result<WindowPoint, String> {
    let old_center = WindowPoint::new(
        record.work_x + record.work_width as i32 / 2,
        record.work_y + record.work_height as i32 / 2,
    );
    let monitor = monitor_for_point(app, old_center).or_else(|_| default_monitor(app))?;
    let area = work_area(&monitor);
    let scale = monitor.scale_factor();
    let old_scale = if record.scale_factor.is_finite() && record.scale_factor > 0.0 {
        record.scale_factor
    } else {
        scale
    };
    let x = area.point.x + (((record.x - record.work_x) as f64 / old_scale) * scale).round() as i32;
    let y = area.point.y + (((record.y - record.work_y) as f64 / old_scale) * scale).round() as i32;
    Ok(clamp_to_work_area(WindowPoint::new(x, y), collapsed_size, area))
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn apply_appearance(window: &WebviewWindow, appearance: &str) {
    let _ = window_vibrancy::clear_vibrancy(window);
    if appearance == "blur" {
        if let Err(error) = window_vibrancy::apply_vibrancy(
            window,
            window_vibrancy::NSVisualEffectMaterial::Popover,
            Some(window_vibrancy::NSVisualEffectState::Active),
            Some(30.0),
        ) {
            log::warn!("failed to apply floating usage vibrancy: {error}");
        }
    }
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn configure(
    app: &tauri::AppHandle,
    state: &UsageDisplayHost,
    visible: bool,
    appearance: &str,
) -> Result<(), String> {
    let window = app
        .get_webview_window(FLOATING_LABEL)
        .ok_or_else(|| "用量悬浮窗尚未初始化".to_string())?;
    if !visible {
        state.floating.expanded.store(false, Ordering::SeqCst);
        return window.hide().map_err(|error| error.to_string());
    }

    apply_appearance(&window, appearance);
    let monitor = default_monitor(app)?;
    let scale = monitor.scale_factor();
    let size = physical_size(COLLAPSED_LOGICAL_SIZE, scale);
    let anchor = state
        .floating
        .collapsed_anchor
        .lock()
        .ok()
        .and_then(|value| *value)
        .or_else(|| load_position(app).and_then(|record| restored_anchor(app, record, size).ok()))
        .unwrap_or_else(|| {
            bottom_right(
                work_area(&monitor),
                size,
                (EDGE_MARGIN_LOGICAL * scale).round() as i32,
            )
        });
    if let Ok(mut value) = state.floating.collapsed_anchor.lock() {
        *value = Some(anchor);
    }
    state.floating.expanded.store(false, Ordering::SeqCst);
    window
        .set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Physical(as_physical(anchor)))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn set_expanded(
    app: &tauri::AppHandle,
    state: &UsageDisplayHost,
    expanded: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(FLOATING_LABEL)
        .ok_or_else(|| "用量悬浮窗尚未初始化".to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let collapsed_size = physical_size(COLLAPSED_LOGICAL_SIZE, scale);
    let expanded_size = physical_size(EXPANDED_LOGICAL_SIZE, scale);
    let current = window.outer_position().map_err(|error| error.to_string())?;

    if expanded {
        let anchor = state
            .floating
            .collapsed_anchor
            .lock()
            .ok()
            .and_then(|value| *value)
            .unwrap_or_else(|| WindowPoint::new(current.x, current.y));
        let monitor = monitor_for_point(app, anchor)?;
        let next = expand_from_anchor(
            WindowRect::new(anchor.x, anchor.y, collapsed_size.width, collapsed_size.height),
            expanded_size,
            work_area(&monitor),
        );
        if let Ok(mut value) = state.floating.expand_offset.lock() {
            *value = WindowPoint::new(anchor.x - next.x, anchor.y - next.y);
        }
        state.floating.expanded.store(true, Ordering::SeqCst);
        window
            .set_position(Position::Physical(as_physical(next)))
            .map_err(|error| error.to_string())?;
        window
            .set_size(Size::Physical(PhysicalSize::new(expanded_size.width, expanded_size.height)))
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let offset = state
        .floating
        .expand_offset
        .lock()
        .map(|value| *value)
        .unwrap_or_default();
    let candidate = WindowPoint::new(current.x + offset.x, current.y + offset.y);
    let monitor = monitor_for_point(app, candidate)?;
    let anchor = clamp_to_work_area(candidate, collapsed_size, work_area(&monitor));
    if let Ok(mut value) = state.floating.collapsed_anchor.lock() {
        *value = Some(anchor);
    }
    window
        .set_size(Size::Physical(PhysicalSize::new(collapsed_size.width, collapsed_size.height)))
        .map_err(|error| error.to_string())?;
    state.floating.expanded.store(false, Ordering::SeqCst);
    window
        .set_position(Position::Physical(as_physical(anchor)))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn start_dragging(app: &tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window(FLOATING_LABEL)
        .ok_or_else(|| "用量悬浮窗尚未初始化".to_string())?
        .start_dragging()
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub(in crate::usage_display) fn moved(
    app: &tauri::AppHandle,
    state: &UsageDisplayHost,
    position: PhysicalPosition<i32>,
) {
    if state.floating.expanded.load(Ordering::SeqCst) {
        return;
    }
    let point = WindowPoint::new(position.x, position.y);
    if let Ok(mut value) = state.floating.collapsed_anchor.lock() {
        *value = Some(point);
    }
    let Ok(monitor) = monitor_for_point(app, point) else {
        return;
    };
    let area = work_area(&monitor);
    let record = FloatingPositionRecord {
        x: point.x,
        y: point.y,
        scale_factor: monitor.scale_factor(),
        work_x: area.point.x,
        work_y: area.point.y,
        work_width: area.size.width,
        work_height: area.size.height,
    };
    let generation = state
        .floating
        .persist_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    persist_position(app.clone(), record, generation);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floating_usage_starts_at_the_bottom_right() {
        assert_eq!(
            bottom_right(
                WorkArea::new(0, 0, 1440, 900),
                WindowSize::new(72, 72),
                20,
            ),
            WindowPoint::new(1348, 808),
        );
    }

    #[test]
    fn floating_usage_expands_up_and_left_from_the_bottom_right() {
        assert_eq!(
            expand_from_anchor(
                WindowRect::new(1348, 808, 72, 72),
                WindowSize::new(336, 336),
                WorkArea::new(0, 0, 1440, 900),
            ),
            WindowPoint::new(1084, 544),
        );
    }

    #[test]
    fn floating_usage_clamps_on_negative_coordinate_monitors() {
        assert_eq!(
            clamp_to_work_area(
                WindowPoint::new(-1400, 720),
                WindowSize::new(72, 72),
                WorkArea::new(-1280, 0, 1280, 800),
            ),
            WindowPoint::new(-1280, 720),
        );
    }
}
