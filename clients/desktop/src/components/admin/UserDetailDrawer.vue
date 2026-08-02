<script setup lang="ts">
import { ArrowUpRight, KeyRound, Link2, RefreshCw, RotateCcw, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  bindAdminUserIdentity,
  getAdminUserApiKeys,
  getAdminUserBalanceHistory,
  getAdminUserPlatformQuotas,
  getAdminUserUsage,
  resetAdminUserPlatformQuota,
  updateAdminUserPlatformQuotas,
} from '@/api/admin/users'
import type {
  AdminPlatformQuota,
  AdminQuotaPlatform,
  AdminQuotaWindow,
  AdminUser,
} from '@/api/admin/types'
import { formatDateTime, formatPlatform } from '@/lib/format'

const props = withDefaults(defineProps<{ user: AdminUser | null; mobile?: boolean }>(), { mobile: false })
const emit = defineEmits<{ close: []; updated: [user: AdminUser] }>()
interface DetailKey { id: number; name: string; status: string; quota_used: number | null }
interface DetailHistoryItem { id: number; type: string; value: number | null; created_at: string | null; notes: string }
interface DetailUsage { total_requests: number | null; total_tokens: number | null; total_cost: number | null }

const loading = ref(false)
const issues = ref<string[]>([])
const keys = ref<{ items: DetailKey[] } | null>(null)
const usage = ref<DetailUsage | null>(null)
const history = ref<{ items: DetailHistoryItem[] } | null>(null)
const quotas = ref<AdminPlatformQuota[]>([])
const quotasReady = ref(false)
const identity = reactive({ provider_type: 'oidc', provider_key: 'main', provider_subject: '' })
const saving = ref('')
const message = ref('')
const detail = ref<HTMLElement | null>(null)
const platforms: AdminQuotaPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok']
const quotaDraft = ref<Record<string, { daily: string; weekly: string; monthly: string }>>(
  emptyQuotaDraft(),
)
let mounted = false
let loadGeneration = 0
let previousFocus: HTMLElement | null = null

const quotaRows = computed(() => platforms.map((platform) => quotas.value.find((quota) => quota.platform === platform) ?? {
  platform,
  daily_limit_usd: null,
  weekly_limit_usd: null,
  monthly_limit_usd: null,
  daily_usage_usd: 0,
  weekly_usage_usd: 0,
  monthly_usage_usd: 0,
}))

function emptyQuotaDraft() {
  return Object.fromEntries(platforms.map((platform) => [platform, { daily: '', weekly: '', monthly: '' }]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function safeMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function safeDateValue(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? value : null
}

function safeDateTime(value: unknown) {
  const date = safeDateValue(value)
  if (!date) return '—'
  try {
    const formatted = formatDateTime(date)
    return formatted && !formatted.includes('Invalid') ? formatted : '—'
  } catch {
    return '—'
  }
}

function sanitizeKeys(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) return null
  const items = value.items.flatMap((item): DetailKey[] => {
    if (!isRecord(item) || !validId(item.id)) return []
    return [{
      id: item.id,
      name: typeof item.name === 'string' ? item.name : '',
      status: typeof item.status === 'string' ? item.status : '',
      quota_used: safeMetric(item.quota_used),
    }]
  })
  return { items }
}

function sanitizeUsage(value: unknown): DetailUsage | null {
  if (!isRecord(value)) return null
  return {
    total_requests: safeMetric(value.total_requests),
    total_tokens: safeMetric(value.total_tokens),
    total_cost: safeMetric(value.total_cost),
  }
}

function sanitizeHistory(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) return null
  const items = value.items.flatMap((item): DetailHistoryItem[] => {
    if (!isRecord(item) || !validId(item.id)) return []
    return [{
      id: item.id,
      type: typeof item.type === 'string' ? item.type : '',
      value: safeMetric(item.value),
      created_at: safeDateValue(item.created_at),
      notes: typeof item.notes === 'string' ? item.notes : '',
    }]
  })
  return { items }
}

function sanitizeQuotas(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.platform_quotas)) return null
  const seen = new Set<AdminQuotaPlatform>()
  return value.platform_quotas.flatMap((item): AdminPlatformQuota[] => {
    if (!isRecord(item) || !platforms.includes(item.platform as AdminQuotaPlatform)) return []
    const platform = item.platform as AdminQuotaPlatform
    if (seen.has(platform)) return []
    seen.add(platform)
    return [{
      platform,
      daily_limit_usd: safeMetric(item.daily_limit_usd),
      weekly_limit_usd: safeMetric(item.weekly_limit_usd),
      monthly_limit_usd: safeMetric(item.monthly_limit_usd),
      daily_usage_usd: safeMetric(item.daily_usage_usd) ?? 0,
      weekly_usage_usd: safeMetric(item.weekly_usage_usd) ?? 0,
      monthly_usage_usd: safeMetric(item.monthly_usage_usd) ?? 0,
    }]
  })
}

