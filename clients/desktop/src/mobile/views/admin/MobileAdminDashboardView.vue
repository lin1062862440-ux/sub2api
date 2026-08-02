<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  HeartPulse,
  RefreshCw,
  UsersRound,
  WalletCards,
} from '@lucide/vue'

import { getAdminDashboardRealtime, getAdminDashboardSnapshot } from '@/api/admin/dashboard'
import type {
  AdminDashboardRealtime,
  AdminDashboardSnapshot,
} from '@/api/admin/types'
import { formatCost, formatCount, formatNumber } from '@/lib/format'
import MobilePage from '@/mobile/components/MobilePage.vue'

type RangeDays = 7 | 30

interface TrendItem {
  date: string
  requests: number
  width: string
}

const rangeDays = ref<RangeDays>(7)
const snapshot = ref<AdminDashboardSnapshot | null>(null)
const realtime = ref<AdminDashboardRealtime | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const fatalError = ref('')
const partialWarning = ref('')

const stats = computed(() => snapshot.value?.stats)
const hasContent = computed(() => snapshot.value !== null || realtime.value !== null)
const busy = computed(() => loading.value || refreshing.value)

function finiteNonNegative(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(0, value!)
}

function metricNumber(value: number | null | undefined): string {
  const safe = finiteNonNegative(value)
  return safe === null ? '—' : formatNumber(safe)
}

function metricCost(value: number | null | undefined): string {
  const safe = finiteNonNegative(value)
  return safe === null ? '—' : formatCost(safe)
}

const healthyPercent = computed(() => {
  if (!stats.value) return null
  const total = finiteNonNegative(stats.value?.total_accounts)
  const normal = finiteNonNegative(stats.value?.normal_accounts)
  if (total === null) return null
  if (total === 0) return 0
  if (normal === null) return null
  return Math.round(Math.min(100, (normal / total) * 100))
})
const healthyPercentLabel = computed(() => (
  healthyPercent.value === null ? '—' : `${healthyPercent.value}%`
))

const attentionItems = computed(() => [
  { key: 'error', label: '错误账号', count: finiteNonNegative(stats.value?.error_accounts) },
  { key: 'ratelimit', label: '限流账号', count: finiteNonNegative(stats.value?.ratelimit_accounts) },
  { key: 'overload', label: '过载账号', count: finiteNonNegative(stats.value?.overload_accounts) },
])

function safeDateLabel(value: string | null | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value!.slice(5) : '日期未知'
}

const visibleTrend = computed<TrendItem[]>(() => {
  const points = (snapshot.value?.trend ?? []).map((point) => ({
    date: safeDateLabel(point.date),
    requests: finiteNonNegative(point.requests) ?? 0,
  }))
  const peak = Math.max(1, ...points.map((point) => point.requests))
  return points.map((point) => ({
    ...point,
    width: point.requests === 0 ? '0%' : `${Math.max(4, (point.requests / peak) * 100)}%`,
  }))
})

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateRange(days: RangeDays) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  return {
    start_date: formatLocalDate(start),
    end_date: formatLocalDate(end),
    granularity: 'day' as const,
  }
}

function warningMessage(failed: string[], keptExistingData: boolean): string {
  const scope = failed.join('、')
  return keptExistingData
    ? `${scope}暂时不可用，已保留现有数据。`
    : `${scope}暂时不可用，其他数据已正常加载。`
}

let mounted = false
let requestGeneration = 0

async function load(preferRefresh = false) {
  const generation = ++requestGeneration
  const hadContent = hasContent.value
  const useRefreshState = preferRefresh || hadContent

  if (useRefreshState) refreshing.value = true
  else loading.value = true
  fatalError.value = ''
  partialWarning.value = ''

  const [snapshotResult, realtimeResult] = await Promise.allSettled([
    getAdminDashboardSnapshot(dateRange(rangeDays.value)),
    getAdminDashboardRealtime(),
  ])

  if (!mounted || generation !== requestGeneration) return

  const failed: string[] = []
  if (snapshotResult.status === 'fulfilled' && snapshotResult.value) {
    snapshot.value = snapshotResult.value
  } else {
    failed.push('统计与趋势')
  }

  if (realtimeResult.status === 'fulfilled' && realtimeResult.value) {
    realtime.value = realtimeResult.value
  } else {
    failed.push('实时状态')
  }

  loading.value = false
  refreshing.value = false

  if (failed.length > 0) {
    if (hasContent.value) partialWarning.value = warningMessage(failed, hadContent)
    else fatalError.value = '暂时无法加载管理概览，请检查网络后重试。'
  }
}

