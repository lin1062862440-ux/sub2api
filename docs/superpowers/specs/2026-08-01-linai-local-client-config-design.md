# LinAI Desktop Local Client Configuration Design

## Goal

Merge the H5 `使用密钥` and `导入 CCS` workflows into the LinAI desktop API-key page. A user should be able to apply a LinAI API key directly to a supported local AI client without installing or launching CC Switch.

The implementation will selectively port CC Switch's proven Rust logic for platform path resolution, configuration parsing, validation, backup, atomic writes, and rollback. It will not embed CC Switch as a second application or import its general multi-provider management system.

## Confirmed Product Decisions

- The API-key list action is named `使用`. There is no separate `配置客户端` entry and no separate CCS import action.
- The target client is derived from the API key's group platform.
- `anthropic` groups let the user choose between Claude Code and Claude Desktop.
- `openai` groups open the Codex flow directly without a client selector.
- `gemini`, `antigravity`, `grok`, `composite`, missing, and unknown platforms display `当前分组暂不支持客户端配置` and do not open a configuration flow.
- Quick apply uses a safe structured merge and preserves unrelated local configuration.
- Expert mode edits the complete real configuration files and may change any field. It is not limited to LinAI-owned fields.
- Existing client processes are never terminated automatically. Successful writes explain whether a newly started session or an application restart is required.
- macOS is the first platform for real-client verification, while the implementation includes the CC Switch path and replacement behavior needed for Windows and Linux.

## Scope

The first release manages only:

- Claude Code
- Claude Desktop
- Codex

It includes:

- Client and configuration detection.
- Safe generated configuration and diff preview.
- Full-file JSON/TOML expert editing.
- Custom Claude Code and Codex configuration directories.
- Syntax validation, conflict detection, backup, atomic writes, and rollback.
- Local managed-state metadata without plaintext key persistence.
- Clear unsupported-platform and restart-required states.

It does not include CC Switch's provider database, provider switching history, local proxy takeover, MCP management, telemetry, cloud sync, session migration, usage collection, project management, or support for additional clients.

## User Flow

### API-Key List

Each API-key row gains a `使用` command beside the existing edit, enable/disable, detail, and delete actions.

The command first evaluates `key.group.platform`:

| Group platform | Result |
| --- | --- |
| `anthropic` | Open the Claude flow and choose Claude Code or Claude Desktop |
| `openai` | Open the Codex flow directly |
| Any other value | Show `当前分组暂不支持客户端配置` |

Unsupported keys keep the `使用` action discoverable. Selecting it produces the explanation instead of silently hiding a capability.

### Claude Target Selection

The Claude dialog starts with two compact targets: Claude Code and Claude Desktop. It remembers the last Claude target locally for convenience, but the user may change it before each apply.

Claude Desktop is selectable on macOS and Windows. On Linux it remains visible but disabled with `当前系统不支持 Claude Desktop 配置` because CC Switch itself has no Linux Claude Desktop writer.

### Quick Apply

After choosing or deriving a target, the dialog shows:

- Target client and detected operating system.
- Resolved configuration path or paths.
- Detection state: not configured, configured by this key, other configuration detected, externally modified, or unsupported.
- LinAI API endpoint, API-key name, and generated default model information.
- `查看变更` and `立即使用` commands.
- A secondary `完整配置编辑` entry for expert mode.

`立即使用` never writes immediately. It generates and displays a file-level diff first. The confirmation view lists every path that will change, whether a backup will be created, and the expected restart behavior.

On success, the result includes changed paths, backup location, and either `新会话生效` or `重启 Claude Desktop 后生效`.

### Expert Mode

Expert mode reads the complete current files from disk:

- Claude Code: the complete `settings.json`.
- Codex: separate tabs for the complete `config.toml` and `auth.json`.
- Claude Desktop: separate tabs for the normal deployment file, 3P deployment file, LinAI profile, and profile metadata file.

The editor supports formatting, JSON/TOML validation, syntax error location, restoring the current tab to its initially loaded contents, and a complete diff preview. Saving performs a full-file replacement for every edited tab. A high-risk confirmation explicitly states that unrelated MCP, provider, hook, feature, login, and preference fields may be changed or removed.

