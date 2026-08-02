<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { AlertCircle, RefreshCw, SlidersHorizontal } from '@lucide/vue'

import * as api from '@/api'
import type {
  GroupOption,
  UsageErrorFilters,
  UsageFilters,
  UsageLog,
  UsageRequestType,
  UsageStats,
  UserErrorRequest,
} from '@/api'
import { formatCost, formatCount, formatDateTime, formatDuration } from '@/lib/format'
import {
  resolveUsageRange,
  usageRangePresets,
  type UsageRangePreset,
} from '@/lib/usage-range'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'
import { session } from '@/stores/session'

const PAGE_SIZE = 20
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

const activeTab = ref<'records' | 'errors'>('records')
const rangePreset = ref<Exclude<UsageRangePreset, 'custom'>>('last24h')
const model = ref('')
const requestType = ref<UsageRequestType | ''>('')
const groupId = ref<number | ''>('')
const billingType = ref<number | ''>('')
const billingMode = ref('')

const sheetOpen = ref(false)
const draftGroupId = ref<number | ''>('')
const draftBillingType = ref<number | ''>('')
const draftBillingMode = ref('')

const stats = ref<UsageStats | null>(null)
const records = ref<UsageLog[]>([])
const recordTotal = ref(0)
const recordsLoaded = ref(false)
const errors = ref<UserErrorRequest[]>([])
const errorTotal = ref(0)
const errorsLoaded = ref(false)
const groups = ref<GroupOption[]>([])

const recordPage = ref(1)
const errorPage = ref(1)
const initialLoading = ref(true)
const listLoading = ref(false)
const refreshing = ref(false)
const fatalError = ref('')
const inlineError = ref('')
let mounted = false
let requestGeneration = 0
let groupGeneration = 0

const currentRange = computed(() => resolveUsageRange(rangePreset.value))
const errorViewEnabled = computed(() => session.settings?.allow_user_view_error_requests === true)
const hasContent = computed(() => stats.value !== null || recordsLoaded.value || errorsLoaded.value)
const busy = computed(() => initialLoading.value || listLoading.value || refreshing.value)
const activePage = computed(() => activeTab.value === 'records' ? recordPage.value : errorPage.value)
const activeTotal = computed(() => activeTab.value === 'records' ? recordTotal.value : errorTotal.value)
const activePageCount = computed(() => Math.max(1, Math.ceil(activeTotal.value / PAGE_SIZE)))
const activeItemsLoaded = computed(() => activeTab.value === 'records' ? recordsLoaded.value : errorsLoaded.value)
const activeItemsEmpty = computed(() => activeTab.value === 'records' ? records.value.length === 0 : errors.value.length === 0)
const activeFilterCount = computed(() => [
  rangePreset.value !== 'last24h',
  Boolean(model.value.trim()),
  Boolean(requestType.value),
  groupId.value !== '',
  billingType.value !== '',
  Boolean(billingMode.value),
].filter(Boolean).length)

function usageFilters(): UsageFilters {
  const filters: UsageFilters = {
    start_date: currentRange.value.startDate,
    end_date: currentRange.value.endDate,
    timezone,
  }
  if (model.value.trim()) filters.model = model.value.trim()
  if (requestType.value) filters.request_type = requestType.value
  if (groupId.value !== '') filters.group_id = groupId.value
  if (billingType.value !== '') filters.billing_type = billingType.value
  if (billingMode.value) filters.billing_mode = billingMode.value
  return filters
}

function errorFilters(): UsageErrorFilters {
  const filters: UsageErrorFilters = {
    start_date: currentRange.value.startDate,
    end_date: currentRange.value.endDate,
    timezone,
  }
  if (model.value.trim()) filters.model = model.value.trim()
  return filters
}

function requestTypeLabel(value: UsageRequestType | undefined): string {
  const labels: Record<UsageRequestType, string> = {
    unknown: '未知请求',
    sync: '同步请求',
    stream: '流式请求',
    ws_v2: 'WebSocket',
    cyber: 'Cyber',
    live: '实时请求',
  }
  return value ? labels[value] : '未知请求'
}

