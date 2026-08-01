use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::types::{ApplyMode, ClientTarget, ConfigError, ConfigFormat};

const MISSING_FINGERPRINT_INPUT: &[u8] = b"linai:missing-file";
const BACKUP_RETAIN_COUNT: usize = 10;

#[derive(Clone)]
pub struct PlannedFile {
    pub path: PathBuf,
    pub format: ConfigFormat,
    pub before: Option<Vec<u8>>,
    pub before_fingerprint: String,
    pub after: Vec<u8>,
}

impl PlannedFile {
    pub fn read(path: &Path, format: ConfigFormat, after: Vec<u8>) -> Result<Self, ConfigError> {
        let before = if path.exists() {
            Some(fs::read(path).map_err(|error| {
                ConfigError::Invalid(format!("无法读取 {}: {error}", path.display()))
            })?)
        } else {
            None
        };
        Ok(Self {
            path: path.to_path_buf(),
            before_fingerprint: fingerprint(before.as_deref()),
            before,
            format,
            after,
        })
    }

    pub fn changed(&self) -> bool {
        self.before.as_deref() != Some(self.after.as_slice())
    }
}

#[derive(Debug)]
pub struct TransactionResult {
    pub backup_path: PathBuf,
    pub changed_paths: Vec<PathBuf>,
    pub result_fingerprints: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifestEntry {
    original_path: String,
    existed: bool,
    backup_file: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    target: String,
    created_at: String,
    files: Vec<BackupManifestEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTargetState {
    pub api_key_id: i64,
    pub apply_mode: ApplyMode,
    pub applied_at: String,
    pub result_fingerprints: BTreeMap<String, String>,
    pub backup_path: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedStateFile {
    pub targets: BTreeMap<String, ManagedTargetState>,
    pub config_overrides: BTreeMap<String, String>,
}

pub fn fingerprint(content: Option<&[u8]>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.unwrap_or(MISSING_FINGERPRINT_INPUT));
    format!("{:x}", hasher.finalize())
}

fn current_fingerprint(path: &Path) -> Result<String, ConfigError> {
    if !path.exists() {
        return Ok(fingerprint(None));
    }
    fs::read(path)
        .map(|bytes| fingerprint(Some(&bytes)))
        .map_err(|error| ConfigError::Invalid(format!("无法读取 {}: {error}", path.display())))
}

fn set_private_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    let _ = path;
}

fn set_private_directory_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
    }
    #[cfg(not(unix))]
    let _ = path;
}

pub fn atomic_replace(path: &Path, data: &[u8]) -> Result<(), ConfigError> {
    let parent = path
        .parent()
        .ok_or_else(|| ConfigError::Write(format!("配置路径无效: {}", path.display())))?;
    fs::create_dir_all(parent)
        .map_err(|error| ConfigError::Write(format!("无法创建 {}: {error}", parent.display())))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| ConfigError::Write(format!("配置文件名无效: {}", path.display())))?;
    let temporary = parent.join(format!(".{file_name}.linai-{}.tmp", uuid::Uuid::new_v4()));

    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| {
                ConfigError::Write(format!("无法创建临时配置 {}: {error}", temporary.display()))
            })?;
        set_private_permissions(&temporary);
        file.write_all(data).map_err(|error| {
            ConfigError::Write(format!("无法写入临时配置 {}: {error}", temporary.display()))
        })?;
        file.sync_all().map_err(|error| {
            ConfigError::Write(format!("无法同步临时配置 {}: {error}", temporary.display()))
        })?;
        drop(file);

        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(path).map_err(|error| {
                ConfigError::Write(format!("无法替换配置 {}: {error}", path.display()))
            })?;
        }
        fs::rename(&temporary, path).map_err(|error| {
            ConfigError::Write(format!("无法替换配置 {}: {error}", path.display()))
        })?;
        set_private_permissions(path);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn backup_operation(
    app_data_dir: &Path,
    target: &str,
    changes: &[PlannedFile],
) -> Result<PathBuf, ConfigError> {
    let operation_name = format!(
        "{}-{}",
        Utc::now().format("%Y%m%dT%H%M%S%3fZ"),
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let operation_dir = app_data_dir
        .join("config-backups")
        .join(target)
        .join(operation_name);
    fs::create_dir_all(&operation_dir).map_err(|error| {
        ConfigError::Backup(format!(
            "无法创建配置备份 {}: {error}",
            operation_dir.display()
        ))
    })?;
    set_private_directory_permissions(&operation_dir);

    let mut manifest_entries = Vec::with_capacity(changes.len());
    for (index, change) in changes.iter().enumerate() {
        let backup_file = change.before.as_ref().map(|bytes| {
            let original_name = change
                .path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("config");
            let name = format!("{index:02}-{original_name}");
            let path = operation_dir.join(&name);
            fs::write(&path, bytes).map_err(|error| {
                ConfigError::Backup(format!("无法写入配置备份 {}: {error}", path.display()))
            })?;
            set_private_permissions(&path);
            Ok::<String, ConfigError>(name)
        });
        let backup_file = match backup_file {
            Some(result) => Some(result?),
            None => None,
        };
        manifest_entries.push(BackupManifestEntry {
            original_path: change.path.display().to_string(),
            existed: change.before.is_some(),
            backup_file,
        });
    }

    let manifest = BackupManifest {
        target: target.to_string(),
        created_at: Utc::now().to_rfc3339(),
        files: manifest_entries,
    };
    let manifest_path = operation_dir.join("manifest.json");
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| ConfigError::Backup(format!("无法生成备份清单: {error}")))?;
    fs::write(&manifest_path, manifest_bytes).map_err(|error| {
        ConfigError::Backup(format!(
            "无法写入备份清单 {}: {error}",
            manifest_path.display()
        ))
    })?;
    set_private_permissions(&manifest_path);

    Ok(operation_dir)
}

