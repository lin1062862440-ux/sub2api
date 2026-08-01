use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[cfg(any(target_os = "macos", test))]
mod macos;

const POPOVER_LABEL: &str = "usage-popover";
const FLOATING_LABEL: &str = "usage-floating-window";
#[cfg(target_os = "macos")]
const POPOVER_WIDTH: f64 = 348.0;
#[cfg(target_os = "macos")]
const POPOVER_HEIGHT: f64 = 348.0;

#[derive(Clone, Copy)]
pub(super) enum PopoverAnchor {
    Main,
    Tray,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UsageSurface {
    MenuBar,
    FloatingWindow,
}

impl UsageSurface {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "menu-bar" => Ok(Self::MenuBar),
            "floating-window" => Ok(Self::FloatingWindow),
            _ => Err("未知的用量展示位置".to_string()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct HostTransition {
    show_menu_bar: bool,
    show_floating: bool,
    hide_popover: bool,
}

impl HostTransition {
    const fn new(show_menu_bar: bool, show_floating: bool, hide_popover: bool) -> Self {
        Self {
            show_menu_bar,
            show_floating,
            hide_popover,
        }
    }
}

fn surface_transition(enabled: bool, surface: UsageSurface) -> HostTransition {
    if !enabled {
        return HostTransition::new(false, false, true);
    }
    match surface {
        UsageSurface::MenuBar => HostTransition::new(true, false, true),
        UsageSurface::FloatingWindow => HostTransition::new(false, true, true),
    }
}

fn validate_appearance(value: &str) -> Result<(), String> {
    match value {
        "default" | "dark" | "blur" => Ok(()),
        _ => Err("未知的用量展示样式".to_string()),
    }
}

#[derive(Default)]
pub struct UsageDisplayHost {
    enabled: AtomicBool,
    active_surface: Mutex<Option<UsageSurface>>,
    #[cfg(target_os = "macos")]
    menu_bar: macos::MenuBarState,
    #[cfg(target_os = "macos")]
    floating: macos::FloatingWindowState,
}

pub(super) fn show_popover(app: &tauri::AppHandle, anchor: PopoverAnchor) -> Result<(), String> {
    let window = app
        .get_webview_window(POPOVER_LABEL)
        .ok_or_else(|| "用量弹窗尚未初始化".to_string())?;

    #[cfg(target_os = "macos")]
    macos::position_popover(app, &window, anchor)?;

    #[cfg(not(target_os = "macos"))]
    {
        let _ = anchor;
        window.center().map_err(|error| error.to_string())?;
    }

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn configure_usage_display(
    app: tauri::AppHandle,
    state: tauri::State<'_, UsageDisplayHost>,
    enabled: bool,
    surface: String,
    title: String,
    appearance: String,
) -> Result<(), String> {
    let surface = UsageSurface::parse(&surface)?;
    validate_appearance(&appearance)?;

    #[cfg(target_os = "macos")]
    {
        let transition = surface_transition(enabled, surface);
        state.enabled.store(enabled, Ordering::SeqCst);
        if transition.hide_popover {
            if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
                let _ = window.hide();
            }
        }
        macos::configure_menu_bar(&app, &state, transition.show_menu_bar, &title, &appearance)?;
        macos::configure_floating(&app, &state, transition.show_floating, &appearance)?;
        if let Ok(mut active) = state.active_surface.lock() {
            *active = enabled.then_some(surface);
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, title, surface, appearance);
        state.enabled.store(false, Ordering::SeqCst);
        if let Ok(mut active) = state.active_surface.lock() {
            *active = None;
        }
        Ok(())
    }
}

#[tauri::command]
pub fn set_usage_display_title(
    app: tauri::AppHandle,
    state: tauri::State<'_, UsageDisplayHost>,
    title: String,
) -> Result<(), String> {
    let active = state
        .active_surface
        .lock()
        .map(|value| *value)
        .unwrap_or(None);
    if active != Some(UsageSurface::MenuBar) {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    return macos::set_menu_bar_title(&app, &title);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, title);
        Ok(())
    }
}

#[tauri::command]
pub fn set_floating_usage_expanded(
    app: tauri::AppHandle,
    state: tauri::State<'_, UsageDisplayHost>,
    window: tauri::WebviewWindow,
    expanded: bool,
) -> Result<(), String> {
    if window.label() != FLOATING_LABEL {
        return Err("悬浮窗命令来源无效".to_string());
    }
    let active = state
        .active_surface
        .lock()
        .map(|value| *value)
        .unwrap_or(None);
    if active != Some(UsageSurface::FloatingWindow) {
        return Err("悬浮窗当前未启用".to_string());
    }

    #[cfg(target_os = "macos")]
    return macos::set_floating_expanded(&app, &state, expanded);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, expanded);
        Ok(())
    }
}