function changeRange(days: RangeDays) {
  if (rangeDays.value === days) return
  rangeDays.value = days
  void load(true)
}

function refresh() {
  void load(hasContent.value)
}

onMounted(() => {
  mounted = true
  void load()
})

onUnmounted(() => {
  mounted = false
  requestGeneration += 1
})
</script>

<template>
  <MobilePage
    title="管理概览"
    subtitle="平台负载与账号状态"
    :loading="loading && !hasContent"
    :error="fatalError"
    :aria-busy="busy"
    loading-label="正在加载管理概览"
    @retry="refresh"
  >
    <template #action>
      <button
        class="refresh-button"
        type="button"
        data-testid="admin-dashboard-refresh"
        :aria-label="refreshing ? '正在刷新管理概览' : '刷新管理概览'"
        :aria-busy="refreshing"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="18" :class="{ spinning: refreshing }" />
      </button>
    </template>

    <template #loading>
      <div class="dashboard-skeleton" aria-hidden="true">
        <i v-for="index in 4" :key="index" />
        <span />
        <span />
      </div>
    </template>

    <div v-if="partialWarning" class="partial-warning" data-testid="partial-warning" role="status">
      <AlertTriangle :size="17" />
      <span>{{ partialWarning }}</span>
    </div>

    <div class="range-control" role="group" aria-label="统计时间范围">
      <button
        v-for="days in [7, 30] as RangeDays[]"
        :key="days"
        type="button"
        :data-range="days"
        :aria-pressed="rangeDays === days"
        @click="changeRange(days)"
      >
        {{ days }} 天
      </button>
    </div>

    <section class="metric-grid" aria-label="平台关键指标">
      <article class="metric-card" data-testid="metric-users">
        <UsersRound :size="19" />
        <span>总用户</span>
        <strong>{{ metricNumber(stats?.total_users) }}</strong>
      </article>
      <article class="metric-card health-metric" data-testid="metric-account-health">
        <HeartPulse :size="19" />
        <span>账号健康</span>
        <strong>{{ healthyPercentLabel }}</strong>
      </article>
      <article class="metric-card live-metric" data-testid="metric-active-requests">
        <Activity :size="19" />
        <span>活跃请求</span>
        <strong>{{ metricNumber(realtime?.active_requests) }}</strong>
      </article>
      <article class="metric-card cost-metric" data-testid="metric-today-cost">
        <WalletCards :size="19" />
        <span>今日消费</span>
        <strong>{{ metricCost(stats?.today_actual_cost) }}</strong>
      </article>
    </section>

    <section class="health-row" data-testid="account-health" aria-label="账号健康明细">
      <div>
        <span>正常账号</span>
        <strong>{{ metricNumber(stats?.normal_accounts) }}</strong>
      </div>
      <div>
        <span>账号总数</span>
        <strong>{{ metricNumber(stats?.total_accounts) }}</strong>
      </div>
      <div>
        <span>健康率</span>
        <strong>{{ healthyPercentLabel }}</strong>
      </div>
    </section>

    <section class="trend-section" data-testid="request-trend" aria-labelledby="mobile-request-trend-title">
      <header>
        <div>
          <h2 id="mobile-request-trend-title">请求趋势</h2>
          <p>近 {{ rangeDays }} 天请求变化</p>
        </div>
        <span v-if="snapshot">{{ safeDateLabel(snapshot.start_date) }} 至 {{ safeDateLabel(snapshot.end_date) }}</span>
      </header>
      <div v-if="visibleTrend.length" class="trend-list">
        <div v-for="point in visibleTrend" :key="point.date" class="trend-point" data-testid="trend-point">
          <span>{{ point.date }}</span>
          <i><b :style="{ width: point.width }" /></i>
          <strong>{{ formatCount(point.requests) }}</strong>
        </div>
      </div>
      <p v-else class="empty-trend">暂无趋势数据</p>
    </section>

    <section class="attention-section" aria-labelledby="mobile-attention-title">
      <header>
        <h2 id="mobile-attention-title">需要关注</h2>
        <span>账号状态</span>
      </header>
      <ol>
        <li
          v-for="item in attentionItems"
          :key="item.key"
          data-testid="attention-item"
          :class="{ clear: item.count === 0 }"
        >
          <span>{{ item.label }}</span>
          <strong>{{ metricNumber(item.count) }}</strong>
        </li>
      </ol>
    </section>
  </MobilePage>