fn restore_snapshots(changes: &[PlannedFile]) -> Result<(), ConfigError> {
    let mut failures = Vec::new();
    for change in changes {
        let result = match &change.before {
            Some(content) => atomic_replace(&change.path, content),
            None if change.path.exists() => fs::remove_file(&change.path).map_err(|error| {
                ConfigError::Rollback(format!("无法删除新配置 {}: {error}", change.path.display()))
            }),
            None => Ok(()),
        };
        if let Err(error) = result {
            failures.push(error.to_string());
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(ConfigError::Rollback(failures.join("; ")))
    }
}

fn cleanup_old_backups(app_data_dir: &Path, target: &str) {
    let target_dir = app_data_dir.join("config-backups").join(target);
    let Ok(entries) = fs::read_dir(&target_dir) else {
        return;
    };
    let mut directories = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();
    directories.sort_by_key(|entry| entry.file_name());
    let remove_count = directories.len().saturating_sub(BACKUP_RETAIN_COUNT);
    for entry in directories.into_iter().take(remove_count) {
        let _ = fs::remove_dir_all(entry.path());
    }
}

pub fn apply_transaction(
    app_data_dir: &Path,
    target: &str,
    changes: &[PlannedFile],
) -> Result<TransactionResult, ConfigError> {
    apply_transaction_with_writer(app_data_dir, target, changes, |_, change| {
        atomic_replace(&change.path, &change.after)
    })
}

pub fn apply_transaction_with_writer<F>(
    app_data_dir: &Path,
    target: &str,
    changes: &[PlannedFile],
    mut writer: F,
) -> Result<TransactionResult, ConfigError>
where
    F: FnMut(usize, &PlannedFile) -> Result<(), ConfigError>,
{
    let mut unique_paths = HashSet::new();
    for change in changes {
        if !unique_paths.insert(change.path.clone()) {
            return Err(ConfigError::Invalid(format!(
                "配置计划包含重复路径: {}",
                change.path.display()
            )));
        }
        if current_fingerprint(&change.path)? != change.before_fingerprint {
            return Err(ConfigError::Conflict(format!(
                "配置文件在预览后已发生变化: {}",
                change.path.display()
            )));
        }
    }

    let changed = changes
        .iter()
        .filter(|change| change.changed())
        .cloned()
        .collect::<Vec<_>>();
    let backup_path = backup_operation(app_data_dir, target, &changed)?;

    for (index, change) in changed.iter().enumerate() {
        if let Err(write_error) = writer(index, change) {
            return match restore_snapshots(&changed) {
                Ok(()) => Err(write_error),
                Err(rollback_error) => Err(ConfigError::Rollback(format!(
                    "{write_error}; 自动回滚失败: {rollback_error}"
                ))),
            };
        }
        let written = fs::read(&change.path).map_err(|error| {
            ConfigError::Write(format!("无法校验配置 {}: {error}", change.path.display()))
        });
        if !matches!(written, Ok(ref bytes) if bytes == &change.after) {
            let verification_error =
                ConfigError::Write(format!("写入后校验失败: {}", change.path.display()));
            return match restore_snapshots(&changed) {
                Ok(()) => Err(verification_error),
                Err(rollback_error) => Err(ConfigError::Rollback(format!(
                    "{verification_error}; 自动回滚失败: {rollback_error}"
                ))),
            };
        }
    }

    cleanup_old_backups(app_data_dir, target);
    let result_fingerprints = changes
        .iter()
        .map(|change| {
            (
                change.path.display().to_string(),
                fingerprint(Some(&change.after)),
            )
        })
        .collect();
    Ok(TransactionResult {
        backup_path,
        changed_paths: changed.into_iter().map(|change| change.path).collect(),
        result_fingerprints,
    })
}

pub fn load_managed_state(app_data_dir: &Path) -> Result<ManagedStateFile, ConfigError> {
    let path = app_data_dir.join("client-config-state.json");
    if !path.exists() {
        return Ok(ManagedStateFile::default());
    }
    let bytes = fs::read(&path)
        .map_err(|error| ConfigError::Invalid(format!("无法读取本地配置状态: {error}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ConfigError::Invalid(format!("本地配置状态格式错误: {error}")))
}

pub fn save_managed_state(
    app_data_dir: &Path,
    state: &ManagedStateFile,
) -> Result<(), ConfigError> {
    let bytes = serde_json::to_vec_pretty(state)
        .map_err(|error| ConfigError::Write(format!("无法生成本地配置状态: {error}")))?;
    atomic_replace(&app_data_dir.join("client-config-state.json"), &bytes)
}

pub fn record_managed_apply(
    app_data_dir: &Path,
    target: &ClientTarget,
    api_key_id: i64,
    apply_mode: ApplyMode,
    transaction: &TransactionResult,
    config_override: Option<&str>,
) -> Result<(), ConfigError> {
    let mut state = load_managed_state(app_data_dir)?;
    state.targets.insert(
        target.as_str().to_string(),
        ManagedTargetState {
            api_key_id,
            apply_mode,
            applied_at: Utc::now().to_rfc3339(),
            result_fingerprints: transaction.result_fingerprints.clone(),
            backup_path: transaction.backup_path.display().to_string(),
        },
    );
    if let Some(path) = config_override.filter(|path| !path.trim().is_empty()) {
        state
            .config_overrides
            .insert(target.as_str().to_string(), path.to_string());
    }
    save_managed_state(app_data_dir, &state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_rejects_a_file_changed_after_preview() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, b"{\"env\":{}}").unwrap();
        let change = PlannedFile::read(
            &path,
            ConfigFormat::Json,
            b"{\"env\":{\"A\":\"B\"}}\n".to_vec(),
        )
        .unwrap();

        std::fs::write(&path, b"{\"externallyChanged\":true}").unwrap();
        let error = apply_transaction(dir.path(), "claude_code", &[change]).unwrap_err();

        assert!(error.to_string().contains("预览后已发生变化"));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"externallyChanged\":true}"
        );
    }

    #[test]
    fn failed_second_write_restores_all_original_files() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("config.toml");
        let second = dir.path().join("auth.json");
        std::fs::write(&first, "model = \"old\"\n").unwrap();
        std::fs::write(&second, "{\"OPENAI_API_KEY\":\"old\"}\n").unwrap();
        let changes = vec![
            PlannedFile::read(&first, ConfigFormat::Toml, b"model = \"new\"\n".to_vec()).unwrap(),
            PlannedFile::read(
                &second,
                ConfigFormat::Json,
                b"{\"OPENAI_API_KEY\":\"new\"}\n".to_vec(),
            )
            .unwrap(),
        ];

        let result =
            apply_transaction_with_writer(dir.path(), "codex", &changes, |index, change| {
                if index == 1 {
                    return Err(ConfigError::Write("forced".to_string()));
                }
                atomic_replace(&change.path, &change.after)
            });

        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(&first).unwrap(),
            "model = \"old\"\n"
        );
        assert_eq!(
            std::fs::read_to_string(&second).unwrap(),
            "{\"OPENAI_API_KEY\":\"old\"}\n"
        );
    }

    #[test]
    fn successful_apply_creates_a_backup_before_replacing_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, b"{\"before\":true}\n").unwrap();
        let change =
            PlannedFile::read(&path, ConfigFormat::Json, b"{\"after\":true}\n".to_vec()).unwrap();

        let result = apply_transaction(dir.path(), "claude_code", &[change]).unwrap();

        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"after\":true}\n"
        );
        assert!(result.backup_path.exists());
        assert_eq!(std::fs::read_dir(&result.backup_path).unwrap().count(), 2);
    }

    #[test]
    fn unchanged_apply_still_records_the_current_file_fingerprint() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let content = b"{\"env\":{}}\n";
        std::fs::write(&path, content).unwrap();
        let change = PlannedFile::read(&path, ConfigFormat::Json, content.to_vec()).unwrap();

        let result = apply_transaction(dir.path(), "claude_code", &[change]).unwrap();

        assert_eq!(
            result.result_fingerprints.get(&path.display().to_string()),
            Some(&fingerprint(Some(content)))
        );
    }
}
