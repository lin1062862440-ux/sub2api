<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { KeyRound, LoaderCircle, Save, ServerCog, X } from '@lucide/vue'

import { createAdminAccount, updateAdminAccount } from '@/api/admin/accounts'
import type {
  AdminAccount,
  AdminAccountPlatform,
  AdminAccountType,
  CreateAdminAccountRequest,
  UpdateAdminAccountRequest,
} from '@/api/admin/types'

const props = withDefaults(defineProps<{
  modelValue: boolean
  account?: AdminAccount | null
  mobile?: boolean
}>(), { mobile: false })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [account: AdminAccount]
}>()

const form = reactive({
  name: '',
  notes: '',
  platform: 'anthropic' as AdminAccountPlatform,
  type: 'apikey' as AdminAccountType,
  apiKey: '',
  baseUrl: '',
  concurrency: 5,
  priority: 10,
  rateMultiplier: 1,
})
const saving = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const editing = computed(() => Boolean(props.account))
const needsApiKey = computed(() => form.type === 'apikey' || form.type === 'upstream')
let previousFocus: HTMLElement | null = null
let mounted = false

function focusableElements() {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-testid="account-editor-name"]')?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusableElements()
  const first = elements[0]
  const last = elements[elements.length - 1]
  const active = document.activeElement
  const outside = !dialog.value?.contains(active)
  if (!first || !last) {
    event.preventDefault()
    dialog.value?.focus()
  } else if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

function resetForm() {
  form.name = props.account?.name ?? ''
  form.notes = props.account?.notes ?? ''
  form.platform = props.account?.platform ?? 'anthropic'
  form.type = props.account?.type ?? 'apikey'
  form.apiKey = ''
  form.baseUrl = ''
  form.concurrency = props.account?.concurrency ?? 5
  form.priority = props.account?.priority ?? 10
  form.rateMultiplier = props.account?.rate_multiplier ?? 1
  error.value = ''
}

watch(() => [props.modelValue, props.account] as const, ([open]) => {
  if (open) resetForm()
}, { immediate: true })

watch(() => props.modelValue, (open) => {
  if (!mounted) return
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  } else {
    restoreFocus()
  }
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

function isBlankNumber(value: unknown) {
  return value === '' || (typeof value === 'string' && !value.trim())
}

async function submit() {
  if (saving.value) return
  error.value = ''
  if (!form.name.trim()) {
    error.value = '请输入账号名称'
    return
  }
  if (!editing.value && needsApiKey.value && !form.apiKey.trim()) {
    error.value = '请输入 API Key'
    return
  }

  const concurrency = Number(form.concurrency)
  if (isBlankNumber(form.concurrency) || !Number.isFinite(concurrency) || !Number.isInteger(concurrency) || concurrency < 0) {
    error.value = '并发上限必须是非负整数。'
    return
  }
  const priority = Number(form.priority)
  if (isBlankNumber(form.priority) || !Number.isFinite(priority) || !Number.isInteger(priority) || priority < 0) {
    error.value = '优先级必须是非负整数。'
    return
  }
  const rateMultiplier = Number(form.rateMultiplier)
  if (isBlankNumber(form.rateMultiplier) || !Number.isFinite(rateMultiplier) || rateMultiplier < 0) {
    error.value = '计费倍率必须是有限的非负数字。'
    return
  }

  saving.value = true
  try {
    let saved: AdminAccount
    if (props.account) {
      const payload: UpdateAdminAccountRequest = {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
        type: form.type,
        concurrency,
        priority,
        rate_multiplier: rateMultiplier,
      }
      if (form.apiKey.trim()) {
        payload.credentials = {
          api_key: form.apiKey.trim(),
          ...(form.baseUrl.trim() ? { base_url: form.baseUrl.trim() } : {}),
        }
      }
      saved = await updateAdminAccount(props.account.id, payload)
    } else {
      const payload: CreateAdminAccountRequest = {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
        platform: form.platform,
        type: form.type,
        credentials: {
          api_key: form.apiKey.trim(),
          ...(form.baseUrl.trim() ? { base_url: form.baseUrl.trim() } : {}),
        },
        concurrency,
        priority,
        rate_multiplier: rateMultiplier,
      }
      saved = await createAdminAccount(payload)
    }
    if (!mounted) return
    emit('saved', saved)
    emit('update:modelValue', false)
  } catch (caught) {
    if (mounted) {
      error.value = props.mobile
        ? '账号保存失败，请稍后重试。'
        : caught instanceof Error && caught.message ? caught.message : '账号保存失败'
    }
  } finally {
    if (mounted) saving.value = false
  }
}

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.modelValue) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  }
})

