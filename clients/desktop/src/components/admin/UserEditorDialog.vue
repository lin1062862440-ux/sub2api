<script setup lang="ts">
import { LoaderCircle, Save, UserRoundPlus, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { createAdminUser, updateAdminUser } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'

const props = withDefaults(defineProps<{
  modelValue: boolean
  user?: AdminUser | null
  mobile?: boolean
}>(), { user: null, mobile: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [user: AdminUser] }>()

type NumberInput = number | string
const form = reactive({
  email: '',
  password: '',
  username: '',
  notes: '',
  role: 'user' as 'admin' | 'user',
  concurrency: 5 as NumberInput,
  rpmLimit: 0 as NumberInput,
})
const saving = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const displayError = computed(() => props.mobile && error.value ? normalizeMobileError(error.value) : error.value)
let mounted = false
let previousFocus: HTMLElement | null = null

function normalizeMobileError(value: string) {
  const validation = [
    '请输入邮箱',
    '初始密码至少需要 6 位',
    '并发上限必须是非负整数。',
    'RPM 上限必须是非负整数。',
  ]
  return validation.includes(value) ? value : '用户保存失败，请稍后重试。'
}

function validUserId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function reset() {
  form.email = props.user?.email ?? ''
  form.password = ''
  form.username = props.user?.username ?? ''
  form.notes = props.user?.notes ?? ''
  form.role = props.user?.role ?? 'user'
  const concurrency = props.user?.concurrency
  const rpmLimit = props.user?.rpm_limit
  const validConcurrency = typeof concurrency === 'number' && Number.isFinite(concurrency) && Number.isInteger(concurrency) && concurrency >= 0
  const validRpmLimit = typeof rpmLimit === 'number' && Number.isFinite(rpmLimit) && Number.isInteger(rpmLimit) && rpmLimit >= 0
  form.concurrency = props.mobile && concurrency !== undefined && !validConcurrency
    ? ''
    : concurrency ?? 5
  form.rpmLimit = props.mobile && rpmLimit !== undefined && !validRpmLimit
    ? ''
    : rpmLimit ?? 0
  error.value = ''
}

function focusableElements() {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-testid="user-editor-email"]')?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.mobile || !props.modelValue) return
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

async function submit() {
  if (saving.value) return
  error.value = ''
  const email = form.email.trim()
  if (!email) {
    error.value = '请输入邮箱'
    return
  }
  if (!props.user && form.password.length < 6) {
    error.value = '初始密码至少需要 6 位'
    return
  }
  const concurrencyInput = Number(form.concurrency)
  if (props.mobile && (form.concurrency === '' || !Number.isFinite(concurrencyInput) || !Number.isInteger(concurrencyInput) || concurrencyInput < 0)) {
    error.value = '并发上限必须是非负整数。'
    return
  }
  const rpmLimitInput = Number(form.rpmLimit)
  if (props.mobile && (form.rpmLimit === '' || !Number.isFinite(rpmLimitInput) || !Number.isInteger(rpmLimitInput) || rpmLimitInput < 0)) {
    error.value = 'RPM 上限必须是非负整数。'
    return
  }
  const concurrency = props.mobile ? concurrencyInput : Math.max(1, concurrencyInput || 1)
  const rpmLimit = props.mobile ? rpmLimitInput : Math.max(0, rpmLimitInput || 0)

  const targetId = props.user?.id ?? null
  saving.value = true
  try {
    const common = {
      email,
      username: form.username.trim(),
      notes: form.notes.trim(),
      role: form.role,
      concurrency,
      rpm_limit: rpmLimit,
    }
    const saved = props.user
      ? await updateAdminUser(targetId!, { ...common, ...(form.password ? { password: form.password } : {}) })
      : await createAdminUser({ ...common, password: form.password })
    if (!mounted) return
    const stillTargetsUser = targetId === null ? props.user == null : props.user?.id === targetId
    if (!saved || !validUserId(saved.id) || (targetId !== null && saved.id !== targetId) || !stillTargetsUser) {
      error.value = '用户保存返回结果无效'
      return
    }
    form.password = ''
    emit('saved', saved)
    emit('update:modelValue', false)
  } catch (caught) {
    if (mounted) error.value = caught instanceof Error && caught.message ? caught.message : '用户保存失败'
  } finally {
    if (mounted) saving.value = false
  }
}

watch(() => [props.modelValue, props.user] as const, ([open]) => {
  if (open) reset()
}, { immediate: true })

watch(() => props.modelValue, (open) => {
  if (!mounted || !props.mobile) return
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  } else {
    restoreFocus()
  }
})

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.mobile && props.modelValue) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  }
})