Expert mode retains safety infrastructure but not field restrictions: all involved files are backed up, the preview is checked for stale source files, and multi-file writes roll back together on failure.

## Architecture

The feature has three bounded layers.

### Vue Presentation

`ApiKeysView.vue` owns only the row entry point and selected API key. New focused components own the workflow:

- `UseApiKeyDialog.vue`: flow shell, platform routing, detection loading, and success/error states.
- `ClaudeClientSelector.vue`: Claude Code versus Claude Desktop selection.
- `QuickClientConfig.vue`: detected state, generated summary, and quick-apply actions.
- `ConfigDiffViewer.vue`: path-level and line-level change preview.
- `FullConfigEditor.vue`: multi-file expert editor and validation feedback.

The API key is passed to the dialog only while it is open. It is not placed in Pinia, Tauri Store, browser storage, query strings, analytics, or logs. Closing the dialog clears editor buffers and secret-bearing preview state.

### Tauri Command Boundary

The frontend communicates through narrow Rust commands rather than a filesystem plugin:

- Detect supported targets and resolve paths.
- Preview a safe apply without writing.
- Apply a previously previewed safe change.
- Read full expert-mode files.
- Validate full expert-mode file contents.
- Preview and apply full-file expert changes.

Command responses use structured file records containing path, format, existence, revision fingerprint, redacted display metadata, and content only when the caller explicitly requests expert editing. Commands never include API keys in errors or logs.

### Rust Configuration Engine

A new `local_config` module contains:

- A common client-adapter contract.
- `claude_code`, `claude_desktop`, and `codex` adapters.
- Platform and override path resolution.
- JSON deep-merge and TOML editing helpers.
- File snapshot, backup retention, atomic write, and rollback helpers.
- Revision conflict detection and managed-state metadata.

The adapters share infrastructure but own client-specific schemas. No CC Switch database or application state is introduced.

## Path Resolution And Platform Support

Path resolution uses the actual OS at runtime. Test-only home-directory overrides isolate automated tests from real user data.

### Claude Code

Resolution priority:

1. A LinAI user-selected Claude configuration directory.
2. The supported Claude configuration-directory environment override when present.
3. The user profile's `.claude` directory.

The primary file is `settings.json`; an existing legacy `claude.json` remains usable rather than being silently abandoned. macOS, Windows, and Linux are supported.

### Codex

Resolution priority:

1. A LinAI user-selected Codex configuration directory.
2. `CODEX_HOME` when present.
3. The user profile's `.codex` directory.

The managed files are `config.toml` and `auth.json`. macOS, Windows, and Linux are supported.

### Claude Desktop

Claude Desktop follows the CC Switch 3P layout.

On macOS the roots are:

- `~/Library/Application Support/Claude`
- `~/Library/Application Support/Claude-3p`

On Windows they are resolved below `%LOCALAPPDATA%`, preferring existing `Claude*` and `Claude*-3p` directories before the conventional `Claude` and `Claude-3p` names.

The writer manages the normal and 3P `claude_desktop_config.json` deployment files plus `configLibrary/<linai-profile-id>.json` and `configLibrary/_meta.json`. Linux reports unsupported and performs no writes.

## Quick-Apply Merge Rules

### Claude Code

The adapter parses the existing JSON object and updates only the required LinAI environment values inside `env`:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
- `CLAUDE_CODE_ATTRIBUTION_HEADER`

Existing schema declarations, MCP configuration, permissions, hooks, plugins, model preferences, and unknown fields are preserved. The API endpoint comes from the authenticated public settings and is normalized using the same contract as the current H5 `UseKeyModal`; users do not enter a server host.

Quick apply does not force model mappings that the group does not supply. Complete model overrides remain available in expert mode.

### Codex

The adapter uses a comment-preserving TOML editor. It creates or updates a dedicated `model_providers.linai` table and sets the active top-level provider and default/review model needed for the current LinAI OpenAI contract. The initial model follows the existing H5 contract (`gpt-5.5`) and remains editable in expert mode.

