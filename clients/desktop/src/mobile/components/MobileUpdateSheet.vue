<script setup lang="ts">
import {
  CheckCircle2,
  Download,
  PackageCheck,
  RefreshCw,
  Settings,
  ShieldCheck,
  TriangleAlert,
} from '@lucide/vue'
import { computed } from 'vue'

import type { AndroidUpdateState } from '@/lib/android-updater'
import MobileBottomSheet from './MobileBottomSheet.vue'

const props = defineProps<{
  modelValue: boolean
  state: AndroidUpdateState
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  check: []
  download: []
  cancel: []
  'request-permission': []
  install: []
}>()

const release = computed(() => props.state.release)
const closeDisabled = computed(() => props.state.phase === 'verifying')

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let amount = value
  let unit = 0
  while (amount >= 1_024 && unit < units.length - 1) {
    amount /= 1_024
    unit += 1
  }
  const digits = amount >= 10 || Number.isInteger(amount) ? 0 : 1
  return `${amount.toFixed(digits)} ${units[unit]}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '发布日期未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function close() {
  if (closeDisabled.value) return
  emit('update:modelValue', false)
}

function retry() {
  if (release.value) emit('download')
  else emit('check')
}
</script>

<template>
  <MobileBottomSheet
    :model-value="modelValue"
    title="应用更新"
    :close-disabled="closeDisabled"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="update-sheet-body" :data-phase="state.phase">
      <section v-if="release" class="version-track" aria-label="版本信息">
        <div>
          <span>当前版本</span>
          <strong>{{ state.installedVersion || '未知' }}</strong>
        </div>
        <div class="version-track-line" aria-hidden="true"><i /></div>
        <div>
          <span>可用版本</span>
          <strong>{{ release.version }}</strong>
        </div>
      </section>

      <section v-if="release" class="release-meta" aria-label="更新详情">
        <span>{{ formatDate(release.publishedAt) }}</span>
        <span>{{ formatBytes(release.bytes) }}</span>
      </section>

      <section class="update-status" role="status" aria-live="polite">
        <template v-if="state.phase === 'checking'">
          <RefreshCw :size="24" class="spinning" />
          <div><strong>正在检查更新</strong><span>正在连接更新服务。</span></div>
        </template>
        <template v-else-if="state.phase === 'up-to-date'">
          <CheckCircle2 :size="24" />
          <div><strong>已是最新版本</strong><span>当前没有可安装的更新。</span></div>
        </template>
        <template v-else-if="state.phase === 'downloading'">
          <Download :size="24" />
          <div><strong>正在下载更新包</strong><span>{{ formatBytes(state.downloadedBytes) }} / {{ formatBytes(state.totalBytes) }}</span></div>
          <progress :max="state.totalBytes || 1" :value="state.downloadedBytes" />
        </template>
        <template v-else-if="state.phase === 'verifying'">
          <ShieldCheck :size="24" class="status-pulse" />
          <div><strong>正在验证更新包</strong><span>完成后即可交给系统安装。</span></div>
        </template>
        <template v-else-if="state.phase === 'permission-required'">
          <Settings :size="24" />
          <div><strong>需要安装授权</strong><span>请在系统设置中允许 LinAI 安装应用。</span></div>
        </template>
        <template v-else-if="state.phase === 'ready-to-install'">
          <PackageCheck :size="24" />
          <div><strong>更新包已验证</strong><span>继续后将打开 Android 系统安装程序。</span></div>
        </template>
        <template v-else-if="state.phase === 'error'">
          <TriangleAlert :size="24" />
          <div><strong>更新未完成</strong><span>{{ state.error || '暂时无法完成更新，请稍后重试。' }}</span></div>
        </template>
        <template v-else-if="release">
          <Download :size="24" />
          <div><strong>发现新版本</strong><span>准备好后可下载更新包。</span></div>
        </template>
        <template v-else>
          <RefreshCw :size="24" />
          <div><strong>检查应用版本</strong><span>查看是否有新的 Android 版本。</span></div>
        </template>
      </section>

      <section v-if="release?.notes" class="release-notes" aria-labelledby="release-notes-title">
        <h3 id="release-notes-title">更新内容</h3>
        <p>{{ release.notes }}</p>
      </section>
    </div>

    <template #footer>
      <button
        v-if="state.phase !== 'verifying' && state.phase !== 'downloading'"
        class="secondary-action"
        type="button"
        @click="close"
      >
        {{ release ? '稍后提醒' : '关闭' }}
      </button>
      <button
        v-if="state.phase === 'available' || state.phase === 'idle'"
        class="primary-action"
        type="button"
        data-testid="android-update-download"
        @click="release ? emit('download') : emit('check')"
      >
        <Download v-if="release" :size="18" />
        <RefreshCw v-else :size="18" />
        {{ release ? '下载并安装' : '检查更新' }}
      </button>
      <button
        v-else-if="state.phase === 'checking' || state.phase === 'up-to-date'"
        class="primary-action"
        type="button"
        :disabled="state.phase === 'checking'"
        @click="state.phase === 'checking' ? undefined : emit('check')"
      >
        <RefreshCw :size="18" :class="{ spinning: state.phase === 'checking' }" />
        {{ state.phase === 'checking' ? '正在检查' : '再次检查' }}
      </button>
      <button
        v-else-if="state.phase === 'downloading'"
        class="secondary-action danger-action"
        type="button"
        data-testid="android-update-cancel"
        @click="emit('cancel')"
      >
        取消下载
      </button>
      <button
        v-else-if="state.phase === 'permission-required'"
        class="primary-action"
        type="button"
        data-testid="android-update-permission"
        @click="emit('request-permission')"
      >
        <Settings :size="18" />
        打开系统设置
      </button>
      <button
        v-else-if="state.phase === 'ready-to-install'"
        class="primary-action"
        type="button"
        data-testid="android-update-install"
        @click="emit('install')"
      >
        <PackageCheck :size="18" />
        继续安装
      </button>
      <button
        v-else-if="state.phase === 'error'"
        class="primary-action"
        type="button"
        data-testid="android-update-retry"
        @click="retry"
      >
        <RefreshCw :size="18" />
        重新尝试
      </button>
    </template>
  </MobileBottomSheet>
</template>

<style scoped>
.update-sheet-body {
  min-height: 286px;
  color: var(--text-primary);
}

.version-track {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 2px 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.version-track > div:not(.version-track-line) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.version-track > div:last-child { text-align: right; }
.version-track span { color: var(--text-tertiary); font-size: 12px; }
.version-track strong { overflow-wrap: anywhere; font-size: 19px; letter-spacing: 0; }

.version-track-line {
  position: relative;
  height: 2px;
  background: var(--border-strong);
}

.version-track-line::after {
  position: absolute;
  top: -3px;
  right: 0;
  width: 8px;
  height: 8px;
  border-top: 2px solid var(--accent-strong);
  border-right: 2px solid var(--accent-strong);
  content: '';
  transform: rotate(45deg);
}

.version-track-line i {
  position: absolute;
  top: -2px;
  right: 4px;
  left: 0;
  height: 6px;
  background: var(--accent-soft);
}

.release-meta {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.update-status {
  display: grid;
  min-height: 78px;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  color: var(--accent-strong);
  border-block: 1px solid var(--border-subtle);
}

.update-status > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.update-status strong { color: var(--text-primary); font-size: 14px; }
.update-status span { color: var(--text-secondary); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.update-status progress { width: 100%; height: 7px; grid-column: 1 / -1; accent-color: var(--accent-strong); }
.update-status progress::-webkit-progress-bar { background: var(--bg-muted); border-radius: 4px; }
.update-status progress::-webkit-progress-value { background: var(--accent-strong); border-radius: 4px; }
.update-sheet-body[data-phase='error'] .update-status { color: var(--coral); }

.release-notes { padding-top: 14px; }
.release-notes h3 { margin: 0 0 7px; font-size: 13px; }
.release-notes p {
  max-height: 144px;
  margin: 0;
  overflow-y: auto;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  min-width: 104px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  font-size: 14px;
  font-weight: 650;
}

.primary-action { background: var(--accent-strong); border-color: var(--accent-strong); color: white; }
.secondary-action { background: transparent; color: var(--text-secondary); }
.danger-action { color: var(--coral); }
.primary-action:disabled { opacity: 0.6; }

.spinning { animation: spin 900ms linear infinite; }
.status-pulse { animation: status-pulse 1.2s ease-in-out infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes status-pulse { 50% { opacity: 0.48; } }

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .status-pulse { animation: none; }
}
</style>
