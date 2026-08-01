<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, CheckCircle2, ChevronRight, Code2, LoaderCircle, Settings2, ShieldCheck, X } from '@lucide/vue'

import type { ApiKey } from '@/api'
import {
  applyLocalClientConfig,
  cancelLocalClientPreview,
  clearEditableFiles,
  detectLocalClient,
  previewLocalClientConfig,
  readLocalClientFiles,
  readRememberedClaudeTarget,
  rememberClaudeTarget,
  routeApiKeyClient,
} from '@/lib/client-config'
import type {
  ApplyResult,
  ClaudeTarget,
  ClientDetection,
  ClientTarget,
  ConfigPreview,
  EditableFile,
} from '@/lib/client-config'

import ClaudeClientSelector from './ClaudeClientSelector.vue'
import ConfigDiffViewer from './ConfigDiffViewer.vue'
import FullConfigEditor from './FullConfigEditor.vue'
import QuickClientConfig from './QuickClientConfig.vue'

const props = defineProps<{
  apiKey: ApiKey
  baseUrl: string
}>()

const emit = defineEmits<{
  close: []
  applied: [result: ApplyResult]
}>()

type Step = 'quick' | 'preview' | 'expert' | 'success'

const route = routeApiKeyClient(props.apiKey.group?.platform)
const target = ref<ClientTarget>(route.kind === 'target' ? route.target : readRememberedClaudeTarget())
const step = ref<Step>('quick')
const detection = ref<ClientDetection | null>(null)
const detecting = ref(false)
const errorMessage = ref('')
const configDir = ref('')
const preview = ref<ConfigPreview | null>(null)
const applying = ref(false)
const result = ref<ApplyResult | null>(null)
const expertFiles = ref<EditableFile[]>([])
const expertLoading = ref(false)

const isAnthropic = computed(() => props.apiKey.group?.platform?.toLowerCase() === 'anthropic')
const targetName = computed(() => ({ claude_code: 'Claude Code', claude_desktop: 'Claude Desktop', codex: 'Codex' })[target.value])
const effectText = computed(() => target.value === 'claude_desktop' ? '重启 Claude Desktop 后生效' : '新会话生效')

function detectInput() {
  return {
    target: target.value,
    apiKeyId: props.apiKey.id,
    groupPlatform: props.apiKey.group?.platform || '',
    configDir: configDir.value.trim() || undefined,
  }
}

async function cancelPreview() {
  if (!preview.value) return
  const id = preview.value.previewId
  preview.value = null
  await cancelLocalClientPreview(id).catch(() => undefined)
}

async function loadDetection() {
  await cancelPreview()
  step.value = 'quick'
  detecting.value = true
  detection.value = null
  errorMessage.value = ''
  try {
    detection.value = await detectLocalClient(detectInput())
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    detecting.value = false
  }
}

async function selectTarget(next: ClaudeTarget) {
  target.value = next
  rememberClaudeTarget(next)
  configDir.value = ''
  await loadDetection()
}

async function createQuickPreview() {
  errorMessage.value = ''
  applying.value = true
  try {
    await cancelPreview()
    preview.value = await previewLocalClientConfig({
      context: {
        ...detectInput(),
        apiKey: props.apiKey.key,
        baseUrl: props.baseUrl,
      },
    })
    step.value = 'preview'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    applying.value = false
  }
}

async function applyQuickPreview() {
  if (!preview.value) return
  applying.value = true
  errorMessage.value = ''
  try {
    result.value = await applyLocalClientConfig(preview.value.previewId)
    preview.value = null
    step.value = 'success'
    emit('applied', result.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    applying.value = false
  }
}

async function openExpert() {
  await cancelPreview()
  expertLoading.value = true
  errorMessage.value = ''
  try {
    expertFiles.value = await readLocalClientFiles(detectInput())
    step.value = 'expert'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    expertLoading.value = false
  }
}

function handleExpertApplied(applied: ApplyResult) {
  clearEditableFiles(expertFiles.value)
  expertFiles.value = []
  result.value = applied
  step.value = 'success'
  emit('applied', applied)
}

async function close() {
  await cancelPreview()
  clearEditableFiles(expertFiles.value)
  expertFiles.value = []
  emit('close')
}

async function backToQuick() {
  await cancelPreview()
  if (step.value === 'expert') {
    clearEditableFiles(expertFiles.value)
    expertFiles.value = []
  }
  step.value = 'quick'
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !applying.value) void close()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  void loadDetection()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (preview.value) void cancelLocalClientPreview(preview.value.previewId)
  clearEditableFiles(expertFiles.value)
})
</script>