The LinAI table owns its name, normalized base URL, Responses wire format, authentication requirement, and provider-scoped bearer token. Other provider tables, MCP servers, feature flags, profiles, comments, and unrelated top-level preferences are preserved.

Safe apply does not overwrite `auth.json`. A third-party LinAI token is projected into the LinAI provider section, following CC Switch's official-auth-preservation behavior, so a user's ChatGPT login cache can survive the change. Expert mode may edit or replace `auth.json` after the explicit full-file warning.

### Claude Desktop

Quick apply creates a LinAI-owned 3P profile rather than replacing unrelated profiles. The profile uses the LinAI base URL and API key with bearer authentication and gateway inference mode. The initial direct profile leaves `inferenceModels` absent so Claude Desktop can query the endpoint model list; expert mode can define the complete model list and mappings.

The normal and 3P deployment files receive only the required deployment-mode field. The profile metadata updater inserts or updates the LinAI profile entry while preserving unrelated entries. The LinAI implementation uses its own stable profile ID and display name, not CC Switch's profile identity.

## Preview, Apply, And Rollback

Every write uses a two-phase flow.

### Preview Phase

1. Resolve all paths.
2. Read bytes and calculate a revision fingerprint for each source file.
3. Parse and validate existing JSON/TOML.
4. Generate safe merged files or accept expert-mode full contents.
5. Validate generated output.
6. Return the complete diff, source fingerprints, affected paths, and restart requirement.

### Apply Phase

1. Acquire a per-client process-local write lock.
2. Re-read every source and compare it with the preview fingerprints.
3. Abort with a conflict if any file changed after preview.
4. Snapshot all files, including non-existent paths.
5. Create a timestamped LinAI backup before the first mutation.
6. Atomically replace files in deterministic order.
7. Re-read and parse every result.
8. Record managed-state metadata only after all verification succeeds.
9. Restore every snapshot if any write or verification step fails.

Backups live under the LinAI application-data directory, grouped by client and operation timestamp. The first release retains the ten newest successful-operation backups per client. Automatic rollback uses the in-memory and on-disk snapshot from the current operation; successful-operation backups are reported to the user but do not add a separate backup-management page.

Claude Desktop treats its deployment files, profile, and metadata as one transaction. Codex expert mode treats `config.toml` and `auth.json` as one transaction when both tabs are changed.

## Managed State And Drift Detection

Local managed state records only:

- Target client.
- LinAI API-key ID.
- Apply mode (`quick` or `expert`).
- Apply timestamp.
- Result file fingerprints.
- Backup identifier and paths.

It does not persist the plaintext API key or complete file content. The real files remain the source of truth.

Detection compares current fingerprints with the last successful result:

- Matching key ID and fingerprints: `已使用此密钥`.
- No managed record and no usable file: `未配置`.
- Usable existing configuration without a matching managed record: `存在其他配置`.
- Managed record with changed fingerprints: `配置已被外部修改`.
- Unsupported OS/client combination: `当前系统不支持`.

An expert save that removes or changes LinAI credentials remains valid. It is recorded as expert-managed configuration but is not presented as `已使用此密钥` unless the resulting files still match that key.

## Error Handling

Errors are categorized for actionable UI messages:

- Unsupported operating system or client.
- Configuration path unavailable.
- File permission denied.
- Existing JSON or TOML is invalid.
- Expert content validation failed.
- Source file changed after preview.
- Backup creation failed.
- Atomic write or verification failed.
- Automatic rollback failed.

A backup failure prevents all writes. A revision conflict returns the user to a refreshed preview. A rollback failure is reported prominently with the backup path and affected files, but still redacts credentials and file contents from logs and error telemetry.

The application never kills or restarts local clients. Claude Code and Codex changes apply to newly started processes. Claude Desktop changes show `重启 Claude Desktop 后生效`.

## Security And Licensing