onBeforeUnmount(() => {
  mounted = false
  document.removeEventListener('keydown', handleKeydown)
  if (props.mobile && props.modelValue) restoreFocus()
})
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="modelValue" class="backdrop" :class="{ mobile }" @mousedown.self="close">
      <section ref="dialog" class="editor" :class="{ mobile }" role="dialog" aria-modal="true" aria-labelledby="user-editor-title" tabindex="-1">
        <header><span><UserRoundPlus :size="20" /></span><div><h2 id="user-editor-title">{{ user ? '编辑用户' : '新增用户' }}</h2><p>仅编辑身份与请求限制</p></div><button type="button" data-testid="user-editor-close" aria-label="关闭" :disabled="saving" @click="close"><X :size="18" /></button></header>
        <form data-testid="user-editor-submit" @submit.prevent="submit">
          <label><span>邮箱</span><input v-model="form.email" data-testid="user-editor-email" type="email" /></label><label><span>用户名</span><input v-model="form.username" /></label>
          <label><span>{{ user ? '新密码（留空不修改）' : '初始密码' }}</span><input v-model="form.password" data-testid="user-editor-password" type="password" autocomplete="new-password" /></label><label><span>角色</span><select v-model="form.role"><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
          <label><span>并发上限</span><input v-model="form.concurrency" data-testid="user-editor-concurrency" type="number" :min="mobile ? 0 : 1" step="1" /></label><label><span>RPM 上限（0 为不限）</span><input v-model="form.rpmLimit" data-testid="user-editor-rpm" type="number" min="0" step="1" /></label>
          <label class="wide"><span>管理员备注</span><textarea v-model="form.notes" rows="3" /></label><p v-if="displayError" class="error wide" role="alert">{{ displayError }}</p><footer class="wide"><button class="secondary" type="button" :disabled="saving" @click="close">取消</button><button type="submit" data-testid="user-editor-save" :disabled="saving"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Save v-else :size="16" />{{ saving ? '保存中' : '保存用户' }}</button></footer>
        </form>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop{position:fixed;z-index:100;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.22);backdrop-filter:blur(12px);place-items:center}.editor{width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;background:rgba(252,253,255,.99);border:1px solid rgba(255,255,255,.9);border-radius:10px;box-shadow:0 28px 72px rgba(27,42,64,.25)}header{display:grid;grid-template-columns:42px 1fr 34px;align-items:center;gap:11px;padding:20px 22px 16px;border-bottom:1px solid var(--border-subtle)}header>span{display:grid;width:40px;height:40px;background:#e9f0ff;border-radius:9px;color:var(--accent);place-items:center}h2{margin:0;font-size:18px}header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}header button{display:grid;width:32px;height:32px;padding:0;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 22px 22px}.wide{grid-column:1/-1}label{display:grid;gap:6px}label span,legend{color:var(--text-secondary);font-size:12px;font-weight:620}input,select,textarea{box-sizing:border-box;width:100%;min-height:38px;padding:8px 11px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-primary);font:inherit;font-size:13px;outline:0}input:focus,select:focus,textarea:focus{border-color:rgba(64,111,203,.58);box-shadow:0 0 0 3px rgba(58,105,198,.09)}.error{margin:0;color:#b4483a;font-size:12px}footer{display:flex;justify-content:flex-end;gap:9px}footer button{display:flex;height:38px;align-items:center;gap:7px;padding:0 15px;border:0;border-radius:7px;background:var(--accent);color:white;cursor:pointer;font-weight:630}footer .secondary{background:var(--bg-base);border:1px solid var(--border-subtle);color:var(--text-secondary)}.backdrop.mobile{align-items:end;padding:0;padding-top:env(safe-area-inset-top)}.editor.mobile{width:100%;max-height:calc(100dvh - env(safe-area-inset-top));padding-bottom:env(safe-area-inset-bottom);border-radius:8px 8px 0 0}.editor.mobile header{grid-template-columns:40px minmax(0,1fr) 44px;padding:12px 16px}.editor.mobile header button{width:44px;height:44px}.editor.mobile form{grid-template-columns:1fr;padding:16px}.editor.mobile form>*{grid-column:1}.editor.mobile input,.editor.mobile select,.editor.mobile textarea{min-height:44px}.editor.mobile footer button{min-height:44px}.spinning{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@media(max-width:700px){form{grid-template-columns:1fr}form>*{grid-column:1}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
