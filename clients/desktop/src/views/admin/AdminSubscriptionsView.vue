<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  CalendarPlus,
  CirclePlus,
  Clock3,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound,
  X,
} from '@lucide/vue'

import {
  assignAdminSubscription,
  bulkAssignAdminSubscriptions,
  extendAdminSubscription,
  getAdminSubscriptionProgress,
  listAdminSubscriptions,
  resetAdminSubscriptionQuota,
  restoreAdminSubscription,
  revokeAdminSubscription,
} from '@/api/admin/subscriptions'
import type { AdminGroupOption, AdminSubscription, AdminSubscriptionProgress, AdminSubscriptionQuotaWindow } from '@/api/admin/types'
import { getAdminGroups } from '@/api/admin/users'
import { formatCost, formatDateTime } from '@/lib/format'

type AssignMode = 'single' | 'bulk'
type LifecycleAction = 'extend' | 'reset' | 'revoke' | 'restore'
type QuotaWindowKey = 'daily' | 'weekly' | 'monthly'

const quotaWindowDefinitions: Array<{ key: QuotaWindowKey; label: string }> = [
  { key: 'daily', label: '日额度' },
  { key: 'weekly', label: '周额度' },
  { key: 'monthly', label: '月额度' },
]

const items = ref<AdminSubscription[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const message = ref('')
const editorOpen = ref(false)
const pending = ref('')
const groups = ref<AdminGroupOption[]>([])
const progress = ref<Record<number, AdminSubscriptionProgress>>({})
const filters = reactive({ search: '', status: '', groupId: '' })
const form = reactive({ mode: 'single' as AssignMode, userId: '', userIds: '', groupId: '', days: 30 })
const action = reactive({
  type: null as LifecycleAction | null,
  item: null as AdminSubscription | null,
  days: 30,
  daily: true,
  weekly: true,
  monthly: true,
  error: '',
})

const active = computed(() => items.value.filter(item => item.status === 'active').length)
const exhausted = computed(() => items.value.filter((item) => {
  const windows = progress.value[item.id]
  return [windows?.daily, windows?.weekly, windows?.monthly].some(window => window && window.limit_usd > 0 && window.percentage >= 100)
}).length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const visiblePages = computed(() => {
  if (pageCount.value <= 7) return Array.from({ length: pageCount.value }, (_, index) => index + 1)
  const pages = new Set([1, pageCount.value])
  for (let value = page.value - 2; value <= page.value + 2; value += 1) {
    if (value > 1 && value < pageCount.value) pages.add(value)
  }
  return [...pages].sort((a, b) => a - b)
})
const actionTitle = computed(() => {
  if (action.type === 'extend') return '延长订阅期限'
  if (action.type === 'reset') return '重置用量'
  if (action.type === 'revoke') return '撤销订阅'
  return '恢复订阅'
})

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

async function load(background = false) {
  if (background) refreshing.value = true
  else loading.value = true
  loadError.value = ''
  const [subscriptions, groupOptions] = await Promise.allSettled([
    listAdminSubscriptions({
      page: page.value,
      page_size: pageSize.value,
      search: filters.search.trim() || undefined,
      status: filters.status || undefined,
      group_id: filters.groupId ? Number(filters.groupId) : undefined,
    }),
    getAdminGroups(),
  ])

  if (subscriptions.status === 'fulfilled') {
    items.value = subscriptions.value.items
    total.value = subscriptions.value.total
    progress.value = {}
    const details = await Promise.allSettled(items.value.map(item => getAdminSubscriptionProgress(item.id)))
    details.forEach((detail, index) => {
      const item = items.value[index]
      if (detail.status === 'fulfilled' && item) progress.value[item.id] = detail.value
    })
  } else {
    loadError.value = errorMessage(subscriptions.reason, '订阅列表加载失败')
  }

  if (groupOptions.status === 'fulfilled') groups.value = groupOptions.value
  loading.value = false
  refreshing.value = false
}

function submitFilters() {
  page.value = 1
  void load(true)
}

function openAssign() {
  form.mode = 'single'
  form.userId = ''
  form.userIds = ''
  form.groupId = ''
  form.days = 30
  editorOpen.value = true
}

function parseUserIds(value: string): number[] {
  return [...new Set(value.split(/[\s,;]+/).map(Number).filter(id => Number.isInteger(id) && id > 0))]
}

async function submitAssignment() {
  const groupId = Number(form.groupId)
  if (!groupId) {
    message.value = '请选择订阅分组'
    return
  }
  pending.value = 'assign'
  try {
    if (form.mode === 'single') {
      const userId = Number(form.userId)
      if (!userId) {
        message.value = '请输入有效的用户 ID'
        return
      }
      await assignAdminSubscription({ user_id: userId, group_id: groupId, validity_days: Number(form.days) || 30 })
      message.value = `已为用户 #${userId} 分配订阅`
    } else {
      const userIds = parseUserIds(form.userIds)
      if (!userIds.length) {
        message.value = '请至少输入一个有效的用户 ID'
        return
      }
      const assigned = await bulkAssignAdminSubscriptions({ user_ids: userIds, group_id: groupId, validity_days: Number(form.days) || 30 })
      message.value = `批量分配完成：成功 ${assigned.success_count} 个，失败 ${assigned.failed_count} 个`
    }
    editorOpen.value = false
    await load(true)
  } catch (caught) {
    message.value = errorMessage(caught, '订阅分配失败')
  } finally {
    pending.value = ''
  }
}

function openAction(type: LifecycleAction, item: AdminSubscription) {
  action.type = type
  action.item = item
  action.days = 30
  action.daily = true
  action.weekly = true
  action.monthly = true
  action.error = ''
}

function closeAction() {
  if (pending.value.startsWith('action-')) return
  action.type = null
  action.item = null
  action.error = ''
}

async function confirmAction() {
  const item = action.item
  const type = action.type
  if (!item || !type || pending.value) return
  if (type === 'extend' && (!Number.isInteger(Number(action.days)) || Number(action.days) <= 0)) {
    action.error = '请输入大于 0 的整数天数'
    return
  }
  if (type === 'reset' && !action.daily && !action.weekly && !action.monthly) {
    action.error = '至少选择一个需要重置的用量窗口'
    return
  }

  pending.value = `action-${item.id}`
  action.error = ''
  try {
    if (type === 'extend') {
      await extendAdminSubscription(item.id, Number(action.days))
      message.value = `订阅已延长 ${action.days} 天`
    } else if (type === 'reset') {
      await resetAdminSubscriptionQuota(item.id, { daily: action.daily, weekly: action.weekly, monthly: action.monthly })
      message.value = '订阅用量已重置'
    } else if (type === 'revoke') {
      await revokeAdminSubscription(item.id)
      message.value = '订阅已撤销'
    } else {
      await restoreAdminSubscription(item.id)
      message.value = '订阅已恢复'
    }
    closeAction()
    await load(true)
  } catch (caught) {
    action.error = errorMessage(caught, '订阅操作失败')
  } finally {
    pending.value = ''
    if (!action.error) closeAction()
  }
}

function percentage(value: number | undefined) {
  return Math.max(0, Math.min(100, value ?? 0))
}

function formatPercentage(value: number | undefined) {
  const normalized = percentage(value)
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(normalized)
}

function quotaWindows(subscriptionId: number): Array<{ key: QuotaWindowKey; label: string; value: AdminSubscriptionQuotaWindow }> {
  const detail = progress.value[subscriptionId]
  if (!detail) return []
  return quotaWindowDefinitions.flatMap(({ key, label }) => {
    const value = detail[key]
    return value ? [{ key, label, value }] : []
  })
}

function formatResetCountdown(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return ''
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时后重置` : `${days} 天后重置`
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟后重置` : `${hours} 小时后重置`
  return `${Math.max(1, minutes)} 分钟后重置`
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void load(true)
}

function changePageSize(event: Event) {
  pageSize.value = Number((event.target as HTMLSelectElement).value)
  page.value = 1
  void load(true)
}

onMounted(() => void load())
</script>

<template>
  <div class="page">
    <header class="page-header drag-region"><div><span>SUBSCRIPTION OPERATIONS</span><h1>订阅管理</h1><p>搜索用户订阅，维护有效期与周期额度。</p></div><button class="primary no-drag" data-testid="assign-subscription" @click="openAssign"><CirclePlus :size="17" />分配订阅</button></header>
    <section class="summary"><div><span>订阅总数</span><strong>{{ total }}</strong></div><div><span>当前页有效</span><strong>{{ active }}</strong></div><div><span>当前页已用满</span><strong>{{ exhausted }}</strong></div></section>

    <form class="toolbar" data-testid="subscription-filters" @submit.prevent="submitFilters">
      <label><Search :size="16" /><input v-model="filters.search" data-testid="subscription-search" placeholder="搜索邮箱、用户名或分组" /></label>
      <select v-model="filters.groupId"><option value="">全部分组</option><option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option></select>
      <select v-model="filters.status"><option value="">全部状态</option><option value="active">有效</option><option value="expired">已过期</option><option value="revoked">已撤销</option><option value="suspended">已暂停</option></select>
      <button type="button" @click="submitFilters">搜索</button><button class="refresh" type="button" :disabled="refreshing" @click="load(true)"><RefreshCw :size="15" :class="{ spinning: refreshing }" />刷新</button>
    </form>
    <p v-if="message" class="message" role="status">{{ message }}</p>

    <section v-if="loading" class="loading"><i v-for="n in 4" :key="n" /></section>
    <section v-else-if="loadError" class="empty"><strong>订阅列表加载失败</strong><span>{{ loadError }}</span><button @click="() => load()">重新加载</button></section>
    <section v-else-if="!items.length" class="empty"><strong>暂无订阅</strong><span>可以为一个或多个用户分配订阅。</span><button @click="openAssign">分配订阅</button></section>
    <section v-else class="list">
      <article v-for="item in items" :key="item.id">
        <header><div><strong>{{ item.user?.email || `用户 #${item.user_id}` }}</strong><span>{{ item.user?.username || '未设置用户名' }} · {{ item.group?.name || `分组 #${item.group_id}` }}</span></div><em :class="item.status">{{ item.status === 'active' ? '有效' : item.status === 'revoked' ? '已撤销' : item.status === 'expired' ? '已过期' : '已暂停' }}</em></header>
        <div class="windows">
          <div v-for="window in quotaWindows(item.id)" :key="window.key" class="quota-window" :data-testid="`subscription-quota-${window.key}-${item.id}`">
            <div class="quota-heading"><span>{{ window.label }}</span><strong>{{ formatPercentage(window.value.percentage) }}%</strong></div>
            <div class="quota-amount"><strong>{{ formatCost(window.value.used_usd) }}</strong><span>/ {{ formatCost(window.value.limit_usd) }}</span></div>
            <i><b :class="{ full: window.value.percentage >= 100 }" :style="{ width: `${percentage(window.value.percentage)}%` }" /></i>
            <small v-if="formatResetCountdown(window.value.resets_in_seconds)"><Clock3 :size="11" />{{ formatResetCountdown(window.value.resets_in_seconds) }}</small>
          </div>
          <div v-if="!quotaWindows(item.id).length" class="quota-unlimited"><strong>∞</strong><span>当前分组未设置周期额度</span></div>
        </div>
        <footer><span>到期 {{ formatDateTime(item.expires_at) }}</span><div><button :disabled="Boolean(pending)" :data-testid="`extend-subscription-${item.id}`" @click="openAction('extend', item)"><CalendarPlus :size="15" />延期</button><button :disabled="Boolean(pending)" :data-testid="`reset-subscription-${item.id}`" @click="openAction('reset', item)"><RotateCcw :size="15" />重置用量</button><button :disabled="Boolean(pending)" :data-testid="`toggle-subscription-${item.id}`" @click="openAction(item.status === 'revoked' ? 'restore' : 'revoke', item)"><ShieldCheck v-if="item.status === 'revoked'" :size="15" /><ShieldOff v-else :size="15" />{{ item.status === 'revoked' ? '恢复' : '撤销' }}</button></div></footer>
      </article>
    </section>

    <footer v-if="total > pageSize" class="pagination"><div><span>每页</span><select :value="pageSize" data-testid="subscription-page-size" @change="changePageSize"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><span>条，共 {{ total }} 条</span></div><nav aria-label="订阅分页"><button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button><template v-for="(value, index) in visiblePages" :key="value"><span v-if="index > 0 && value - visiblePages[index - 1]! > 1">...</span><button type="button" :class="{ current: value === page }" :data-testid="`subscription-page-${value}`" @click="changePage(value)">{{ value }}</button></template><button type="button" :disabled="page >= pageCount" @click="changePage(page + 1)">下一页</button></nav></footer>

    <Transition name="fade">
      <div v-if="editorOpen" class="backdrop" @mousedown.self="editorOpen = false"><section class="editor"><header><div><h2>分配订阅</h2><p>为一个或多个用户开通分组订阅</p></div><button aria-label="关闭" @click="editorOpen = false"><X :size="18" /></button></header><form data-testid="subscription-editor" @submit.prevent="submitAssignment"><div class="mode-switch wide" aria-label="分配方式"><button type="button" :aria-pressed="form.mode === 'single'" @click="form.mode = 'single'">单个用户</button><button type="button" data-testid="subscription-mode-bulk" :aria-pressed="form.mode === 'bulk'" @click="form.mode = 'bulk'"><UsersRound :size="14" />批量用户</button></div><label v-if="form.mode === 'single'" class="wide"><span>用户 ID</span><input v-model="form.userId" data-testid="subscription-user-id" inputmode="numeric" /></label><label v-else class="wide"><span>用户 ID 列表</span><textarea v-model="form.userIds" data-testid="subscription-user-ids" rows="4" placeholder="例如：7, 8, 9；支持逗号、空格或换行" /></label><label><span>订阅分组</span><select v-model="form.groupId" data-testid="subscription-group-id"><option value="">请选择</option><option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option></select></label><label><span>有效天数</span><input v-model.number="form.days" type="number" min="1" /></label><footer class="wide"><button type="button" @click="editorOpen = false">取消</button><button class="save" type="submit" :disabled="pending === 'assign'">{{ pending === 'assign' ? '正在分配' : '确认分配' }}</button></footer></form></section></div>
    </Transition>

    <Transition name="fade">
      <div v-if="action.item" class="backdrop" @mousedown.self="closeAction"><section class="action-dialog" data-testid="subscription-action-dialog" role="dialog" aria-modal="true"><header><span :class="{ danger: action.type === 'revoke' }"><CalendarPlus v-if="action.type === 'extend'" :size="20" /><RotateCcw v-else-if="action.type === 'reset'" :size="20" /><ShieldOff v-else-if="action.type === 'revoke'" :size="20" /><ShieldCheck v-else :size="20" /></span><div><h2>{{ actionTitle }}</h2><p>{{ action.item.user?.email || `用户 #${action.item.user_id}` }} · {{ action.item.group?.name }}</p></div><button aria-label="关闭" @click="closeAction"><X :size="18" /></button></header><div class="action-body"><label v-if="action.type === 'extend'"><span>延长天数</span><input v-model.number="action.days" data-testid="subscription-extend-days" type="number" min="1" max="36500" /></label><div v-else-if="action.type === 'reset'" class="reset-options"><span>选择重置窗口</span><label><input v-model="action.daily" type="checkbox" />日额度</label><label><input v-model="action.weekly" type="checkbox" />周额度</label><label><input v-model="action.monthly" type="checkbox" />月额度</label></div><p v-else-if="action.type === 'revoke'" class="warning">撤销后该用户将立即失去此订阅分组的使用权限，之后仍可恢复。</p><p v-else>恢复后，订阅会继续按照原有效期与额度规则生效。</p><p v-if="action.error" class="action-error" role="alert">{{ action.error }}</p></div><footer><button type="button" @click="closeAction">取消</button><button class="confirm" :class="{ danger: action.type === 'revoke' }" type="button" data-testid="confirm-subscription-action" :disabled="pending.startsWith('action-')" @click="confirmAction">{{ pending.startsWith('action-') ? '处理中' : '确认操作' }}</button></footer></section></div>
    </Transition>
  </div>
</template>

<style scoped>
.page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.page-header h1{font-size:25px}.page-header p{margin-top:7px;color:var(--text-secondary);font-size:14px}.primary,.toolbar button{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:0;border-radius:7px;background:var(--accent);color:white}.summary{display:grid;grid-template-columns:repeat(3,1fr);margin-top:20px;background:white;border:1px solid var(--border-subtle);border-radius:8px}.summary>div{display:flex;min-height:64px;align-items:center;justify-content:space-between;padding:0 18px;border-right:1px solid var(--border-subtle)}.summary>div:last-child{border:0}.summary span{color:var(--text-secondary);font-size:12px}.summary strong{font-family:var(--font-data);font-size:20px}.toolbar{display:flex;gap:8px;margin-top:12px}.toolbar label{display:flex;min-width:260px;flex:1;align-items:center;gap:8px;height:38px;padding:0 11px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-tertiary)}.toolbar input{width:100%;border:0;outline:0;background:transparent;font-size:12px}.toolbar select{height:38px;min-width:120px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:7px;background:white}.toolbar .refresh{background:white;border:1px solid var(--border-subtle);color:var(--text-secondary)}.message{margin-top:10px;padding:8px 11px;background:#edf5ff;border:1px solid #d3e3f8;border-radius:7px;color:#3f67a2;font-size:12px}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:12px}.list article{display:flex;min-height:252px;flex-direction:column;padding:17px 18px;background:rgba(255,255,255,.88);border:1px solid var(--border-subtle);border-radius:8px;box-shadow:0 6px 18px rgba(31,51,78,.035)}.list article>header{display:flex;justify-content:space-between;gap:12px}.list header>div{display:grid;min-width:0;gap:4px}.list header strong,.list header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.list header strong{font-size:14px}.list header span{color:var(--text-tertiary);font-size:11px}.list header em{height:max-content;padding:4px 7px;background:#eaf8f1;border-radius:5px;color:#277a58;font-size:10px;font-style:normal}.list header em.revoked,.list header em.expired{background:#eff2f5;color:#747e8a}.windows{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px}.quota-window{min-width:0;padding:12px 13px;background:linear-gradient(150deg,#f8faff,#f1f5fb);border:1px solid #e5eaf1;border-radius:7px}.quota-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.quota-heading span{color:var(--text-secondary);font-size:11px;font-weight:650}.quota-heading strong{color:var(--accent);font-family:var(--font-data);font-size:12px}.quota-amount{display:flex;align-items:baseline;gap:5px;margin-top:9px;white-space:nowrap}.quota-amount strong{color:var(--text-primary);font-family:var(--font-data);font-size:18px;font-weight:720}.quota-amount span{color:var(--text-tertiary);font-family:var(--font-data);font-size:11px}.quota-window i{display:block;height:6px;margin:10px 0 8px;overflow:hidden;background:#dfe5ed;border-radius:6px}.quota-window b{display:block;height:100%;background:#3c76d7;border-radius:inherit;transition:width 320ms ease}.quota-window b.full{background:#bc4f3e}.quota-window small{display:flex;align-items:center;gap:4px;color:#6281ae;font-size:10px}.quota-unlimited{display:flex;min-height:95px;align-items:center;justify-content:center;gap:8px;background:#eef8f4;border:1px solid #d7eee5;border-radius:7px;color:#337760}.quota-unlimited strong{font-size:22px}.quota-unlimited span{font-size:11px}.list article>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:15px}.list footer>span{color:var(--text-tertiary);font-size:10px}.list footer>div{display:flex;gap:5px}.list footer button{display:flex;height:31px;align-items:center;gap:5px;padding:0 8px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:10px}.loading{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;margin-top:12px}.loading i{height:252px;background:linear-gradient(90deg,#edf1f5 25%,#fafbfd 45%,#edf1f5 65%);background-size:240% 100%;border-radius:8px;animation:shimmer 1.15s linear infinite}.empty{display:grid;min-height:280px;margin-top:12px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:8px}.empty strong{color:var(--text-primary)}.empty button{height:34px;padding:0 12px;border:0;border-radius:7px;background:var(--accent);color:white}.pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:13px}.pagination>div,.pagination nav{display:flex;align-items:center;gap:6px;color:var(--text-tertiary);font-size:11px}.pagination select{height:31px;padding:0 7px;border:1px solid var(--border-subtle);border-radius:6px;background:white}.pagination nav button{min-width:31px;height:31px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:11px}.pagination nav button.current{border-color:var(--accent);background:var(--accent);color:white}
.backdrop{position:fixed;z-index:120;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.24);backdrop-filter:blur(10px);place-items:center}.editor,.action-dialog{width:min(540px,100%);overflow:hidden;background:white;border:1px solid var(--border-subtle);border-radius:8px;box-shadow:0 25px 70px rgba(28,42,62,.24)}.editor>header{display:flex;justify-content:space-between;padding:20px;border-bottom:1px solid var(--border-subtle)}.editor h2,.action-dialog h2{font-size:17px}.editor header p,.action-dialog header p{margin-top:3px;color:var(--text-tertiary);font-size:11px}.editor header button,.action-dialog header>button{border:0;background:transparent;color:var(--text-tertiary)}.editor form{display:grid;grid-template-columns:repeat(2,1fr);gap:13px;padding:19px 20px}.editor label,.action-body>label{display:grid;gap:5px}.editor label span,.action-body label>span,.reset-options>span{color:var(--text-secondary);font-size:11px;font-weight:650}.editor input,.editor select,.editor textarea,.action-body input{padding:9px;border:1px solid var(--border-subtle);border-radius:7px;font:inherit}.editor input,.editor select,.action-body input{height:38px}.editor textarea{resize:vertical;line-height:1.5}.wide{grid-column:1/-1}.mode-switch{display:grid;grid-template-columns:repeat(2,1fr);gap:3px;padding:3px;background:#e9eef5;border-radius:7px}.mode-switch button{display:flex;height:32px;align-items:center;justify-content:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--text-secondary)}.mode-switch button[aria-pressed=true]{background:white;color:var(--accent);box-shadow:0 2px 7px rgba(40,58,85,.1)}.editor footer{display:flex;justify-content:flex-end;gap:8px}.editor footer button{height:36px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:7px;background:white}.editor footer .save{background:var(--accent);color:white}.action-dialog>header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}.action-dialog>header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e9f0ff;color:var(--accent);place-items:center}.action-dialog>header>span.danger{background:#fff0ed;color:#ac4738}.action-body{display:grid;gap:12px;padding:18px}.action-body>p{color:var(--text-secondary);font-size:12px;line-height:1.55}.action-body .warning{padding:10px 11px;border:1px solid #efcec7;border-radius:6px;background:#fff3f0;color:#9f4437}.reset-options{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.reset-options>span{grid-column:1/-1}.reset-options label{display:flex;align-items:center;gap:7px;padding:9px;border:1px solid var(--border-subtle);border-radius:6px;font-size:11px}.reset-options input{width:15px;height:15px}.action-error{padding:9px 10px;border:1px solid var(--coral-border);border-radius:6px;background:var(--coral-soft);color:var(--danger)!important}.action-dialog>footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border-subtle);background:#f7f9fc}.action-dialog>footer button{height:35px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:12px}.action-dialog>footer .confirm{border-color:var(--accent);background:var(--accent);color:white}.action-dialog>footer .confirm.danger{border-color:#b84a3c;background:#b84a3c}.spinning{animation:spin .75s linear infinite}button:disabled{opacity:.5}.fade-enter-active,.fade-leave-active{transition:opacity 180ms}.fade-enter-from,.fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-240% 0}}
@container app-content (max-width:980px){.page{padding:24px}.list,.loading{grid-template-columns:1fr}.toolbar{flex-wrap:wrap}.toolbar label{flex-basis:100%}.pagination{align-items:flex-start;flex-direction:column}.pagination nav{flex-wrap:wrap}}
@container app-content (max-width:760px){.page-header{align-items:flex-start;flex-direction:column}.primary{width:100%;justify-content:center}.windows{grid-template-columns:1fr}.list article>footer{align-items:flex-start;flex-direction:column}.editor form{grid-template-columns:1fr}.editor form>*{grid-column:1}.toolbar select{flex:1}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