- API keys are never emitted through standard logs, panic messages, analytics, route parameters, or persisted frontend state.
- Rust error construction uses field names and paths, not raw configuration content.
- UI secret fields are masked by default; full-file expert mode can reveal file content because editing requires it, and buffers are cleared when the dialog closes.
- Backups necessarily contain the original credential-bearing files. They use user-only filesystem permissions where supported and remain inside the LinAI application-data directory.
- Only required CC Switch code is ported. Ported files retain source attribution where practical, and the desktop package includes a `THIRD_PARTY_NOTICES.md` entry containing the CC Switch copyright and MIT license.

## Components And Expected Modules

Expected focused units include:

- `src/components/keys/UseApiKeyDialog.vue`
- `src/components/keys/ClaudeClientSelector.vue`
- `src/components/keys/QuickClientConfig.vue`
- `src/components/keys/ConfigDiffViewer.vue`
- `src/components/keys/FullConfigEditor.vue`
- `src/lib/client-config.ts` for frontend types, formatting, and command wrappers
- `src-tauri/src/local_config/mod.rs`
- `src-tauri/src/local_config/claude_code.rs`
- `src-tauri/src/local_config/claude_desktop.rs`
- `src-tauri/src/local_config/codex.rs`
- `src-tauri/src/local_config/paths.rs`
- `src-tauri/src/local_config/backup.rs`
- `src-tauri/src/local_config/transaction.rs`
- `clients/desktop/THIRD_PARTY_NOTICES.md`

Planning may adjust filenames to match nearby conventions, but it must preserve the separation between platform adapters, transaction safety, Tauri commands, and Vue presentation.

## Verification

Rust tests use temporary homes and configuration roots and must never access real user files. They cover:

- macOS, Windows, and Linux default and custom path resolution.
- Claude Desktop unsupported behavior on Linux.
- Claude Code JSON merge preservation for MCP, hooks, permissions, and unknown fields.
- Codex TOML merge preservation for comments, provider tables, MCP, features, and official `auth.json`.
- Claude Desktop profile/meta preservation and deployment-mode updates.
- JSON/TOML validation failures.
- Preview/apply revision conflicts.
- Atomic single-file writes and multi-file rollback.
- Backup failure preventing mutation and ten-backup retention.
- Managed-state drift detection.
- Secret redaction in errors and logs.

Vue tests cover:

- The `使用` row action.
- Automatic `openai` to Codex routing.
- Anthropic Claude Code/Desktop selection and remembered target.
- Unsupported group messaging.
- Claude Desktop Linux disabled state.
- Detection, loading, empty, error, preview, confirmation, and success states.
- Quick versus expert mode warnings.
- Multi-file tabs and validation errors.
- Closing the dialog clears secret-bearing UI state.

Manual verification uses Tauri development mode rather than repeated production builds. The first real-client pass on macOS covers all three clients, safe preservation of pre-existing configuration, expert full-file edits, external-change conflicts, backup creation, rollback, and restart messaging. Windows and Linux first pass through isolated path tests; real-client checks occur on those systems when platform packages are prepared.

## Acceptance Criteria

- An Anthropic API key can be safely applied to Claude Code or Claude Desktop from its list row.
- An OpenAI API key enters the Codex flow without an unnecessary client selector.
- Unsupported groups receive the agreed unsupported message and no file writes.
- Quick apply preserves unrelated client configuration and Codex official login state.
- Expert mode can edit and replace the complete real target files after explicit warning.
- Every write has a preview, syntax validation, backup, conflict check, post-write verification, and transaction rollback.
- macOS, Windows, and Linux behavior matches the platform support declared above.
- No plaintext API key is persisted outside the target client files and their protected backups.
- The desktop package carries the required CC Switch MIT attribution.

## Out Of Scope

- Installing, launching, or requiring CC Switch.
- A generic client/provider management page.
- Multiple non-LinAI providers or provider switching history.
- Gemini CLI, Antigravity, Grok Build, OpenCode, OpenClaw, or other clients.
- Automatic process termination or restart.
- Local protocol-conversion proxies.
- MCP, prompt, plugin, project, session, usage, or cloud-sync management.
- A backup browser or manual restore history in the first release.
