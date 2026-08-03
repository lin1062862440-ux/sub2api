<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FilterX,
  RefreshCw,
  SlidersHorizontal,
} from '@lucide/vue'

import * as api from '@/api'
import type {
  ApiKeyOption,
  GroupOption,
  ModelStat,
  UsageFilters,
  UsageGroupStat,
  UsageLog,
  UsageRequestType,
  UsageSnapshot,
  UsageStats,
  UserErrorRequest,
} from '@/api'
import TrendChart from '@/components/TrendChart.vue'
import UsageFilterSelect, { type UsageFilterOption } from '@/components/UsageFilterSelect.vue'
import UsageErrorDrawer from '@/components/UsageErrorDrawer.vue'
import UsageErrorsTable from '@/components/UsageErrorsTable.vue'
import UsageRangePicker from '@/components/UsageRangePicker.vue'
import UsageRanking from '@/components/UsageRanking.vue'
import UsageRecordsTable from '@/components/UsageRecordsTable.vue'
import UsageSummary from '@/components/UsageSummary.vue'
import { formatCount } from '@/lib/format'
import { resolveUsageRange, type UsageDateRange } from '@/lib/usage-range'
import { session } from '@/stores/session'

const PAGE_SIZE = 20
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

const range = ref<UsageDateRange>(resolveUsageRange('last24h'))
const apiKeyId = ref<number | ''>('')
const model = ref('')
const requestType = ref<UsageRequestType | ''>('')
const groupId = ref<number | ''>('')
const billingType = ref<number | ''>('')
const billingMode = ref('')
const advancedOpen = ref(false)
const advancedTrigger = ref<HTMLElement | null>(null)
const advancedPanel = ref<HTMLElement | null>(null)
const activeTab = ref<'records' | 'errors'>('records')
const usagePage = ref(1)
const errorPage = ref(1)

const stats = ref<UsageStats | null>(null)
const snapshot = ref<UsageSnapshot | null>(null)
const models = ref<ModelStat[]>([])
const records = ref<UsageLog[]>([])
const recordTotal = ref(0)
const errors = ref<UserErrorRequest[]>([])
const errorTotal = ref(0)
const apiKeys = ref<ApiKeyOption[]>([])
const groups = ref<GroupOption[]>([])
const selectedErrorId = ref<number | null>(null)

const initialLoading = ref(true)
const analysisLoading = ref(false)
const recordsLoading = ref(false)
const errorsLoading = ref(false)
const refreshing = ref(false)
const issues = ref<string[]>([])
const lastUpdated = ref<Date | null>(null)
let loadSequence = 0
let recordSequence = 0
let errorSequence = 0

const simpleMode = computed(() => session.runMode === 'simple')
const errorViewEnabled = computed(() => session.settings?.allow_user_view_error_requests === true)
const usagePages = computed(() => Math.max(1, Math.ceil(recordTotal.value / PAGE_SIZE)))
const errorPages = computed(() => Math.max(1, Math.ceil(errorTotal.value / PAGE_SIZE)))
const filtered = computed(() => Boolean(
  apiKeyId.value || model.value || requestType.value || groupId.value || billingType.value !== '' || billingMode.value,
))

const sharedFilters = computed<UsageFilters>(() => {
  const filters: UsageFilters = {
    start_date: range.value.startDate,
    end_date: range.value.endDate,
    timezone,
  }
  if (apiKeyId.value !== '') filters.api_key_id = apiKeyId.value
  if (model.value.trim()) filters.model = model.value.trim()
  if (requestType.value) filters.request_type = requestType.value
  if (groupId.value !== '') filters.group_id = groupId.value
  if (billingType.value !== '') filters.billing_type = billingType.value
  if (billingMode.value) filters.billing_mode = billingMode.value
  return filters
})

const errorFilters = computed(() => ({
  start_date: range.value.startDate,
  end_date: range.value.endDate,
  timezone,
  ...(apiKeyId.value !== '' ? { api_key_id: apiKeyId.value } : {}),
  ...(model.value.trim() ? { model: model.value.trim() } : {}),
}))

