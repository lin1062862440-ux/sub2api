#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fs2::available_space;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Component, Path, PathBuf, Prefix},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::{Builder as TempBuilder, NamedTempFile, TempPath};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND},
};
#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/linai-payload.exe"));
const PAYLOAD_SHA256: &str = env!("LINAI_PAYLOAD_SHA256");
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const STORE_KEY: &str = "usage_display:installer-default";
const STARTUP_VALUE_NAME: &str = "LinAI";

#[cfg(windows)]
static DUPLICATE_NOTICE_VISIBLE: AtomicBool = AtomicBool::new(false);

struct InstallState {
    running: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallerEnvironment {
    default_install_dir: String,
    required_bytes: u64,
    available_bytes: Option<u64>,
    payload_ready: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskSpaceInfo {
    available_bytes: Option<u64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallRequest {
    install_dir: String,
    launch_at_startup: bool,
    floating_status: bool,
    desktop_shortcut: bool,
}

#[derive(Clone, Serialize)]
struct InstallProgress<'a> {
    percent: u8,
    phase: &'a str,
    message: String,
}

#[tauri::command]
fn installer_environment() -> InstallerEnvironment {
    let install_dir = default_install_dir();
    InstallerEnvironment {
        available_bytes: disk_space_for(&install_dir),
        default_install_dir: install_dir.to_string_lossy().into_owned(),
        required_bytes: required_install_bytes(),
        payload_ready: !PAYLOAD.is_empty(),
    }
}

#[tauri::command]
fn choose_install_directory(initial_path: String) -> Option<String> {
    let initial = nearest_existing_directory(Path::new(&initial_path));
    let mut dialog = rfd::FileDialog::new().set_title("选择 LinAI 安装位置");
    if let Some(path) = initial {
        dialog = dialog.set_directory(path);
    }
    dialog.pick_folder().map(|path| {
        ensure_product_directory(&path)
            .to_string_lossy()
            .into_owned()
    })
}

#[tauri::command]
fn inspect_install_directory(path: String) -> Result<DiskSpaceInfo, String> {
    let path = validate_install_dir(&path)?;
    Ok(DiskSpaceInfo {
        available_bytes: disk_space_for(&path),
    })
}

#[tauri::command]
async fn start_installation(
    app: AppHandle,
    state: State<'_, InstallState>,
    request: InstallRequest,
) -> Result<(), String> {
    state
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "安装任务已经在运行".to_string())?;

    let worker_app = app.clone();
    let worker_result =
        tauri::async_runtime::spawn_blocking(move || run_installation(&worker_app, request)).await;

    app.state::<InstallState>()
        .running
        .store(false, Ordering::Release);
    match worker_result {
        Ok(result) => result,
        Err(error) => Err(format!("安装任务意外结束: {error}")),
    }
}

#[tauri::command]
fn launch_installed_app(app: AppHandle, install_dir: String) -> Result<(), String> {
    let install_dir = validate_install_dir(&install_dir)?;
    let executable = find_installed_executable(&install_dir)
        .ok_or_else(|| "未找到已安装的 LinAI.exe".to_string())?;
    Command::new(executable)
        .spawn()
        .map_err(|error| format!("无法启动 LinAI: {error}"))?;
    app.exit(0);
    Ok(())
}

fn run_installation(app: &AppHandle, request: InstallRequest) -> Result<(), String> {
    if PAYLOAD.is_empty() {
        return Err("安装载荷尚未嵌入，请重新生成正式安装包".to_string());
    }

    let install_dir = validate_install_dir(&request.install_dir)?;
    ensure_space(&install_dir)?;
    emit_progress(app, 20, "verify", "正在校验安装文件")?;
    verify_payload()?;

    let payload_path = stage_payload(PAYLOAD)?;

    emit_progress(
        app,
        24,
        "copy",
        format!("正在复制文件到 {}", install_dir.display()),
    )?;
    run_nsis_payload(app, payload_path.as_ref(), &install_dir)?;

    let executable = find_installed_executable(&install_dir).ok_or_else(|| {
        format!(
            "安装程序已结束，但在 {} 中未找到 LinAI.exe",
            install_dir.display()
        )
    })?;

    emit_progress(app, 88, "configure", "正在写入你的配置")?;
    write_installer_defaults(request.floating_status)?;
    configure_startup(&executable, request.launch_at_startup)?;
    configure_start_menu_shortcut(&executable)?;
    configure_desktop_shortcut(&executable, request.desktop_shortcut)?;

    emit_progress(app, 97, "complete", "正在完成最后步骤")?;
    thread::sleep(Duration::from_millis(260));
    emit_progress(app, 100, "complete", "安装完成，可以立即启动")
}

fn stage_payload(payload: &[u8]) -> Result<TempPath, String> {
    let mut payload_file = TempBuilder::new()
        .prefix("LinAI-Payload-")
        .suffix(".exe")
        .tempfile()
        .map_err(|error| format!("无法创建临时安装文件: {error}"))?;
    payload_file
        .write_all(payload)
        .and_then(|_| payload_file.as_file().sync_all())
        .map_err(|error| format!("无法释放安装文件: {error}"))?;
    Ok(payload_file.into_temp_path())
}

fn run_nsis_payload(app: &AppHandle, payload: &Path, install_dir: &Path) -> Result<(), String> {
    let destination_arg = format!("/D={}", install_dir.display());
    let mut command = Command::new(payload);
    command.arg("/S").arg("/NS");
    #[cfg(windows)]
    command
        .raw_arg(destination_arg)
        .creation_flags(CREATE_NO_WINDOW);
    #[cfg(not(windows))]
    command.arg(destination_arg);

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动正式安装程序: {error}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                return Err(format!(
                    "正式安装程序返回错误代码 {}",
                    status
                        .code()
                        .map_or_else(|| "未知".to_string(), |code| code.to_string())
                ));
            }
            Ok(None) => {
                let elapsed = started.elapsed().as_secs_f32();
                let percent = (25.0 + elapsed * 2.1).min(84.0) as u8;
                emit_progress(
                    app,
                    percent,
                    "copy",
                    format!("正在复制文件到 {}", install_dir.display()),
                )?;
                thread::sleep(Duration::from_millis(240));
            }
            Err(error) => return Err(format!("无法读取安装程序状态: {error}")),
        }
    }
}

