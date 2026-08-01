use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientTarget {
    ClaudeCode,
    ClaudeDesktop,
    Codex,
}

impl ClientTarget {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude_code",
            Self::ClaudeDesktop => "claude_desktop",
            Self::Codex => "codex",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigFormat {
    Json,
    Toml,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyMode {
    Quick,
    Expert,
}

#[derive(Debug)]
pub enum ConfigError {
    Invalid(String),
    Unsupported(String),
    Conflict(String),
    Backup(String),
    Write(String),
    Rollback(String),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::Invalid(message)
            | Self::Unsupported(message)
            | Self::Conflict(message)
            | Self::Backup(message)
            | Self::Write(message)
            | Self::Rollback(message) => message,
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for ConfigError {}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigContext {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub api_key: String,
    pub base_url: String,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub context: ConfigContext,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFilesInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditableFile {
    pub path: String,
    pub format: ConfigFormat,
    pub exists: bool,
    pub fingerprint: String,
    pub content: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateFileInput {
    pub path: String,
    pub format: ConfigFormat,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub message: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertPreviewInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
    pub files: Vec<EditableFile>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub format: ConfigFormat,
    pub changed: bool,
    pub redacted_before: String,
    pub redacted_after: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPreview {
    pub preview_id: String,
    pub target: ClientTarget,
    pub mode: ApplyMode,
    pub files: Vec<FileDiff>,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub target: ClientTarget,
    pub changed_paths: Vec<String>,
    pub backup_path: String,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetection {
    pub target: ClientTarget,
    pub supported: bool,
    pub status: String,
    pub paths: Vec<String>,
    pub restart_required: bool,
}
