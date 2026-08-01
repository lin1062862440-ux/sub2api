# LinAI Local Client Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a LinAI desktop user apply an Anthropic API key to Claude Code or Claude Desktop and an OpenAI API key to Codex, with safe merge defaults and a complete-file expert editor.

**Architecture:** A Rust `local_config` engine owns platform paths, parsing, preview tokens, backups, atomic transactions, managed metadata, and three client adapters. Narrow Tauri commands expose detection, preview/apply, expert file reading, validation, and cancellation to focused Vue components added to the existing API-key view. Raw pending writes remain in Rust memory until applied or cancelled; expert file contents exist in the frontend only while the dialog is open.

**Tech Stack:** Tauri 2, Rust 2021, serde/serde_json, toml_edit, dirs, sha2, chrono, uuid, Vue 3, TypeScript, Vitest, Vue Test Utils, Lucide Vue.

---

## File Map

Rust files:

- Create `clients/desktop/src-tauri/src/local_config/mod.rs`: public module boundary, state, target dispatch, detection, preview lifecycle, and command exports.
- Create `clients/desktop/src-tauri/src/local_config/types.rs`: serialized request/response and internal transaction types.
- Create `clients/desktop/src-tauri/src/local_config/paths.rs`: home, environment override, custom override, and OS-specific client paths.
- Create `clients/desktop/src-tauri/src/local_config/transaction.rs`: fingerprints, snapshots, backup retention, atomic writes, stale-preview detection, rollback, and managed metadata.
- Create `clients/desktop/src-tauri/src/local_config/claude_code.rs`: Claude Code detection, JSON merge, validation, and expert files.
- Create `clients/desktop/src-tauri/src/local_config/codex.rs`: Codex detection, comment-preserving TOML merge, auth preservation, and expert files.
- Create `clients/desktop/src-tauri/src/local_config/claude_desktop.rs`: macOS/Windows 3P paths, profile/meta merge, status, and multi-file writes.
- Modify `clients/desktop/src-tauri/src/lib.rs`: manage `LocalConfigHost` and register commands without disturbing existing plugins or usage-display commands.
- Modify `clients/desktop/src-tauri/Cargo.toml`: add only the parsing/path/transaction dependencies used by the engine.
- Create `clients/desktop/THIRD_PARTY_NOTICES.md`: CC Switch MIT attribution.

Frontend files:

- Create `clients/desktop/src/lib/client-config.ts`: TypeScript contracts, Tauri invoke wrappers, group routing, and secret-buffer clearing helpers.
- Create `clients/desktop/src/lib/client-config.spec.ts`: group routing and bridge behavior.
- Create `clients/desktop/src/components/keys/UseApiKeyDialog.vue`: workflow shell, Claude selection, loading, preview, apply, success, and cancellation.
- Create `clients/desktop/src/components/keys/UseApiKeyDialog.spec.ts`: routing, state transitions, unsupported platforms, and buffer cleanup.
- Create `clients/desktop/src/components/keys/ClaudeClientSelector.vue`: Claude Code/Desktop segmented target control.
- Create `clients/desktop/src/components/keys/QuickClientConfig.vue`: detected status and safe-apply summary.
- Create `clients/desktop/src/components/keys/ConfigDiffViewer.vue`: compact per-file before/after diff.
- Create `clients/desktop/src/components/keys/FullConfigEditor.vue`: full-file tabs, text editor, validation, reset, and expert warning.
- Create `clients/desktop/src/components/keys/FullConfigEditor.spec.ts`: multi-file editing, validation, reset, and save behavior.
- Create `clients/desktop/src/views/ApiKeysView.spec.ts`: API-key row entry integration.
- Modify `clients/desktop/src/views/ApiKeysView.vue`: add the `使用` action, unsupported message, and dialog mount.

No backend HTTP API changes are required.

### Task 1: Rust Contracts And Cross-Platform Paths

**Files:**
- Modify: `clients/desktop/src-tauri/Cargo.toml`
- Create: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Create: `clients/desktop/src-tauri/src/local_config/types.rs`
- Create: `clients/desktop/src-tauri/src/local_config/paths.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing path-resolution tests**

Add tests to `paths.rs` that use explicit inputs rather than the real machine:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn claude_code_prefers_custom_then_env_then_home() {
        let home = Path::new("/home/lin");
        assert_eq!(
            claude_code_dir(home, Some(Path::new("/custom/claude")), Some(Path::new("/env/claude"))),
            Path::new("/custom/claude")
        );
        assert_eq!(
            claude_code_dir(home, None, Some(Path::new("/env/claude"))),
            Path::new("/env/claude")
        );
        assert_eq!(claude_code_dir(home, None, None), Path::new("/home/lin/.claude"));
    }

    #[test]
    fn codex_prefers_custom_then_codex_home_then_user_home() {
        let home = Path::new("C:/Users/Lin");
        assert_eq!(
            codex_dir(home, Some(Path::new("D:/codex")), Some(Path::new("E:/env-codex"))),
            Path::new("D:/codex")
        );
        assert_eq!(codex_dir(home, None, None), Path::new("C:/Users/Lin/.codex"));
    }

    #[test]
    fn claude_desktop_uses_macos_and_windows_3p_roots() {
        let mac = claude_desktop_paths_for_macos(Path::new("/Users/lin"));
        assert!(mac.profile.to_string_lossy().contains("Claude-3p/configLibrary"));
        let windows = claude_desktop_paths_for_windows(Path::new("C:/Users/Lin/AppData/Local"), &[]);
        assert!(windows.profile.to_string_lossy().contains("Claude-3p\\configLibrary"));
    }
}
```

