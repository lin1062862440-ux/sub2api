pub mod claude_code;
pub mod claude_desktop;
pub mod codex;
pub mod paths;
pub mod transaction;
pub mod types;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::Manager;

use transaction::{
    apply_transaction, fingerprint, load_managed_state, record_managed_apply, PlannedFile,
};
use types::{
    ApplyMode, ApplyResult, ClientDetection, ClientTarget, ConfigError, ConfigFormat,
    ConfigPreview, DetectInput, EditableFile, ExpertPreviewInput, FileDiff, PreviewInput,
    ReadFilesInput, ValidateFileInput, ValidationResult,
};

const REDACTED_SECRET: &str = "••••••••";

pub(crate) struct PendingPreview {
    pub id: String,
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub mode: ApplyMode,
    pub files: Vec<PlannedFile>,
    pub restart_required: bool,
    pub config_override: Option<String>,
    created_at: Instant,
}

impl PendingPreview {
    pub fn new(
        target: ClientTarget,
        api_key_id: i64,
        mode: ApplyMode,
        files: Vec<PlannedFile>,
        restart_required: bool,
        config_override: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            target,
            api_key_id,
            mode,
            files,
            restart_required,
            config_override,
            created_at: Instant::now(),
        }
    }
}

#[derive(Default)]
pub struct LocalConfigHost {
    pending: Mutex<HashMap<String, PendingPreview>>,
    pub(crate) write_lock: Mutex<()>,
}

impl LocalConfigHost {
    const PREVIEW_TTL: Duration = Duration::from_secs(10 * 60);

    fn prune_expired(pending: &mut HashMap<String, PendingPreview>) {
        pending.retain(|_, preview| preview.created_at.elapsed() <= Self::PREVIEW_TTL);
    }

    pub(crate) fn insert_preview(&self, preview: PendingPreview) -> Result<String, ConfigError> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| ConfigError::Write("配置预览状态不可用".to_string()))?;
        Self::prune_expired(&mut pending);
        let id = preview.id.clone();
        pending.insert(id.clone(), preview);
        Ok(id)
    }

    pub(crate) fn take_preview(&self, id: &str) -> Result<PendingPreview, ConfigError> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| ConfigError::Write("配置预览状态不可用".to_string()))?;
        Self::prune_expired(&mut pending);
        pending
            .remove(id)
            .ok_or_else(|| ConfigError::Conflict("配置预览已失效，请重新生成".to_string()))
    }

    pub(crate) fn cancel_preview(&self, id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(id);
        }
    }
}

fn validate_group_target(group_platform: &str, target: &ClientTarget) -> Result<(), ConfigError> {
    let valid = matches!(
        (group_platform.trim().to_ascii_lowercase().as_str(), target),
        ("anthropic", ClientTarget::ClaudeCode)
            | ("anthropic", ClientTarget::ClaudeDesktop)
            | ("openai", ClientTarget::Codex)
    );
    if valid {
        return Ok(());
    }

    let supported_group = matches!(
        group_platform.trim().to_ascii_lowercase().as_str(),
        "anthropic" | "openai"
    );
    if supported_group {
        Err(ConfigError::Invalid(
            "当前分组与所选客户端不匹配".to_string(),
        ))
    } else {
        Err(ConfigError::Unsupported(
            "当前分组暂不支持客户端配置".to_string(),
        ))
    }
}

fn sensitive_key(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    ["token", "api_key", "apikey", "secret", "password", "auth"]
        .iter()
        .any(|needle| normalized.contains(needle))
}

fn redact_json_value(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                if sensitive_key(key) && matches!(value, Value::String(_)) {
                    *value = Value::String(REDACTED_SECRET.to_string());
                } else {
                    redact_json_value(value);
                }
            }
        }
        Value::Array(values) => values.iter_mut().for_each(redact_json_value),
        _ => {}
    }
}

