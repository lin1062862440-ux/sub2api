use std::{fs, path::{Path, PathBuf}};

fn safe_export_name(suggested_name: &str) -> String {
    let file_name = Path::new(suggested_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("linai-export.csv");
    let sanitized: String = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "linai-export.csv".to_string()
    } else {
        sanitized
    }
}

fn available_path(directory: &Path, suggested_name: &str) -> PathBuf {
    let safe_name = safe_export_name(suggested_name);
    let initial = directory.join(&safe_name);
    if !initial.exists() {
        return initial;
    }

    let path = Path::new(&safe_name);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("linai-export");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 2..=9999 {
        let name = match extension {
            Some(value) => format!("{stem}-{index}.{value}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = directory.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }

    directory.join(format!("linai-export-{}.csv", chrono::Utc::now().timestamp_millis()))
}

#[tauri::command]
pub fn save_text_export(content: String, suggested_name: String) -> Result<String, String> {
    let directory = dirs::download_dir()
        .or_else(dirs::document_dir)
        .ok_or_else(|| "无法定位下载目录".to_string())?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建下载目录: {error}"))?;
    let target = available_path(&directory, &suggested_name);
    fs::write(&target, content.as_bytes()).map_err(|error| format!("无法保存导出文件: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_directory_segments_and_unsafe_characters() {
        assert_eq!(safe_export_name("../../LinAI 兑换码.csv"), "LinAI----.csv");
    }

    #[test]
    fn avoids_overwriting_an_existing_export() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("codes.csv"), "existing").unwrap();
        assert_eq!(available_path(directory.path(), "codes.csv"), directory.path().join("codes-2.csv"));
    }
}