function resetUserState() {
  loadGeneration += 1
  loading.value = false
  issues.value = []
  keys.value = null
  usage.value = null
  history.value = null
  quotas.value = []
  quotasReady.value = false
  quotaDraft.value = emptyQuotaDraft()
  identity.provider_type = 'oidc'
  identity.provider_key = 'main'
  identity.provider_subject = ''
  saving.value = ''
  message.value = ''
}

function safeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function safeCost(value: unknown) {
  const parsed = safeNumber(value)
  if (parsed === null) return '—'
  if (parsed === 0) return '$0.00'
  return parsed < 0.01 ? `$${parsed.toFixed(4)}` : `$${parsed.toFixed(2)}`
}

function safeCount(value: unknown) {
  const parsed = safeNumber(value)
  if (parsed === null || !Number.isInteger(parsed)) return '—'
  return new Intl.NumberFormat('zh-CN').format(parsed)
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function syncDraft() {
  quotaDraft.value = Object.fromEntries(quotaRows.value.map((quota) => [quota.platform, {
    daily: safeNumber(quota.daily_limit_usd)?.toString() ?? '',
    weekly: safeNumber(quota.weekly_limit_usd)?.toString() ?? '',
    monthly: safeNumber(quota.monthly_limit_usd)?.toString() ?? '',
  }]))
}

function focusableElements() {
  if (!detail.value) return []
  return Array.from(detail.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusInitialControl() {
  await nextTick()
  detail.value?.querySelector<HTMLElement>('[aria-label="关闭"]')?.focus()
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
  const outside = !detail.value?.contains(active)
  if (!first || !last) {
    event.preventDefault()
    detail.value?.focus()
  } else if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

async function load() {
  const user = props.user
  if (!user) return
  const generation = ++loadGeneration
  loading.value = true
  issues.value = []
  const [keyResult, usageResult, historyResult, quotaResult] = await Promise.allSettled([
    getAdminUserApiKeys(user.id),
    getAdminUserUsage(user.id, 'month'),
    getAdminUserBalanceHistory(user.id, { page: 1, page_size: 20 }),
    getAdminUserPlatformQuotas(user.id),
  ])
  if (!mounted || generation !== loadGeneration || props.user?.id !== user.id) return
  const sanitizedKeys = keyResult.status === 'fulfilled' ? sanitizeKeys(keyResult.value) : null
  if (sanitizedKeys) keys.value = sanitizedKeys
  else issues.value.push('API Key')
  const sanitizedUsage = usageResult.status === 'fulfilled' ? sanitizeUsage(usageResult.value) : null
  if (sanitizedUsage) usage.value = sanitizedUsage
  else issues.value.push('用量')
  const sanitizedHistory = historyResult.status === 'fulfilled' ? sanitizeHistory(historyResult.value) : null
  if (sanitizedHistory) history.value = sanitizedHistory
  else issues.value.push('余额记录')
  if (quotaResult.status === 'fulfilled') {
    const sanitizedQuotas = sanitizeQuotas(quotaResult.value)
    if (sanitizedQuotas) {
      quotas.value = sanitizedQuotas
      quotasReady.value = true
      syncDraft()
    } else {
      issues.value.push('平台额度')
    }
  } else {
    issues.value.push('平台额度')
  }
  loading.value = false
}

async function bindIdentity() {
  if (!props.user || !identity.provider_subject.trim() || (props.mobile && saving.value)) return
  const targetId = props.user.id
  saving.value = 'identity'
  message.value = ''
  try {
    await bindAdminUserIdentity(targetId, {
      provider_type: identity.provider_type,
      provider_key: identity.provider_key,
      provider_subject: identity.provider_subject.trim(),
    })
    if (!mounted || props.user?.id !== targetId) return
    message.value = '身份绑定完成'
    identity.provider_subject = ''
  } catch (caught) {
    if (mounted && props.user?.id === targetId) message.value = props.mobile
      ? '身份绑定失败，请稍后重试。'
      : caught instanceof Error && caught.message ? caught.message : '身份绑定失败'
  } finally {
    if (mounted && props.user?.id === targetId && saving.value === 'identity') saving.value = ''
  }
}

function parseQuota(value: string): number | null | undefined {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function legacyNullable(value: string) {
  return value.trim() === '' ? null : Math.max(0, Number(value) || 0)
}

async function saveQuotas() {
  if (!props.user || !quotasReady.value || (props.mobile && saving.value)) return
  const targetId = props.user.id
  const payload = platforms.map((platform) => ({
    platform,
    daily_limit_usd: props.mobile ? parseQuota(quotaDraft.value[platform]?.daily ?? '') : legacyNullable(quotaDraft.value[platform]?.daily ?? ''),
    weekly_limit_usd: props.mobile ? parseQuota(quotaDraft.value[platform]?.weekly ?? '') : legacyNullable(quotaDraft.value[platform]?.weekly ?? ''),
    monthly_limit_usd: props.mobile ? parseQuota(quotaDraft.value[platform]?.monthly ?? '') : legacyNullable(quotaDraft.value[platform]?.monthly ?? ''),
  }))
  if (payload.some((quota) => quota.daily_limit_usd === undefined || quota.weekly_limit_usd === undefined || quota.monthly_limit_usd === undefined)) {
    message.value = '额度必须是有限的非负数字，或留空表示不限。'
    return
  }
  saving.value = 'quotas'
  message.value = ''
  try {
    const data = await updateAdminUserPlatformQuotas(targetId, payload.map((quota) => ({
      platform: quota.platform,
      daily_limit_usd: quota.daily_limit_usd!,
      weekly_limit_usd: quota.weekly_limit_usd!,
      monthly_limit_usd: quota.monthly_limit_usd!,
    })))
    if (!mounted || props.user?.id !== targetId) return
    const sanitized = sanitizeQuotas(data)
    if (!sanitized) {
      message.value = props.mobile ? '额度保存失败，请稍后重试。' : '额度保存返回结果无效'
      return
    }
    quotas.value = sanitized
    syncDraft()
    message.value = '平台额度已保存'
  } catch (caught) {
    if (mounted && props.user?.id === targetId) message.value = props.mobile
      ? '额度保存失败，请稍后重试。'
      : caught instanceof Error && caught.message ? caught.message : '额度保存失败'
  } finally {
    if (mounted && props.user?.id === targetId && saving.value === 'quotas') saving.value = ''
  }
}

async function resetQuota(platform: AdminQuotaPlatform, window: AdminQuotaWindow) {
  if (!props.user || !quotasReady.value || (props.mobile && saving.value)) return
  const targetId = props.user.id
  const windowLabel = { daily: '日', weekly: '周', monthly: '月' }[window]
  if (!globalThis.confirm(`确认重置 ${props.user.email} 的 ${formatPlatform(platform)} ${windowLabel}用量？`)) return
  saving.value = `${platform}-${window}`
  message.value = ''
  try {
    const data = await resetAdminUserPlatformQuota(targetId, platform, window)
    if (!mounted || props.user?.id !== targetId) return
    const sanitized = sanitizeQuotas(data)
    if (!sanitized) {
      message.value = props.mobile ? '额度重置失败，请稍后重试。' : '额度重置返回结果无效'
      return
    }
    quotas.value = sanitized
    syncDraft()
    message.value = `${formatPlatform(platform)} ${windowLabel}用量已重置`
  } catch (caught) {
    if (mounted && props.user?.id === targetId) message.value = props.mobile
      ? '额度重置失败，请稍后重试。'
      : caught instanceof Error && caught.message ? caught.message : '额度重置失败'
  } finally {
    if (mounted && props.user?.id === targetId && saving.value === `${platform}-${window}`) saving.value = ''
  }
}

watch(() => props.user?.id, (id, previousId) => {
  resetUserState()
  if (id && mounted) void load()
  if (!mounted || !props.mobile) return
  if (id && !previousId) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusInitialControl()
  } else if (!id && previousId) {
    restoreFocus()
  }
}, { immediate: true })

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.user) {
    resetUserState()
    void load()
    if (props.mobile) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void focusInitialControl()
    }
  }
})

