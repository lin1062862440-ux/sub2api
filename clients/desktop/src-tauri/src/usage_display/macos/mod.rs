pub(super) mod floating_window;
pub(super) mod menu_bar;

#[cfg(target_os = "windows")]
use tauri::window::{Color, Effect, EffectsBuilder};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::WebviewWindow;
#[cfg(target_os = "macos")]
use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WindowMaterialAction {
    Clear,
    ApplyVibrancy,
}

#[cfg(any(target_os = "macos", test))]
const fn window_material_action(appearance: super::Appearance) -> WindowMaterialAction {
    match appearance {
        super::Appearance::Native => WindowMaterialAction::ApplyVibrancy,
        _ => WindowMaterialAction::Clear,
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(super) fn apply_window_material(
    window: &WebviewWindow,
    appearance: super::Appearance,
    radius: f64,
) {
    #[cfg(target_os = "macos")]
    {
        let _ = window_vibrancy::clear_vibrancy(window);
        if window_material_action(appearance) == WindowMaterialAction::ApplyVibrancy {
            let _ = window_vibrancy::apply_vibrancy(
                window,
                NSVisualEffectMaterial::Popover,
                Some(NSVisualEffectState::Active),
                Some(radius),
            );
        }
    }
    #[cfg(target_os = "windows")]
    {
        let _ = radius;
        let effects = (appearance == super::Appearance::Native).then(|| {
            EffectsBuilder::new()
                .effect(Effect::Acrylic)
                .color(Color(246, 248, 250, 176))
                .build()
        });
        let _ = window.set_effects(effects);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_is_the_only_appearance_that_applies_vibrancy() {
        assert_eq!(
            window_material_action(super::super::Appearance::Native),
            WindowMaterialAction::ApplyVibrancy,
        );
        assert_eq!(
            window_material_action(super::super::Appearance::Sky),
            WindowMaterialAction::Clear,
        );
        assert_eq!(
            window_material_action(super::super::Appearance::Meadow),
            WindowMaterialAction::Clear,
        );
        assert_eq!(
            window_material_action(super::super::Appearance::Sunset),
            WindowMaterialAction::Clear,
        );
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(super) use floating_window::{
    configure as configure_floating, moved as floating_moved,
    set_expanded as set_floating_expanded, start_dragging as start_floating_drag,
    FloatingWindowState,
};
#[cfg(target_os = "windows")]
pub(super) use menu_bar::setup as setup_windows_tray;
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(super) use menu_bar::{
    configure as configure_menu_bar, position_popover, set_title as set_menu_bar_title,
    MenuBarState,
};
