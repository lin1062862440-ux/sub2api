<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { AlertTriangle, Braces, Check, RotateCcw, Save, ShieldAlert } from '@lucide/vue'

import {
  applyLocalClientConfig,
  clearEditableFiles,
  previewExpertLocalClientConfig,
  validateLocalClientFile,
} from '@/lib/client-config'
import type {
  ApplyResult,
  ClientTarget,
  ConfigPreview,
  EditableFile,
  ValidationResult,
} from '@/lib/client-config'

const props = defineProps<{
  files: EditableFile[]
  target: ClientTarget
  apiKeyId: number
  groupPlatform: string
  configDir?: string
}>()

const emit = defineEmits<{
  applied: [result: ApplyResult]
  cancelPreview: [previewId: string]
}>()

type DraftFile = EditableFile & { original: string }

const drafts = reactive<DraftFile[]>(props.files.map((file) => ({ ...file, original: file.content })))
const activePath = ref(drafts[0]?.path || '')
const validation = ref<ValidationResult | null>(null)
const preview = ref<ConfigPreview | null>(null)
const previewing = ref(false)
const applying = ref(false)
const riskAccepted = ref(false)
const errorMessage = ref('')

const activeFile = computed(() => drafts.find((file) => file.path === activePath.value) || null)

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function changed(file: DraftFile) {
  return file.content !== file.original
}

function resetActive() {
  if (!activeFile.value) return
  activeFile.value.content = activeFile.value.original
  validation.value = null
  preview.value = null
  riskAccepted.value = false
}

function formatActive() {
  const file = activeFile.value
  if (!file) return
  try {
    if (file.format === 'json') file.content = `${JSON.stringify(JSON.parse(file.content), null, 2)}\n`
    else file.content = `${file.content.trimEnd()}\n`
    validation.value = null
  } catch {
    validation.value = { valid: false, message: 'JSON 格式错误' }
  }
}

async function validateAll() {
  for (const file of drafts) {
    const result = await validateLocalClientFile({
      path: file.path,
      format: file.format,
      content: file.content,
    })
    if (!result.valid) {
      activePath.value = file.path
      validation.value = result
      return false
    }
  }
  validation.value = null
  return true
}

