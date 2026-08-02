pub(super) mod floating_window;
pub(super) mod menu_bar;

#[cfg(target_os = "macos")]
use tauri::WebviewWindow;
#[cfg(target_os = "macos")]
use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WindowMaterialAction {
    Clear,
    ApplyVibrancy,
}

const fn window_material_action(appearance: super::Appearance) -> WindowMaterialAction {
    match appearance {
        super::Appearance::Native => WindowMaterialAction::ApplyVibrancy,
        _ => WindowMaterialAction::Clear,
    }
}

#[cfg(target_os = "macos")]
pub(super) fn apply_window_material(
    window: &WebviewWindow,
    appearance: super::Appearance,
    radius: f64,
) {
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

#[cfg(target_os = "macos")]
pub(super) use floating_window::{
    configure as configure_floating, moved as floating_moved,
    set_expanded as set_floating_expanded, start_dragging as start_floating_drag,
    FloatingWindowState,
};
#[cfg(target_os = "macos")]
pub(super) use menu_bar::{
    configure as configure_menu_bar, position_popover, set_title as set_menu_bar_title,
    MenuBarState,
};