const modelOptions = computed(() => {
  const values = new Set<string>()
  models.value.forEach((item) => item.model && values.add(item.model))
  records.value.forEach((item) => item.model && values.add(item.model))
  if (model.value) values.add(model.value)
  return [...values].sort()
})

const apiKeyOptions = computed(() => {
  const values = new Map<number, ApiKeyOption>()
  apiKeys.value.forEach((key) => values.set(key.id, key))
  records.value.forEach((record) => {
    const id = record.api_key?.id ?? record.api_key_id
    if (!id || values.has(id)) return
    values.set(id, { id, name: record.api_key?.name || `Key #${id}` })
  })
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})

const apiKeyFilterOptions = computed<UsageFilterOption[]>(() => [
  { value: '', label: '全部 Key' },
  ...apiKeyOptions.value.map((key) => ({ value: key.id, label: key.name })),
])
const modelFilterOptions = computed<UsageFilterOption[]>(() => [
  { value: '', label: '全部模型' },
  ...modelOptions.value.map((item) => ({ value: item, label: item })),
])
const requestTypeOptions: UsageFilterOption[] = [
  { value: '', label: '全部类型' },
  { value: 'stream', label: '流式' },
  { value: 'sync', label: '同步' },
  { value: 'ws_v2', label: 'WebSocket' },
  { value: 'live', label: 'Live' },
  { value: 'cyber', label: 'Cyber' },
]
const billingTypeOptions: UsageFilterOption[] = [
  { value: '', label: '全部类型' },
  { value: 0, label: '余额' },
  { value: 1, label: '订阅' },
]
const billingModeOptions: UsageFilterOption[] = [
  { value: '', label: '全部模式' },
  { value: 'token', label: '按 Token' },
  { value: 'per_request', label: '按次' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]
const groupFilterOptions = computed<UsageFilterOption[]>(() => [
  { value: '', label: '全部分组' },
  ...groups.value.map((group) => ({ value: group.id, label: group.name })),
])

function rankingRows<T extends { total_tokens: number }>(
  items: T[],
  identify: (item: T) => string | number,
  label: (item: T) => string,
) {
  const total = items.reduce((sum, item) => sum + item.total_tokens, 0)
  return items
    .slice()
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, 5)
    .map((item) => ({
      id: identify(item),
      label: label(item),
      value: formatCount(item.total_tokens),
      share: total > 0 ? item.total_tokens / total * 100 : 0,
    }))
}

const modelRows = computed(() => rankingRows(models.value, (item) => item.model, (item) => item.model))
const groupRows = computed(() => rankingRows<UsageGroupStat>(
  snapshot.value?.groups ?? [],
  (item) => item.group_id,
  (item) => item.group_name || `分组 #${item.group_id}`,
))

