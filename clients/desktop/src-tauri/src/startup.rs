use std::path::Path;

const STARTUP_VALUE_NAME: &str = "LinAI";

#[tauri::command]
pub fn get_launch_at_startup() -> Result<bool, String> {
    platform_launch_at_startup()
}

#[tauri::command]
pub fn set_launch_at_startup(enabled: bool) -> Result<bool, String> {
    configure_platform_launch_at_startup(enabled)?;
    platform_launch_at_startup()
}

fn startup_command(executable: &Path) -> String {
    format!("\"{}\"", executable.display())
}

#[cfg(windows)]
fn platform_launch_at_startup() -> Result<bool, String> {
    use std::io;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let executable = std::env::current_exe()
        .map_err(|error| format!("无法定位 LinAI 程序: {error}"))?;
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = match current_user.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_READ,
    ) {
        Ok(key) => key,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("无法读取开机启动配置: {error}")),
    };

    match run_key.get_value::<String, _>(STARTUP_VALUE_NAME) {
        Ok(configured) => Ok(configured == startup_command(&executable)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("无法读取开机启动配置: {error}")),
    }
}

#[cfg(windows)]
fn configure_platform_launch_at_startup(enabled: bool) -> Result<(), String> {
    use std::io;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let executable = std::env::current_exe()
        .map_err(|error| format!("无法定位 LinAI 程序: {error}"))?;
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = current_user
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|error| format!("无法打开开机启动配置: {error}"))?;

    if enabled {
        run_key
            .set_value(STARTUP_VALUE_NAME, &startup_command(&executable))
            .map_err(|error| format!("无法设置开机启动: {error}"))
    } else {
        match run_key.delete_value(STARTUP_VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("无法关闭开机启动: {error}")),
        }
    }
}

#[cfg(not(windows))]
fn platform_launch_at_startup() -> Result<bool, String> {
    Err("当前平台不支持开机自启动设置".to_string())
}

#[cfg(not(windows))]
fn configure_platform_launch_at_startup(_enabled: bool) -> Result<(), String> {
    Err("当前平台不支持开机自启动设置".to_string())
}

#[cfg(test)]
mod tests {
    use super::startup_command;
    use std::path::Path;

    #[test]
    fn quotes_the_startup_executable_path() {
        assert_eq!(
            startup_command(Path::new(r"C:\Program Files\LinAI\LinAI.exe")),
            r#""C:\Program Files\LinAI\LinAI.exe""#
        );
    }
}
