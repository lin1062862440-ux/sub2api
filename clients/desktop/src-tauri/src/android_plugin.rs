use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

const PLUGIN_IDENTIFIER: &str = "ai.lin.android.updater";

pub struct AndroidUpdater<R: Runtime>(PluginHandle<R>);

#[derive(Debug, Serialize)]
pub struct NativeError {
    code: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledVersion {
    version: String,
    version_code: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DownloadResult {
    path: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ArchiveValidation {
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadPayload {
    version: String,
    url: String,
    bytes: u64,
    on_progress: Channel<DownloadProgress>,
}

#[derive(Serialize)]
struct PathPayload {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupPayload {
    retained_version: Option<String>,
}

fn map_native_error(error: PluginInvokeError) -> NativeError {
    let code = match error {
        PluginInvokeError::InvokeRejected(response) => response
            .code
            .filter(|code| ALLOWED_ERROR_CODES.contains(&code.as_str()))
            .unwrap_or_else(|| "native_error".to_string()),
        _ => "native_error".to_string(),
    };
    NativeError { code }
}

#[tauri::command]
async fn installed_version<R: Runtime>(app: AppHandle<R>) -> Result<InstalledVersion, NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("installedVersion", ())
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn download<R: Runtime>(
    app: AppHandle<R>,
    version: String,
    url: String,
    bytes: u64,
    on_progress: Channel<DownloadProgress>,
) -> Result<DownloadResult, NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async(
            "download",
            DownloadPayload {
                version,
                url,
                bytes,
                on_progress,
            },
        )
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn cancel_download<R: Runtime>(app: AppHandle<R>) -> Result<(), NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("cancelDownload", ())
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn validate_archive<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<ArchiveValidation, NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("validateArchive", PathPayload { path })
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn request_install_permission<R: Runtime>(app: AppHandle<R>) -> Result<(), NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("requestInstallPermission", ())
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn install<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("install", PathPayload { path })
        .await
        .map_err(map_native_error)
}

#[tauri::command]
async fn cleanup<R: Runtime>(
    app: AppHandle<R>,
    retained_version: Option<String>,
) -> Result<(), NativeError> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("cleanup", CleanupPayload { retained_version })
        .await
        .map_err(map_native_error)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-updater")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "AndroidUpdaterPlugin")?;
            app.manage(AndroidUpdater(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            installed_version,
            download,
            cancel_download,
            validate_archive,
            request_install_permission,
            install,
            cleanup,
        ])
        .build()
}

const ALLOWED_ERROR_CODES: &[&str] = &[
    "cancelled",
    "certificate_mismatch",
    "download_busy",
    "download_failed",
    "installer_unavailable",
    "invalid_download",
    "missing_file",
    "native_error",
    "package_info_unavailable",
    "package_name_mismatch",
    "permission_required",
    "permission_settings_unavailable",
    "size_mismatch",
    "storage_full",
    "storage_unavailable",
    "unsafe_path",
    "verification_expired",
    "version_code_mismatch",
];
