#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(windows)]
const INSTALL_REGISTRY_KEY: &str = r"Software\lin\LinAI";

#[cfg(windows)]
fn comparable_directory(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("无法确认安装目录 {}: {error}", path.display()))
}

#[cfg(windows)]
fn registered_install_directory() -> Result<PathBuf, String> {
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = machine
        .open_subkey(INSTALL_REGISTRY_KEY)
        .map_err(|_| "未找到当前安装目录记录，请使用完整安装包修复安装后再更新".to_string())?;
    let value: String = key
        .get_value("")
        .map_err(|_| "当前安装目录记录无效，请使用完整安装包修复安装后再更新".to_string())?;
    let trimmed = value.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("当前安装目录记录为空，请使用完整安装包修复安装后再更新".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

#[cfg(windows)]
fn validate_install_directory(current_executable: &Path, registered: &Path) -> Result<(), String> {
    let current = current_executable
        .parent()
        .ok_or_else(|| "无法定位当前程序目录，已取消更新".to_string())?;
    let current = comparable_directory(current)?;
    let registered = comparable_directory(registered)?;

    if current
        .to_string_lossy()
        .eq_ignore_ascii_case(&registered.to_string_lossy())
    {
        Ok(())
    } else {
        Err(format!(
            "当前程序目录与安装记录不一致，已取消更新。当前目录：{}；安装记录：{}",
            current.display(),
            registered.display()
        ))
    }
}

#[tauri::command]
pub(crate) fn validate_windows_update_install_dir() -> Result<(), String> {
    #[cfg(windows)]
    {
        let executable = std::env::current_exe()
            .map_err(|error| format!("无法定位当前程序，已取消更新: {error}"))?;
        return validate_install_directory(&executable, &registered_install_directory()?);
    }

    #[cfg(not(windows))]
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn accepts_the_running_executable_directory() {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("LinAI.exe");
        File::create(&executable).unwrap();

        assert!(validate_install_directory(&executable, directory.path()).is_ok());
    }

    #[test]
    fn rejects_a_different_registered_directory() {
        let current = tempfile::tempdir().unwrap();
        let registered = tempfile::tempdir().unwrap();
        let executable = current.path().join("LinAI.exe");
        File::create(&executable).unwrap();

        let error = validate_install_directory(&executable, registered.path()).unwrap_err();
        assert!(error.contains("不一致"));
    }
}
