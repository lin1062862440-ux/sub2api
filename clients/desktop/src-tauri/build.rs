fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "android-updater",
            tauri_build::InlinedPlugin::new()
                .commands(&[
                    "installed_version",
                    "download",
                    "cancel_download",
                    "validate_archive",
                    "request_install_permission",
                    "install",
                    "cleanup",
                ])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to prepare Tauri build")
}