function streamLabel(item: UsageLog): string {
  return item.stream ? '流式' : '非流式'
}

function billingTypeLabel(value: number): string {
  if (value === 0) return '余额'
  if (value === 1) return '订阅'
  return '计费类型未知'
}

function tokenTotal(item: UsageLog): number {
  if (Number.isFinite(item.total_tokens)) return item.total_tokens!
  return item.input_tokens + item.output_tokens + item.cache_creation_tokens + item.cache_read_tokens
}

function failureMessage(failed: string[], refresh: boolean): string {
  const scope = failed.join('、')
  return refresh
    ? `刷新失败：${scope}暂时不可用，已保留现有数据。`
    : `${scope}加载失败，点击重试。`
}

async function loadUsage(isRefresh = false) {
  const generation = ++requestGeneration
  const tab = activeTab.value
  const hadContent = hasContent.value
  fatalError.value = ''
  inlineError.value = ''

  if (hadContent || isRefresh) refreshing.value = true
  else initialLoading.value = true
  listLoading.value = true

  const statsRequest = api.getUsageStats(usageFilters())
  const listRequest = tab === 'records'
    ? api.getUsageRecords({ ...usageFilters(), page: recordPage.value, page_size: PAGE_SIZE })
    : api.getUsageErrors({ ...errorFilters(), page: errorPage.value, page_size: PAGE_SIZE })
  const [statsResult, listResult] = await Promise.allSettled([statsRequest, listRequest])

  if (!mounted || generation !== requestGeneration) return

  const failed: string[] = []
  if (statsResult.status === 'fulfilled') stats.value = statsResult.value
  else failed.push('汇总数据')

  if (tab === 'records') {
    if (listResult.status === 'fulfilled') {
      const value = listResult.value as Awaited<ReturnType<typeof api.getUsageRecords>>
      records.value = value.items ?? []
      recordTotal.value = value.total ?? 0
      recordsLoaded.value = true
    } else {
      failed.push('使用记录')
    }
  } else if (listResult.status === 'fulfilled') {
    const value = listResult.value as Awaited<ReturnType<typeof api.getUsageErrors>>
    errors.value = value.items ?? []
    errorTotal.value = value.total ?? 0
    errorsLoaded.value = true
  } else {
    failed.push('错误记录')
  }

  initialLoading.value = false
  listLoading.value = false
  refreshing.value = false
  if (failed.length) {
    if (!hasContent.value) fatalError.value = '暂时无法加载使用记录，请检查网络后重试。'
    else inlineError.value = failureMessage(failed, hadContent || isRefresh)
  }
}

async function loadActiveList() {
  const generation = ++requestGeneration
  const tab = activeTab.value
  listLoading.value = true
  inlineError.value = ''

  try {
    if (tab === 'records') {
      const value = await api.getUsageRecords({
        ...usageFilters(),
        page: recordPage.value,
        page_size: PAGE_SIZE,
      })
      if (!mounted || generation !== requestGeneration) return
      records.value = value.items ?? []
      recordTotal.value = value.total ?? 0
      recordsLoaded.value = true
    } else {
      const value = await api.getUsageErrors({
        ...errorFilters(),
        page: errorPage.value,
        page_size: PAGE_SIZE,
      })
      if (!mounted || generation !== requestGeneration) return
      errors.value = value.items ?? []
      errorTotal.value = value.total ?? 0
      errorsLoaded.value = true
    }
  } catch {
    if (!mounted || generation !== requestGeneration) return
    inlineError.value = `${tab === 'records' ? '使用记录' : '错误记录'}加载失败，已保留当前数据。`
  } finally {
    if (mounted && generation === requestGeneration) listLoading.value = false
  }
}

async function loadGroups() {
  const generation = ++groupGeneration
  try {
    const value = await api.getUsageGroups()
    if (mounted && generation === groupGeneration) groups.value = value ?? []
  } catch {
    // Group choices are optional; filters remain usable without them.
  }
}

function refresh() {
  void loadUsage(hasContent.value)
}

function retryInline() {
  void loadUsage(true)
}

function resetPages() {
  recordPage.value = 1
  errorPage.value = 1
}

