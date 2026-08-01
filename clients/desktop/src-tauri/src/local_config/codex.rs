use std::fs;
use std::path::PathBuf;

use toml_edit::{value, DocumentMut, Item, Table};

use super::paths::resolve_codex_dir;
use super::transaction::{fingerprint, PlannedFile};
use super::types::{
    ClientDetection, ClientTarget, ConfigContext, ConfigError, ConfigFormat, EditableFile,
    ReadFilesInput, ValidationResult,
};

fn ensure_table<'a>(table: &'a mut Table, key: &str) -> &'a mut Table {
    if !table.contains_key(key) || !table[key].is_table() {
        table.insert(key, Item::Table(Table::new()));
    }
    table[key]
        .as_table_mut()
        .expect("table inserted immediately above")
}

fn normalize_base_url(base_url: &str) -> Result<String, ConfigError> {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.is_empty() {
        return Err(ConfigError::Invalid("LinAI API 地址不能为空".to_string()));
    }
    Ok(normalized.to_string())
}

pub(crate) fn merge_config(
    existing: &str,
    base_url: &str,
    api_key: &str,
) -> Result<String, ConfigError> {
    let mut document = if existing.trim().is_empty() {
        DocumentMut::new()
    } else {
        existing.parse::<DocumentMut>().map_err(|error| {
            ConfigError::Invalid(format!("Codex config.toml TOML 格式错误: {error}"))
        })?
    };

    document["model_provider"] = value("linai");
    document["model"] = value("gpt-5.5");
    document["review_model"] = value("gpt-5.5");
    document["model_reasoning_effort"] = value("xhigh");

    let providers = ensure_table(document.as_table_mut(), "model_providers");
    let linai = ensure_table(providers, "linai");
    linai["name"] = value("LinAI");
    linai["base_url"] = value(normalize_base_url(base_url)?);
    linai["wire_api"] = value("responses");
    linai["requires_openai_auth"] = value(true);
    linai["experimental_bearer_token"] = value(api_key);

    let mut output = document.to_string();
    if !output.ends_with('\n') {
        output.push('\n');
    }
    Ok(output)
}

pub(crate) fn preview_quick(context: &ConfigContext) -> Result<Vec<PlannedFile>, ConfigError> {
    let config_dir = resolve_codex_dir(context.config_dir.as_deref())?;
    let path = config_dir.join("config.toml");
    let existing = if path.exists() {
        fs::read_to_string(&path).map_err(|error| {
            ConfigError::Invalid(format!("无法读取 Codex 配置 {}: {error}", path.display()))
        })?
    } else {
        String::new()
    };
    let after = merge_config(&existing, &context.base_url, &context.api_key)?;
    Ok(vec![PlannedFile::read(
        &path,
        ConfigFormat::Toml,
        after.into_bytes(),
    )?])
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
    fn quick_merge_preserves_comments_mcp_features_and_other_providers() {
        let existing = r#"# user comment
model_provider = "openai"

[model_providers.other]
name = "Other"
base_url = "https://other.example/v1"

[features]
goals = true

[mcp_servers.docs]
command = "node"
"#;

        let merged = merge_config(existing, "https://lynn.lat/v1", "sk-lin-secret").unwrap();

        assert!(merged.contains("# user comment"));
        assert!(merged.contains("[mcp_servers.docs]"));
        assert!(merged.contains("goals = true"));
        assert!(merged.contains("[model_providers.other]"));
        let document = merged.parse::<toml_edit::DocumentMut>().unwrap();
        assert_eq!(document["model_provider"].as_str(), Some("linai"));
        assert_eq!(
            document["model_providers"]["linai"]["base_url"].as_str(),
            Some("https://lynn.lat/v1")
        );
        assert_eq!(
            document["model_providers"]["linai"]["experimental_bearer_token"].as_str(),
            Some("sk-lin-secret")
        );
    }

    #[test]
    fn safe_preview_never_plans_an_auth_json_write() {
        let directory = tempfile::tempdir().unwrap();
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

        assert_eq!(files.len(), 1);
        assert!(files[0].path.ends_with("config.toml"));
        assert_eq!(
            std::fs::read_to_string(directory.path().join("auth.json")).unwrap(),
            "{\"tokens\":{\"access_token\":\"official\"}}\n"
        );
    }

    #[test]
    fn malformed_toml_is_rejected() {
        let error = merge_config("model = [", "https://lynn.lat/v1", "key").unwrap_err();
        assert!(error.to_string().contains("TOML"));
    }
}
