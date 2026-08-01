use std::fs;

use serde_json::{Map, Value};

use super::paths::{claude_settings_path, resolve_claude_code_dir};
use super::transaction::{fingerprint, PlannedFile};
use super::types::{
    ClientDetection, ClientTarget, ConfigContext, ConfigError, ConfigFormat, EditableFile,
    ReadFilesInput, ValidationResult,
};

pub(crate) fn merge_settings(
    mut settings: Value,
    base_url: &str,
    api_key: &str,
) -> Result<Value, ConfigError> {
    let root = settings.as_object_mut().ok_or_else(|| {
        ConfigError::Invalid("Claude Code settings.json 必须是 JSON 对象".to_string())
    })?;
    let env = root
        .entry("env")
        .or_insert_with(|| Value::Object(Map::new()));
    let env = env.as_object_mut().ok_or_else(|| {
        ConfigError::Invalid("Claude Code settings.json 中的 env 必须是 JSON 对象".to_string())
    })?;

    env.insert(
        "ANTHROPIC_BASE_URL".to_string(),
        Value::String(base_url.trim().trim_end_matches('/').to_string()),
    );
    env.insert(
        "ANTHROPIC_AUTH_TOKEN".to_string(),
        Value::String(api_key.to_string()),
    );
    env.insert(
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".to_string(),
        Value::String("1".to_string()),
    );
    env.insert(
        "CLAUDE_CODE_ATTRIBUTION_HEADER".to_string(),
        Value::String("0".to_string()),
    );
    Ok(settings)
}

pub(crate) fn preview_quick_bytes(
    existing: &[u8],
    base_url: &str,
    api_key: &str,
) -> Result<Vec<u8>, ConfigError> {
    let settings = if existing.is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_slice(existing).map_err(|error| {
            ConfigError::Invalid(format!("Claude Code settings.json 格式错误: {error}"))
        })?
    };
    let merged = merge_settings(settings, base_url, api_key)?;
    let mut bytes = serde_json::to_vec_pretty(&merged)
        .map_err(|error| ConfigError::Invalid(format!("无法生成 Claude Code 配置: {error}")))?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub(crate) fn preview_quick(context: &ConfigContext) -> Result<Vec<PlannedFile>, ConfigError> {
    let config_dir = resolve_claude_code_dir(context.config_dir.as_deref())?;
    let path = claude_settings_path(&config_dir);
    let existing = if path.exists() {
        fs::read(&path).map_err(|error| {
            ConfigError::Invalid(format!(
                "无法读取 Claude Code 配置 {}: {error}",
                path.display()
            ))
        })?
    } else {
        Vec::new()
    };
    let after = preview_quick_bytes(&existing, &context.base_url, &context.api_key)?;
    Ok(vec![PlannedFile::read(&path, ConfigFormat::Json, after)?])
}

pub(crate) fn read_expert_files(input: &ReadFilesInput) -> Result<Vec<EditableFile>, ConfigError> {
    let config_dir = resolve_claude_code_dir(input.config_dir.as_deref())?;
    let path = claude_settings_path(&config_dir);
    let (exists, bytes) = if path.exists() {
        (
            true,
            fs::read(&path).map_err(|error| {
                ConfigError::Invalid(format!(
                    "无法读取 Claude Code 配置 {}: {error}",
                    path.display()
                ))
            })?,
        )
    } else {
        (false, b"{}\n".to_vec())
    };
    let content = String::from_utf8(bytes.clone()).map_err(|_| {
        ConfigError::Invalid(format!(
            "Claude Code 配置不是 UTF-8 文本: {}",
            path.display()
        ))
    })?;
    Ok(vec![EditableFile {
        path: path.display().to_string(),
        format: ConfigFormat::Json,
        exists,
        fingerprint: if exists {
            fingerprint(Some(&bytes))
        } else {
            fingerprint(None)
        },
        content,
    }])
}

pub(crate) fn validate_content(content: &str) -> ValidationResult {
    match serde_json::from_str::<Value>(content) {
        Ok(Value::Object(_)) => ValidationResult {
            valid: true,
            message: None,
            line: None,
            column: None,
        },
        Ok(_) => ValidationResult {
            valid: false,
            message: Some("Claude Code settings.json 必须是 JSON 对象".to_string()),
            line: None,
            column: None,
        },
        Err(error) => ValidationResult {
            valid: false,
            message: Some("JSON 格式错误".to_string()),
            line: Some(error.line()),
            column: Some(error.column()),
        },
    }
}

pub(crate) fn detect(config_dir: Option<&str>) -> Result<ClientDetection, ConfigError> {
    let config_dir = resolve_claude_code_dir(config_dir)?;
    let path = claude_settings_path(&config_dir);
    Ok(ClientDetection {
        target: ClientTarget::ClaudeCode,
        supported: true,
        status: if path.exists() {
            "other_config".to_string()
        } else {
            "not_configured".to_string()
        },
        paths: vec![path.display().to_string()],
        restart_required: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_merge_updates_only_linai_env_fields() {
        let existing = serde_json::json!({
            "$schema": "https://json.schemastore.org/claude-code-settings.json",
            "env": { "OTHER": "keep", "ANTHROPIC_AUTH_TOKEN": "old" },
            "mcpServers": { "docs": { "command": "node" } },
            "hooks": { "PreToolUse": ["keep"] },
            "permissions": { "allow": ["Read"] }
        });

        let merged = merge_settings(existing, "https://lynn.lat", "sk-lin-secret").unwrap();

        assert_eq!(merged["env"]["ANTHROPIC_BASE_URL"], "https://lynn.lat");
        assert_eq!(merged["env"]["ANTHROPIC_AUTH_TOKEN"], "sk-lin-secret");
        assert_eq!(merged["env"]["OTHER"], "keep");
        assert_eq!(merged["mcpServers"]["docs"]["command"], "node");
        assert_eq!(merged["hooks"]["PreToolUse"][0], "keep");
        assert_eq!(merged["permissions"]["allow"][0], "Read");
    }

    #[test]
    fn malformed_existing_settings_are_rejected() {
        let error = preview_quick_bytes(b"[]", "https://lynn.lat", "key").unwrap_err();
        assert!(error.to_string().contains("JSON 对象"));
    }

    #[test]
    fn missing_settings_start_from_an_object_and_end_with_a_newline() {
        let output = preview_quick_bytes(b"", "https://lynn.lat/", "key").unwrap();
        assert!(output.ends_with(b"\n"));
        let parsed: serde_json::Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(parsed["env"]["ANTHROPIC_BASE_URL"], "https://lynn.lat");
    }
}