fn verify_payload() -> Result<(), String> {
    let actual = hex::encode(Sha256::digest(PAYLOAD));
    if actual == PAYLOAD_SHA256 {
        Ok(())
    } else {
        Err("安装文件校验失败，请重新下载安装包".to_string())
    }
}

fn validate_install_dir(value: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("请选择安装目录".to_string());
    }
    if trimmed != value {
        return Err("安装目录首尾不能包含空格".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("安装目录必须是绝对路径".to_string());
    }
    let mut path_components = path.components();
    if !matches!(
        path_components.next(),
        Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::Disk(_))
    ) || !matches!(path_components.next(), Some(Component::RootDir))
    {
        return Err("安装目录必须位于本机磁盘中".to_string());
    }

    let mut has_directory_name = false;
    for component in path.components() {
        match component {
            Component::ParentDir | Component::CurDir => {
                return Err("安装目录不能包含 . 或 ..".to_string())
            }
            Component::Normal(part) => {
                has_directory_name = true;
                let part = part.to_string_lossy();
                if part.ends_with(' ')
                    || part.ends_with('.')
                    || part.chars().any(is_invalid_path_char)
                    || is_reserved_windows_name(&part)
                {
                    return Err("安装目录包含 Windows 不支持的字符".to_string());
                }
            }
            _ => {}
        }
    }
    if !has_directory_name {
        return Err("不能直接安装到磁盘根目录".to_string());
    }
    Ok(path)
}

fn is_invalid_path_char(character: char) -> bool {
    character.is_control() || matches!(character, '"' | '<' | '>' | '|' | '?' | '*' | ':')
}

fn is_reserved_windows_name(value: &str) -> bool {
    let base = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || base.strip_prefix("COM").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
        || base.strip_prefix("LPT").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
}

fn nearest_existing_directory(path: &Path) -> Option<PathBuf> {
    let mut candidate = path.to_path_buf();
    loop {
        if candidate.is_dir() {
            return Some(candidate);
        }
        if !candidate.pop() {
            return None;
        }
    }
}

fn disk_space_for(path: &Path) -> Option<u64> {
    nearest_existing_directory(path).and_then(|directory| available_space(directory).ok())
}

fn ensure_space(path: &Path) -> Result<(), String> {
    if let Some(available) = disk_space_for(path) {
        if available < required_install_bytes() {
            return Err(format!(
                "安装磁盘空间不足，至少需要 {} MB",
                required_install_bytes().div_ceil(1024 * 1024)
            ));
        }
    }
    Ok(())
}

fn required_install_bytes() -> u64 {
    let payload_size = env!("LINAI_PAYLOAD_SIZE").parse::<u64>().unwrap_or(0);
    payload_size
        .saturating_mul(3)
        .saturating_add(128 * 1024 * 1024)
}

fn default_install_dir() -> PathBuf {
    std::env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
        .join("LinAI")
}

fn ensure_product_directory(path: &Path) -> PathBuf {
    if path
        .file_name()
        .is_some_and(|name| name.eq_ignore_ascii_case("LinAI"))
    {
        path.to_path_buf()
    } else {
        path.join("LinAI")
    }
}

