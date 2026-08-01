import { invoke } from '@tauri-apps/api/core'

export type ClientTarget = 'claude_code' | 'claude_desktop' | 'codex'
export type ClaudeTarget = Extract<ClientTarget, 'claude_code' | 'claude_desktop'>
export type ConfigFormat = 'json' | 'toml'
export type ClientStatus =
  | 'not_configured'
  | 'managed'
  | 'other_config'
  | 'drifted'
  | 'unsupported'

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

export interface PreviewInput {
  context: ConfigContext
}

export interface EditableFile {
  path: string
  format: ConfigFormat
  exists: boolean
  fingerprint: string
  content: string
}

export type ReadFilesInput = DetectInput

export interface ValidateFileInput {
  path: string
  format: ConfigFormat
  content: string
}

export interface ValidationResult {
  valid: boolean
  message?: string
  line?: number
  column?: number
}

export interface ExpertPreviewInput extends DetectInput {
  files: EditableFile[]
}

export interface FileDiff {
  path: string
  format: ConfigFormat
  changed: boolean
  redactedBefore: string
  redactedAfter: string
}

export interface ConfigPreview {
  previewId: string
  target: ClientTarget
  mode: 'quick' | 'expert'
  files: FileDiff[]
  restartRequired: boolean
}

export interface ApplyResult {
  target: ClientTarget
  changedPaths: string[]
  backupPath: string
  restartRequired: boolean
}

export type ApiKeyClientRoute =
  | { kind: 'choose_claude' }
  | { kind: 'target'; target: 'codex' }
  | { kind: 'unsupported'; message: string }

export function routeApiKeyClient(platform?: string): ApiKeyClientRoute {
  const normalized = platform?.trim().toLowerCase()
  if (normalized === 'anthropic') return { kind: 'choose_claude' }
  if (normalized === 'openai') return { kind: 'target', target: 'codex' }
  return { kind: 'unsupported', message: '当前分组暂不支持客户端配置' }
}

const CLAUDE_TARGET_KEY = 'linai:last-claude-target'

export function readRememberedClaudeTarget(): ClaudeTarget {
  return localStorage.getItem(CLAUDE_TARGET_KEY) === 'claude_desktop'
    ? 'claude_desktop'
    : 'claude_code'
}

export function rememberClaudeTarget(target: ClaudeTarget) {
  localStorage.setItem(CLAUDE_TARGET_KEY, target)
}

export function clearEditableFiles(files: EditableFile[]) {
  for (const file of files) file.content = ''
}

export const detectLocalClient = (input: DetectInput) =>
  invoke<ClientDetection>('detect_local_client', { input })

export const previewLocalClientConfig = (input: PreviewInput) =>
  invoke<ConfigPreview>('preview_local_client_config', { input })

export const applyLocalClientConfig = (previewId: string) =>
  invoke<ApplyResult>('apply_local_client_config', { previewId })

export const readLocalClientFiles = (input: ReadFilesInput) =>
  invoke<EditableFile[]>('read_local_client_files', { input })

export const validateLocalClientFile = (input: ValidateFileInput) =>
  invoke<ValidationResult>('validate_local_client_file', { input })

export const previewExpertLocalClientConfig = (input: ExpertPreviewInput) =>
  invoke<ConfigPreview>('preview_expert_local_client_config', { input })

export const cancelLocalClientPreview = (previewId: string) =>
  invoke<void>('cancel_local_client_preview', { previewId })
