use std::fs;
use std::path::Path;

use serde_json::{json, Map, Value};

use super::paths::{resolve_claude_desktop_paths, ClaudeDesktopPaths, LINAI_PROFILE_ID};
use super::transaction::{fingerprint, PlannedFile};
use super::types::{
    ClientDetection, ClientTarget, ConfigContext, ConfigError, ConfigFormat, EditableFile,
    ReadFilesInput, ValidationResult,
};

const LINAI_PROFILE_NAME: &str = "LinAI";

#[derive(Debug)]
pub(crate) struct DesktopFileValues {
    pub normal: Value,
    pub threep: Value,
    pub profile: Value,
    pub meta: Value,
}

fn require_object(mut value: Value, label: &str) -> Result<Value, ConfigError> {
    if value.is_null() {
        value = Value::Object(Map::new());
    }
    if value.is_object() {
        Ok(value)
    } else {
        Err(ConfigError::Invalid(format!("{label} 必须是 JSON 对象")))
    }
}

fn set_deployment_mode(value: Value) -> Result<Value, ConfigError> {
    let mut value = require_object(value, "Claude Desktop deployment 配置")?;
    value.as_object_mut().expect("validated above").insert(
        "deploymentMode".to_string(),
        Value::String("3p".to_string()),
    );
    Ok(value)
}

fn merge_meta(value: Value) -> Result<Value, ConfigError> {
    let mut value = require_object(value, "Claude Desktop Profile 元数据")?;
    let object = value.as_object_mut().expect("validated above");
    let mut entries = object
        .get("entries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    entries.retain(|entry| entry.get("id").and_then(Value::as_str) != Some(LINAI_PROFILE_ID));
    entries.push(json!({
        "id": LINAI_PROFILE_ID,
        "name": LINAI_PROFILE_NAME,
    }));
    object.insert("entries".to_string(), Value::Array(entries));
    object.insert(
        "appliedId".to_string(),
        Value::String(LINAI_PROFILE_ID.to_string()),
    );
    Ok(value)
}

fn gateway_profile(base_url: &str, api_key: &str) -> Result<Value, ConfigError> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err(ConfigError::Invalid("LinAI API 地址不能为空".to_string()));
    }
    Ok(json!({
        "coworkEgressAllowedHosts": ["*"],
        "disableDeploymentModeChooser": true,
        "inferenceGatewayApiKey": api_key,
        "inferenceGatewayAuthScheme": "bearer",
        "inferenceGatewayBaseUrl": base_url,
        "inferenceProvider": "gateway",
    }))
}

pub(crate) fn build_desktop_files(
    normal: Value,
    threep: Value,
    meta: Value,
    base_url: &str,
    api_key: &str,
) -> Result<DesktopFileValues, ConfigError> {
    Ok(DesktopFileValues {
        normal: set_deployment_mode(normal)?,
        threep: set_deployment_mode(threep)?,
        profile: gateway_profile(base_url, api_key)?,
        meta: merge_meta(meta)?,
    })
}

fn read_json_object(path: &Path, label: &str) -> Result<Value, ConfigError> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let bytes = fs::read(path)
        .map_err(|error| ConfigError::Invalid(format!("无法读取 {}: {error}", path.display())))?;
    let value = serde_json::from_slice(&bytes)
        .map_err(|error| ConfigError::Invalid(format!("{label} JSON 格式错误: {error}")))?;
    require_object(value, label)
}

fn json_bytes(value: &Value) -> Result<Vec<u8>, ConfigError> {
    let mut bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| ConfigError::Invalid(format!("无法生成 Claude Desktop 配置: {error}")))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn planned_json(path: &Path, value: &Value) -> Result<PlannedFile, ConfigError> {
    PlannedFile::read(path, ConfigFormat::Json, json_bytes(value)?)
}

pub(crate) fn preview_quick(context: &ConfigContext) -> Result<Vec<PlannedFile>, ConfigError> {
    let paths = resolve_claude_desktop_paths()?.ok_or_else(|| {
        ConfigError::Unsupported("当前系统不支持 Claude Desktop 配置".to_string())
    })?;
    let output = build_desktop_files(
        read_json_object(&paths.normal_config, "Claude Desktop 配置")?,
        read_json_object(&paths.threep_config, "Claude Desktop 3P 配置")?,
        read_json_object(&paths.meta, "Claude Desktop Profile 元数据")?,
        &context.base_url,
        &context.api_key,
    )?;
    Ok(vec![
        planned_json(&paths.normal_config, &output.normal)?,
        planned_json(&paths.threep_config, &output.threep)?,
        planned_json(&paths.profile, &output.profile)?,
        planned_json(&paths.meta, &output.meta)?,
    ])
}

