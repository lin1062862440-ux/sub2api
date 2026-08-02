<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, RefreshCw } from '@lucide/vue'

import * as api from '@/api'
import type { DashboardStats, SubscriptionSummary, SubscriptionSummaryItem, TrendPoint } from '@/api'
import { formatCost, formatCount, formatDuration } from '@/lib/format'
import { session } from '@/stores/session'
import MobilePage from '@/mobile/components/MobilePage.vue'

const stats = ref<DashboardStats | null>(null)
const trend = ref<TrendPoint[]>([])
const subscriptionSummary = ref<SubscriptionSummary | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const fatalError = ref('')
const unavailableSections = ref<string[]>([])
const trendLoaded = ref(false)
const subscriptionsLoaded = ref(false)

const isSimpleMode = computed(() => session.runMode === 'simple')
const busy = computed(() => loading.value || refreshing.value)
const hasContent = computed(() => Boolean(stats.value) || trendLoaded.value || subscriptionsLoaded.value)

function dateRange(): { start_date: string; end_date: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

function quotaRatio(subscription: SubscriptionSummaryItem): number {
  const windows = [
    [subscription.daily_used_usd, subscription.daily_limit_usd],
    [subscription.weekly_used_usd, subscription.weekly_limit_usd],
    [subscription.monthly_used_usd, subscription.monthly_limit_usd],
  ]

  return windows.reduce((highest, [used, limit]) => {
    if (used === undefined || limit === undefined || limit <= 0) return highest
    return Math.max(highest, used / limit)
  }, 0)
}

function quotaLabel(subscription: SubscriptionSummaryItem): string {
  const ratio = quotaRatio(subscription)
  if (ratio >= 1) return '额度已用满'
  if (ratio >= 0.8) return '额度接近上限'
  return '额度正常'
}

const activeSubscriptions = computed(() =>
  (subscriptionSummary.value?.subscriptions ?? []).filter((subscription) => subscription.status === 'active'),
)

const nearestExpiry = computed(() => activeSubscriptions.value
  .filter((subscription) => subscription.expires_at && !Number.isNaN(Date.parse(subscription.expires_at)))
  .sort((left, right) => Date.parse(left.expires_at!) - Date.parse(right.expires_at!))[0] ?? null)

function formatExpiry(value: string | undefined): string {
  if (!value) return '长期有效'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '到期时间未知'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}月${day}日`
}

const visibleTrend = computed(() => trend.value.slice(-7))
const requestPeak = computed(() => Math.max(1, ...visibleTrend.value.map((point) => point.requests ?? 0)))

function trendWidth(point: TrendPoint): string {
  if (!point.requests) return '0%'
  return `${Math.max((point.requests / requestPeak.value) * 100, 3)}%`
}

async function load(isRefresh = false) {
  if (refreshing.value) return
  if (isRefresh) refreshing.value = true
  else loading.value = true
  fatalError.value = ''
  unavailableSections.value = []

  const range = dateRange()
  const [statsResult, trendResult, subscriptionsResult] = await Promise.allSettled([
    api.getDashboardStats(),
    api.getDashboardTrend({ ...range, granularity: 'day' }),
    api.getSubscriptionSummary(),
  ])

  if (statsResult.status === 'fulfilled') stats.value = statsResult.value
  else unavailableSections.value.push('核心指标')

  if (trendResult.status === 'fulfilled') {
    trend.value = trendResult.value.trend ?? []
    trendLoaded.value = true
  } else {
    unavailableSections.value.push('用量趋势')
  }

  if (subscriptionsResult.status === 'fulfilled') {
    subscriptionSummary.value = subscriptionsResult.value
    subscriptionsLoaded.value = true
  } else {
    unavailableSections.value.push('订阅概况')
  }

  loading.value = false
  refreshing.value = false
  if (!hasContent.value) fatalError.value = '暂时无法加载首页数据，请检查网络后重试。'
}

function refresh() {
  void load(hasContent.value)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <MobilePage
    title="首页"
    :loading="loading && !hasContent"
    :error="fatalError"
    loading-label="正在加载首页"
    @retry="refresh"
  >
    <template #action>
      <button
        class="refresh-button"
        type="button"
        title="刷新首页"
        aria-label="刷新首页"
        data-testid="dashboard-refresh"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="18" :class="{ spinning: refreshing }" />
      </button>
    </template>

    <template #loading>
      <div class="dashboard-skeleton" aria-hidden="true">
        <div class="skeleton-band"><i /><i /></div>
        <div class="skeleton-grid">
          <i v-for="index in 4" :key="index" data-testid="dashboard-skeleton-metric" />
        </div>
        <div class="skeleton-section"><i /><i v-for="index in 4" :key="index" /></div>
      </div>
    </template>

    <div
      v-if="unavailableSections.length && hasContent"
      class="partial-warning"
      data-testid="dashboard-partial-warning"
      role="status"
    >
      <Activity :size="16" />
      <span>部分数据未加载：{{ unavailableSections.join('、') }}</span>
      <button type="button" :disabled="busy" @click="refresh">重试</button>
    </div>

    <section
      v-if="!isSimpleMode || subscriptionsLoaded"
      class="account-band"
      :class="{ single: isSimpleMode || !subscriptionsLoaded }"
      data-testid="account-band"
      aria-label="账户概况"
    >
      <div v-if="!isSimpleMode" data-testid="account-balance">
        <span>可用余额</span>
        <strong>{{ formatCost(session.user?.balance) }}</strong>
      </div>
      <div v-if="subscriptionsLoaded">
        <span>当前订阅</span>
        <strong>{{ subscriptionSummary?.active_count ?? 0 }} 个有效</strong>
      </div>
    </section>

    <section v-if="stats" class="metric-grid" aria-label="用量摘要">
      <article class="metric" data-testid="metric-requests">
        <span>累计请求</span>
        <strong>{{ formatCount(stats.total_requests) }}</strong>
      </article>
      <article class="metric" data-testid="metric-tokens">
        <span>累计 Token</span>
        <strong>{{ formatCount(stats.total_tokens) }}</strong>
      </article>
      <article v-if="!isSimpleMode" class="metric" data-testid="metric-cost">
        <span>实际消费</span>
        <strong>{{ formatCost(stats.total_actual_cost) }}</strong>
      </article>
      <article class="metric" data-testid="metric-duration">
        <span>平均耗时</span>
        <strong>{{ formatDuration(stats.average_duration_ms) }}</strong>
      </article>
    </section>

    <section v-if="trendLoaded" class="data-section trend-section" data-testid="usage-trend">
      <header class="section-heading">
        <h2>近 7 天请求</h2>
        <span>按日</span>
      </header>
      <div v-if="visibleTrend.length" class="trend-list">
        <div v-for="point in visibleTrend" :key="point.date" class="trend-row" data-testid="trend-row">
          <time :datetime="point.date">{{ point.date.slice(5) }}</time>
          <div class="trend-track" aria-hidden="true"><i :style="{ width: trendWidth(point) }" /></div>
          <strong>{{ formatCount(point.requests) }}</strong>
        </div>
      </div>
      <div v-else class="section-empty">近 7 天暂无请求</div>
    </section>

    <section v-if="subscriptionsLoaded" class="data-section" data-testid="subscription-summary">
      <header class="section-heading">
        <h2>当前订阅</h2>
        <span>{{ subscriptionSummary?.active_count ?? 0 }} 个有效订阅</span>
      </header>

      <div v-if="activeSubscriptions.length" class="subscription-list">
        <div v-for="subscription in activeSubscriptions" :key="subscription.id" class="subscription-row">
          <div>
            <strong>{{ subscription.group_name }}</strong>
            <span v-if="nearestExpiry?.id === subscription.id">最近到期 {{ formatExpiry(subscription.expires_at) }}</span>
            <span v-else>{{ formatExpiry(subscription.expires_at) }}</span>
          </div>
          <em :class="{ warning: quotaRatio(subscription) >= 0.8 }">{{ quotaLabel(subscription) }}</em>
        </div>
      </div>
      <div v-else class="section-empty" data-testid="subscription-empty">当前没有有效订阅</div>
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

.refresh-button:disabled,
.partial-warning button:disabled {
  cursor: default;
  opacity: 0.5;
}

.partial-warning {
  display: grid;
  min-height: 44px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px 10px;
  border: 1px solid #ead7a7;
  border-radius: 7px;
  background: #fff9e9;
  color: #765b19;
  font-size: 12px;
  line-height: 1.4;
}

.partial-warning button {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 650;
}

.account-band {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0 2px 16px;
  padding: 2px 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.account-band.single {
  grid-template-columns: minmax(0, 1fr);
}

.account-band > div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.account-band span,
.metric span {
  color: var(--text-secondary);
  font-size: 12px;
}

.account-band strong {
  overflow-wrap: anywhere;
  font-family: var(--font-data);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.metric {
  display: grid;
  min-width: 0;
  min-height: 78px;
  align-content: center;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--bg-surface);
}

.metric strong {
  overflow-wrap: anywhere;
  font-family: var(--font-data);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.data-section {
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.section-heading {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.section-heading h2 {
  margin: 0;
  font-size: 14px;
  line-height: 1.3;
}

.section-heading span {
  color: var(--text-tertiary);
  font-size: 11px;
  white-space: nowrap;
}

.trend-list {
  display: grid;
  min-height: 132px;
  align-content: center;
  gap: 10px;
  padding: 12px;
}

.trend-row {
  display: grid;
  min-height: 22px;
  grid-template-columns: 40px minmax(72px, 1fr) minmax(44px, auto);
  align-items: center;
  gap: 9px;
  font-size: 11px;
}

.trend-row time {
  color: var(--text-tertiary);
  font-family: var(--font-data);
}

.trend-track {
  height: 7px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--bg-inset);
}

.trend-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.trend-row strong {
  overflow: hidden;
  font-family: var(--font-data);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscription-list {
  display: grid;
}

.subscription-row {
  display: grid;
  min-height: 62px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.subscription-row:last-child {
  border-bottom: 0;
}

.subscription-row > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.subscription-row strong,
.subscription-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscription-row strong {
  font-size: 13px;
}

.subscription-row span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.subscription-row em {
  padding: 4px 6px;
  border-radius: 5px;
  background: #eaf6f0;
  color: #277a58;
  font-size: 10px;
  font-style: normal;
  white-space: nowrap;
}

.subscription-row em.warning {
  background: #fff3db;
  color: #87601d;
}

.section-empty {
  display: grid;
  min-height: 96px;
  padding: 16px;
  color: var(--text-tertiary);
  font-size: 13px;
  place-items: center;
  text-align: center;
}

.dashboard-skeleton {
  display: grid;
  gap: 12px;
  width: 100%;
}

.skeleton-band {
  display: grid;
  height: 66px;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
}

.skeleton-band i,
.skeleton-grid i,
.skeleton-section i {
  display: block;
  border-radius: 6px;
  background: var(--skeleton, #e9edf2);
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}

.skeleton-band i {
  width: 78%;
  height: 28px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.skeleton-grid i {
  height: 78px;
}

.skeleton-section {
  display: grid;
  min-height: 190px;
  align-content: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.skeleton-section i {
  height: 18px;
}

.skeleton-section i:first-child {
  width: 38%;
  margin-bottom: 6px;
}

.spinning {
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes skeleton-pulse {
  50% { opacity: 0.55; }
}

@media (max-width: 380px) {
  .account-band {
    gap: 10px;
  }

  .account-band strong {
    font-size: 19px;
  }

  .subscription-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .subscription-row em {
    width: max-content;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .skeleton-band i,
  .skeleton-grid i,
  .skeleton-section i {
    animation: none;
  }
}
</style>