- [ ] **Step 2: Run the path tests and verify failure**

Run:

```bash
cd clients/desktop/src-tauri
cargo test local_config::paths::tests -- --nocapture
```

Expected: compilation fails because `local_config`, the path functions, and serialized types do not exist.

- [ ] **Step 3: Add dependencies and implement contracts and pure path helpers**

Add these dependencies using the same versions already proven in `cc-switch/src-tauri/Cargo.toml`:

```toml
chrono = { version = "0.4", features = ["serde"] }
dirs = "5.0"
sha2 = "0.10"
tempfile = "3"
toml_edit = "0.22"
uuid = { version = "1.11", features = ["v4"] }
```

Define stable serialized contracts in `types.rs`:

```rust
#[derive(Clone, Debug, Eq, Hash, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientTarget { ClaudeCode, ClaudeDesktop, Codex }

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigFormat { Json, Toml }

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyMode { Quick, Expert }

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

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigContext {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub api_key: String,
    pub base_url: String,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub context: ConfigContext,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFilesInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditableFile {
    pub path: String,
    pub format: ConfigFormat,
    pub exists: bool,
    pub fingerprint: String,
    pub content: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateFileInput {
    pub path: String,
    pub format: ConfigFormat,
    pub content: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub message: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertPreviewInput {
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub group_platform: String,
    pub config_dir: Option<String>,
    pub files: Vec<EditableFile>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub format: ConfigFormat,
    pub changed: bool,
    pub redacted_before: String,
    pub redacted_after: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPreview {
    pub preview_id: String,
    pub target: ClientTarget,
    pub mode: ApplyMode,
    pub files: Vec<FileDiff>,
    pub restart_required: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub target: ClientTarget,
    pub changed_paths: Vec<String>,
    pub backup_path: String,
    pub restart_required: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetection {
    pub target: ClientTarget,
    pub supported: bool,
    pub status: String,
    pub paths: Vec<String>,
    pub restart_required: bool,
}
```

Implement `claude_code_dir`, `codex_dir`, `claude_desktop_paths_for_macos`, and `claude_desktop_paths_for_windows` as pure functions. Runtime helpers use `dirs::home_dir`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `%LOCALAPPDATA%` only at the outer boundary. Preserve an existing Claude `claude.json` when `settings.json` is absent. Tests, and debug builds when `LINAI_CONFIG_TEST_HOME` is explicitly set, resolve every client root below that disposable directory; release builds ignore the test-only override.

Expose `pub mod local_config;` from `lib.rs` without registering commands yet.

- [ ] **Step 4: Run path tests and Rust formatting**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config::paths::tests -- --nocapture
```

Expected: all path tests pass and no real user paths are accessed.

- [ ] **Step 5: Commit the path foundation**

```bash
git add clients/desktop/src-tauri/Cargo.toml clients/desktop/src-tauri/Cargo.lock clients/desktop/src-tauri/src/lib.rs clients/desktop/src-tauri/src/local_config
git commit -m "feat(desktop): add local client config contracts"
```

### Task 2: Preview Transactions, Backups, And Managed State

**Files:**
- Create: `clients/desktop/src-tauri/src/local_config/transaction.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/types.rs`

- [ ] **Step 1: Write failing transaction tests**

Cover revision conflicts, backup-before-write, rollback, and retention with temporary directories:

```rust
#[test]
fn apply_rejects_a_file_changed_after_preview() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, b"{\"env\":{}}").unwrap();
    let change = PlannedFile::from_existing(&path, ConfigFormat::Json, b"{\"env\":{}}", b"{\"env\":{\"A\":\"B\"}}".to_vec());
    std::fs::write(&path, b"{\"externallyChanged\":true}").unwrap();
    let error = apply_transaction(dir.path(), "claude_code", &[change]).unwrap_err();
    assert!(error.to_string().contains("预览后已发生变化"));
}

#[test]
fn failed_second_write_restores_all_original_files() {
    let dir = tempfile::tempdir().unwrap();
    let first = dir.path().join("config.toml");
    let blocked = dir.path().join("blocked").join("auth.json");
    std::fs::write(&first, "model = \"old\"\n").unwrap();
    let changes = vec![
        PlannedFile::read(&first, ConfigFormat::Toml, b"model = \"new\"\n".to_vec()).unwrap(),
        PlannedFile::missing(&blocked, ConfigFormat::Json, b"{}\n".to_vec()),
    ];
    let result = apply_transaction_with_writer(dir.path(), "codex", &changes, |index, change| {
        if index == 1 { return Err(ConfigError::Write("forced".into())); }
        atomic_replace(&change.path, &change.after)
    });
    assert!(result.is_err());
    assert_eq!(std::fs::read_to_string(&first).unwrap(), "model = \"old\"\n");
    assert!(!blocked.exists());
}
```

- [ ] **Step 2: Run transaction tests and verify failure**

Run `cargo test local_config::transaction::tests -- --nocapture` from `clients/desktop/src-tauri`.

Expected: compilation fails because fingerprints, planned files, backup helpers, and apply transactions are not implemented.

- [ ] **Step 3: Implement pending previews and transaction safety**

Implement these core types:

```rust
#[derive(Clone)]
pub(crate) struct PlannedFile {
    pub path: PathBuf,
    pub format: ConfigFormat,
    pub before: Option<Vec<u8>>,
    pub before_fingerprint: String,
    pub after: Vec<u8>,
}