function applyVisibleFilters() {
  resetPages()
  void loadUsage(hasContent.value)
}

function openAdvancedFilters() {
  draftGroupId.value = groupId.value
  draftBillingType.value = billingType.value
  draftBillingMode.value = billingMode.value
  sheetOpen.value = true
}

function applyAdvancedFilters() {
  groupId.value = draftGroupId.value
  billingType.value = draftBillingType.value
  billingMode.value = draftBillingMode.value
  resetPages()
  sheetOpen.value = false
  void loadUsage(hasContent.value)
}

function resetFilters() {
  rangePreset.value = 'last24h'
  model.value = ''
  requestType.value = ''
  groupId.value = ''
  billingType.value = ''
  billingMode.value = ''
  draftGroupId.value = ''
  draftBillingType.value = ''
  draftBillingMode.value = ''
  resetPages()
  sheetOpen.value = false
  void loadUsage(hasContent.value)
}

function selectTab(tab: 'records' | 'errors') {
  if (tab === activeTab.value || (tab === 'errors' && !errorViewEnabled.value)) return
  activeTab.value = tab
  inlineError.value = ''
  void loadUsage(false)
}

function changePage(page: number) {
  const validPage = Math.min(activePageCount.value, Math.max(1, page))
  if (validPage === activePage.value) return
  if (activeTab.value === 'records') recordPage.value = validPage
  else errorPage.value = validPage
  void loadActiveList()
}

onMounted(() => {
  mounted = true
  void loadGroups()
  void loadUsage()
})

onUnmounted(() => {
  mounted = false
  requestGeneration += 1
  groupGeneration += 1
})
</script>

