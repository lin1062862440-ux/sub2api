<script setup lang="ts">
import { AlertTriangle, CalendarClock, Server, ShieldCheck, X } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AdminAccount } from '@/api/admin/types'
import { formatDateTime, formatPlatform } from '@/lib/format'

const props = withDefaults(defineProps<{ account: AdminAccount | null; mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null)
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
  focusableElements()[0]?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function requestClose() {
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.account) return
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

function formatExpiry(value: number | null) {
  if (!value || !Number.isFinite(value)) return '永不过期'
  const expiry = new Date(value * 1000)
  return Number.isFinite(expiry.getTime()) ? formatDateTime(expiry.toISOString()) : '永不过期'
}

function safeNumber(value: unknown, fallback = 0) {
  if (!props.mobile) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

watch(() => props.account, (account, previousAccount) => {
  if (!mounted) return
  if (account && !previousAccount) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  } else if (!account && previousAccount) {
    restoreFocus()
  }
})

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.account) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (props.account) restoreFocus()
})
</script>

<template>
  <Transition name="drawer">
    <div v-if="account" class="drawer-backdrop" @mousedown.self="requestClose">
      <aside ref="dialog" class="account-detail" :class="{ mobile }" data-testid="account-detail" role="dialog" aria-modal="true" aria-label="账号详情" tabindex="-1">
        <header><span><Server :size="20" /></span><div><h2>{{ account.name }}</h2><p>{{ formatPlatform(account.platform) }} · {{ account.type }}</p></div><button type="button" title="关闭" aria-label="关闭" @click="requestClose"><X :size="18" /></button></header>
        <section class="detail-status" :class="account.status"><ShieldCheck v-if="account.status === 'active'" :size="18" /><AlertTriangle v-else :size="18" /><div><strong>{{ account.status === 'active' ? '账号运行正常' : account.status === 'error' ? '账号存在错误' : '账号已停用' }}</strong><span>{{ account.schedulable ? '已加入调度' : '未参与调度' }}</span></div></section>
        <section v-if="account.error_message" class="error-box"><span>最近错误</span><p>{{ mobile ? '错误详情已隐藏，请在受控日志中查看。' : account.error_message }}</p></section>
        <section class="detail-grid"><div><span>当前并发</span><strong>{{ safeNumber(account.current_concurrency) }} / {{ safeNumber(account.concurrency) }}</strong></div><div><span>优先级</span><strong>{{ safeNumber(account.priority) }}</strong></div><div><span>计费倍率</span><strong>{{ safeNumber(account.rate_multiplier, 1) }}x</strong></div><div><span>代理</span><strong>{{ account.proxy_id ? `#${safeNumber(account.proxy_id)}` : '直连' }}</strong></div></section>
        <section class="detail-section"><h3>所属分组</h3><div class="group-chips"><span v-for="group in account.groups" :key="group.id">{{ group.name }}</span><em v-if="!account.groups?.length">未绑定分组</em></div></section>
        <section class="detail-section"><h3>时间信息</h3><dl><div><dt><CalendarClock :size="15" />最后使用</dt><dd>{{ formatDateTime(account.last_used_at) }}</dd></div><div><dt>凭据有效期</dt><dd>{{ formatExpiry(account.expires_at) }}</dd></div><div><dt>最近更新</dt><dd>{{ formatDateTime(account.updated_at) }}</dd></div></dl></section>
        <section v-if="account.notes" class="detail-section"><h3>备注</h3><p class="notes">{{ account.notes }}</p></section>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-backdrop{position:fixed;z-index:90;inset:0;background:rgba(31,42,58,.16);backdrop-filter:blur(5px)}.account-detail{position:absolute;top:0;right:0;width:min(460px,56vw);min-width:390px;height:100%;padding:26px;overflow:auto;background:rgba(249,251,254,.985);border-left:1px solid rgba(215,223,234,.9);box-shadow:-18px 0 54px rgba(32,47,68,.16)}header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:11px}header>span{display:grid;width:40px;height:40px;background:#e9f0ff;border-radius:9px;color:var(--accent);place-items:center}h2{margin:0;font-size:19px}header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}.detail-status{display:flex;align-items:center;gap:10px;margin-top:22px;padding:13px;background:#eaf8f1;border:1px solid #c8e9d8;border-radius:8px;color:#257957}.detail-status.error{background:#fff0ed;border-color:#efcbc4;color:#a94536}.detail-status.inactive{background:#f1f3f6;border-color:#dce1e8;color:#687282}.detail-status div{display:grid;gap:2px}.detail-status strong{font-size:13px}.detail-status span{font-size:11px;opacity:.85}.error-box{margin-top:12px;padding:12px;background:#fff7f5;border:1px solid #efd5cf;border-radius:8px}.error-box span{color:#a24b3d;font-size:11px;font-weight:650}.error-box p{margin:6px 0 0;color:#7e463d;font-family:var(--font-data);font-size:12px;line-height:1.55;overflow-wrap:anywhere}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.detail-grid div{display:grid;gap:5px;padding:12px;background:white;border:1px solid var(--border-subtle);border-radius:7px}.detail-grid span{color:var(--text-tertiary);font-size:11px}.detail-grid strong{font-family:var(--font-data);font-size:15px}.detail-section{margin-top:22px}.detail-section h3{margin:0 0 10px;font-size:13px}.group-chips{display:flex;flex-wrap:wrap;gap:7px}.group-chips span{padding:5px 9px;background:#edf3ff;border:1px solid #d5e2fa;border-radius:5px;color:#3d67ad;font-size:12px}.group-chips em{color:var(--text-tertiary);font-size:12px;font-style:normal}dl{display:grid;margin:0;background:white;border:1px solid var(--border-subtle);border-radius:8px}dl>div{display:flex;min-height:42px;align-items:center;justify-content:space-between;gap:18px;padding:0 12px;border-bottom:1px solid var(--border-subtle)}dl>div:last-child{border-bottom:0}dt{display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:12px}dd{margin:0;color:var(--text-primary);font-family:var(--font-data);font-size:12px;text-align:right}.notes{margin:0;padding:12px;background:white;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-secondary);font-size:12px;line-height:1.6}.account-detail.mobile{width:min(100%,460px);min-width:0;padding:20px 16px 28px}.account-detail.mobile h2,.account-detail.mobile header p,.account-detail.mobile dd,.account-detail.mobile .notes,.account-detail.mobile .group-chips span{overflow-wrap:anywhere}.account-detail.mobile header button{width:44px;height:44px}.account-detail.mobile .group-chips span{max-width:100%}.drawer-enter-active,.drawer-leave-active{transition:opacity 200ms ease}.drawer-enter-active .account-detail,.drawer-leave-active .account-detail{transition:transform 220ms var(--motion-ease-out)}.drawer-enter-from,.drawer-leave-to{opacity:0}.drawer-enter-from .account-detail,.drawer-leave-to .account-detail{transform:translateX(26px)}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