pub(crate) struct PendingPreview {
    pub id: String,
    pub target: ClientTarget,
    pub api_key_id: i64,
    pub mode: ApplyMode,
    pub files: Vec<PlannedFile>,
    pub created_at: std::time::Instant,
}

#[derive(Default)]
pub struct LocalConfigHost {
    pending: std::sync::Mutex<std::collections::HashMap<String, PendingPreview>>,
    write_lock: std::sync::Mutex<()>,
}
```

Fingerprint bytes with SHA-256, represent a missing file with a stable sentinel, create backups under `<app-data>/config-backups/<target>/<timestamp>/`, and retain the newest ten successful-operation directories per target. Use `tempfile::NamedTempFile::persist` in the destination directory for atomic replacement and set Unix backup/file permissions to `0600` where supported.

Pending previews are single-use. `insert_preview` and `take_preview` first remove entries older than ten minutes, and the dialog cancellation command removes the active entry immediately.

Persist `ManagedStateFile` as JSON under the LinAI app-data directory only after verification succeeds:

```rust
#[derive(Default, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedStateFile {
    pub targets: std::collections::BTreeMap<String, ManagedTargetState>,
    pub config_overrides: std::collections::BTreeMap<String, String>,
}
```

- [ ] **Step 4: Run transaction tests**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config::transaction::tests -- --nocapture
```

Expected: conflict, rollback, retention, permission, and no-mutation-on-backup-failure tests pass.

- [ ] **Step 5: Commit transaction safety**

```bash
git add clients/desktop/src-tauri/src/local_config
git commit -m "feat(desktop): add safe config transactions"
```

### Task 3: Claude Code Adapter

**Files:**
- Create: `clients/desktop/src-tauri/src/local_config/claude_code.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/types.rs`

- [ ] **Step 1: Write failing safe-merge tests**

```rust
#[test]
fn quick_merge_updates_only_linai_env_fields() {
    let existing = serde_json::json!({
        "$schema": "https://json.schemastore.org/claude-code-settings.json",
        "env": { "OTHER": "keep", "ANTHROPIC_AUTH_TOKEN": "old" },
        "mcpServers": { "docs": { "command": "node" } },
        "hooks": { "PreToolUse": ["keep"] }
    });
    let merged = merge_settings(existing, "https://lynn.lat", "sk-lin-secret").unwrap();
    assert_eq!(merged["env"]["ANTHROPIC_BASE_URL"], "https://lynn.lat");
    assert_eq!(merged["env"]["ANTHROPIC_AUTH_TOKEN"], "sk-lin-secret");
    assert_eq!(merged["env"]["OTHER"], "keep");
    assert_eq!(merged["mcpServers"]["docs"]["command"], "node");
    assert_eq!(merged["hooks"]["PreToolUse"][0], "keep");
}

#[test]
fn malformed_existing_settings_are_rejected_without_overwrite() {
    let error = preview_quick_bytes(b"[]", "https://lynn.lat", "key").unwrap_err();
    assert!(error.to_string().contains("JSON 对象"));
}
```

- [ ] **Step 2: Run Claude Code tests and verify failure**

Run `cargo test local_config::claude_code::tests -- --nocapture`.

Expected: compilation fails because the adapter and merge functions do not exist.

- [ ] **Step 3: Implement detection, safe merge, and expert file access**

Implement `merge_settings` with object-level mutation, not string replacement:

```rust
pub(crate) fn merge_settings(
    mut settings: serde_json::Value,
    base_url: &str,
    api_key: &str,
) -> Result<serde_json::Value, ConfigError> {
    let root = settings.as_object_mut().ok_or_else(|| ConfigError::Invalid("Claude Code settings.json 必须是 JSON 对象".into()))?;
    let env = root.entry("env").or_insert_with(|| serde_json::json!({}));
    let env = env.as_object_mut().ok_or_else(|| ConfigError::Invalid("Claude Code env 必须是 JSON 对象".into()))?;
    env.insert("ANTHROPIC_BASE_URL".into(), base_url.trim_end_matches('/').into());
    env.insert("ANTHROPIC_AUTH_TOKEN".into(), api_key.into());
    env.insert("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".into(), "1".into());
    env.insert("CLAUDE_CODE_ATTRIBUTION_HEADER".into(), "0".into());
    Ok(settings)
}
```

Serialize pretty JSON with a trailing newline. Detection reports `not_configured`, `other_config`, `managed`, or `drifted` from file existence, required env fields, and managed fingerprints. Expert mode returns the complete selected `settings.json` or legacy `claude.json` file.