fn find_installed_executable(install_dir: &Path) -> Option<PathBuf> {
    ["LinAI.exe", "linai-desktop.exe"]
        .into_iter()
        .map(|name| install_dir.join(name))
        .find(|path| path.is_file())
}

fn emit_progress(
    app: &AppHandle,
    percent: u8,
    phase: &'static str,
    message: impl Into<String>,
) -> Result<(), String> {
    app.emit(
        "installer://progress",
        InstallProgress {
            percent,
            phase,
            message: message.into(),
        },
    )
    .map_err(|error| format!("无法更新安装进度: {error}"))
}

fn write_installer_defaults(floating_status: bool) -> Result<(), String> {
    let config_root = dirs::config_dir().ok_or_else(|| "无法定位用户配置目录".to_string())?;
    let app_dir = config_root.join("ai.lin.desktop");
    fs::create_dir_all(&app_dir).map_err(|error| format!("无法创建用户配置目录: {error}"))?;
    let store_path = app_dir.join("linai.json");

    let mut root = if store_path.exists() {
        let file =
            File::open(&store_path).map_err(|error| format!("无法读取现有用户配置: {error}"))?;
        let value: Value = serde_json::from_reader(file)
            .map_err(|error| format!("现有用户配置格式无效，已停止写入: {error}"))?;
        value
            .as_object()
            .cloned()
            .ok_or_else(|| "现有用户配置不是 JSON 对象，已停止写入".to_string())?
    } else {
        Map::new()
    };

    root.insert(
        STORE_KEY.to_string(),
        json!({
            "enabled": floating_status,
            "source": "balance",
            "subscriptionId": null,
            "surface": "floating-window",
            "appearance": "sky",
            "floatingStyle": "orb"
        }),
    );

    let mut temporary = NamedTempFile::new_in(&app_dir)
        .map_err(|error| format!("无法创建临时配置文件: {error}"))?;
    serde_json::to_writer_pretty(&mut temporary, &root)
        .map_err(|error| format!("无法序列化用户配置: {error}"))?;
    temporary
        .write_all(b"\n")
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("无法保存用户配置: {error}"))?;
    temporary
        .persist(&store_path)
        .map_err(|error| format!("无法替换用户配置: {}", error.error))?;
    Ok(())
}

#[cfg(windows)]
fn configure_startup(executable: &Path, enabled: bool) -> Result<(), String> {
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = current_user
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|error| format!("无法打开开机启动配置: {error}"))?;
    if enabled {
        if !executable.is_file() {
            return Err(format!("无法设置开机启动，未找到 {}", executable.display()));
        }
        let command = startup_command(executable);
        run_key
            .set_value(STARTUP_VALUE_NAME, &command)
            .map_err(|error| format!("无法设置开机启动: {error}"))?;
        let configured: String = run_key
            .get_value(STARTUP_VALUE_NAME)
            .map_err(|error| format!("无法验证开机启动配置: {error}"))?;
        if configured == command {
            Ok(())
        } else {
            Err("开机启动配置验证失败".to_string())
        }
    } else {
        match run_key.delete_value(STARTUP_VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("无法清除开机启动: {error}")),
        }
    }
}

fn startup_command(executable: &Path) -> String {
    format!("\"{}\"", executable.display())
}

#[cfg(not(windows))]
fn configure_startup(_executable: &Path, _enabled: bool) -> Result<(), String> {
    Ok(())
}

fn configure_desktop_shortcut(executable: &Path, enabled: bool) -> Result<(), String> {
    let desktop = dirs::desktop_dir().ok_or_else(|| "无法定位桌面目录".to_string())?;
    let shortcut = desktop.join("LinAI.lnk");
    if !enabled {
        return match fs::remove_file(shortcut) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("无法删除桌面快捷方式: {error}")),
        };
    }
    create_shell_shortcut(executable, &shortcut, "桌面")
}

fn configure_start_menu_shortcut(executable: &Path) -> Result<(), String> {
    let data_dir = dirs::data_dir().ok_or_else(|| "无法定位开始菜单目录".to_string())?;
    let programs = data_dir.join(r"Microsoft\Windows\Start Menu\Programs");
    fs::create_dir_all(&programs).map_err(|error| format!("无法创建开始菜单目录: {error}"))?;
    create_shell_shortcut(executable, &programs.join("LinAI.lnk"), "开始菜单")
}

