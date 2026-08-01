use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::fs;

use super::types::ConfigError;

pub const LINAI_PROFILE_ID: &str = "00000000-0000-4000-8000-00000011a1a1";
pub const LINAI_PROFILE_FILENAME: &str = "00000000-0000-4000-8000-00000011a1a1.json";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaudeDesktopPaths {
    pub normal_config: PathBuf,
    pub threep_config: PathBuf,
    pub config_library: PathBuf,
    pub profile: PathBuf,
    pub meta: PathBuf,
}

pub fn claude_code_dir(home: &Path, custom: Option<&Path>, environment: Option<&Path>) -> PathBuf {
    custom
        .or(environment)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".claude"))
}

pub fn codex_dir(home: &Path, custom: Option<&Path>, environment: Option<&Path>) -> PathBuf {
    custom
        .or(environment)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".codex"))
}

fn desktop_paths(normal_dir: PathBuf, threep_dir: PathBuf) -> ClaudeDesktopPaths {
    let config_library = threep_dir.join("configLibrary");
    ClaudeDesktopPaths {
        normal_config: normal_dir.join("claude_desktop_config.json"),
        threep_config: threep_dir.join("claude_desktop_config.json"),
        profile: config_library.join(LINAI_PROFILE_FILENAME),
        meta: config_library.join("_meta.json"),
        config_library,
    }
}

pub fn claude_desktop_paths_for_macos(home: &Path) -> ClaudeDesktopPaths {
    let app_support = home.join("Library").join("Application Support");
    desktop_paths(app_support.join("Claude"), app_support.join("Claude-3p"))
}

fn pick_windows_claude_dir(local_app_data: &Path, entries: &[PathBuf], threep: bool) -> PathBuf {
    let exact_name = if threep { "Claude-3p" } else { "Claude" };
    let exact = local_app_data.join(exact_name);
    if entries.iter().any(|entry| entry == &exact) || exact.exists() {
        return exact;
    }

    let mut matching = entries
        .iter()
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("Claude") && name.contains("-3p") == threep)
        })
        .cloned()
        .collect::<Vec<_>>();
    matching.sort();
    matching.into_iter().next().unwrap_or(exact)
}

pub fn claude_desktop_paths_for_windows(
    local_app_data: &Path,
    entries: &[PathBuf],
) -> ClaudeDesktopPaths {
    desktop_paths(
        pick_windows_claude_dir(local_app_data, entries, false),
        pick_windows_claude_dir(local_app_data, entries, true),
    )
}

pub fn resolve_claude_desktop_paths() -> Result<Option<ClaudeDesktopPaths>, ConfigError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(Some(claude_desktop_paths_for_macos(&user_home_dir()?)));
    }

    #[cfg(windows)]
    {
        let local_app_data = if let Ok(test_home) = std::env::var("LINAI_CONFIG_TEST_HOME") {
            let trimmed = test_home.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(PathBuf::from(trimmed).join("AppData").join("Local"))
            }
        } else {
            None
        }
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(PathBuf::from))
        .unwrap_or_else(|| {
            user_home_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("AppData")
                .join("Local")
        });
        let entries = fs::read_dir(&local_app_data)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect::<Vec<_>>();
        return Ok(Some(claude_desktop_paths_for_windows(
            &local_app_data,
            &entries,
        )));
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Ok(None)
    }
}

pub fn user_home_dir() -> Result<PathBuf, ConfigError> {
    #[cfg(any(test, debug_assertions))]
    if let Ok(test_home) = std::env::var("LINAI_CONFIG_TEST_HOME") {
        let trimmed = test_home.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    dirs::home_dir().ok_or_else(|| ConfigError::Invalid("无法确定当前用户目录".to_string()))
}

fn non_empty_environment_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn resolve_claude_code_dir(custom: Option<&str>) -> Result<PathBuf, ConfigError> {
    let home = user_home_dir()?;
    let custom = custom.map(Path::new);
    let environment = non_empty_environment_path("CLAUDE_CONFIG_DIR");
    Ok(claude_code_dir(&home, custom, environment.as_deref()))
}

pub fn resolve_codex_dir(custom: Option<&str>) -> Result<PathBuf, ConfigError> {
    let home = user_home_dir()?;
    let custom = custom.map(Path::new);
    let environment = non_empty_environment_path("CODEX_HOME");
    Ok(codex_dir(&home, custom, environment.as_deref()))
}

pub fn claude_settings_path(config_dir: &Path) -> PathBuf {
    let settings = config_dir.join("settings.json");
    if settings.exists() {
        return settings;
    }
    let legacy = config_dir.join("claude.json");
    if legacy.exists() {
        return legacy;
    }
    settings
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn claude_code_prefers_custom_then_env_then_home() {
        let home = Path::new("/home/lin");
        assert_eq!(
            claude_code_dir(
                home,
                Some(Path::new("/custom/claude")),
                Some(Path::new("/env/claude")),
            ),
            Path::new("/custom/claude")
        );
        assert_eq!(
            claude_code_dir(home, None, Some(Path::new("/env/claude"))),
            Path::new("/env/claude")
        );
        assert_eq!(
            claude_code_dir(home, None, None),
            Path::new("/home/lin/.claude")
        );
    }

    #[test]
    fn codex_prefers_custom_then_codex_home_then_user_home() {
        let home = Path::new("C:/Users/Lin");
        assert_eq!(
            codex_dir(
                home,
                Some(Path::new("D:/codex")),
                Some(Path::new("E:/env-codex")),
            ),
            Path::new("D:/codex")
        );
        assert_eq!(
            codex_dir(home, None, Some(Path::new("E:/env-codex"))),
            Path::new("E:/env-codex")
        );
        assert_eq!(
            codex_dir(home, None, None),
            Path::new("C:/Users/Lin/.codex")
        );
    }

    #[test]
    fn claude_desktop_uses_macos_and_windows_3p_roots() {
        let mac = claude_desktop_paths_for_macos(Path::new("/Users/lin"));
        assert_eq!(
            mac.profile,
            Path::new("/Users/lin/Library/Application Support/Claude-3p/configLibrary")
                .join(LINAI_PROFILE_FILENAME)
        );

        let windows =
            claude_desktop_paths_for_windows(Path::new("C:/Users/Lin/AppData/Local"), &[]);
        assert_eq!(
            windows.profile,
            Path::new("C:/Users/Lin/AppData/Local/Claude-3p/configLibrary")
                .join(LINAI_PROFILE_FILENAME)
        );
    }

    #[test]
    fn windows_prefers_existing_claude_directory_names() {
        let local = Path::new("C:/Users/Lin/AppData/Local");
        let entries = vec![local.join("Claude-1.2"), local.join("Claude-1.2-3p")];
        let paths = claude_desktop_paths_for_windows(local, &entries);
        assert!(paths.normal_config.starts_with(&entries[0]));
        assert!(paths.threep_config.starts_with(&entries[1]));
    }
}