<template>
  <MobilePage
    title="使用记录"
    :loading="initialLoading && !hasContent"
    :error="fatalError"
    :aria-busy="busy"
    loading-label="正在加载使用记录"
    @retry="refresh"
  >
    <template #action>
      <button
        class="icon-button"
        type="button"
        data-testid="usage-refresh"
        :title="refreshing ? '正在刷新使用记录' : '刷新使用记录'"
        :aria-label="refreshing ? '正在刷新使用记录' : '刷新使用记录'"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="18" :class="{ spinning: refreshing }" />
      </button>
    </template>

    <template #loading>
      <div class="usage-skeleton" aria-hidden="true">
        <i v-for="index in 4" :key="index" />
        <span /><span />
      </div>
    </template>

    <div class="usage-content">
      <section v-if="stats" class="summary-grid" aria-label="用量汇总">
        <div data-testid="summary-requests"><span>请求</span><strong>{{ formatCount(stats.total_requests) }}</strong></div>
        <div data-testid="summary-tokens"><span>Token</span><strong>{{ formatCount(stats.total_tokens) }}</strong></div>
        <div data-testid="summary-cost"><span>实际费用</span><strong>{{ formatCost(stats.total_actual_cost) }}</strong></div>
        <div data-testid="summary-duration"><span>平均耗时</span><strong>{{ formatDuration(stats.average_duration_ms) }}</strong></div>
      </section>

      <section class="filter-area" aria-label="使用记录筛选">
        <label>
          <span>日期</span>
          <select v-model="rangePreset" data-testid="usage-range-filter" @change="applyVisibleFilters">
            <option v-for="preset in usageRangePresets" :key="preset.value" :value="preset.value">{{ preset.label }}</option>
          </select>
        </label>
        <label class="model-filter">
          <span>模型</span>
          <input
            v-model="model"
            data-testid="usage-model-filter"
            type="text"
            autocomplete="off"
            placeholder="全部模型"
            @change="applyVisibleFilters"
          >
        </label>
        <label>
          <span>请求类型</span>
          <select v-model="requestType" data-testid="usage-request-type-filter" @change="applyVisibleFilters">
            <option value="">全部类型</option>
            <option value="sync">同步</option>
            <option value="stream">流式</option>
            <option value="ws_v2">WebSocket</option>
            <option value="cyber">Cyber</option>
            <option value="live">实时</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <button
          class="advanced-button"
          type="button"
          data-testid="usage-advanced-trigger"
          @click="openAdvancedFilters"
        >
          <SlidersHorizontal :size="17" />
          高级筛选
          <span v-if="activeFilterCount" data-testid="usage-filter-count">{{ activeFilterCount }}</span>
        </button>
      </section>

      <div v-if="inlineError" class="inline-error" data-testid="usage-inline-error" role="alert">
        <AlertCircle :size="18" />
        <span>{{ inlineError }}</span>
        <button type="button" data-testid="usage-inline-retry" @click="retryInline">重试</button>
      </div>

      <div class="usage-tabs" role="tablist" aria-label="记录类型">
        <button
          type="button"
          role="tab"
          data-testid="usage-records-tab"
          :aria-selected="activeTab === 'records'"
          @click="selectTab('records')"
        >使用记录</button>
        <button
          v-if="errorViewEnabled"
          type="button"
          role="tab"
          data-testid="usage-errors-tab"
          :aria-selected="activeTab === 'errors'"
          @click="selectTab('errors')"
        >错误记录</button>
      </div>

      <div v-if="listLoading" class="list-loading" data-testid="usage-list-loading" role="status">
        正在加载{{ activeTab === 'records' ? '使用记录' : '错误记录' }}
      </div>

      <section v-if="activeTab === 'records'" class="record-list" aria-label="使用记录列表">
        <article v-for="item in records" :key="item.id" class="record-card" data-testid="usage-record-card">
          <header>
            <strong>{{ item.model || '未知模型' }}</strong>
            <time>{{ formatDateTime(item.created_at) }}</time>
          </header>
          <div class="status-row">
            <span>{{ requestTypeLabel(item.request_type) }}</span>
            <span>{{ streamLabel(item) }}</span>
            <span>{{ billingTypeLabel(item.billing_type) }}</span>
          </div>
          <dl class="record-details">
            <div><dt>输入</dt><dd>{{ ` ${formatCount(item.input_tokens)}` }}</dd></div>
            <div><dt>输出</dt><dd>{{ ` ${formatCount(item.output_tokens)}` }}</dd></div>
            <div><dt>缓存创建</dt><dd>{{ ` ${formatCount(item.cache_creation_tokens)}` }}</dd></div>
            <div><dt>缓存读取</dt><dd>{{ ` ${formatCount(item.cache_read_tokens)}` }}</dd></div>
            <div><dt>合计</dt><dd>{{ ` ${formatCount(tokenTotal(item))}` }}</dd></div>
            <div><dt>费用</dt><dd>{{ ` ${formatCost(item.actual_cost)}` }}</dd></div>
            <div><dt>耗时</dt><dd>{{ ` ${formatDuration(item.duration_ms)}` }}</dd></div>
            <div><dt>分组</dt><dd>{{ ` ${item.group?.name || '未分组'}` }}</dd></div>
          </dl>
        </article>
        <div v-if="recordsLoaded && !listLoading && records.length === 0" class="list-empty" data-testid="usage-list-empty">
          <strong>暂无使用记录</strong>
          <span>当前筛选范围内没有请求记录。</span>
        </div>
      </section>

      <section v-else class="record-list" aria-label="错误记录列表">
        <article v-for="item in errors" :key="item.id" class="record-card error-card" data-testid="usage-error-card">
          <header>
            <strong>{{ item.model || '未知模型' }}</strong>
            <time>{{ formatDateTime(item.created_at) }}</time>
          </header>
          <div class="status-row">
            <span>HTTP {{ item.status_code }}</span>
            <span>{{ item.category || '未分类' }}</span>
            <span>{{ item.platform || '未知平台' }}</span>
          </div>
          <dl class="error-details">
            <div><dt>分组</dt><dd>{{ item.group_name || '未分组' }}</dd></div>
            <div><dt>接口</dt><dd>{{ item.inbound_endpoint || '未知接口' }}</dd></div>
          </dl>
        </article>
        <div v-if="errorsLoaded && !listLoading && errors.length === 0" class="list-empty" data-testid="usage-list-empty">
          <strong>暂无错误记录</strong>
          <span>当前筛选范围内没有错误请求。</span>
        </div>
      </section>

      <MobilePagination
        v-if="activeItemsLoaded && (!activeItemsEmpty || activeTotal > 0)"
        :page="activePage"
        :page-count="activePageCount"
        @change="changePage"
      />
    </div>

    <MobileBottomSheet v-model="sheetOpen" title="高级筛选">
      <div class="advanced-fields">
        <label>
          <span>分组</span>
          <select v-model="draftGroupId" data-testid="usage-group-filter">
            <option value="">全部分组</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
        </label>
        <label>
          <span>计费类型</span>
          <select v-model="draftBillingType" data-testid="usage-billing-type-filter">
            <option value="">全部类型</option>
            <option :value="0">余额</option>
            <option :value="1">订阅</option>
          </select>
        </label>
        <label>
          <span>计费模式</span>
          <select v-model="draftBillingMode" data-testid="usage-billing-mode-filter">
            <option value="">全部模式</option>
            <option value="token">按 Token</option>
            <option value="per_request">按次</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
        </label>
      </div>
      <template #footer>
        <button class="sheet-secondary" type="button" data-testid="usage-filter-reset" @click="resetFilters">重置</button>
        <button class="sheet-primary" type="button" data-testid="usage-filter-apply" @click="applyAdvancedFilters">应用</button>
      </template>
    </MobileBottomSheet>
  </MobilePage>
