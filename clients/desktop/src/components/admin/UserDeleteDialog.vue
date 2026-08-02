<script setup lang="ts">
import { AlertTriangle, LoaderCircle, Trash2, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { deleteAdminUser } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'

const props = withDefaults(defineProps<{ user: AdminUser | null; mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ close: []; deleted: [id: number] }>()
const identity = ref('')
const deleting = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const confirmed = computed(() => Boolean(props.user) && (identity.value === props.user?.username || identity.value === props.user?.email))
const displayError = computed(() => props.mobile && error.value ? '用户删除失败，请稍后重试。' : error.value)
let mounted = false
let previousFocus: HTMLElement | null = null

function focusableElements() {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-testid="delete-user-identity"]')?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function requestClose() {
  if (!props.mobile || !deleting.value) emit('close')
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

async function remove() {
  if (!props.user || !confirmed.value || deleting.value) return
  const id = props.user.id
  deleting.value = true
  error.value = ''
  try {
    await deleteAdminUser(id)
    if (!mounted) return
    emit('deleted', id)
    emit('close')
  } catch (caught) {
    if (mounted) error.value = caught instanceof Error && caught.message ? caught.message : '删除失败'
  } finally {
    if (mounted) deleting.value = false
  }
}

watch(() => props.user?.id, (id, previousId) => {
  identity.value = ''
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
  <Transition name="fade">
    <div v-if="user" class="backdrop" :class="{ mobile }" @mousedown.self="requestClose">
      <section ref="dialog" class="dialog" :class="{ mobile }" role="dialog" aria-modal="true" aria-labelledby="delete-user-title" tabindex="-1">
        <header><span><AlertTriangle :size="20" /></span><div><h2 id="delete-user-title">删除用户</h2><p>此操作会停用并移除用户访问权限</p></div><button type="button" aria-label="关闭" :disabled="mobile && deleting" @click="requestClose"><X :size="18" /></button></header>
        <div class="body"><p>请输入用户名 <strong>{{ user.username }}</strong> 或邮箱 <strong>{{ user.email }}</strong> 以确认删除。</p><input v-model="identity" data-testid="delete-user-identity" autocomplete="off" /><span v-if="displayError" class="error" role="alert">{{ displayError }}</span></div>
        <footer><button type="button" class="secondary" data-testid="cancel-delete-user" :disabled="mobile && deleting" @click="requestClose">取消</button><button type="button" data-testid="confirm-delete-user" :disabled="!confirmed || deleting" @click="remove"><LoaderCircle v-if="deleting" :size="16" class="spinning" /><Trash2 v-else :size="16" />确认删除</button></footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop{position:fixed;z-index:110;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.28);backdrop-filter:blur(12px);place-items:center}.dialog{width:min(480px,100%);background:white;border:1px solid rgba(255,255,255,.9);border-radius:10px;box-shadow:0 28px 72px rgba(27,42,64,.28)}header{display:grid;grid-template-columns:42px 1fr 32px;align-items:center;gap:10px;padding:20px}header>span{display:grid;width:40px;height:40px;background:#fff0ed;border-radius:9px;color:#b34839;place-items:center}h2{margin:0;font-size:18px}header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}header button{display:grid;width:32px;height:32px;padding:0;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}.body{padding:0 20px 18px}.body p{margin:0 0 11px;overflow-wrap:anywhere;color:var(--text-secondary);font-size:13px;line-height:1.6}.body input{box-sizing:border-box;width:100%;height:40px;padding:0 11px;border:1px solid #e1aaa1;border-radius:7px;outline:0}.error{display:block;margin-top:7px;color:#b34839;font-size:12px}footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 20px;border-top:1px solid var(--border-subtle)}footer button{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:0;border-radius:7px;background:#ba4d3c;color:white;cursor:pointer}.secondary{background:var(--bg-base);border:1px solid var(--border-subtle);color:var(--text-secondary)}button:disabled{cursor:default;opacity:.45}.backdrop.mobile{align-items:end;padding:0;padding-top:env(safe-area-inset-top)}.dialog.mobile{width:100%;max-height:calc(100dvh - env(safe-area-inset-top));padding-bottom:env(safe-area-inset-bottom);overflow:auto;border-radius:8px 8px 0 0}.dialog.mobile header{grid-template-columns:40px minmax(0,1fr) 44px;padding:12px 16px}.dialog.mobile header button{width:44px;height:44px}.dialog.mobile .body input{min-height:44px}.dialog.mobile footer button{min-height:44px}.spinning{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.fade-enter-active,.fade-leave-active{transition:opacity 180ms}.fade-enter-from,.fade-leave-to{opacity:0}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