fn editable_json(path: &Path) -> Result<EditableFile, ConfigError> {
    let (exists, bytes) = if path.exists() {
        (
            true,
            fs::read(path).map_err(|error| {
                ConfigError::Invalid(format!(
                    "无法读取 Claude Desktop 配置 {}: {error}",
                    path.display()
                ))
            })?,
        )
    } else {
        (false, b"{}\n".to_vec())
    };
    let content = String::from_utf8(bytes.clone()).map_err(|_| {
        ConfigError::Invalid(format!(
            "Claude Desktop 配置不是 UTF-8 文本: {}",
            path.display()
        ))
    })?;
    Ok(EditableFile {
        path: path.display().to_string(),
        format: ConfigFormat::Json,
        exists,
        fingerprint: if exists {
            fingerprint(Some(&bytes))
        } else {
            fingerprint(None)
        },
        content,
    })
}

pub(crate) fn read_expert_files(_input: &ReadFilesInput) -> Result<Vec<EditableFile>, ConfigError> {
    let paths = resolve_claude_desktop_paths()?.ok_or_else(|| {
        ConfigError::Unsupported("当前系统不支持 Claude Desktop 配置".to_string())
    })?;
    Ok(vec![
        editable_json(&paths.normal_config)?,
        editable_json(&paths.threep_config)?,
        editable_json(&paths.profile)?,
        editable_json(&paths.meta)?,
    ])
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
            message: Some("Claude Desktop 配置必须是 JSON 对象".to_string()),
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

pub(crate) fn unsupported_detection() -> ClientDetection {
    ClientDetection {
        target: ClientTarget::ClaudeDesktop,
        supported: false,
        status: "unsupported".to_string(),
        paths: Vec::new(),
        restart_required: true,
    }
}

fn detection_from_paths(paths: &ClaudeDesktopPaths) -> ClientDetection {
    ClientDetection {
        target: ClientTarget::ClaudeDesktop,
        supported: true,
        status: if paths.profile.exists() {
            "other_config".to_string()
        } else {
            "not_configured".to_string()
        },
        paths: vec![
            paths.normal_config.display().to_string(),
            paths.threep_config.display().to_string(),
            paths.profile.display().to_string(),
            paths.meta.display().to_string(),
        ],
        restart_required: true,
    }
}

pub(crate) fn detect() -> Result<ClientDetection, ConfigError> {
    Ok(match resolve_claude_desktop_paths()? {
        Some(paths) => detection_from_paths(&paths),
        None => unsupported_detection(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_merge_preserves_unrelated_profiles_and_sets_3p_mode() {
        let existing_meta = serde_json::json!({
            "entries": [{ "id": "other", "name": "Other" }],
            "appliedId": "other"
        });

        let output = build_desktop_files(
            serde_json::json!({ "theme": "light" }),
            serde_json::json!({ "other": true }),
            existing_meta,
            "https://lynn.lat",
            "sk-lin-secret",
        )
        .unwrap();

        assert_eq!(output.normal["theme"], "light");
        assert_eq!(output.normal["deploymentMode"], "3p");
        assert_eq!(output.threep["other"], true);
        assert_eq!(output.threep["deploymentMode"], "3p");
        assert!(output.meta["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["id"] == "other"));
        assert!(output.meta["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["id"] == LINAI_PROFILE_ID));
        assert_eq!(output.meta["appliedId"], LINAI_PROFILE_ID);
        assert_eq!(output.profile["inferenceGatewayAuthScheme"], "bearer");
        assert_eq!(output.profile["inferenceGatewayApiKey"], "sk-lin-secret");
        assert!(output.profile.get("inferenceModels").is_none());
    }

    #[test]
    fn linux_reports_unsupported_without_paths() {
        let detection = unsupported_detection();
        assert!(!detection.supported);
        assert!(detection.paths.is_empty());
        assert_eq!(detection.status, "unsupported");
    }

    #[test]
    fn invalid_existing_meta_is_rejected() {
        let error = build_desktop_files(
            serde_json::json!({}),
            serde_json::json!({}),
            serde_json::json!([]),
            "https://lynn.lat",
            "key",
        )
        .unwrap_err();
        assert!(error.to_string().contains("JSON 对象"));
    }
}