onBeforeUnmount(() => {
  mounted = false
  document.removeEventListener('keydown', handleKeydown)
  if (props.modelValue) restoreFocus()
})
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="modelValue" class="dialog-backdrop" :class="{ mobile }" @mousedown.self="close">
      <section ref="dialog" class="account-editor" :class="{ mobile }" role="dialog" aria-modal="true" aria-labelledby="account-editor-title" tabindex="-1">
        <header>
          <span><ServerCog :size="20" /></span>
          <div><h2 id="account-editor-title">{{ editing ? '编辑账号' : '新增账号' }}</h2><p>维护常用接入参数与调度容量</p></div>
          <button type="button" title="关闭" aria-label="关闭" data-testid="account-editor-close" @click="close"><X :size="18" /></button>
        </header>

        <form data-testid="account-editor-submit" @submit.prevent="submit">
          <label class="wide"><span>账号名称</span><input v-model="form.name" data-testid="account-editor-name" autocomplete="off" placeholder="例如：Claude 主池" /></label>
          <label><span>平台</span><select v-model="form.platform" :disabled="editing"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="antigravity">Antigravity</option><option value="grok">Grok</option></select></label>
          <label><span>接入类型</span><select v-model="form.type"><option value="apikey">API Key</option><option value="upstream">上游中转</option><option value="oauth">OAuth</option><option value="setup-token">Setup Token</option><option value="bedrock">Bedrock</option><option value="service_account">Service Account</option></select></label>
          <label v-if="needsApiKey" class="wide"><span>{{ editing ? '替换 API Key（留空则保持不变）' : 'API Key' }}</span><div class="secret-input"><KeyRound :size="16" /><input v-model="form.apiKey" data-testid="account-editor-api-key" type="password" autocomplete="new-password" placeholder="输入平台凭据" /></div></label>
          <label v-if="needsApiKey" class="wide"><span>Base URL（可选）</span><input v-model="form.baseUrl" placeholder="https://api.example.com" /></label>
          <label><span>并发上限</span><input v-model.number="form.concurrency" type="number" min="0" /></label>
          <label><span>优先级</span><input v-model.number="form.priority" type="number" min="0" /></label>
          <label><span>计费倍率</span><input v-model.number="form.rateMultiplier" type="number" min="0" step="0.01" /></label>
          <label class="wide"><span>备注</span><textarea v-model="form.notes" rows="3" placeholder="内部说明，不会展示给用户" /></label>

          <div v-if="!needsApiKey" class="advanced-notice wide">
            OAuth、Setup Token、Bedrock 与 Service Account 的授权材料请在网页管理后台完成；客户端仍可编辑其通用调度参数。
          </div>
          <p v-if="error" class="form-error wide" role="alert">{{ error }}</p>
          <footer class="wide"><button type="button" class="secondary" @click="close">取消</button><button type="submit" data-testid="account-editor-save" :disabled="saving"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Save v-else :size="16" />{{ saving ? '保存中' : '保存账号' }}</button></footer>
        </form>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop { position:fixed; z-index:100; inset:0; display:grid; padding:24px; background:rgba(28,39,56,.22); backdrop-filter:blur(12px); place-items:center; }
.account-editor { width:min(650px,100%); max-height:calc(100vh - 48px); overflow:auto; background:rgba(252,253,255,.985); border:1px solid rgba(255,255,255,.9); border-radius:10px; box-shadow:0 28px 72px rgba(27,42,64,.25); }
.account-editor > header { display:grid; grid-template-columns:42px minmax(0,1fr) 34px; align-items:center; gap:11px; padding:20px 22px 16px; border-bottom:1px solid var(--border-subtle); }.account-editor > header > span { display:grid; width:40px;height:40px;background:#e9f0ff;border-radius:9px;color:var(--accent);place-items:center; }.account-editor h2{margin:0;font-size:18px}.account-editor header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}.account-editor header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}.account-editor header button:hover{background:var(--bg-base);color:var(--text-primary)}
form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px 14px; padding:19px 22px 22px; }.wide{grid-column:1/-1}label{display:grid;gap:6px}label>span{color:var(--text-secondary);font-size:12px;font-weight:620}input,select,textarea{width:100%;min-height:38px;padding:8px 11px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-primary);font:inherit;font-size:13px;outline:none}textarea{resize:vertical}input:focus,select:focus,textarea:focus{border-color:rgba(64,111,203,.58);box-shadow:0 0 0 3px rgba(58,105,198,.09)}select:disabled{opacity:.65}.secret-input{position:relative}.secret-input svg{position:absolute;top:11px;left:11px;color:var(--text-tertiary)}.secret-input input{padding-left:36px}.advanced-notice{padding:10px 12px;background:#f6f3ff;border:1px solid #ddd4f6;border-radius:7px;color:#68558c;font-size:12px;line-height:1.55}.form-error{margin:0;color:#b4483a;font-size:12px}footer{display:flex;justify-content:flex-end;gap:9px;padding-top:3px}footer button{display:flex;height:38px;align-items:center;gap:7px;padding:0 15px;border:0;border-radius:7px;background:var(--accent);color:white;cursor:pointer;font-weight:630}footer .secondary{background:var(--bg-base);border:1px solid var(--border-subtle);color:var(--text-secondary)}button:disabled{cursor:default;opacity:.6}.spinning{animation:spin .75s linear infinite}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms ease}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:700px){form{grid-template-columns:1fr}form>*{grid-column:1}.account-editor{max-height:calc(100vh - 24px)}}
.dialog-backdrop.mobile{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));align-items:center}.account-editor.mobile{width:100%;max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);overscroll-behavior:contain}.account-editor.mobile>header{position:sticky;z-index:2;top:0;grid-template-columns:42px minmax(0,1fr) 44px;padding:16px;background:rgba(252,253,255,.985)}.account-editor.mobile h2,.account-editor.mobile header p{overflow-wrap:anywhere}.account-editor.mobile header button{width:44px;height:44px}.account-editor.mobile form{grid-template-columns:minmax(0,1fr);padding:16px}.account-editor.mobile form>*{grid-column:1}.account-editor.mobile input{min-height:44px}.account-editor.mobile select{min-height:44px}.account-editor.mobile textarea{min-height:88px}.account-editor.mobile footer{position:sticky;bottom:0;display:flex;flex-wrap:wrap;padding:12px 0 max(12px,env(safe-area-inset-bottom));background:rgba(252,253,255,.985)}.account-editor.mobile footer button{min-height:44px;height:auto;flex:1 1 120px;justify-content:center;white-space:normal}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
