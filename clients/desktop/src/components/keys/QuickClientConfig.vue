<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleDashed, FileCog, FolderOpen, RefreshCw } from '@lucide/vue'

import type { ClientDetection, ClientTarget } from '@/lib/client-config'

const props = defineProps<{
  target: ClientTarget
  detection: ClientDetection | null
  detecting: boolean
  error?: string
  apiKeyName: string
  baseUrl: string
  configDir: string
}>()

const emit = defineEmits<{
  'update:configDir': [value: string]
  retry: []
  applyDirectory: []
}>()

const targetName = () => ({ claude_code: 'Claude Code', claude_desktop: 'Claude Desktop', codex: 'Codex' })[props.target]
const statusText = () => ({
  not_configured: '尚未配置',
  managed: '已使用此密钥',
  other_config: '检测到现有配置',
  drifted: '配置已被外部修改',
  unsupported: '当前系统不支持',
})[props.detection?.status || 'not_configured']
</script>

<template>
  <div class="quick-config">
    <div v-if="detecting" class="detecting-state">
      <CircleDashed :size="18" />
      <span><strong>正在检查 {{ targetName() }}</strong><small>读取配置位置与当前状态</small></span>
    </div>
    <div v-else-if="error" class="detect-error">
      <AlertTriangle :size="17" />
      <span>{{ error }}</span>
      <button type="button" title="重新检测" @click="emit('retry')"><RefreshCw :size="15" /></button>
    </div>
    <template v-else-if="detection">
      <div class="config-status" :class="detection.status">
        <span class="status-icon"><CheckCircle2 v-if="detection.status === 'managed'" :size="18" /><FileCog v-else :size="18" /></span>
        <span><small>{{ targetName() }}</small><strong>{{ statusText() }}</strong></span>
        <i>{{ detection.restartRequired ? '重启后生效' : '新会话生效' }}</i>
      </div>

      <dl class="config-summary">
        <div><dt>API 密钥</dt><dd>{{ apiKeyName }}</dd></div>
        <div><dt>服务地址</dt><dd :title="baseUrl">{{ baseUrl }}</dd></div>
      </dl>

      <label v-if="target !== 'claude_desktop'" class="directory-control">
        <span>配置目录</span>
        <div>
          <FolderOpen :size="15" />
          <input :value="configDir" type="text" :placeholder="detection.paths[0]?.replace(/\/(settings\.json|claude\.json|config\.toml|auth\.json)$/, '')" @input="emit('update:configDir', ($event.target as HTMLInputElement).value)" />
          <button type="button" @click="emit('applyDirectory')">检测目录</button>
        </div>
      </label>

      <div class="resolved-paths">
        <span>将检查以下文件</span>
        <code v-for="path in detection.paths" :key="path" :title="path">{{ path }}</code>
      </div>
    </template>
  </div>
</template>

<style scoped>
.quick-config { display: grid; gap: 14px; }
.detecting-state,.detect-error,.config-status { display: flex; min-height: 70px; align-items: center; gap: 12px; padding: 0 16px; border: 1px solid var(--border-subtle); border-radius: 8px; background: #f8fafc; }
.detecting-state svg { color: var(--accent); animation: client-spin 900ms linear infinite; }
.detecting-state span { display: grid; }
.detecting-state strong { font-size: 14px; }
.detecting-state small { margin-top: 2px; color: var(--text-tertiary); font-size: 13px; }
.detect-error { border-color: var(--coral-border); background: var(--coral-soft); color: var(--danger); font-size: 14px; }
.detect-error span { flex: 1; }
.detect-error button { display: grid; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: rgba(255,255,255,.72); color: inherit; place-items: center; }
.config-status { display: grid; grid-template-columns: 42px minmax(0,1fr) auto; background: #f7faff; border-color: #d9e6f8; }
.status-icon { display: grid; width: 38px; height: 38px; background: var(--accent-soft); border-radius: 8px; color: var(--accent-strong); place-items: center; }
.config-status.managed { background: #f1faf7; border-color: #cbe8dc; }
.config-status.managed .status-icon { background: var(--success-soft); color: var(--success); }
.config-status small,.config-status strong { display: block; }
.config-status small { color: var(--text-tertiary); font-size: 12px; }
.config-status strong { margin-top: 2px; color: var(--text-primary); font-size: 15px; }
.config-status i { color: var(--text-tertiary); font-size: 13px; font-style: normal; }
.config-summary { display: grid; grid-template-columns: 1fr 1fr; margin: 0; border: 1px solid var(--border-subtle); border-radius: 8px; overflow: hidden; }
.config-summary div { min-width: 0; padding: 12px 14px; }
.config-summary div + div { border-left: 1px solid var(--border-subtle); }
.config-summary dt { color: var(--text-tertiary); font-size: 12px; }
.config-summary dd { margin: 4px 0 0; overflow: hidden; color: var(--text-primary); font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.directory-control { display: grid; gap: 7px; color: var(--text-secondary); font-size: 13px; font-weight: 680; }
.directory-control > div { display: grid; height: 44px; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 8px; background: #f8fafc; }
.directory-control svg { justify-self: end; color: var(--text-tertiary); }
.directory-control input { min-width: 0; height: 100%; padding: 0 10px; border: 0; outline: 0; background: transparent; color: var(--text-primary); font-size: 14px; }
.directory-control button { align-self: stretch; padding: 0 14px; border: 0; border-left: 1px solid var(--border-subtle); background: #fff; color: var(--accent-strong); font-size: 13px; font-weight: 700; }
.resolved-paths { display: grid; gap: 5px; }
.resolved-paths > span { color: var(--text-tertiary); font-size: 12px; }
.resolved-paths code { overflow: hidden; padding: 8px 10px; border-radius: 6px; background: var(--bg-inset); color: var(--text-secondary); font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@keyframes client-spin { to { transform: rotate(360deg); } }
</style>