- [ ] **Step 4: Run Claude Code tests**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config::claude_code::tests -- --nocapture
```

Expected: merge preservation, malformed input, missing-file creation, and drift detection tests pass.

- [ ] **Step 5: Commit Claude Code support**

```bash
git add clients/desktop/src-tauri/src/local_config
git commit -m "feat(desktop): manage Claude Code configuration"
```

### Task 4: Codex Adapter With Official Auth Preservation

**Files:**
- Create: `clients/desktop/src-tauri/src/local_config/codex.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/types.rs`

- [ ] **Step 1: Write failing TOML-preservation tests**

```rust
#[test]
fn quick_merge_preserves_comments_mcp_features_and_auth() {
    let existing = r#"# user comment
model_provider = "openai"
[features]
goals = true
[mcp_servers.docs]
command = "node"
"#;
    let merged = merge_config(existing, "https://lynn.lat/v1", "sk-lin-secret").unwrap();
    assert!(merged.contains("# user comment"));
    assert!(merged.contains("[mcp_servers.docs]"));
    assert!(merged.contains("goals = true"));
    let doc = merged.parse::<toml_edit::DocumentMut>().unwrap();
    assert_eq!(doc["model_provider"].as_str(), Some("linai"));
    assert_eq!(doc["model_providers"]["linai"]["base_url"].as_str(), Some("https://lynn.lat/v1"));
    assert_eq!(doc["model_providers"]["linai"]["experimental_bearer_token"].as_str(), Some("sk-lin-secret"));
}

#[test]
fn safe_preview_never_plans_an_auth_json_write() {
    let files = preview_quick_files(Path::new("/tmp/.codex"), "", "https://lynn.lat/v1", "key").unwrap();
    assert_eq!(files.len(), 1);
    assert!(files[0].path.ends_with("config.toml"));
}
```

- [ ] **Step 2: Run Codex tests and verify failure**

Run `cargo test local_config::codex::tests -- --nocapture`.

Expected: compilation fails because the Codex adapter does not exist.

- [ ] **Step 3: Implement comment-preserving Codex merge**

Parse existing non-empty text with `toml_edit::DocumentMut`; create a new document only when the file is absent or empty. Set these owned values:

```rust
doc["model_provider"] = toml_edit::value("linai");
doc["model"] = toml_edit::value("gpt-5.5");
doc["review_model"] = toml_edit::value("gpt-5.5");
doc["model_reasoning_effort"] = toml_edit::value("xhigh");
doc["model_providers"]["linai"]["name"] = toml_edit::value("LinAI");
doc["model_providers"]["linai"]["base_url"] = toml_edit::value(normalize_codex_base_url(base_url));
doc["model_providers"]["linai"]["wire_api"] = toml_edit::value("responses");
doc["model_providers"]["linai"]["requires_openai_auth"] = toml_edit::value(true);
doc["model_providers"]["linai"]["experimental_bearer_token"] = toml_edit::value(api_key);
```

Do not read, rewrite, or delete `auth.json` in quick mode. Expert mode returns both files, representing a missing file as empty content with the correct format. Validation parses TOML and requires a JSON object for non-empty `auth.json`.

- [ ] **Step 4: Run Codex tests**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config::codex::tests -- --nocapture
```

Expected: comments, MCP, features, unrelated providers, and fixture `auth.json` remain byte-for-byte untouched in quick mode; expert validation tests pass.

- [ ] **Step 5: Commit Codex support**

```bash
git add clients/desktop/src-tauri/src/local_config
git commit -m "feat(desktop): manage Codex configuration"
```

### Task 5: Claude Desktop 3P Adapter

**Files:**
- Create: `clients/desktop/src-tauri/src/local_config/claude_desktop.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/types.rs`

- [ ] **Step 1: Write failing multi-file profile tests**

```rust
#[test]
fn quick_merge_preserves_unrelated_profiles_and_sets_3p_mode() {
    let existing_meta = serde_json::json!({
        "entries": [{ "id": "other", "name": "Other" }],
        "selectedId": "other"
    });
    let output = build_desktop_files(
        serde_json::json!({ "theme": "light" }),
        serde_json::json!({ "other": true }),
        existing_meta,
        "https://lynn.lat",
        "sk-lin-secret",
    ).unwrap();
    assert_eq!(output.normal["theme"], "light");
    assert_eq!(output.normal["deploymentMode"], "3p");
    assert_eq!(output.threep["other"], true);
    assert!(output.meta["entries"].as_array().unwrap().iter().any(|entry| entry["id"] == "other"));
    assert!(output.meta["entries"].as_array().unwrap().iter().any(|entry| entry["id"] == LINAI_PROFILE_ID));
    assert_eq!(output.profile["inferenceGatewayAuthScheme"], "bearer");
}

#[test]
fn linux_reports_unsupported_without_file_plans() {
    let result = detect_for_platform(DesktopPlatform::Linux, Path::new("/home/lin"));
    assert!(!result.supported);
    assert!(result.paths.is_empty());
}
```

- [ ] **Step 2: Run Claude Desktop tests and verify failure**

Run `cargo test local_config::claude_desktop::tests -- --nocapture`.

Expected: compilation fails because profile builders and platform detection are missing.

- [ ] **Step 3: Port and trim the CC Switch 3P writer**

Port only the relevant behavior from `cc-switch/src-tauri/src/claude_desktop_config.rs`:

```rust
pub const LINAI_PROFILE_ID: &str = "00000000-0000-4000-8000-00000011a1a1";
pub const LINAI_PROFILE_NAME: &str = "LinAI";

fn build_gateway_profile(base_url: &str, api_key: &str) -> serde_json::Value {
    serde_json::json!({
        "coworkEgressAllowedHosts": ["*"],
        "disableDeploymentModeChooser": true,
        "inferenceGatewayApiKey": api_key,
        "inferenceGatewayAuthScheme": "bearer",
        "inferenceGatewayBaseUrl": base_url.trim_end_matches('/'),
        "inferenceProvider": "gateway"
    })
}
```

