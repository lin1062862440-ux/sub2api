<script setup lang="ts">
import { Coins, LoaderCircle, Save, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { updateAdminUserBalance } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'

const props = withDefaults(defineProps<{ user: AdminUser | null; mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ close: []; updated: [user: AdminUser] }>()
const form = reactive({ operation: 'add' as 'set' | 'add' | 'subtract', amount: 0 as number | string, notes: '' })
const saving = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const displayError = computed(() => props.mobile && error.value && !['请输入大于 0 的金额', '扣减金额不能超过当前余额'].includes(error.value)
  ? '余额更新失败，请稍后重试。'
  : error.value)
let mounted = false
let previousFocus: HTMLElement | null = null

function safeBalance(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return '—'
  return parsed === 0 ? '$0.00' : `$${parsed.toFixed(2)}`
}

function validUserId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function focusableElements() {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-testid="balance-amount"]')?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function requestClose() {
  if (!props.mobile || !saving.value) emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.mobile || !props.user) return
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
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
  if (!props.user || saving.value) return
  const targetId = props.user.id
  const amount = Number(form.amount)
  if (form.amount === '' || !Number.isFinite(amount) || amount <= 0) {
    error.value = '请输入大于 0 的金额'
    return
  }
  const currentBalance = Number(props.user.balance)
  if (form.operation === 'subtract' && (!Number.isFinite(currentBalance) || currentBalance < 0 || amount > currentBalance)) {
    error.value = '扣减金额不能超过当前余额'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const user = await updateAdminUserBalance(targetId, {
      balance: amount,
      operation: form.operation,
      notes: form.notes.trim(),
    })
    if (!mounted) return
    if (!user || !validUserId(user.id) || user.id !== targetId || props.user?.id !== targetId) {
      error.value = '余额更新返回结果无效'
      return
    }
    emit('updated', user)
    emit('close')
  } catch (caught) {
    if (mounted) error.value = caught instanceof Error && caught.message ? caught.message : '余额更新失败'
  } finally {
    if (mounted) saving.value = false
  }
}

watch(() => props.user?.id, (id, previousId) => {
  form.operation = 'add'
  form.amount = 0
  form.notes = ''
  error.value = ''
  if (!mounted || !props.mobile) return
  if (id && !previousId) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  } else if (!id && previousId) {
    restoreFocus()
  }
})

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.mobile && props.user) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  }
})

onBeforeUnmount(() => {
  mounted = false
  document.removeEventListener('keydown', handleKeydown)
  if (props.mobile && props.user) restoreFocus()
})
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="user" class="dialog-backdrop" :class="{ mobile }" @mousedown.self="requestClose">
      <section ref="dialog" class="balance-dialog" :class="{ mobile }" role="dialog" aria-modal="true" aria-labelledby="balance-dialog-title" tabindex="-1">
        <header><span><Coins :size="20" /></span><div><h2 id="balance-dialog-title">调整余额</h2><p>{{ user.email }} · 当前 {{ safeBalance(user.balance) }}</p></div><button type="button" aria-label="关闭" :disabled="mobile && saving" @click="requestClose"><X :size="18" /></button></header>
        <form data-testid="balance-form" @submit.prevent="submit">
          <label><span>操作方式</span><select v-model="form.operation"><option value="add">增加余额</option><option value="subtract">扣减余额</option><option value="set">设为指定金额</option></select></label>
          <label><span>金额</span><input v-model="form.amount" data-testid="balance-amount" type="number" min="0.01" step="0.01" /></label>
          <label><span>操作备注</span><textarea v-model="form.notes" rows="3" placeholder="可选，用于审计记录" /></label>
          <p v-if="displayError" class="form-error" role="alert">{{ displayError }}</p>
          <footer><button type="button" :disabled="mobile && saving" @click="requestClose">取消</button><button class="primary" type="submit" :disabled="saving"><LoaderCircle v-if="saving" :size="15" class="spinning" /><Save v-else :size="15" />{{ saving ? '处理中' : '确认调整' }}</button></footer>
        </form>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop{position:fixed;z-index:120;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.24);backdrop-filter:blur(10px);place-items:center}.balance-dialog{width:min(440px,calc(100vw - 40px));overflow:hidden;background:rgba(252,253,255,.99);border:1px solid rgba(207,217,230,.95);border-radius:8px;box-shadow:0 24px 70px rgba(23,38,59,.23)}header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e8f4ee;color:#247657;place-items:center}h2{font-size:17px}header p{margin-top:3px;overflow-wrap:anywhere;color:var(--text-tertiary);font-size:11px}header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}form{display:grid;gap:13px;padding:18px}label{display:grid;gap:6px}label span{color:var(--text-secondary);font-size:12px;font-weight:650}input,select,textarea{box-sizing:border-box;width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:6px;background:white;color:var(--text-primary);font:inherit;font-size:13px;outline:0}input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}textarea{resize:vertical}.form-error{padding:9px 10px;border:1px solid var(--coral-border);border-radius:6px;background:var(--coral-soft);color:var(--danger);font-size:12px}footer{display:flex;justify-content:flex-end;gap:8px;padding-top:3px}footer button{display:flex;height:36px;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:12px;font-weight:650}footer .primary{border-color:var(--accent);background:var(--accent);color:white}.dialog-backdrop.mobile{align-items:end;padding:0;padding-top:env(safe-area-inset-top)}.balance-dialog.mobile{width:100%;max-height:calc(100dvh - env(safe-area-inset-top));padding-bottom:env(safe-area-inset-bottom);overflow:auto;border-radius:8px 8px 0 0}.balance-dialog.mobile header{grid-template-columns:40px minmax(0,1fr) 44px;padding:12px 16px}.balance-dialog.mobile header button{width:44px;height:44px}.balance-dialog.mobile input,.balance-dialog.mobile select,.balance-dialog.mobile textarea{min-height:44px}.balance-dialog.mobile footer button{min-height:44px}.spinning{animation:spin .75s linear infinite}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
