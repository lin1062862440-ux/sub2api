use std::fs;
use std::path::PathBuf;

use toml_edit::DocumentMut;

use super::paths::resolve_codex_dir;
use super::transaction::{fingerprint, PlannedFile};
use super::types::{
    ClientDetection, ClientTarget, ConfigContext, ConfigError, ConfigFormat, EditableFile,
    ReadFilesInput, ValidationResult,
};

fn normalize_base_url(base_url: &str) -> Result<String, ConfigError> {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.is_empty() {
        return Err(ConfigError::Invalid("LinAI API 地址不能为空".to_string()));
    }
    Ok(normalized.to_string())
}

fn toml_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}

pub(crate) fn generate_config(base_url: &str) -> Result<String, ConfigError> {
    let base_url = normalize_base_url(base_url)?;
    Ok(format!(
        r#"model_provider = "OpenAI"
model = "gpt-5.5"
review_model = "gpt-5.5"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true

[model_providers.OpenAI]
name = "OpenAI"
base_url = {}
wire_api = "responses"
requires_openai_auth = true

[features]
goals = true
"#,
        toml_string(&base_url)
    ))
}

pub(crate) fn generate_auth(api_key: &str) -> Result<Vec<u8>, ConfigError> {
    let auth = serde_json::json!({ "OPENAI_API_KEY": api_key });
    let mut bytes = serde_json::to_vec_pretty(&auth)
        .map_err(|error| ConfigError::Invalid(format!("无法生成 Codex auth.json: {error}")))?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub(crate) fn preview_quick(context: &ConfigContext) -> Result<Vec<PlannedFile>, ConfigError> {
    let config_dir = resolve_codex_dir(context.config_dir.as_deref())?;
    let config_path = config_dir.join("config.toml");
    let auth_path = config_dir.join("auth.json");
    Ok(vec![
        PlannedFile::read(
            &config_path,
            ConfigFormat::Toml,
            generate_config(&context.base_url)?.into_bytes(),
        )?,
        PlannedFile::read(
            &auth_path,
            ConfigFormat::Json,
            generate_auth(&context.api_key)?,
        )?,
    ])
}

fn read_expert_file(
    path: PathBuf,
    format: ConfigFormat,
    missing_content: &str,
) -> Result<EditableFile, ConfigError> {
    let (exists, bytes) = if path.exists() {
        (
            true,
            fs::read(&path).map_err(|error| {
                ConfigError::Invalid(format!("无法读取 Codex 配置 {}: {error}", path.display()))
            })?,
        )
    } else {
        (false, missing_content.as_bytes().to_vec())
    };
    let content = String::from_utf8(bytes.clone()).map_err(|_| {
        ConfigError::Invalid(format!("Codex 配置不是 UTF-8 文本: {}", path.display()))
    })?;
    Ok(EditableFile {
        path: path.display().to_string(),
        format,
        exists,
        fingerprint: if exists {
            fingerprint(Some(&bytes))
        } else {
            fingerprint(None)
        },
        content,
    })
}

pub(crate) fn read_expert_files(input: &ReadFilesInput) -> Result<Vec<EditableFile>, ConfigError> {
    let config_dir = resolve_codex_dir(input.config_dir.as_deref())?;
    Ok(vec![
        read_expert_file(config_dir.join("config.toml"), ConfigFormat::Toml, "")?,
        read_expert_file(config_dir.join("auth.json"), ConfigFormat::Json, "{}\n")?,
    ])
}

pub(crate) fn validate_toml(content: &str) -> ValidationResult {
    if content.trim().is_empty() {
        return ValidationResult {
            valid: true,
            message: None,
            line: None,
            column: None,
        };
    }
    match content.parse::<DocumentMut>() {
        Ok(_) => ValidationResult {
            valid: true,
            message: None,
            line: None,
            column: None,
        },
        Err(error) => {
            let span = error.span();
            let (line, column) = span
                .map(|span| line_and_column(content, span.start))
                .unwrap_or((0, 0));
            ValidationResult {
                valid: false,
                message: Some("TOML 格式错误".to_string()),
                line: (line > 0).then_some(line),
                column: (column > 0).then_some(column),
            }
        }
    }
}

fn line_and_column(content: &str, byte_offset: usize) -> (usize, usize) {
    let prefix = &content[..byte_offset.min(content.len())];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix
        .rsplit_once('\n')
        .map(|(_, tail)| tail.chars().count() + 1)
        .unwrap_or_else(|| prefix.chars().count() + 1);
    (line, column)
}

pub(crate) fn validate_json(content: &str) -> ValidationResult {
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Object(_)) => ValidationResult {
            valid: true,
            message: None,
            line: None,
            column: None,
        },
        Ok(_) => ValidationResult {
            valid: false,
            message: Some("Codex auth.json 必须是 JSON 对象".to_string()),
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
    let config_dir = resolve_codex_dir(config_dir)?;
    let config_path = config_dir.join("config.toml");
    let auth_path = config_dir.join("auth.json");
    Ok(ClientDetection {
        target: ClientTarget::Codex,
        supported: true,
        status: if config_path.exists() || auth_path.exists() {
            "other_config".to_string()
        } else {
            "not_configured".to_string()
        },
        paths: vec![
            config_path.display().to_string(),
            auth_path.display().to_string(),
        ],
        restart_required: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_config_matches_ccs_codex_files() {
        let config = generate_config("https://lynn.lat/v1/").unwrap();

        assert!(config.contains("model_provider = \"OpenAI\""));
        assert!(config.contains("model = \"gpt-5.5\""));
        assert!(config.contains("review_model = \"gpt-5.5\""));
        assert!(config.contains("model_reasoning_effort = \"xhigh\""));
        assert!(config.contains("disable_response_storage = true"));
        assert!(config.contains("[features]\ngoals = true"));
        assert!(!config.contains("experimental_bearer_token"));
        let document = config.parse::<toml_edit::DocumentMut>().unwrap();
        assert_eq!(document["model_provider"].as_str(), Some("OpenAI"));
        assert_eq!(
            document["model_providers"]["OpenAI"]["base_url"].as_str(),
            Some("https://lynn.lat/v1")
        );
        assert_eq!(
            document["model_providers"]["OpenAI"]["requires_openai_auth"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn quick_preview_replaces_config_toml_and_auth_json() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("config.toml"), "model = \"old\"\n").unwrap();
        std::fs::write(
            directory.path().join("auth.json"),
            "{\"tokens\":{\"access_token\":\"official\"}}\n",
        )
        .unwrap();
        let context = ConfigContext {
            target: ClientTarget::Codex,
            api_key_id: 12,
            api_key: "sk-lin-secret".to_string(),
            base_url: "https://lynn.lat/v1".to_string(),
            group_platform: "openai".to_string(),
            config_dir: Some(directory.path().display().to_string()),
        };

        let files = preview_quick(&context).unwrap();

        assert_eq!(files.len(), 2);
        let config = files
            .iter()
            .find(|file| file.path.ends_with("config.toml"))
            .expect("config.toml planned");
        let auth = files
            .iter()
            .find(|file| file.path.ends_with("auth.json"))
            .expect("auth.json planned");
        let config_after = String::from_utf8(config.after.clone()).unwrap();
        assert!(config_after.contains("model_provider = \"OpenAI\""));
        assert!(!config_after.contains("experimental_bearer_token"));
        let auth_after: serde_json::Value = serde_json::from_slice(&auth.after).unwrap();
        assert_eq!(auth_after["OPENAI_API_KEY"], "sk-lin-secret");
    }

    #[test]
    fn malformed_toml_is_rejected_by_validator() {
        let result = validate_toml("model = [");
        assert!(!result.valid);
        assert!(result.message.unwrap().contains("TOML"));
    }
}