Implement object-preserving `write_deployment_mode` and `write_meta` builders. Do not copy CC Switch's database, proxy mode, route catalog, gateway-token generation, or official-provider switching. Generate four `PlannedFile` records so the shared transaction layer provides all-or-nothing behavior.

- [ ] **Step 4: Run Claude Desktop tests**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config::claude_desktop::tests -- --nocapture
```

Expected: macOS/Windows path, profile preservation, existing metadata, missing-file creation, Linux unsupported, and multi-file rollback tests pass.

- [ ] **Step 5: Commit Claude Desktop support**

```bash
git add clients/desktop/src-tauri/src/local_config
git commit -m "feat(desktop): manage Claude Desktop profiles"
```

### Task 6: Tauri Commands, Preview Lifecycle, And Attribution

**Files:**
- Modify: `clients/desktop/src-tauri/src/local_config/mod.rs`
- Modify: `clients/desktop/src-tauri/src/local_config/types.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs`
- Create: `clients/desktop/THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: Write failing dispatch and redaction tests**

```rust
#[test]
fn pending_preview_is_consumed_once_and_never_serializes_raw_key() {
    let host = LocalConfigHost::default();
    let preview = host.insert_preview(test_preview("sk-lin-never-log"));
    let json = serde_json::to_string(&preview).unwrap();
    assert!(!json.contains("sk-lin-never-log"));
    assert!(host.take_preview(&preview.preview_id).is_ok());
    assert!(host.take_preview(&preview.preview_id).is_err());
}

#[test]
fn unsupported_group_values_are_rejected_before_dispatch() {
    let error = validate_group_target("gemini", ClientTarget::Codex).unwrap_err();
    assert!(error.to_string().contains("当前分组暂不支持客户端配置"));
}
```

- [ ] **Step 2: Run dispatch tests and verify failure**

Run `cargo test local_config::tests -- --nocapture`.

Expected: compilation fails because command dispatch and public preview projection are not implemented.

- [ ] **Step 3: Implement and register narrow commands**

Expose these Tauri commands:

```rust
#[tauri::command]
pub fn detect_local_client(app: tauri::AppHandle, input: DetectInput) -> Result<ClientDetection, String>;

#[tauri::command]
pub fn preview_local_client_config(app: tauri::AppHandle, state: tauri::State<'_, LocalConfigHost>, input: PreviewInput) -> Result<ConfigPreview, String>;

#[tauri::command]
pub fn apply_local_client_config(app: tauri::AppHandle, state: tauri::State<'_, LocalConfigHost>, preview_id: String) -> Result<ApplyResult, String>;

#[tauri::command]
pub fn read_local_client_files(app: tauri::AppHandle, input: ReadFilesInput) -> Result<Vec<EditableFile>, String>;

#[tauri::command]
pub fn validate_local_client_file(input: ValidateFileInput) -> ValidationResult;

#[tauri::command]
pub fn preview_expert_local_client_config(state: tauri::State<'_, LocalConfigHost>, input: ExpertPreviewInput) -> Result<ConfigPreview, String>;

#[tauri::command]
pub fn cancel_local_client_preview(state: tauri::State<'_, LocalConfigHost>, preview_id: String);
```

Public `ConfigPreview` returns a preview ID, redacted diff lines, paths, changed flags, and restart requirement. Raw planned bytes remain in `LocalConfigHost.pending`. Expert file reads intentionally return full content, but validation errors report path/line/column without echoing content.

Manage `LocalConfigHost::default()` in `run()` and append these commands to the existing `generate_handler!` list without changing usage-display commands.

Create `THIRD_PARTY_NOTICES.md` with CC Switch's 2025 Jason Young copyright and full MIT text copied from `cc-switch/LICENSE`.

- [ ] **Step 4: Verify the command surface**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test local_config -- --nocapture
cargo check
```

Expected: all local-config tests pass, Tauri command types compile, and existing Tauri host code still checks.

- [ ] **Step 5: Commit the host integration**

```bash
git add clients/desktop/src-tauri/src/lib.rs clients/desktop/src-tauri/src/local_config clients/desktop/THIRD_PARTY_NOTICES.md
git commit -m "feat(desktop): expose local config commands"
```

### Task 7: Frontend Bridge And Group Routing

**Files:**
- Create: `clients/desktop/src/lib/client-config.ts`
- Create: `clients/desktop/src/lib/client-config.spec.ts`

- [ ] **Step 1: Write failing frontend contract tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { routeApiKeyClient, clearEditableFiles } from './client-config'

describe('client config routing', () => {
  it('routes OpenAI directly to Codex and Anthropic to Claude selection', () => {
    expect(routeApiKeyClient('openai')).toEqual({ kind: 'target', target: 'codex' })
    expect(routeApiKeyClient('anthropic')).toEqual({ kind: 'choose_claude' })
  })

  it.each(['gemini', 'antigravity', 'grok', 'composite', '', 'unknown'])('rejects %s', (platform) => {
    expect(routeApiKeyClient(platform)).toEqual({
      kind: 'unsupported',
      message: '当前分组暂不支持客户端配置',
    })
  })

  it('clears secret-bearing editor buffers in place', () => {
    const files = [{ path: '/x/auth.json', format: 'json' as const, content: 'secret', fingerprint: 'a', exists: true }]
    clearEditableFiles(files)
    expect(files[0].content).toBe('')
  })
})
```

