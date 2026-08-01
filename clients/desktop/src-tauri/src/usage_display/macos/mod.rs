pub(super) mod floating_window;
pub(super) mod menu_bar;

#[cfg(target_os = "macos")]
pub(super) use floating_window::{
    configure as configure_floating,
    moved as floating_moved,
    set_expanded as set_floating_expanded,
    start_dragging as start_floating_drag,
    FloatingWindowState,
};
#[cfg(target_os = "macos")]
pub(super) use menu_bar::{
    configure as configure_menu_bar,
    position_popover,
    set_title as set_menu_bar_title,
    MenuBarState,
};