onBeforeUnmount(() => {
  mounted = false
  loadGeneration += 1
  document.removeEventListener('keydown', handleKeydown)
  if (props.mobile && props.user) restoreFocus()
})
</script>

<template>
  <Transition name="drawer">
    <div v-if="user" class="backdrop" :class="{ mobile }" @mousedown.self="requestClose">
      <aside ref="detail" class="detail" :class="{ mobile }" data-testid="user-detail" role="dialog" aria-modal="true" aria-labelledby="user-detail-title" tabindex="-1">
        <header><div><h2 id="user-detail-title">{{ safeText(user.username, '未命名用户') }}</h2><p>{{ safeText(user.email, '未提供邮箱') }}</p></div><button type="button" aria-label="关闭" :disabled="mobile && Boolean(saving)" @click="requestClose"><X :size="18" /></button></header>
        <p v-if="issues.length" class="warning">部分数据不可用：{{ issues.join('、') }}</p>
        <p v-if="message" class="message" role="status">{{ message }}</p>
        <div v-if="loading" class="loading"><i v-for="n in 7" :key="n" /></div>
        <template v-else>
          <section class="metrics"><div><span>近 30 天请求</span><strong>{{ safeCount(usage?.total_requests) }}</strong></div><div><span>Token</span><strong>{{ safeCount(usage?.total_tokens) }}</strong></div><div><span>消费</span><strong>{{ safeCost(usage?.total_cost) }}</strong></div><div><span>当前余额</span><strong>{{ safeCost(user.balance) }}</strong></div></section>
          <section class="panel"><h3><KeyRound :size="16" />API Key</h3><div v-if="!keys?.items?.length" class="empty">暂无 API Key</div><div v-for="key in keys?.items ?? []" :key="key.id" class="key-row"><div><strong>{{ safeText(key.name, '未命名 Key') }}</strong><span>{{ safeText(key.status, '未知状态') }}</span></div><span>已用 {{ safeCost(key.quota_used) }}</span></div></section>
          <section class="panel"><h3><ArrowUpRight :size="16" />余额记录</h3><div v-if="!history?.items?.length" class="empty">暂无记录</div><div v-for="item in (history?.items ?? []).slice(0, 5)" :key="item.id" class="history-row"><div><strong>{{ safeText(item.type, '未知类型') }}</strong><span>{{ safeText(item.notes, '无备注') }}</span></div><em>{{ Number(item.value) > 0 ? '+' : '' }}{{ safeCost(item.value) }}</em><span>{{ safeDateTime(item.created_at) }}</span></div></section>
          <section class="panel"><h3><Link2 :size="16" />绑定登录身份</h3><form class="identity-form" @submit.prevent="bindIdentity"><select v-model="identity.provider_type"><option value="oidc">OIDC</option><option value="linuxdo">LinuxDo</option><option value="github">GitHub</option><option value="google">Google</option><option value="wechat">微信</option><option value="dingtalk">钉钉</option></select><input v-model="identity.provider_key" placeholder="Provider Key" /><input v-model="identity.provider_subject" placeholder="Provider Subject" /><button type="submit" :disabled="mobile && Boolean(saving)">绑定</button></form></section>
          <section class="panel quota-panel"><div class="panel-title"><h3><RefreshCw :size="16" />平台额度</h3><button type="button" data-testid="user-quota-save" :disabled="!quotasReady || (mobile ? Boolean(saving) : saving === 'quotas')" @click="saveQuotas">保存额度</button></div><div class="quota-head"><span>平台</span><span>日限额</span><span>周限额</span><span>月限额</span><span>日 / 周 / 月用量</span></div><div v-for="quota in quotaRows" :key="quota.platform" class="quota-row"><strong>{{ formatPlatform(quota.platform) }}</strong><input v-model="quotaDraft[quota.platform]!.daily" placeholder="不限" /><input v-model="quotaDraft[quota.platform]!.weekly" placeholder="不限" /><input v-model="quotaDraft[quota.platform]!.monthly" placeholder="不限" /><div class="quota-usage"><span><small>日 {{ safeCost(quota.daily_usage_usd) }}</small><button type="button" title="重置日用量" :data-testid="`reset-quota-${quota.platform}-daily`" :disabled="!quotasReady || (mobile ? Boolean(saving) : saving === `${quota.platform}-daily`)" @click="resetQuota(quota.platform, 'daily')"><RotateCcw :size="12" /></button></span><span><small>周 {{ safeCost(quota.weekly_usage_usd) }}</small><button type="button" title="重置周用量" :data-testid="`reset-quota-${quota.platform}-weekly`" :disabled="!quotasReady || (mobile ? Boolean(saving) : saving === `${quota.platform}-weekly`)" @click="resetQuota(quota.platform, 'weekly')"><RotateCcw :size="12" /></button></span><span><small>月 {{ safeCost(quota.monthly_usage_usd) }}</small><button type="button" title="重置月用量" :data-testid="`reset-quota-${quota.platform}-monthly`" :disabled="!quotasReady || (mobile ? Boolean(saving) : saving === `${quota.platform}-monthly`)" @click="resetQuota(quota.platform, 'monthly')"><RotateCcw :size="12" /></button></span></div></div></section>
        </template>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop{position:fixed;z-index:90;inset:0;background:rgba(31,42,58,.16);backdrop-filter:blur(5px)}.detail{box-sizing:border-box;position:absolute;top:0;right:0;width:min(650px,72vw);min-width:520px;height:100%;padding:26px;overflow:auto;background:rgba(249,251,254,.99);border-left:1px solid rgba(215,223,234,.9);box-shadow:-18px 0 54px rgba(32,47,68,.16)}header{display:flex;align-items:center;justify-content:space-between;gap:16px}header>div{min-width:0}h2,header p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}h2{margin:0;font-size:20px}header p{margin:4px 0 0;color:var(--text-tertiary);font-size:12px}header button{display:grid;width:32px;height:32px;padding:0;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}.warning,.message{padding:9px 11px;border-radius:7px;font-size:12px}.warning{background:#fff8e8;border:1px solid #f0dda9;color:#8a641b}.message{overflow-wrap:anywhere;background:#edf5ff;border:1px solid #d3e3f8;color:#3f67a2}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:18px}.metrics>div{display:grid;min-width:0;gap:5px;padding:12px;background:white;border:1px solid var(--border-subtle);border-radius:7px}.metrics span{color:var(--text-tertiary);font-size:10px}.metrics strong{overflow:hidden;font-family:var(--font-data);font-size:15px;text-overflow:ellipsis;white-space:nowrap}.panel{margin-top:14px;padding:15px;background:white;border:1px solid var(--border-subtle);border-radius:8px}.panel h3{display:flex;align-items:center;gap:7px;margin:0 0 11px;font-size:13px}.identity-form{display:grid;grid-template-columns:100px 120px minmax(0,1fr) 58px;gap:7px}input,select{box-sizing:border-box;min-width:0;height:35px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary);font:inherit;font-size:11px;outline:0}.identity-form button,.panel-title button{display:grid;border:0;border-radius:6px;background:var(--accent);color:white;cursor:pointer;place-items:center}.key-row,.history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:42px;border-top:1px solid var(--border-subtle);font-size:11px}.key-row:first-of-type,.history-row:first-of-type{border-top:0}.key-row>div,.history-row>div{display:grid;min-width:0;gap:3px}.key-row strong,.key-row span,.history-row strong,.history-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.key-row span,.history-row span{color:var(--text-tertiary)}.history-row{grid-template-columns:minmax(0,1fr) 70px 120px}.history-row em{font-family:var(--font-data);font-style:normal}.empty{padding:16px;color:var(--text-tertiary);font-size:12px;text-align:center}.panel-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.panel-title h3{margin:0}.panel-title button{height:30px;padding:0 10px}.quota-head,.quota-row{display:grid;grid-template-columns:85px repeat(3,minmax(62px,1fr)) 100px;align-items:center;gap:7px;margin-top:9px}.quota-head{color:var(--text-tertiary);font-size:10px}.quota-row strong{font-size:11px}.quota-row input{height:31px}.quota-usage{display:grid;gap:3px;color:var(--text-secondary);font-size:10px}.quota-usage span{display:flex;align-items:center;justify-content:space-between;gap:4px}.quota-usage button{display:grid;width:25px;height:25px;padding:0;border:0;border-radius:5px;background:var(--bg-base);color:var(--text-tertiary);cursor:pointer;place-items:center}.loading{display:grid;gap:10px;margin-top:20px}.loading i{height:54px;background:#edf1f5;border-radius:7px}.detail.mobile{left:0;width:100%;min-width:0;padding:16px;padding-top:max(16px,env(safe-area-inset-top));padding-bottom:max(16px,env(safe-area-inset-bottom));border-left:0}.detail.mobile header button{width:44px;height:44px;flex:0 0 auto}.detail.mobile input,.detail.mobile select,.detail.mobile .identity-form button,.detail.mobile .panel-title button{min-height:44px}.detail.mobile .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.detail.mobile .identity-form{grid-template-columns:1fr}.detail.mobile .quota-head{display:none}.detail.mobile .quota-row{grid-template-columns:1fr;gap:8px;padding:12px 0;border-top:1px solid var(--border-subtle)}.detail.mobile .quota-row input{height:44px}.detail.mobile .quota-usage button{width:44px;height:44px}.drawer-enter-active,.drawer-leave-active{transition:opacity 200ms}.drawer-enter-active .detail,.drawer-leave-active .detail{transition:transform 220ms var(--motion-ease-out)}.drawer-enter-from,.drawer-leave-to{opacity:0}.drawer-enter-from .detail,.drawer-leave-to .detail{transform:translateX(28px)}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