fn create_shell_shortcut(executable: &Path, shortcut: &Path, location: &str) -> Result<(), String> {
    let script = concat!(
        "$ErrorActionPreference='Stop';",
        "$shell=New-Object -ComObject WScript.Shell;",
        "$link=$shell.CreateShortcut($env:LINAI_SHORTCUT_PATH);",
        "$link.TargetPath=$env:LINAI_SHORTCUT_TARGET;",
        "$link.WorkingDirectory=[IO.Path]::GetDirectoryName($env:LINAI_SHORTCUT_TARGET);",
        "$link.IconLocation=$env:LINAI_SHORTCUT_TARGET + ',0';",
        "$link.Save();"
    );
    let powershell = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    if !powershell.is_file() {
        return Err(format!(
            "无法找到系统 PowerShell，不能创建{location}快捷方式"
        ));
    }
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .env("LINAI_SHORTCUT_TARGET", executable)
        .env("LINAI_SHORTCUT_PATH", shortcut);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let status = command
        .status()
        .map_err(|error| format!("无法创建{location}快捷方式: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "创建{location}快捷方式失败，错误代码 {}",
            status
                .code()
                .map_or_else(|| "未知".to_string(), |code| code.to_string())
        ))
    }
}

#[cfg(windows)]
fn show_already_running_notice(owner: HWND) {
    if DUPLICATE_NOTICE_VISIBLE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    let owner_address = owner as usize;
    thread::spawn(move || {
        use std::iter;

        let owner = owner_address as HWND;
        let message: Vec<u16> = "LinAI 安装程序已在运行。\r\n请在已打开的安装窗口中继续。"
            .encode_utf16()
            .chain(iter::once(0))
            .collect();
        let title: Vec<u16> = "LinAI Setup".encode_utf16().chain(iter::once(0)).collect();
        unsafe {
            MessageBoxW(
                owner,
                message.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND,
            );
        }
        DUPLICATE_NOTICE_VISIBLE.store(false, Ordering::Release);
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
                #[cfg(windows)]
                if let Ok(owner) = window.hwnd() {
                    show_already_running_notice(owner.0);
                }
            }
        }))
        .manage(InstallState {
            running: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            installer_environment,
            choose_install_directory,
            inspect_install_directory,
            start_installation,
            launch_installed_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running LinAI installer");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn staged_payload_releases_its_file_handle() {
        use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};

        let payload_path = stage_payload(b"test payload").unwrap();
        OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&payload_path)
            .expect("staged payload should be available for exclusive execution");
    }

    #[test]
    fn finds_the_branded_installed_executable_first() {
        let directory = tempfile::tempdir().unwrap();
        File::create(directory.path().join("linai-desktop.exe")).unwrap();
        File::create(directory.path().join("LinAI.exe")).unwrap();

        assert_eq!(
            find_installed_executable(directory.path()),
            Some(directory.path().join("LinAI.exe"))
        );
    }

    #[test]
    fn accepts_the_legacy_installed_executable_name() {
        let directory = tempfile::tempdir().unwrap();
        File::create(directory.path().join("linai-desktop.exe")).unwrap();

        assert_eq!(
            find_installed_executable(directory.path()),
            Some(directory.path().join("linai-desktop.exe"))
        );
    }

    #[test]
    fn quotes_the_startup_executable_path() {
        assert_eq!(
            startup_command(Path::new(r"C:\Program Files\LinAI\LinAI.exe")),
            r#""C:\Program Files\LinAI\LinAI.exe""#
        );
    }

    #[test]
    fn appends_product_directory_to_a_selected_parent() {
        assert_eq!(
            ensure_product_directory(Path::new(r"D:\Program Files")),
            PathBuf::from(r"D:\Program Files\LinAI")
        );
    }

    #[test]
    fn does_not_duplicate_an_existing_product_directory() {
        assert_eq!(
            ensure_product_directory(Path::new(r"D:\Applications\linai")),
            PathBuf::from(r"D:\Applications\linai")
        );
    }

    #[test]
    fn accepts_a_normal_absolute_install_path() {
        assert_eq!(
            validate_install_dir(r"C:\Program Files\LinAI").unwrap(),
            PathBuf::from(r"C:\Program Files\LinAI")
        );
    }

    #[test]
    fn rejects_relative_and_traversal_paths() {
        assert!(validate_install_dir(r"LinAI").is_err());
        assert!(validate_install_dir(r"C:\Apps\..\LinAI").is_err());
        assert!(validate_install_dir(r"C:\").is_err());
        assert!(validate_install_dir(r"\\server\share\LinAI").is_err());
    }

    #[test]
    fn rejects_windows_invalid_characters() {
        assert!(validate_install_dir(r"C:\Apps\LinAI?").is_err());
        assert!(validate_install_dir("C:\\Apps\\LinAI ").is_err());
        assert!(validate_install_dir(r"C:\Apps\LinAI:beta").is_err());
        assert!(validate_install_dir(r"C:\Apps\CON.txt").is_err());
        assert!(validate_install_dir(r"C:\Apps\LPT9").is_err());
    }
}