- [ ] **Step 2: Run the frontend tests and verify failure**

Run `pnpm test:run -- src/lib/client-config.spec.ts` from `clients/desktop`.

Expected: failure because the bridge module does not exist.

- [ ] **Step 3: Implement typed invoke wrappers**

Define unions matching Rust snake-case values and camel-case fields:

```ts
export type ClientTarget = 'claude_code' | 'claude_desktop' | 'codex'
export type ConfigFormat = 'json' | 'toml'
export type ClientStatus = 'not_configured' | 'managed' | 'other_config' | 'drifted' | 'unsupported'

export interface DetectInput {
  target: ClientTarget
  apiKeyId: number
  groupPlatform: string
  configDir?: string
}

export interface ClientDetection {
  target: ClientTarget
  supported: boolean
  status: ClientStatus
  paths: string[]
  restartRequired: boolean
}

export interface ConfigContext extends DetectInput {
  apiKey: string
  baseUrl: string
}

export interface PreviewInput { context: ConfigContext }

export interface EditableFile {
  path: string
  format: ConfigFormat
  exists: boolean
  fingerprint: string
  content: string
}

export interface ReadFilesInput extends DetectInput {}
export interface ValidateFileInput { path: string; format: ConfigFormat; content: string }
export interface ValidationResult { valid: boolean; message?: string; line?: number; column?: number }
export interface ExpertPreviewInput extends DetectInput { files: EditableFile[] }
export interface FileDiff { path: string; format: ConfigFormat; changed: boolean; redactedBefore: string; redactedAfter: string }
export interface ConfigPreview { previewId: string; target: ClientTarget; mode: 'quick' | 'expert'; files: FileDiff[]; restartRequired: boolean }
export interface ApplyResult { target: ClientTarget; changedPaths: string[]; backupPath: string; restartRequired: boolean }

export function routeApiKeyClient(platform?: string) {
  if (platform === 'anthropic') return { kind: 'choose_claude' as const }
  if (platform === 'openai') return { kind: 'target' as const, target: 'codex' as const }
  return { kind: 'unsupported' as const, message: '当前分组暂不支持客户端配置' }
}

const CLAUDE_TARGET_KEY = 'linai:last-claude-target'
export function readRememberedClaudeTarget(): 'claude_code' | 'claude_desktop' {
  return localStorage.getItem(CLAUDE_TARGET_KEY) === 'claude_desktop' ? 'claude_desktop' : 'claude_code'
}
export function rememberClaudeTarget(target: 'claude_code' | 'claude_desktop') {
  localStorage.setItem(CLAUDE_TARGET_KEY, target)
}

export const detectLocalClient = (input: DetectInput) => invoke<ClientDetection>('detect_local_client', { input })
export const previewLocalClientConfig = (input: PreviewInput) => invoke<ConfigPreview>('preview_local_client_config', { input })
export const applyLocalClientConfig = (previewId: string) => invoke<ApplyResult>('apply_local_client_config', { previewId })
export const readLocalClientFiles = (input: ReadFilesInput) => invoke<EditableFile[]>('read_local_client_files', { input })
export const previewExpertLocalClientConfig = (input: ExpertPreviewInput) => invoke<ConfigPreview>('preview_expert_local_client_config', { input })
export const cancelLocalClientPreview = (previewId: string) => invoke<void>('cancel_local_client_preview', { previewId })
```

Do not swallow errors in these wrappers; the dialog must display real filesystem failures. Only visual preview tests mock the bridge.

- [ ] **Step 4: Run frontend bridge tests**

Run:

```bash
cd clients/desktop
pnpm test:run -- src/lib/client-config.spec.ts
```

Expected: routing, unsupported messaging, secret clearing, and invoke argument tests pass.

- [ ] **Step 5: Commit the frontend bridge**

```bash
git add clients/desktop/src/lib/client-config.ts clients/desktop/src/lib/client-config.spec.ts
git commit -m "feat(desktop): add client config bridge"
```

### Task 8: Quick-Apply Dialog And Diff Preview

**Files:**
- Create: `clients/desktop/src/components/keys/UseApiKeyDialog.vue`
- Create: `clients/desktop/src/components/keys/UseApiKeyDialog.spec.ts`
- Create: `clients/desktop/src/components/keys/ClaudeClientSelector.vue`
- Create: `clients/desktop/src/components/keys/QuickClientConfig.vue`
- Create: `clients/desktop/src/components/keys/ConfigDiffViewer.vue`

- [ ] **Step 1: Write failing workflow tests**

Mock `@/lib/client-config` and assert the agreed flow:

```ts
it('lets an Anthropic key choose Claude and previews before applying', async () => {
  const wrapper = mount(UseApiKeyDialog, {
    props: { apiKey: anthropicKey, baseUrl: 'https://lynn.lat/v1' },
  })
  await wrapper.get('[data-testid="target-claude-code"]').trigger('click')
  await flushPromises()
  expect(mocks.detectLocalClient).toHaveBeenCalledWith(expect.objectContaining({ target: 'claude_code' }))
  await wrapper.get('[data-testid="quick-preview"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="config-diff"]').text()).toContain('settings.json')
  expect(mocks.applyLocalClientConfig).not.toHaveBeenCalled()
  await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
  expect(mocks.applyLocalClientConfig).toHaveBeenCalledWith('preview-1')
})

it('opens an OpenAI key directly on Codex', async () => {
  const wrapper = mount(UseApiKeyDialog, { props: { apiKey: openAiKey, baseUrl: 'https://lynn.lat/v1' } })
  await flushPromises()
  expect(wrapper.find('[data-testid="claude-targets"]').exists()).toBe(false)
  expect(mocks.detectLocalClient).toHaveBeenCalledWith(expect.objectContaining({ target: 'codex' }))
})
```

- [ ] **Step 2: Run dialog tests and verify failure**

Run `pnpm test:run -- src/components/keys/UseApiKeyDialog.spec.ts`.

Expected: failure because the components do not exist.

- [ ] **Step 3: Implement the quick workflow**

Use a small explicit state machine:

```ts
type DialogStep = 'choose' | 'detecting' | 'quick' | 'preview' | 'applying' | 'success' | 'expert'
const step = ref<DialogStep>(props.apiKey.group?.platform === 'openai' ? 'detecting' : 'choose')
const target = ref<ClientTarget | null>(props.apiKey.group?.platform === 'openai' ? 'codex' : rememberedClaudeTarget())
```

The dialog must:

- Show Claude Code/Desktop as a segmented target, with Desktop disabled when detection says unsupported.
- Render resolved paths and status in `QuickClientConfig`.
- Show a compact `更改目录` control for Claude Code and Codex. The entered directory is passed as `configDir`, and a successful apply lets Rust persist that non-secret override in managed state. Claude Desktop uses its platform-managed location and does not show this control.
- Call preview before enabling the final apply confirmation.
- Render redacted per-file changes in `ConfigDiffViewer`.
- Cancel any pending preview on target change or dialog close.
- Display `新会话生效` for CLI clients and `重启 Claude Desktop 后生效` for Desktop.
- Use existing desktop variables, Lucide icons, 7-8px radii, normal body text sizes, and one scroll surface.

- [ ] **Step 4: Run quick-dialog tests**

Run:

```bash
cd clients/desktop
pnpm test:run -- src/components/keys/UseApiKeyDialog.spec.ts
```

Expected: target selection, direct Codex routing, detection failures, preview confirmation, apply success, restart messaging, and Escape/backdrop cancellation pass.

- [ ] **Step 5: Commit the quick workflow**

```bash
git add clients/desktop/src/components/keys
git commit -m "feat(desktop): add API key quick-use dialog"
```

### Task 9: Complete-File Expert Editor

**Files:**
- Create: `clients/desktop/src/components/keys/FullConfigEditor.vue`
- Create: `clients/desktop/src/components/keys/FullConfigEditor.spec.ts`
- Modify: `clients/desktop/src/components/keys/UseApiKeyDialog.vue`
- Modify: `clients/desktop/src/components/keys/UseApiKeyDialog.spec.ts`

- [ ] **Step 1: Write failing expert-editor tests**

```ts
it('edits complete files, validates, resets, and previews full replacement', async () => {
  const wrapper = mount(FullConfigEditor, { props: { files: editableCodexFiles } })
  expect(wrapper.text()).toContain('config.toml')
  expect(wrapper.text()).toContain('auth.json')
  await wrapper.get('[data-testid="expert-content"]').setValue('invalid = [')
  await wrapper.get('[data-testid="expert-preview"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="validation-error"]').text()).toContain('第 1 行')
  expect(mocks.previewExpertLocalClientConfig).not.toHaveBeenCalled()
  await wrapper.get('[data-testid="expert-reset"]').trigger('click')
  expect((wrapper.get('[data-testid="expert-content"]').element as HTMLTextAreaElement).value).toContain('model_provider')
})

it('requires the full-file risk confirmation before saving', async () => {
  const wrapper = mount(FullConfigEditor, { props: { files: editableCodexFiles } })
  await wrapper.get('[data-testid="expert-preview"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="expert-risk"]').text()).toContain('完整覆盖')
  expect(wrapper.get('[data-testid="expert-confirm"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="expert-risk-check"]').setValue(true)
  expect(wrapper.get('[data-testid="expert-confirm"]').attributes('disabled')).toBeUndefined()
})
```

- [ ] **Step 2: Run expert-editor tests and verify failure**

Run `pnpm test:run -- src/components/keys/FullConfigEditor.spec.ts`.

Expected: failure because the expert editor does not exist.

- [ ] **Step 3: Implement full-file tabs and validation**

Maintain separate original and draft buffers:

```ts
const drafts = reactive(props.files.map((file) => ({ ...file, original: file.content })))
const activePath = ref(drafts[0]?.path ?? '')
const activeFile = computed(() => drafts.find((file) => file.path === activePath.value) ?? null)

function resetActive() {
  if (activeFile.value) activeFile.value.content = activeFile.value.original
}

async function validateAll() {
  const results = await Promise.all(drafts.map((file) => validateLocalClientFile({
    path: file.path,
    format: file.format,
    content: file.content,
  })))
  return results.every((result) => result.valid)
}
```