</template>

<style scoped>
.icon-button {
  display: grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.icon-button:disabled {
  opacity: 0.5;
}

.spinning {
  animation: usage-spin 700ms linear infinite;
}

.usage-content {
  display: grid;
  min-width: 0;
  gap: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-grid > div {
  display: grid;
  min-width: 0;
  min-height: 76px;
  align-content: center;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.summary-grid span,
.filter-area label > span,
.advanced-fields label > span {
  color: var(--text-secondary);
  font-size: 12px;
}

.summary-grid strong {
  overflow: hidden;
  font-size: 20px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-area {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.filter-area label,
.advanced-fields label {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.model-filter {
  grid-column: 1 / -1;
}

.filter-area input,
.filter-area select,
.advanced-fields select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
}

.advanced-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
}

.advanced-button span {
  display: grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent-primary);
  color: white;
  font-size: 12px;
}

.inline-error {
  display: grid;
  min-height: 44px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-warning-border, #e4b55f);
  border-radius: 6px;
  background: var(--color-warning-bg, #fff8e8);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
}

.inline-error button {
  min-height: 44px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-weight: 600;
}

.usage-tabs {
  display: grid;
  min-height: 44px;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-muted);
}

.usage-tabs button {
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 14px;
}

.usage-tabs button[aria-selected="true"] {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(28, 43, 60, 0.12);
  font-weight: 600;
}

.list-loading {
  min-height: 44px;
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}

.record-list {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.record-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.record-card header {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.record-card header strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.4;
}

.record-card time {
  color: var(--text-tertiary);
  font-size: 12px;
}

.status-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.status-row span {
  padding: 4px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-muted);
  color: var(--text-secondary);
  font-size: 12px;
}

.record-details,
.error-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
}

.record-details div,
.error-details div {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 6px;
}

.record-details dt,
.error-details dt {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 12px;
}

.record-details dd,
.error-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 12px;
  text-align: right;
}

.error-details {
  grid-template-columns: 1fr;
}

.list-empty {
  display: flex;
  min-height: 132px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
  text-align: center;
}

.list-empty strong {
  color: var(--text-primary);
  font-size: 15px;
}

.list-empty span {
  font-size: 13px;
}

.advanced-fields {
  display: grid;
  gap: 14px;
}

.sheet-primary,
.sheet-secondary {
  min-width: 88px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
}

.sheet-secondary {
  border: 1px solid var(--border-strong);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.sheet-primary {
  border: 1px solid var(--accent-primary);
  background: var(--accent-primary);
  color: white;
}

.usage-skeleton {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.usage-skeleton i,
.usage-skeleton span {
  height: 76px;
  border-radius: 8px;
  background: var(--bg-muted);
}

.usage-skeleton span {
  grid-column: 1 / -1;
  height: 44px;
}

@keyframes usage-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}
</style>