async function createPreview() {
  errorMessage.value = ''
  previewing.value = true
  if (preview.value) emit('cancelPreview', preview.value.previewId)
  preview.value = null
  riskAccepted.value = false
  try {
    if (!(await validateAll())) return
    preview.value = await previewExpertLocalClientConfig({
      target: props.target,
      apiKeyId: props.apiKeyId,
      groupPlatform: props.groupPlatform,
      configDir: props.configDir || undefined,
      files: drafts.map((file) => ({
        path: file.path,
        format: file.format,
        exists: file.exists,
        fingerprint: file.fingerprint,
        content: file.content,
      })),
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    previewing.value = false
  }
}

async function applyPreview() {
  if (!preview.value || !riskAccepted.value) return
  applying.value = true
  errorMessage.value = ''
  try {
    const result = await applyLocalClientConfig(preview.value.previewId)
    preview.value = null
    emit('applied', result)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    applying.value = false
  }
}

onBeforeUnmount(() => {
  if (preview.value) emit('cancelPreview', preview.value.previewId)
  clearEditableFiles(drafts)
  for (const file of drafts) file.original = ''
})
</script>

<template>
  <div class="expert-editor">
    <div class="expert-warning">
      <ShieldAlert :size="17" />
      <span><strong>完整配置编辑</strong><small>这里显示真实文件的全部内容，保存会替换完整文件。</small></span>
    </div>

    <div class="editor-tabs" role="tablist" aria-label="配置文件">
      <button v-for="file in drafts" :key="file.path" type="button" role="tab" :aria-selected="activePath === file.path" :class="{ active: activePath === file.path }" @click="activePath = file.path; validation = null">
        <span>{{ fileName(file.path) }}</span><i v-if="changed(file)" />
      </button>
    </div>

    <template v-if="activeFile">
      <div class="editor-toolbar">
        <code :title="activeFile.path">{{ activeFile.path }}</code>
        <span>{{ activeFile.format.toUpperCase() }}</span>
        <button type="button" title="格式化" @click="formatActive"><Braces :size="14" /></button>
        <button type="button" title="恢复打开时内容" data-testid="expert-reset" @click="resetActive"><RotateCcw :size="14" /></button>
      </div>
      <textarea v-model="activeFile.content" data-testid="expert-content" spellcheck="false" aria-label="完整配置内容" @input="preview = null; validation = null; riskAccepted = false" />
    </template>

    <div v-if="validation && !validation.valid" class="validation-error" data-testid="validation-error">
      <AlertTriangle :size="15" />
      <span>{{ validation.message || '配置格式错误' }}<template v-if="validation.line">，第 {{ validation.line }} 行<template v-if="validation.column">第 {{ validation.column }} 列</template></template></span>
    </div>
    <div v-if="errorMessage" class="validation-error"><AlertTriangle :size="15" /><span>{{ errorMessage }}</span></div>

    <div v-if="preview" class="expert-risk" data-testid="expert-risk">
      <AlertTriangle :size="16" />
      <div>
        <strong>即将完整覆盖 {{ preview.files.length || drafts.length }} 个配置文件</strong>
        <p>未在编辑器中保留的 MCP、Provider、Hook、Feature、登录信息或偏好设置会被移除。写入前会创建备份。</p>
        <label><input v-model="riskAccepted" data-testid="expert-risk-check" type="checkbox" />我已检查完整内容并理解覆盖风险</label>
      </div>
    </div>

    <footer>
      <span>{{ drafts.filter(changed).length }} 个文件有修改</span>
      <button v-if="!preview" class="expert-preview" type="button" data-testid="expert-preview" :disabled="previewing" @click="createPreview">
        <Braces :size="15" />{{ previewing ? '正在校验' : '校验并预览' }}
      </button>
      <button v-else class="expert-confirm" type="button" data-testid="expert-confirm" :disabled="!riskAccepted || applying" @click="applyPreview">
        <Check v-if="!applying" :size="15" /><Save v-else :size="15" />{{ applying ? '正在写入' : '确认覆盖' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.expert-editor { display: grid; gap: 12px; }
.expert-warning { display: flex; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid var(--warning-border); border-radius: 8px; background: var(--warning-soft); color: var(--warning); }
.expert-warning span,.expert-warning strong,.expert-warning small { display: block; }
.expert-warning strong { font-size: 14px; }
.expert-warning small { margin-top: 2px; font-size: 12px; font-weight: 500; }
.editor-tabs { display: flex; gap: 3px; overflow-x: auto; border-bottom: 1px solid var(--border-subtle); }
.editor-tabs button { position: relative; display: inline-flex; min-height: 40px; flex: 0 0 auto; align-items: center; gap: 6px; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-tertiary); font-size: 13px; }
.editor-tabs button.active { border-bottom-color: var(--accent); color: var(--text-primary); font-weight: 700; }
.editor-tabs i { width: 5px; height: 5px; border-radius: 50%; background: var(--warning); }
.editor-toolbar { display: grid; min-height: 40px; grid-template-columns: minmax(0,1fr) auto 32px 32px; align-items: center; gap: 6px; padding: 0 7px 0 12px; border: 1px solid var(--border-subtle); border-bottom: 0; border-radius: 8px 8px 0 0; background: #f8fafc; }
.editor-toolbar code { overflow: hidden; color: var(--text-tertiary); font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.editor-toolbar > span { padding: 2px 6px; border-radius: 4px; background: var(--bg-inset); color: var(--text-secondary); font-size: 12px; font-weight: 700; }
.editor-toolbar button { display: grid; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--text-secondary); place-items: center; }
.editor-toolbar button:hover { background: var(--accent-soft); color: var(--accent-strong); }
textarea { width: 100%; height: 330px; padding: 14px; resize: vertical; border: 1px solid var(--border-subtle); border-radius: 0 0 8px 8px; outline: 0; background: #111827; color: #e5edf8; caret-color: #93c5fd; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 14px; line-height: 1.65; tab-size: 2; }
textarea:focus { border-color: #6f9fe9; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.validation-error { display: flex; align-items: flex-start; gap: 7px; padding: 9px 11px; border: 1px solid var(--coral-border); border-radius: 7px; background: var(--coral-soft); color: var(--danger); font-size: 13px; }
.validation-error svg { flex: 0 0 auto; }
.expert-risk { display: grid; grid-template-columns: 24px 1fr; gap: 8px; padding: 11px; border: 1px solid var(--warning-border); border-radius: 8px; background: var(--warning-soft); color: var(--warning); }
.expert-risk strong { display: block; font-size: 14px; }
.expert-risk p { margin-top: 4px; font-size: 12px; line-height: 1.55; }
.expert-risk label { display: flex; align-items: center; gap: 7px; margin-top: 9px; color: var(--text-primary); font-size: 13px; font-weight: 650; }
.expert-risk input { width: 16px; height: 16px; accent-color: var(--accent); }
footer { display: flex; min-height: 48px; align-items: center; justify-content: flex-end; gap: 8px; }
footer > span { margin-right: auto; color: var(--text-tertiary); font-size: 12px; }
footer button { display: inline-flex; min-height: 42px; align-items: center; gap: 7px; padding: 0 14px; border-radius: 7px; font-size: 14px; font-weight: 700; }
.expert-preview { border: 1px solid var(--border-strong); background: #fff; color: var(--text-primary); }
.expert-confirm { border: 1px solid var(--warning); background: var(--warning); color: #fff; }
footer button:active:not(:disabled) { transform: translateY(1px); }
footer button:disabled { opacity: .5; }
</style>