The component uses a stable monospace textarea with tabs above it, a format button, reset icon, path display, validation location, changed marker, and no nested scroll container around the editor. It sends every edited file with its original fingerprint to the expert-preview command. Closing or leaving expert mode overwrites all draft/original strings with empty strings before releasing references.

- [ ] **Step 4: Run expert tests and the dialog regression tests**

Run:

```bash
cd clients/desktop
pnpm test:run -- src/components/keys/FullConfigEditor.spec.ts src/components/keys/UseApiKeyDialog.spec.ts
```

Expected: multi-file tabs, complete-content editing, syntax errors, reset, risk confirmation, preview/apply, and secret-buffer cleanup pass.

- [ ] **Step 5: Commit expert mode**

```bash
git add clients/desktop/src/components/keys
git commit -m "feat(desktop): add full client config editor"
```

### Task 10: API-Key View Integration And End-To-End Verification

**Files:**
- Create: `clients/desktop/src/views/ApiKeysView.spec.ts`
- Modify: `clients/desktop/src/views/ApiKeysView.vue`
- Modify: `clients/desktop/src/test/visual/api.ts` only if its API-key fixtures lack required platform data

- [ ] **Step 1: Write failing API-key row tests**

```ts
it('opens Use for supported groups and explains unsupported groups', async () => {
  const wrapper = mount(ApiKeysView)
  await flushPromises()
  const useButtons = wrapper.findAll('[data-testid="use-api-key"]')
  await useButtons[0].trigger('click')
  expect(wrapper.findComponent(UseApiKeyDialog).props('apiKey').group.platform).toBe('anthropic')
  await wrapper.findComponent(UseApiKeyDialog).vm.$emit('close')
  await useButtons[2].trigger('click')
  expect(wrapper.text()).toContain('当前分组暂不支持客户端配置')
})

it('passes the public API endpoint and never stores the key in the URL', async () => {
  const wrapper = mount(ApiKeysView)
  await flushPromises()
  await wrapper.find('[data-testid="use-api-key"]').trigger('click')
  expect(wrapper.findComponent(UseApiKeyDialog).props('baseUrl')).toBe('https://lynn.lat/v1')
  expect(window.location.href).not.toContain('sk-lin-')
})
```

- [ ] **Step 2: Run API-key view tests and verify failure**

Run `pnpm test:run -- src/views/ApiKeysView.spec.ts`.

Expected: failure because the row has no `使用` action or dialog integration.

- [ ] **Step 3: Add the row action and dialog mount**

Add a familiar terminal/use icon button to the existing action group:

```vue
<button
  class="action-button"
  type="button"
  title="使用"
  data-testid="use-api-key"
  @click="openUseKey(key)"
>
  <TerminalSquare :size="15" />
</button>
```

`openUseKey` uses `routeApiKeyClient`. Unsupported platforms call the existing toast with the exact approved message. Supported platforms assign `useTarget` and open `UseApiKeyDialog`, passing `apiEndpoint`. Closing clears `useTarget` before the next animation frame.

Keep the five icon actions within the existing fixed row; at the `1180px` breakpoint tighten the gap rather than shrinking icons or text below existing sizes.

- [ ] **Step 4: Run targeted and full verification**

Run:

```bash
cd clients/desktop
pnpm test:run -- src/lib/client-config.spec.ts src/components/keys/UseApiKeyDialog.spec.ts src/components/keys/FullConfigEditor.spec.ts src/views/ApiKeysView.spec.ts
pnpm test:run
pnpm build
cd src-tauri
cargo fmt --check
cargo test local_config -- --nocapture
cargo check
```

Expected: all targeted and existing tests pass, the frontend production build succeeds, local-config Rust tests pass, and the Tauri host checks.

- [ ] **Step 5: Verify the macOS flow against a disposable home in development mode**

Start the existing desktop client with every managed client path redirected below a disposable directory:

```bash
cd clients/desktop
LINAI_TEST_ROOT=$(mktemp -d /tmp/linai-client-config.XXXXXX)
LINAI_CONFIG_TEST_HOME="$LINAI_TEST_ROOT" pnpm tauri dev
```

Verify:

- Anthropic keys show Claude Code/Desktop only.
- OpenAI keys go directly to Codex.
- Other groups show the approved unsupported message.
- Quick previews redact keys and preserve pre-existing MCP/hooks/providers/login state.
- Expert mode exposes the full file only after entry and can save a harmless formatting change.
- External edits between preview and apply produce a conflict, not an overwrite.
- Backups appear under LinAI app data and failed test writes roll back.
- Claude Desktop reports restart required and the application does not terminate it.
- No console or Rust log line contains the API key.

After the isolated verification, resolve and display the real macOS paths read-only. Do not apply to real Claude/Codex files without the user's explicit confirmation; the user can perform the final live-client write through the completed UI.

- [ ] **Step 6: Commit the completed integration**

```bash
git add clients/desktop/src/views/ApiKeysView.vue clients/desktop/src/views/ApiKeysView.spec.ts clients/desktop/src/test/visual/api.ts
git commit -m "feat(desktop): use API keys in local clients"
```

- [ ] **Step 7: Record final evidence**

Run:

```bash
git status --short
git log --oneline --max-count=12
```

Expected: only pre-existing unrelated user changes remain unstaged; the feature commits are present in task order, and no generated backup or real-client configuration file is tracked by the repository.