</template>

<style scoped>
.refresh-button {
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  place-items: center;
}

.refresh-button:disabled {
  opacity: 0.58;
}

.partial-warning {
  display: flex;
  min-height: 44px;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 11px;
  border: 1px solid #eedba9;
  border-radius: 7px;
  background: #fff8e8;
  color: #825d15;
  font-size: 13px;
  line-height: 1.45;
}

.partial-warning svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.range-control {
  display: grid;
  width: 100%;
  min-height: 52px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--bg-base);
}

.range-control button {
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 14px;
}

.range-control button[aria-pressed="true"] {
  background: var(--bg-surface);
  box-shadow: 0 1px 5px rgba(31, 51, 78, 0.11);
  color: var(--accent-strong);
  font-weight: 650;
}

.range-control button:focus-visible,
.refresh-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.metric-card {
  box-sizing: border-box;
  display: grid;
  min-width: 0;
  min-height: 98px;
  grid-template-columns: 26px minmax(0, 1fr);
  grid-template-rows: 24px minmax(28px, auto);
  align-content: center;
  gap: 5px 7px;
  padding: 13px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  color: #396fc5;
}

.metric-card span {
  min-width: 0;
  align-self: center;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card strong {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-metric { color: #24805b; }
.live-metric { color: #7653bd; }
.cost-metric { color: #b3602b; }

.health-row {
  display: grid;
  min-width: 0;
  min-height: 72px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.health-row > div {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 4px;
  padding: 10px;
  border-right: 1px solid var(--border-subtle);
}

.health-row > div:last-child { border-right: 0; }
.health-row span { overflow: hidden; color: var(--text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.health-row strong { font-family: var(--font-data); font-size: 16px; font-variant-numeric: tabular-nums; }

.trend-section,
.attention-section {
  min-width: 0;
  margin-top: 12px;
  padding: 14px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.trend-section > header,
.attention-section > header {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.trend-section h2,
.attention-section h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.35;
}

.trend-section header p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.trend-section header > span,
.attention-section header > span {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.trend-point {
  display: grid;
  min-width: 0;
  height: 22px;
  grid-template-columns: 42px minmax(0, 1fr) 50px;
  align-items: center;
  gap: 8px;
}

.trend-point span,
.trend-point strong {
  overflow: hidden;
  font-family: var(--font-data);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-point span { color: var(--text-tertiary); }
.trend-point strong { text-align: right; }
.trend-point i { display: block; height: 6px; overflow: hidden; border-radius: 4px; background: var(--bg-base); }
.trend-point b { display: block; height: 100%; border-radius: inherit; background: var(--accent); }

.empty-trend {
  display: grid;
  min-height: 82px;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  place-items: center;
}

.attention-section ol {
  display: grid;
  gap: 0;
  margin: 9px 0 0;
  padding: 0;
  list-style: none;
}

.attention-section li {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: #a54c3e;
  font-size: 13px;
}

.attention-section li:last-child { border-bottom: 0; }
.attention-section li.clear { color: var(--text-tertiary); }
.attention-section li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attention-section li strong { flex: 0 0 auto; font-family: var(--font-data); font-size: 15px; }

.dashboard-skeleton {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-skeleton i,
.dashboard-skeleton span {
  display: block;
  min-height: 98px;
  border-radius: 8px;
  background: #edf1f5;
  animation: pulse 1.1s ease-in-out infinite alternate;
}

.dashboard-skeleton span {
  min-height: 72px;
  grid-column: 1 / -1;
}

.spinning { animation: spin 0.75s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { to { opacity: 0.55; } }

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .dashboard-skeleton i,
  .dashboard-skeleton span { animation: none; }
}
</style>