<template>
  <Teleport to="body">
    <div class="client-dialog-backdrop" @click.self="close">
      <section class="client-dialog" role="dialog" aria-modal="true" aria-labelledby="client-dialog-title">
        <header class="client-dialog__head">
          <button v-if="step === 'preview' || step === 'expert'" type="button" class="head-icon" aria-label="返回快捷配置" @click="backToQuick"><ArrowLeft :size="17" /></button>
          <span v-else class="client-mark"><Code2 :size="18" /></span>
          <div>
            <h2 id="client-dialog-title">{{ step === 'expert' ? '完整配置编辑' : `在 ${targetName} 中使用` }}</h2>
            <p>{{ apiKey.name }} · {{ apiKey.group?.name || '未分组' }}</p>
          </div>
          <button type="button" class="head-icon close" aria-label="关闭本地客户端配置" :disabled="applying" @click="close"><X :size="18" /></button>
        </header>

        <div class="client-dialog__body">
          <template v-if="step === 'success' && result">
            <div class="apply-success">
              <span><CheckCircle2 :size="27" /></span>
              <h3>配置已安全写入</h3>
              <p>{{ effectText }}</p>
              <dl><div><dt>已更新</dt><dd>{{ result.changedPaths.length }} 个文件</dd></div><div><dt>备份位置</dt><dd :title="result.backupPath">{{ result.backupPath }}</dd></div></dl>
              <button type="button" @click="close">完成</button>
            </div>
          </template>

          <template v-else-if="step === 'expert'">
            <div v-if="expertLoading" class="client-loading"><LoaderCircle :size="20" /><span>正在读取完整配置</span></div>
            <FullConfigEditor
              v-else
              :files="expertFiles"
              :target="target"
              :api-key-id="apiKey.id"
              :group-platform="apiKey.group?.platform || ''"
              :config-dir="configDir.trim() || undefined"
              @applied="handleExpertApplied"
              @cancel-preview="cancelLocalClientPreview"
            />
          </template>

          <template v-else-if="step === 'preview' && preview">
            <ConfigDiffViewer :files="preview.files" />
            <div v-if="errorMessage" class="client-error">{{ errorMessage }}</div>
          </template>

          <template v-else>
            <ClaudeClientSelector v-if="isAnthropic" :model-value="target as ClaudeTarget" :desktop-supported="target === 'claude_desktop' ? detection?.supported : undefined" @update:model-value="selectTarget" />
            <QuickClientConfig
              :target="target"
              :detection="detection"
              :detecting="detecting"
              :error="errorMessage"
              :api-key-name="apiKey.name"
              :base-url="baseUrl"
              :config-dir="configDir"
              @update:config-dir="configDir = $event"
              @retry="loadDetection"
              @apply-directory="loadDetection"
            />
          </template>
        </div>

        <footer v-if="step !== 'success' && step !== 'expert'" class="client-dialog__foot">
          <template v-if="step === 'preview'">
            <span><ShieldCheck :size="14" />写入前自动备份，文件变化时会中止</span>
            <button type="button" class="secondary-client-button" @click="backToQuick">返回</button>
            <button type="button" class="primary-client-button" data-testid="confirm-apply" :disabled="applying" @click="applyQuickPreview">
              <LoaderCircle v-if="applying" :size="15" class="client-spin" /><CheckCircle2 v-else :size="15" />{{ applying ? '正在写入' : '确认并使用' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="expert-entry" :disabled="detecting || !detection?.supported || expertLoading" @click="openExpert"><Settings2 :size="14" />完整配置编辑<ChevronRight :size="14" /></button>
            <button type="button" class="primary-client-button" data-testid="quick-preview" :disabled="detecting || !detection?.supported || applying" @click="createQuickPreview">
              <LoaderCircle v-if="applying" :size="15" class="client-spin" /><Code2 v-else :size="15" />{{ applying ? '正在生成' : '查看变更' }}
            </button>
          </template>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.client-dialog-backdrop { position: fixed; z-index: 180; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(22,35,52,.32); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.client-dialog { display: flex; width: min(820px,100%); max-height: min(860px,calc(100vh - 48px)); flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.9); border-radius: 10px; background: rgba(255,255,255,.985); box-shadow: 0 30px 80px rgba(28,44,66,.26); animation: client-dialog-in 220ms var(--motion-ease-out) both; }
.client-dialog__head { display: grid; min-height: 76px; flex: 0 0 auto; grid-template-columns: 40px minmax(0,1fr) 40px; align-items: center; gap: 11px; padding: 0 22px; border-bottom: 1px solid var(--border-subtle); }
.client-mark,.head-icon { display: grid; width: 38px; height: 38px; border: 0; border-radius: 8px; background: var(--accent-soft); color: var(--accent-strong); place-items: center; }
.head-icon { padding: 0; background: var(--bg-surface-hover); color: var(--text-secondary); }
.head-icon:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent-strong); }
.head-icon.close { justify-self: end; }
.client-dialog__head h2 { font-size: 18px; font-weight: 740; }
.client-dialog__head p { margin-top: 3px; color: var(--text-tertiary); font-size: 13px; }
.client-dialog__body { display: grid; min-height: 300px; gap: 14px; padding: 22px; overflow-y: auto; }
.client-dialog__foot { display: flex; min-height: 72px; flex: 0 0 auto; align-items: center; justify-content: flex-end; gap: 9px; padding: 0 22px; border-top: 1px solid var(--border-subtle); background: #fbfcfe; }
.client-dialog__foot > span { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; color: var(--text-tertiary); font-size: 12px; }
.client-dialog__foot > span svg { color: var(--success); }
.primary-client-button,.secondary-client-button,.expert-entry { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: 7px; font-size: 14px; font-weight: 700; white-space: nowrap; }
.primary-client-button { border: 1px solid var(--accent); background: var(--accent); color: #fff; }
.primary-client-button:hover:not(:disabled) { background: var(--accent-strong); }
.secondary-client-button { border: 1px solid var(--border-strong); background: #fff; color: var(--text-secondary); }
.expert-entry { margin-right: auto; padding-left: 0; border: 0; background: transparent; color: var(--text-secondary); }
.expert-entry:hover:not(:disabled) { color: var(--accent-strong); }
.expert-entry svg:last-child { margin-left: -3px; }
.primary-client-button:active:not(:disabled),.secondary-client-button:active:not(:disabled) { transform: translateY(1px); }
.primary-client-button:disabled,.expert-entry:disabled { opacity: .48; }
.client-error { padding: 10px 12px; border: 1px solid var(--coral-border); border-radius: 7px; background: var(--coral-soft); color: var(--danger); font-size: 13px; }
.client-loading { display: flex; min-height: 280px; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); font-size: 14px; }
.client-loading svg,.client-spin { animation: client-spin 850ms linear infinite; }
.apply-success { display: grid; min-height: 360px; place-items: center; align-content: center; text-align: center; }
.apply-success > span { display: grid; width: 54px; height: 54px; border-radius: 10px; background: var(--success-soft); color: var(--success); place-items: center; }
.apply-success h3 { margin-top: 14px; font-size: 18px; }
.apply-success > p { margin-top: 5px; color: var(--success); font-size: 14px; font-weight: 650; }
.apply-success dl { display: grid; width: min(480px,100%); grid-template-columns: 140px minmax(0,1fr); margin: 20px 0 0; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 8px; text-align: left; }
.apply-success dl div { min-width: 0; padding: 10px 12px; }
.apply-success dl div + div { border-left: 1px solid var(--border-subtle); }
.apply-success dt { color: var(--text-tertiary); font-size: 12px; }
.apply-success dd { margin: 4px 0 0; overflow: hidden; color: var(--text-primary); font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.apply-success button { min-height: 42px; margin-top: 18px; padding: 0 18px; border: 1px solid var(--accent); border-radius: 7px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 700; }
@keyframes client-dialog-in { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes client-spin { to { transform: rotate(360deg); } }
@media (max-width: 680px) { .client-dialog-backdrop { padding: 12px; } .client-dialog { max-height: calc(100vh - 24px); } .client-dialog__body { padding: 14px; } .client-dialog__foot > span { display: none; } }
@media (prefers-reduced-motion: reduce) { .client-dialog,.client-loading svg,.client-spin { animation: none; } }
</style>
