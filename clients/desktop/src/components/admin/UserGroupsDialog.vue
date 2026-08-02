<script setup lang="ts">
import { Layers3, LoaderCircle, Save, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { updateAdminUser } from '@/api/admin/users'
import type { AdminGroupOption, AdminUser } from '@/api/admin/types'
import { formatPlatform } from '@/lib/format'

const props = withDefaults(defineProps<{ user: AdminUser | null; groups: AdminGroupOption[]; mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ close: []; updated: [user: AdminUser] }>()
const selected = ref<number[]>([])
const saving = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const displayError = computed(() => props.mobile && error.value ? '分组权限保存失败，请稍后重试。' : error.value)
let mounted = false
let previousFocus: HTMLElement | null = null

function safeGroups() {
  return Array.isArray(props.groups)
    ? props.groups.filter((group) => group && Number.isFinite(group.id) && Number.isInteger(group.id) && group.id > 0)
    : []
}

function safeName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '未命名分组'
}

function focusableElements() {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  const groupButton = dialog.value?.querySelector<HTMLElement>('[data-testid^="user-group-"]')
  ;(groupButton ?? focusableElements()[0] ?? dialog.value)?.focus()
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

function toggle(id: number) {
  if (props.mobile && saving.value) return
  const index = selected.value.indexOf(id)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(id)
}

async function submit() {
  if (!props.user || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const user = await updateAdminUser(props.user.id, { allowed_groups: [...selected.value].sort((a, b) => a - b) })
    if (!mounted) return
    emit('updated', user)
    emit('close')
  } catch (caught) {
    if (mounted) error.value = caught instanceof Error && caught.message ? caught.message : '分组权限保存失败'
  } finally {
    if (mounted) saving.value = false
  }
}

watch(() => props.user?.id, (id, previousId) => {
  selected.value = Array.isArray(props.user?.allowed_groups)
    ? props.user.allowed_groups.filter((value) => Number.isFinite(value) && Number.isInteger(value) && value > 0)
    : []
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
      <section ref="dialog" class="groups-dialog" :class="{ mobile }" data-testid="user-groups-dialog" role="dialog" aria-modal="true" aria-labelledby="groups-dialog-title" tabindex="-1">
        <header><span><Layers3 :size="20" /></span><div><h2 id="groups-dialog-title">用户分组</h2><p>{{ user.email }}</p></div><button type="button" aria-label="关闭" :disabled="mobile && saving" @click="requestClose"><X :size="18" /></button></header>
        <div class="dialog-body">
          <div class="public-note"><strong>公共分组</strong><span>用户默认可以访问所有已启用的公共分组。</span></div>
          <div class="group-list">
            <button v-for="group in safeGroups().filter(item => item.is_exclusive)" :key="group.id" type="button" :data-testid="`user-group-${group.id}`" :aria-pressed="selected.includes(group.id)" :disabled="mobile && saving" @click="toggle(group.id)"><i><span /></i><div><strong>{{ safeName(group.name) }}</strong><small>{{ formatPlatform(group.platform || '') }} · 专属分组</small></div></button>
            <p v-if="!safeGroups().some(item => item.is_exclusive)">暂无可分配的专属分组</p>
          </div>
          <p v-if="displayError" class="form-error" role="alert">{{ displayError }}</p>
        </div>
        <footer><span>已选择 {{ selected.length }} 个专属分组</span><div><button type="button" :disabled="mobile && saving" @click="requestClose">取消</button><button class="primary" type="button" data-testid="user-groups-submit" :disabled="saving" @click="submit"><LoaderCircle v-if="saving" :size="15" class="spinning" /><Save v-else :size="15" />{{ saving ? '保存中' : '保存分组' }}</button></div></footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop{position:fixed;z-index:120;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.24);backdrop-filter:blur(10px);place-items:center}.groups-dialog{width:min(500px,calc(100vw - 40px));overflow:hidden;background:rgba(252,253,255,.99);border:1px solid rgba(207,217,230,.95);border-radius:8px;box-shadow:0 24px 70px rgba(23,38,59,.23)}header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e9f0ff;color:var(--accent);place-items:center}h2{font-size:17px}header p{margin-top:3px;overflow-wrap:anywhere;color:var(--text-tertiary);font-size:11px}header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}.dialog-body{display:grid;gap:12px;padding:18px}.public-note{display:grid;gap:3px;padding:10px 11px;border:1px solid #dbe6f7;border-radius:6px;background:#f2f6fd}.public-note strong{font-size:12px}.public-note span{color:var(--text-tertiary);font-size:10px}.group-list{display:grid;gap:7px;max-height:310px;overflow:auto}.group-list>button{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:10px;width:100%;padding:10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary);text-align:left}.group-list>button[aria-pressed=true]{border-color:#b8cef3;background:#f2f6ff}.group-list>button>i{display:grid;width:18px;height:18px;border:1px solid #bdc7d4;border-radius:4px;background:white;place-items:center}.group-list>button[aria-pressed=true]>i{border-color:var(--accent);background:var(--accent)}.group-list>button[aria-pressed=true]>i span{width:8px;height:4px;border-bottom:2px solid white;border-left:2px solid white;transform:rotate(-45deg) translateY(-1px)}.group-list>button>div{display:grid;min-width:0;gap:2px}.group-list strong,.group-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-list strong{font-size:12px}.group-list small{color:var(--text-tertiary);font-size:10px}.group-list>p{padding:28px;color:var(--text-tertiary);font-size:12px;text-align:center}.form-error{padding:9px 10px;border:1px solid var(--coral-border);border-radius:6px;background:var(--coral-soft);color:var(--danger);font-size:12px}footer{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;border-top:1px solid var(--border-subtle);background:#f7f9fc}footer>span{color:var(--text-tertiary);font-size:11px}footer>div{display:flex;gap:8px}footer button{display:flex;height:35px;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:12px;font-weight:650}footer .primary{border-color:var(--accent);background:var(--accent);color:white}.dialog-backdrop.mobile{align-items:end;padding:0;padding-top:env(safe-area-inset-top)}.groups-dialog.mobile{display:flex;width:100%;max-height:calc(100dvh - env(safe-area-inset-top));flex-direction:column;padding-bottom:env(safe-area-inset-bottom);border-radius:8px 8px 0 0}.groups-dialog.mobile header{grid-template-columns:40px minmax(0,1fr) 44px;padding:12px 16px}.groups-dialog.mobile header button{width:44px;height:44px}.groups-dialog.mobile .dialog-body{min-height:0;overflow:auto}.groups-dialog.mobile .group-list>button{min-height:44px}.groups-dialog.mobile footer button{min-height:44px}.spinning{animation:spin .75s linear infinite}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:380px){.groups-dialog.mobile footer{align-items:stretch;flex-direction:column}.groups-dialog.mobile footer>div{display:grid;grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