fn redact_toml_lines(content: &str) -> String {
    content
        .lines()
        .map(|line| {
            let Some((key, value)) = line.split_once('=') else {
                return line.to_string();
            };
            if sensitive_key(key.trim().trim_matches('"').trim_matches('\'')) {
                let comment = value
                    .find('#')
                    .map(|index| value[index..].trim_start())
                    .unwrap_or_default();
                if comment.is_empty() {
                    format!("{}= \"{REDACTED_SECRET}\"", &line[..key.len()])
                } else {
                    format!("{}= \"{REDACTED_SECRET}\" {comment}", &line[..key.len()])
                }
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_quick_content(content: &str, api_key: &str) -> String {
    let content = if api_key.is_empty() {
        content.to_string()
    } else {
        content.replace(api_key, REDACTED_SECRET)
    };
    if let Ok(mut json) = serde_json::from_str::<Value>(&content) {
        redact_json_value(&mut json);
        return serde_json::to_string_pretty(&json).unwrap_or(content);
    }
    redact_toml_lines(&content)
}

fn app_data_dir_with_test_home(default: &Path, test_home: Option<&str>) -> PathBuf {
    test_home
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| PathBuf::from(value).join(".linai").join("app-data"))
        .unwrap_or_else(|| default.to_path_buf())
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, ConfigError> {
    let default = app
        .path()
        .app_data_dir()
        .map_err(|error| ConfigError::Invalid(format!("无法确定 LinAI 数据目录: {error}")))?;
    #[cfg(any(test, debug_assertions))]
    {
        let test_home = std::env::var("LINAI_CONFIG_TEST_HOME").ok();
        return Ok(app_data_dir_with_test_home(&default, test_home.as_deref()));
    }
    #[cfg(not(any(test, debug_assertions)))]
    Ok(default)
}

fn saved_override(
    app_data_dir: &Path,
    target: &ClientTarget,
) -> Result<Option<String>, ConfigError> {
    Ok(load_managed_state(app_data_dir)?
        .config_overrides
        .get(target.as_str())
        .cloned())
}

fn current_file_fingerprint(path: &Path) -> Result<String, ConfigError> {
    if path.exists() {
        let bytes = fs::read(path).map_err(|error| {
            ConfigError::Invalid(format!("无法读取配置 {}: {error}", path.display()))
        })?;
        Ok(fingerprint(Some(&bytes)))
    } else {
        Ok(fingerprint(None))
    }
}

fn decorate_detection(
    app_data_dir: &Path,
    api_key_id: i64,
    mut detection: ClientDetection,
) -> Result<ClientDetection, ConfigError> {
    let state = load_managed_state(app_data_dir)?;
    let Some(managed) = state.targets.get(detection.target.as_str()) else {
        return Ok(detection);
    };
    let matches = managed.result_fingerprints.iter().all(|(path, expected)| {
        current_file_fingerprint(Path::new(path)).is_ok_and(|actual| actual == *expected)
    });
    detection.status = if matches && managed.api_key_id == api_key_id {
        "managed".to_string()
    } else if matches {
        "other_config".to_string()
    } else {
        "drifted".to_string()
    };
    Ok(detection)
}

fn detect_dispatch(input: &DetectInput) -> Result<ClientDetection, ConfigError> {
    match input.target {
        ClientTarget::ClaudeCode => claude_code::detect(input.config_dir.as_deref()),
        ClientTarget::ClaudeDesktop => claude_desktop::detect(),
        ClientTarget::Codex => codex::detect(input.config_dir.as_deref()),
    }
}

fn quick_dispatch(input: &PreviewInput) -> Result<Vec<PlannedFile>, ConfigError> {
    match input.context.target {
        ClientTarget::ClaudeCode => claude_code::preview_quick(&input.context),
        ClientTarget::ClaudeDesktop => claude_desktop::preview_quick(&input.context),
        ClientTarget::Codex => codex::preview_quick(&input.context),
    }
}

fn read_expert_dispatch(input: &ReadFilesInput) -> Result<Vec<EditableFile>, ConfigError> {
    match input.target {
        ClientTarget::ClaudeCode => claude_code::read_expert_files(input),
        ClientTarget::ClaudeDesktop => claude_desktop::read_expert_files(input),
        ClientTarget::Codex => codex::read_expert_files(input),
    }
}

fn validate_for_target(
    target: &ClientTarget,
    format: &ConfigFormat,
    content: &str,
) -> ValidationResult {
    match (target, format) {
        (ClientTarget::ClaudeCode, ConfigFormat::Json) => claude_code::validate_content(content),
        (ClientTarget::ClaudeDesktop, ConfigFormat::Json) => {
            claude_desktop::validate_content(content)
        }
        (ClientTarget::Codex, ConfigFormat::Toml) => codex::validate_toml(content),
        (ClientTarget::Codex, ConfigFormat::Json) => codex::validate_json(content),
        _ => ValidationResult {
            valid: false,
            message: Some("配置文件格式与客户端不匹配".to_string()),
            line: None,
            column: None,
        },
    }
}

fn public_preview(preview: &PendingPreview, api_key: &str) -> Result<ConfigPreview, ConfigError> {
    let files = preview
        .files
        .iter()
        .map(|file| {
            let before = file
                .before
                .as_deref()
                .map(String::from_utf8_lossy)
                .map(|content| redact_quick_content(&content, api_key))
                .unwrap_or_default();
            let after = String::from_utf8(file.after.clone()).map_err(|_| {
                ConfigError::Invalid(format!("配置文件不是 UTF-8 文本: {}", file.path.display()))
            })?;
            Ok(FileDiff {
                path: file.path.display().to_string(),
                format: file.format.clone(),
                changed: file.changed(),
                redacted_before: before,
                redacted_after: redact_quick_content(&after, api_key),
            })
        })
        .collect::<Result<Vec<_>, ConfigError>>()?;
    Ok(ConfigPreview {
        preview_id: preview.id.clone(),
        target: preview.target.clone(),
        mode: preview.mode.clone(),
        files,
        restart_required: preview.restart_required,
    })
}

fn with_resolved_override(
    app_data_dir: &Path,
    target: &ClientTarget,
    explicit: Option<String>,
) -> Result<Option<String>, ConfigError> {
    if explicit
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        Ok(explicit)
    } else {
        saved_override(app_data_dir, target)
    }
}

fn expert_planned_files(input: &ExpertPreviewInput) -> Result<Vec<PlannedFile>, ConfigError> {
    let current = read_expert_dispatch(&ReadFilesInput {
        target: input.target.clone(),
        api_key_id: input.api_key_id,
        group_platform: input.group_platform.clone(),
        config_dir: input.config_dir.clone(),
    })?;
    if current.len() != input.files.len() {
        return Err(ConfigError::Invalid(
            "专家模式必须提交当前客户端的完整配置文件集合".to_string(),
        ));
    }

    let mut submitted_paths = HashSet::new();
    let mut planned = Vec::with_capacity(current.len());
    for allowed in current {
        let submitted = input
            .files
            .iter()
            .find(|file| file.path == allowed.path)
            .ok_or_else(|| ConfigError::Invalid("专家模式配置文件集合不完整".to_string()))?;
        if !submitted_paths.insert(submitted.path.clone()) {
            return Err(ConfigError::Invalid("专家模式包含重复配置路径".to_string()));
        }
        if submitted.format != allowed.format {
            return Err(ConfigError::Invalid(format!(
                "配置格式与目标文件不匹配: {}",
                submitted.path
            )));
        }
        if submitted.fingerprint != allowed.fingerprint {
            return Err(ConfigError::Conflict(format!(
                "配置文件在编辑后已发生变化: {}",
                submitted.path
            )));
        }
        let validation = validate_for_target(&input.target, &submitted.format, &submitted.content);
        if !validation.valid {
            let location = validation
                .line
                .map(|line| format!("（第 {line} 行）"))
                .unwrap_or_default();
            return Err(ConfigError::Invalid(format!(
                "{}{}: {}",
                validation
                    .message
                    .unwrap_or_else(|| "配置格式错误".to_string()),
                location,
                submitted.path
            )));
        }
        planned.push(PlannedFile::read(
            Path::new(&submitted.path),
            submitted.format.clone(),
            submitted.content.as_bytes().to_vec(),
        )?);
    }
    Ok(planned)
}

#[tauri::command]
pub fn detect_local_client(
    app: tauri::AppHandle,
    mut input: DetectInput,
) -> Result<ClientDetection, String> {
    validate_group_target(&input.group_platform, &input.target)
        .map_err(|error| error.to_string())?;
    let app_data = app_data_dir(&app).map_err(|error| error.to_string())?;
    input.config_dir = with_resolved_override(&app_data, &input.target, input.config_dir)
        .map_err(|error| error.to_string())?;
    let detection = detect_dispatch(&input).map_err(|error| error.to_string())?;
    decorate_detection(&app_data, input.api_key_id, detection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn preview_local_client_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalConfigHost>,
    mut input: PreviewInput,
) -> Result<ConfigPreview, String> {
    validate_group_target(&input.context.group_platform, &input.context.target)
        .map_err(|error| error.to_string())?;
    let app_data = app_data_dir(&app).map_err(|error| error.to_string())?;
    input.context.config_dir =
        with_resolved_override(&app_data, &input.context.target, input.context.config_dir)
            .map_err(|error| error.to_string())?;
    let files = quick_dispatch(&input).map_err(|error| error.to_string())?;
    let preview = PendingPreview::new(
        input.context.target.clone(),
        input.context.api_key_id,
        ApplyMode::Quick,
        files,
        matches!(input.context.target, ClientTarget::ClaudeDesktop),
        input.context.config_dir.clone(),
    );
    let public =
        public_preview(&preview, &input.context.api_key).map_err(|error| error.to_string())?;
    state
        .insert_preview(preview)
        .map_err(|error| error.to_string())?;
    Ok(public)
}

#[tauri::command]
pub fn apply_local_client_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalConfigHost>,
    preview_id: String,
) -> Result<ApplyResult, String> {
    let preview = state
        .take_preview(&preview_id)
        .map_err(|error| error.to_string())?;
    let _guard = state
        .write_lock
        .lock()
        .map_err(|_| "本地配置写入锁不可用".to_string())?;
    let app_data = app_data_dir(&app).map_err(|error| error.to_string())?;
    let transaction = apply_transaction(&app_data, preview.target.as_str(), &preview.files)
        .map_err(|error| error.to_string())?;
    record_managed_apply(
        &app_data,
        &preview.target,
        preview.api_key_id,
        preview.mode.clone(),
        &transaction,
        preview.config_override.as_deref(),
    )
    .map_err(|error| error.to_string())?;
    Ok(ApplyResult {
        target: preview.target,
        changed_paths: transaction
            .changed_paths
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        backup_path: transaction.backup_path.display().to_string(),
        restart_required: preview.restart_required,
    })
}

#[tauri::command]
pub fn read_local_client_files(
    app: tauri::AppHandle,
    mut input: ReadFilesInput,
) -> Result<Vec<EditableFile>, String> {
    validate_group_target(&input.group_platform, &input.target)
        .map_err(|error| error.to_string())?;
    let app_data = app_data_dir(&app).map_err(|error| error.to_string())?;
    input.config_dir = with_resolved_override(&app_data, &input.target, input.config_dir)
        .map_err(|error| error.to_string())?;
    read_expert_dispatch(&input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn validate_local_client_file(input: ValidateFileInput) -> ValidationResult {
    match input.format {
        ConfigFormat::Json => match serde_json::from_str::<Value>(&input.content) {
            Ok(Value::Object(_)) => ValidationResult {
                valid: true,
                message: None,
                line: None,
                column: None,
            },
            Ok(_) => ValidationResult {
                valid: false,
                message: Some("JSON 配置必须是对象".to_string()),
                line: None,
                column: None,
            },
            Err(error) => ValidationResult {
                valid: false,
                message: Some(format!("JSON 格式错误: {}", input.path)),
                line: Some(error.line()),
                column: Some(error.column()),
            },
        },
        ConfigFormat::Toml => codex::validate_toml(&input.content),
    }
}

#[tauri::command]
pub fn preview_expert_local_client_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalConfigHost>,
    mut input: ExpertPreviewInput,
) -> Result<ConfigPreview, String> {
    validate_group_target(&input.group_platform, &input.target)
        .map_err(|error| error.to_string())?;
    let app_data = app_data_dir(&app).map_err(|error| error.to_string())?;
    input.config_dir = with_resolved_override(&app_data, &input.target, input.config_dir)
        .map_err(|error| error.to_string())?;
    let files = expert_planned_files(&input).map_err(|error| error.to_string())?;
    let preview = PendingPreview::new(
        input.target.clone(),
        input.api_key_id,
        ApplyMode::Expert,
        files,
        matches!(input.target, ClientTarget::ClaudeDesktop),
        input.config_dir.clone(),
    );
    let public = public_preview(&preview, "").map_err(|error| error.to_string())?;
    state
        .insert_preview(preview)
        .map_err(|error| error.to_string())?;
    Ok(public)
}

#[tauri::command]
pub fn cancel_local_client_preview(state: tauri::State<'_, LocalConfigHost>, preview_id: String) {
    state.cancel_preview(&preview_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_config::types::{ConfigFormat, FileDiff};

    #[test]
    fn group_target_validation_accepts_only_the_confirmed_mapping() {
        assert!(validate_group_target("anthropic", &ClientTarget::ClaudeCode).is_ok());
        assert!(validate_group_target("anthropic", &ClientTarget::ClaudeDesktop).is_ok());
        assert!(validate_group_target("openai", &ClientTarget::Codex).is_ok());
        let error = validate_group_target("gemini", &ClientTarget::Codex).unwrap_err();
        assert!(error.to_string().contains("当前分组暂不支持客户端配置"));
        assert!(validate_group_target("openai", &ClientTarget::ClaudeCode).is_err());
    }

    #[test]
    fn pending_preview_is_consumed_once() {
        let host = LocalConfigHost::default();
        let preview = PendingPreview::new(
            ClientTarget::Codex,
            12,
            ApplyMode::Quick,
            Vec::new(),
            false,
            None,
        );
        let id = host.insert_preview(preview).unwrap();
        assert!(host.take_preview(&id).is_ok());
        assert!(host.take_preview(&id).is_err());
    }

    #[test]
    fn public_preview_redacts_quick_mode_secrets() {
        let diff = FileDiff {
            path: "/tmp/settings.json".to_string(),
            format: ConfigFormat::Json,
            changed: true,
            redacted_before: "old".to_string(),
            redacted_after: redact_quick_content(
                "{\"ANTHROPIC_AUTH_TOKEN\":\"sk-lin-never-serialize\"}",
                "sk-lin-never-serialize",
            ),
        };
        let json = serde_json::to_string(&diff).unwrap();
        assert!(!json.contains("sk-lin-never-serialize"));
        assert!(json.contains(REDACTED_SECRET));
    }

    #[test]
    fn redaction_hides_preexisting_json_and_toml_credentials() {
        let json = redact_quick_content("{\"api_key\":\"old-secret\"}", "new-secret");
        let toml = redact_quick_content("experimental_bearer_token = \"old-secret\"\n", "");
        assert!(!json.contains("old-secret"));
        assert!(!toml.contains("old-secret"));
        assert!(json.contains(REDACTED_SECRET));
        assert!(toml.contains(REDACTED_SECRET));
    }

    #[test]
    fn debug_test_home_also_isolates_linai_managed_state() {
        let default = Path::new("/Users/lin/Library/Application Support/ai.lin.desktop");
        assert_eq!(
            app_data_dir_with_test_home(default, Some("/tmp/linai-test")),
            Path::new("/tmp/linai-test/.linai/app-data")
        );
        assert_eq!(app_data_dir_with_test_home(default, None), default);
    }
}