#[tauri::command]
pub fn start_floating_usage_drag(
    app: tauri::AppHandle,
    state: tauri::State<'_, UsageDisplayHost>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if window.label() != FLOATING_LABEL {
        return Err("悬浮窗命令来源无效".to_string());
    }
    let active = state
        .active_surface
        .lock()
        .map(|value| *value)
        .unwrap_or(None);
    if active != Some(UsageSurface::FloatingWindow) {
        return Err("悬浮窗当前未启用".to_string());
    }

    #[cfg(target_os = "macos")]
    return macos::start_floating_drag(&app);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn open_usage_display(app: tauri::AppHandle, anchor: String) -> Result<(), String> {
    let anchor = match anchor.as_str() {
        "main" => PopoverAnchor::Main,
        "tray" => PopoverAnchor::Tray,
        _ => return Err("未知的用量弹窗位置".to_string()),
    };
    show_popover(&app, anchor)
}

#[tauri::command]
pub fn hide_usage_display(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(POPOVER_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_usage_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不可用".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn quit_usage_display(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    setup_macos(app)
}

#[cfg(target_os = "macos")]
fn setup_macos(app: &mut tauri::App) -> tauri::Result<()> {
    let popover = WebviewWindowBuilder::new(
        app,
        POPOVER_LABEL,
        WebviewUrl::App("usage-popover.html".into()),
    )
    .title("LinAI 用量显示")
    .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()?;

    let floating = WebviewWindowBuilder::new(
        app,
        FLOATING_LABEL,
        WebviewUrl::App("usage-floating-window.html".into()),
    )
    .title("LinAI 用量悬浮窗")
    .inner_size(
        macos::floating_window::COLLAPSED_LOGICAL_SIZE,
        macos::floating_window::COLLAPSED_LOGICAL_SIZE,
    )
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()?;

    let popover_for_events = popover.clone();
    popover.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let _ = popover_for_events.hide();
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = popover_for_events.hide();
        }
        _ => {}
    });

    let floating_app = app.handle().clone();
    floating.on_window_event(move |event| match event {
        WindowEvent::Moved(position) => {
            let state = floating_app.state::<UsageDisplayHost>();
            macos::floating_moved(&floating_app, &state, *position);
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
        }
        _ => {}
    });

    if let Some(main) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        let main_for_events = main.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if app_handle
                    .state::<UsageDisplayHost>()
                    .enabled
                    .load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = main_for_events.hide();
                }
            }
        });
    }

    Ok(())
}

#[cfg(test)]
mod surface_tests {
    use super::*;

    #[test]
    fn usage_surface_transition_is_mutually_exclusive() {
        assert_eq!(
            surface_transition(false, UsageSurface::MenuBar),
            HostTransition::new(false, false, true),
        );
        assert_eq!(
            surface_transition(true, UsageSurface::MenuBar),
            HostTransition::new(true, false, true),
        );
        assert_eq!(
            surface_transition(true, UsageSurface::FloatingWindow),
            HostTransition::new(false, true, true),
        );
    }
}