const updateLabel = computed(() => {
  if (!lastUpdated.value) return '等待数据'
  return `更新于 ${lastUpdated.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})

async function loadOptions() {
  const [keysResult, groupsResult] = await Promise.allSettled([
    api.getUsageApiKeys(),
    api.getUsageGroups(),
  ])
  if (keysResult.status === 'fulfilled') apiKeys.value = keysResult.value.items ?? []
  if (groupsResult.status === 'fulfilled') groups.value = groupsResult.value ?? []
}

async function loadAll(isRefresh = false) {
  const current = ++loadSequence
  const currentRecords = ++recordSequence
  if (isRefresh) refreshing.value = true
  analysisLoading.value = true
  recordsLoading.value = true
  issues.value = []

  const filters = sharedFilters.value
  const [statsResult, snapshotResult, modelResult, recordsResult] = await Promise.allSettled([
    api.getUsageStats(filters),
    api.getUsageSnapshot({ ...filters, granularity: range.value.granularity }),
    api.getUsageModels(filters),
    api.getUsageRecords({ ...filters, page: usagePage.value, page_size: PAGE_SIZE }),
  ])

  if (current !== loadSequence) return

  const failed: string[] = []
  if (statsResult.status === 'fulfilled') stats.value = statsResult.value
  else failed.push('汇总指标')
  if (snapshotResult.status === 'fulfilled') snapshot.value = snapshotResult.value
  else failed.push('趋势与分组')
  if (modelResult.status === 'fulfilled') models.value = modelResult.value.models ?? []
  else failed.push('模型排行')
  if (currentRecords === recordSequence) {
    if (recordsResult.status === 'fulfilled') {
      records.value = recordsResult.value.items ?? []
      recordTotal.value = recordsResult.value.total ?? 0
    } else {
      failed.push('用量明细')
    }
    recordsLoading.value = false
  }

  issues.value = failed
  lastUpdated.value = new Date()
  analysisLoading.value = false
  initialLoading.value = false
  refreshing.value = false
}

async function loadRecords() {
  const current = ++recordSequence
  recordsLoading.value = true
  try {
    const value = await api.getUsageRecords({
      ...sharedFilters.value,
      page: usagePage.value,
      page_size: PAGE_SIZE,
    })
    if (current !== recordSequence) return
    records.value = value.items ?? []
    recordTotal.value = value.total ?? 0
  } catch {
    if (current === recordSequence && !issues.value.includes('用量明细')) issues.value.push('用量明细')
  } finally {
    if (current === recordSequence) recordsLoading.value = false
  }
}

async function loadErrors() {
  if (!errorViewEnabled.value) return
  const current = ++errorSequence
  errorsLoading.value = true
  try {
    const value = await api.getUsageErrors({
      ...errorFilters.value,
      page: errorPage.value,
      page_size: PAGE_SIZE,
    })
    if (current !== errorSequence) return
    errors.value = value.items ?? []
    errorTotal.value = value.total ?? 0
  } catch {
    if (current === errorSequence && !issues.value.includes('错误请求')) issues.value.push('错误请求')
  } finally {
    if (current === errorSequence) errorsLoading.value = false
  }
}

function applyFilters() {
  usagePage.value = 1
  errorPage.value = 1
  void loadAll(true)
  if (activeTab.value === 'errors') void loadErrors()
}

function updateRange(value: UsageDateRange) {
  range.value = value
  applyFilters()
}

function resetFilters() {
  range.value = resolveUsageRange('last24h')
  apiKeyId.value = ''
  model.value = ''
  requestType.value = ''
  groupId.value = ''
  billingType.value = ''
  billingMode.value = ''
  advancedOpen.value = false
  applyFilters()
}

function selectTab(tab: 'records' | 'errors') {
  if (tab === 'errors' && !errorViewEnabled.value) return
  activeTab.value = tab
  if (tab === 'errors') void loadErrors()
}

function changePage(direction: -1 | 1) {
  const page = activeTab.value === 'records' ? usagePage : errorPage
  const pages = activeTab.value === 'records' ? usagePages.value : errorPages.value
  const next = page.value + direction
  if (next < 1 || next > pages) return
  page.value = next
  if (activeTab.value === 'records') void loadRecords()
  else void loadErrors()
}

function refresh() {
  void loadAll(true)
  if (activeTab.value === 'errors') void loadErrors()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!advancedOpen.value) return
  const target = event.target as Node
  if (advancedTrigger.value?.contains(target) || advancedPanel.value?.contains(target)) return
  advancedOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') advancedOpen.value = false
}

let timer: number | undefined

onMounted(() => {
  void loadOptions()
  void loadAll()
  timer = window.setInterval(refresh, 60_000)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div
    class="usage-page"
    :class="{ 'is-loading': initialLoading, 'is-loaded': !initialLoading, 'is-refreshing': refreshing }"
  >
    <header class="usage-head drag-region">
      <div>
        <h1>使用记录</h1>
        <p>查看请求趋势、Token 消耗与每一次调用结果。</p>
      </div>
      <div class="head-status no-drag">
        <div v-if="issues.length" class="refresh-notice" data-testid="usage-refresh-notice" role="status">
          <Activity :size="13" />
          <span>部分数据未更新：{{ issues.join('、') }}</span>
        </div>
        <span class="updated-at">{{ updateLabel }}</span>
        <button class="icon-button" type="button" title="刷新数据" aria-label="刷新数据" :disabled="refreshing" @click="refresh">
          <RefreshCw :size="15" :class="{ spinning: refreshing }" />
        </button>
      </div>
    </header>

    <section class="filter-console no-drag" aria-label="用量筛选">
      <UsageRangePicker :model-value="range" @update:model-value="updateRange" />
      <UsageFilterSelect v-model="apiKeyId" class="filter-control" label="API Key" :options="apiKeyFilterOptions" test-id="api-key-filter" @change="applyFilters" />
      <UsageFilterSelect v-model="model" class="filter-control model-control" label="模型" :options="modelFilterOptions" test-id="model-filter" @change="applyFilters" />
      <UsageFilterSelect v-model="requestType" class="filter-control" label="请求类型" :options="requestTypeOptions" test-id="request-type-filter" @change="applyFilters" />
      <div class="advanced-filter-anchor">
        <button ref="advancedTrigger" class="filter-command" type="button" :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">
          <SlidersHorizontal :size="14" />
          <span>更多筛选</span>
          <i v-if="groupId || billingType !== '' || billingMode" />
        </button>

        <div v-if="advancedOpen" ref="advancedPanel" class="advanced-filters">
          <header><div><strong>更多筛选</strong><span>按分组与计费方式缩小范围</span></div></header>
          <UsageFilterSelect v-model="groupId" class="advanced-select advanced-group" label="分组" :options="groupFilterOptions" stacked @change="applyFilters" />
          <UsageFilterSelect v-model="billingType" class="advanced-select" label="计费类型" :options="billingTypeOptions" stacked @change="applyFilters" />
          <UsageFilterSelect v-model="billingMode" class="advanced-select" label="计费模式" :options="billingModeOptions" stacked @change="applyFilters" />
        </div>
      </div>
      <button class="reset-command" type="button" title="重置筛选" aria-label="重置筛选" :disabled="!filtered && range.preset === 'last24h'" @click="resetFilters">
        <FilterX :size="15" />
      </button>
    </section>

    <UsageSummary :stats="stats" :simple-mode="simpleMode" :loading="initialLoading" :refreshing="refreshing" />

    <section class="analysis-workspace" :class="{ loading: initialLoading || analysisLoading }">
      <div class="trend-panel">
        <header class="panel-head"><div><h2>用量趋势</h2><p>{{ range.label }} · 请求数与 Token 变化</p></div><span>{{ range.granularity === 'hour' ? '按小时' : '按天' }}</span></header>
        <div v-if="initialLoading" class="analysis-skeleton"><i /><i /><i /></div>
        <TrendChart v-else class="usage-trend" :points="snapshot?.trend ?? []" />
      </div>
      <div class="ranking-column">
        <UsageRanking title="模型分布" subtitle="按 Token 排名" :rows="modelRows" :loading="initialLoading" empty-text="当前范围暂无模型数据" />
        <UsageRanking title="分组分布" subtitle="按 Token 排名" :rows="groupRows" :loading="initialLoading" empty-text="当前范围暂无分组数据" tone="teal" />
      </div>
    </section>

    <section class="detail-workspace">
      <header class="detail-head">
        <div class="detail-tabs" role="tablist" aria-label="请求记录类型">
          <button type="button" role="tab" :aria-selected="activeTab === 'records'" :class="{ active: activeTab === 'records' }" @click="selectTab('records')">用量明细 <span>{{ recordTotal }}</span></button>
          <button v-if="errorViewEnabled" type="button" role="tab" data-testid="usage-errors-tab" :aria-selected="activeTab === 'errors'" :class="{ active: activeTab === 'errors' }" @click="selectTab('errors')">错误请求 <span>{{ errorTotal }}</span></button>
        </div>
        <div class="pagination" aria-label="分页">
          <span>第 {{ activeTab === 'records' ? usagePage : errorPage }} / {{ activeTab === 'records' ? usagePages : errorPages }} 页</span>
          <button type="button" title="上一页" aria-label="上一页" :disabled="(activeTab === 'records' ? usagePage : errorPage) <= 1" @click="changePage(-1)"><ChevronLeft :size="14" /></button>
          <button type="button" title="下一页" aria-label="下一页" :disabled="(activeTab === 'records' ? usagePage : errorPage) >= (activeTab === 'records' ? usagePages : errorPages)" @click="changePage(1)"><ChevronRight :size="14" /></button>
        </div>
      </header>
      <UsageRecordsTable v-if="activeTab === 'records'" :rows="records" :loading="recordsLoading" :simple-mode="simpleMode" :filtered="filtered" />
      <UsageErrorsTable v-else :rows="errors" :loading="errorsLoading" :filtered="filtered" @select="selectedErrorId = $event" />
    </section>

    <UsageErrorDrawer :open-id="selectedErrorId" @close="selectedErrorId = null" />
  </div>
</template>

<style scoped>
.usage-page { position: relative; display: grid; width: 100%; min-height: 100%; grid-template-rows: 54px 48px 70px 360px auto; gap: 15px; padding: 34px 26px 24px; }
.usage-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 18px; }
.usage-head h1 { font-size: 24px; font-weight: 740; }
.usage-head p { margin-top: 2px; color: var(--text-tertiary); font-size: 14px; }
.head-status { display: flex; min-width: 0; align-items: center; gap: 9px; }
.updated-at { color: var(--text-tertiary); font-size: 13px; white-space: nowrap; }
.refresh-notice { display: flex; max-width: 320px; align-items: center; gap: 7px; padding: 6px 9px; background: var(--warning-soft); border: 1px solid var(--warning-border); border-radius: 6px; color: var(--warning); font-size: 12px; }
.refresh-notice span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-button, .reset-command, .pagination button { display: grid; width: 38px; height: 38px; padding: 0; background: rgba(255,255,255,.72); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-secondary); place-items: center; transition: transform var(--motion-fast) var(--motion-ease-out), background var(--motion-fast) ease, color var(--motion-fast) ease; }
.icon-button:hover:not(:disabled), .reset-command:hover:not(:disabled), .pagination button:hover:not(:disabled) { background: var(--bg-surface); color: var(--accent-strong); }
.filter-console { position: relative; z-index: 12; display: flex; min-width: 0; align-items: center; gap: 7px; }
.filter-control { flex: 0 1 196px; }
.model-control { flex: 1 1 150px; max-width: 210px; }
.advanced-filter-anchor { position: relative; flex: 0 0 auto; }
.filter-command { display: inline-flex; height: 44px; align-items: center; gap: 7px; padding: 0 12px; background: rgba(255,255,255,.7); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-secondary); font-size: 14px; white-space: nowrap; }
.filter-command i { width: 5px; height: 5px; background: var(--accent); border-radius: 50%; }
.reset-command { flex: 0 0 auto; }
.advanced-filters { position: absolute; z-index: 30; top: calc(100% + 8px); right: 0; display: grid; width: 308px; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; background: rgba(249,251,254,.88); border: 1px solid rgba(255,255,255,.9); border-radius: 8px; box-shadow: 0 18px 38px rgba(30,48,74,.16); backdrop-filter: blur(20px) saturate(1.25); transform-origin: top right; animation: usage-popover-in var(--motion-standard) var(--motion-ease-out) both; }
.advanced-filters header { grid-column: 1 / -1; padding-bottom: 7px; border-bottom: 1px solid var(--border-subtle); }
.advanced-filters header div { display: flex; flex-direction: column; }
.advanced-filters header strong { font-size: 14px; }
.advanced-filters header span { color: var(--text-tertiary); font-size: 13px; }
.advanced-group { grid-column: 1 / -1; }
.analysis-workspace { display: grid; min-width: 0; min-height: 0; grid-template-columns: minmax(0, 1.8fr) minmax(214px, .64fr); gap: 10px; }
.trend-panel, .detail-workspace { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: rgba(255,255,255,.76); border: 1px solid rgba(205,216,231,.92); border-radius: 8px; transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast) ease, box-shadow var(--motion-standard) ease; }
.trend-panel::after,
.detail-workspace::after { position: absolute; z-index: 5; top: -20%; bottom: -20%; left: 0; width: 22%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent); content: ''; opacity: 0; pointer-events: none; transform: translateX(-115%) skewX(-12deg); }
.is-refreshing .trend-panel::after,
.is-refreshing .detail-workspace::after { animation: linai-highlight-sweep 820ms var(--motion-ease-out) both; }
.is-loaded .analysis-workspace,
.is-loaded .detail-workspace { animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.is-loaded .analysis-workspace { animation-delay: 110ms; }
.is-loaded .detail-workspace { animation-delay: 190ms; }
.trend-panel { display: flex; flex-direction: column; padding: 14px 18px 12px; }
.panel-head { display: flex; min-height: 42px; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; }
.panel-head h2 { font-size: 15px; font-weight: 700; }
.panel-head p { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
.panel-head > span { color: var(--accent-strong); font-size: 12px; }
.usage-trend { min-height: 0; }
.usage-trend :deep(.chart-toolbar) { min-height: 48px; }
.usage-trend :deep(.range-totals > div) { height: 40px; }
.usage-trend :deep(.plot) { min-height: 180px; }
.ranking-column { display: grid; min-width: 0; min-height: 0; grid-template-rows: 1fr 1fr; gap: 10px; }
.analysis-skeleton { display: grid; flex: 1; grid-template-rows: 34px 1fr 12px; gap: 8px; }
.analysis-skeleton i { background: linear-gradient(105deg, #e8edf4 30%, #f5f8fc 47%, #e8edf4 64%); background-size: 220% 100%; border-radius: 6px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.detail-workspace { display: flex; min-height: 360px; flex-direction: column; }
.detail-head { display: flex; min-height: 50px; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 0 13px 0 15px; }
.detail-tabs { display: flex; align-self: stretch; gap: 2px; }
.detail-tabs button { position: relative; display: flex; height: 100%; align-items: center; gap: 7px; padding: 0 11px; background: transparent; border: 0; color: var(--text-tertiary); font-size: 14px; }
.detail-tabs button::after { position: absolute; right: 9px; bottom: 0; left: 9px; height: 2px; background: transparent; content: ''; }
.detail-tabs button.active { color: var(--text-primary); font-weight: 650; }
.detail-tabs button.active::after { background: var(--accent); }
.detail-tabs button span { min-width: 22px; padding: 2px 6px; background: var(--bg-inset); border-radius: 9px; color: var(--text-tertiary); font-size: 12px; text-align: center; }
.pagination { display: flex; align-items: center; gap: 5px; }
.pagination > span { margin-right: 3px; color: var(--text-tertiary); font-size: 12px; }
.pagination button { width: 30px; height: 30px; }
.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes usage-popover-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (hover: hover) and (pointer: fine) { .trend-panel:hover { border-color: rgba(139,166,211,.78); box-shadow: 0 13px 30px rgba(31,51,78,.08); transform: translateY(-2px); } .filter-command:hover { border-color: rgba(139,166,211,.78); background: var(--bg-surface); } .icon-button:hover:not(:disabled), .reset-command:hover:not(:disabled), .pagination button:hover:not(:disabled) { transform: translateY(-1px); } }
@container app-content (max-width: 1050px) { .usage-page { grid-template-rows: auto auto 70px 360px auto; padding-right: 18px; padding-left: 18px; } .filter-console { flex-wrap: wrap; } .filter-control { flex: 1 1 150px; } .filter-control :deep(.select-label) { display: none; } .model-control { max-width: none; } .analysis-workspace { grid-template-columns: minmax(0, 1.55fr) 220px; } }
@container app-content (max-width: 760px) { .usage-page { grid-template-rows: auto auto auto auto auto; padding-right: 16px; padding-left: 16px; } .usage-head { align-items: flex-start; } .head-status { flex-wrap: wrap; justify-content: flex-end; } .refresh-notice { max-width: 240px; } .filter-console > :deep(.range-picker) { flex: 1 1 100%; } .filter-control { flex-basis: calc(50% - 8px); } .advanced-filter-anchor { flex: 1 1 auto; } .filter-command { width: 100%; justify-content: center; } .advanced-filters { width: min(308px,calc(100vw - 32px)); } .analysis-workspace { grid-template-columns: 1fr; } .ranking-column { grid-template-columns: repeat(2,minmax(0,1fr)); grid-template-rows: auto; } .detail-head { align-items: stretch; flex-direction: column; gap: 10px; padding-top: 10px; padding-bottom: 10px; } .pagination { justify-content: flex-end; } }
@media (prefers-reduced-motion: reduce) { .analysis-skeleton i, .spinning, .advanced-filters, .analysis-workspace, .detail-workspace { animation: none; transform: none; } }
</style>
