<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Activity, BadgeCheck, Clock3, ReceiptText, RefreshCw, WalletCards } from '@lucide/vue'

import * as api from '@/api'
import type { DashboardStats, ModelStat, SubscriptionSummary, SubscriptionSummaryItem, TrendPoint } from '@/api'
import TrendChart from '@/components/TrendChart.vue'
import { ApiError } from '@/lib/http'
import { formatCost, formatCount, formatDuration, formatPlatform } from '@/lib/format'
import { refreshUser, session } from '@/stores/session'

type RangeDays = 7 | 30 | 90

const rangeOptions: RangeDays[] = [7, 30, 90]
const platformPalette = ['#2563eb', '#0faea5', '#ff7a63', '#8056e8', '#d89b24']

const stats = ref<DashboardStats | null>(null)
const subscriptionSummary = ref<SubscriptionSummary | null>(null)
const trend = ref<TrendPoint[]>([])
const models = ref<ModelStat[]>([])
const rangeDays = ref<RangeDays>(7)
const loading = ref(true)
const refreshing = ref(false)
const issues = ref<string[]>([])
const lastUpdated = ref<Date | null>(null)

const user = computed(() => session.user)
const isSimpleMode = computed(() => session.runMode === 'simple')
const rangeLabel = computed(() => `近 ${rangeDays.value} 天`)

function hasReachedSubscriptionLimit(subscription: SubscriptionSummaryItem): boolean {
  return [
    [subscription.daily_used_usd, subscription.daily_limit_usd],
    [subscription.weekly_used_usd, subscription.weekly_limit_usd],
    [subscription.monthly_used_usd, subscription.monthly_limit_usd],
  ].some(([used, limit]) => (limit ?? 0) > 0 && (used ?? 0) >= (limit ?? 0))
}

const subscriptionCounts = computed(() => {
  const total = subscriptionSummary.value?.active_count ?? 0
  const exhausted = Math.min(
    total,
    subscriptionSummary.value?.subscriptions.filter(hasReachedSubscriptionLimit).length ?? 0,
  )
  return { available: Math.max(total - exhausted, 0), exhausted, total }
})

function dateRange(days = rangeDays.value): { start_date: string; end_date: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

const topModels = computed(() => {
  const total = models.value.reduce((sum, model) => sum + (model.requests ?? 0), 0)
  return models.value.slice(0, 3).map((model) => ({
    ...model,
    share: total > 0 ? (model.requests / total) * 100 : 0,
  }))
})

const platformSource = computed(() =>
  (stats.value?.by_platform ?? [])
    .filter((row) => row.total_requests > 0)
    .sort((a, b) => b.total_requests - a.total_requests),
)

const platformTotal = computed(() =>
  platformSource.value.reduce((sum, row) => sum + row.total_requests, 0),
)

const platformRows = computed(() => {
  const rows = platformSource.value.length <= 5
    ? platformSource.value
    : [
        ...platformSource.value.slice(0, 4),
        platformSource.value.slice(4).reduce((other, row) => ({
          platform: '__other__',
          total_requests: other.total_requests + row.total_requests,
          total_tokens: other.total_tokens + row.total_tokens,
          total_cost: other.total_cost + row.total_cost,
          total_actual_cost: other.total_actual_cost + row.total_actual_cost,
          today_requests: other.today_requests + row.today_requests,
          today_tokens: other.today_tokens + row.today_tokens,
          today_cost: other.today_cost + row.today_cost,
          today_actual_cost: other.today_actual_cost + row.today_actual_cost,
        }), {
          platform: '__other__',
          total_requests: 0,
          total_tokens: 0,
          total_cost: 0,
          total_actual_cost: 0,
          today_requests: 0,
          today_tokens: 0,
          today_cost: 0,
          today_actual_cost: 0,
        }),
      ]

  return rows.map((row, index) => ({
    ...row,
    label: row.platform === '__other__' ? '其他' : formatPlatform(row.platform),
    color: platformPalette[index % platformPalette.length],
    share: platformTotal.value > 0 ? (row.total_requests / platformTotal.value) * 100 : 0,
  }))
})

const platformGradient = computed(() => {
  if (platformRows.value.length === 0) return 'conic-gradient(#dfe6f0 0 100%)'
  let cursor = 0
  const stops = platformRows.value.map((row) => {
    const start = cursor
    cursor += row.share
    return `${row.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})

const updateLabel = computed(() => {
  if (!lastUpdated.value) return '等待数据'
  return `更新于 ${lastUpdated.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})

function issueMessage(reason: unknown): string | null {
  if (reason instanceof ApiError && reason.status === 401) return null
  if (reason instanceof ApiError && reason.status === 0) return '连接中断'
  return reason instanceof ApiError ? reason.message : null
}

async function load(isRefresh = false) {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  issues.value = []

  const range = dateRange()
  const [statsResult, trendResult, modelsResult, subscriptionsResult] = await Promise.allSettled([
    api.getDashboardStats(),
    api.getDashboardTrend({ ...range, granularity: 'day' }),
    api.getDashboardModels({ ...range, limit: 10 }),
    api.getSubscriptionSummary(),
  ])

  if (statsResult.status === 'fulfilled') stats.value = statsResult.value
  else issues.value.push('核心指标')

  if (trendResult.status === 'fulfilled') trend.value = trendResult.value.trend ?? []
  else issues.value.push('请求趋势')

  if (modelsResult.status === 'fulfilled') models.value = modelsResult.value.models ?? []
  else issues.value.push('模型用量')

  if (subscriptionsResult.status === 'fulfilled') subscriptionSummary.value = subscriptionsResult.value
  else issues.value.push('订阅概况')

  try {
    await refreshUser()
  } catch (reason) {
    if (issueMessage(reason)) issues.value.push('账户余额')
  }

  lastUpdated.value = new Date()
  loading.value = false
  refreshing.value = false
}

function setRange(days: RangeDays) {
  if (rangeDays.value === days) return
  rangeDays.value = days
  void load(true)
}

let timer: number | undefined

onMounted(() => {
  void load()
  timer = window.setInterval(() => void load(true), 60_000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div
    class="dashboard-page"
    :class="{ 'is-loading': loading, 'is-loaded': !loading, 'is-refreshing': refreshing }"
  >
    <header class="page-head drag-region">
      <div class="title-block">
        <h1>仪表盘</h1>
        <p>{{ user?.username || 'LinAI 用户' }}，这是{{ rangeLabel }}的服务概览。</p>
      </div>

      <div class="head-console no-drag">
        <div class="headline-metrics" aria-label="账户摘要">
          <div
            class="headline-metric metric-subscription"
            data-testid="metric-subscriptions"
            :title="`有效 ${subscriptionCounts.available} · 已用满 ${subscriptionCounts.exhausted} · 总计 ${subscriptionCounts.total}`"
          >
            <BadgeCheck :size="16" />
            <span>订阅</span>
            <div class="subscription-values" aria-label="有效订阅、已用满订阅、总订阅">
              <strong class="subscription-available" data-testid="subscription-available">{{ subscriptionCounts.available }}</strong>
              <i>/</i>
              <strong class="subscription-exhausted" data-testid="subscription-exhausted">{{ subscriptionCounts.exhausted }}</strong>
              <i>/</i>
              <strong data-testid="subscription-total">{{ subscriptionCounts.total }}</strong>
            </div>
          </div>
          <div v-if="!isSimpleMode" class="headline-metric metric-balance" data-testid="metric-balance">
            <WalletCards :size="16" />
            <span>账户余额</span>
            <strong>{{ formatCost(user?.balance) }}</strong>
          </div>
          <div v-if="!isSimpleMode" class="headline-metric metric-cost" data-testid="metric-cost">
            <ReceiptText :size="16" />
            <span>今日消费</span>
            <strong>{{ formatCost(stats?.today_actual_cost) }}</strong>
          </div>
          <div class="headline-metric metric-duration" data-testid="metric-duration">
            <Clock3 :size="16" />
            <span>平均耗时</span>
            <strong>{{ formatDuration(stats?.average_duration_ms) }}</strong>
          </div>
        </div>

        <div class="head-tools">
          <span class="update-time">{{ updateLabel }}</span>
          <button
            class="icon-button"
            type="button"
            title="刷新数据"
            aria-label="刷新数据"
            :disabled="refreshing"
            @click="load(true)"
          >
            <RefreshCw :size="16" :class="{ spinning: refreshing }" />
          </button>
        </div>
      </div>
    </header>

    <div v-if="issues.length" class="refresh-notice" data-testid="refresh-notice" role="status">
      <Activity :size="15" />
      <span>部分数据未更新：{{ issues.join('、') }}</span>
    </div>

    <div v-if="loading" class="dashboard-loading" aria-label="正在加载仪表盘">
      <div class="loading-chart">
        <div class="loading-chart-head"><i /><i /></div>
        <div class="loading-chart-summary"><i /><i /></div>
        <div class="loading-chart-series"><i v-for="index in 5" :key="index" /></div>
      </div>
      <div class="loading-grid">
        <div v-for="panel in 2" :key="panel" class="loading-panel">
          <i class="loading-panel-title" />
          <i v-for="row in 3" :key="row" class="loading-panel-row" />
        </div>
      </div>
    </div>

    <main v-else class="dashboard-main">
      <section class="data-panel trend-panel">
        <header class="section-head trend-head">
          <div>
            <h2>请求趋势</h2>
            <p>请求数与 Token 的每日变化</p>
          </div>
          <div class="range-control trend-range" data-testid="trend-range" aria-label="统计时间范围">
            <button
              v-for="days in rangeOptions"
              :key="days"
              type="button"
              :data-testid="`range-${days}`"
              :aria-pressed="rangeDays === days"
              @click="setRange(days)"
            >
              {{ days }}天
            </button>
          </div>
        </header>
        <TrendChart :points="trend" />
      </section>

      <div class="lower-grid">
        <section class="data-panel models-panel">
          <header class="section-head">
            <div>
              <h2>模型用量</h2>
              <p>{{ rangeLabel }}按请求数排序</p>
            </div>
            <span>Top {{ topModels.length }}</span>
          </header>

          <div v-if="topModels.length === 0" class="section-empty">
            <strong>还没有模型数据</strong>
            <span>发起调用后，模型排行会显示在这里。</span>
          </div>
          <ol v-else class="model-list">
            <li
              v-for="model in topModels"
              :key="model.model"
              :title="`${formatCount(model.total_tokens)} tokens${isSimpleMode ? '' : ` · ${formatCost(model.actual_cost)}`}`"
            >
              <div class="model-line">
                <strong>{{ model.model }}</strong>
                <span>{{ formatCount(model.requests) }}</span>
                <em>{{ model.share.toFixed(1) }}%</em>
              </div>
              <div class="usage-track" aria-hidden="true">
                <span :style="{ width: `${Math.max(model.share, 2)}%` }" />
              </div>
            </li>
          </ol>
        </section>

        <section class="data-panel platform-panel">
          <header class="section-head">
            <div>
              <h2>平台分布</h2>
              <p>累计请求数</p>
            </div>
            <span>累计</span>
          </header>

          <div v-if="platformRows.length === 0" class="section-empty">
            <strong>还没有平台数据</strong>
            <span>平台用量会随调用自动汇总。</span>
          </div>
          <div v-else class="platform-visual">
            <div class="platform-donut" :style="{ background: platformGradient }" aria-hidden="true">
              <div>
                <strong>{{ formatCount(platformTotal) }}</strong>
                <span>总请求</span>
              </div>
            </div>
            <ol class="platform-list">
              <li v-for="row in platformRows" :key="row.platform">
                <i :style="{ background: row.color }" />
                <span>{{ row.label }}</span>
                <strong>{{ formatCount(row.total_requests) }}</strong>
                <em>{{ row.share.toFixed(1) }}%</em>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  max-width: 1440px;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  margin: 0 auto;
  padding: 0 28px 18px;
  overflow: hidden;
}

.page-head {
  position: relative;
  display: flex;
  min-height: clamp(160px, 20vh, 184px);
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 0 8px;
}

.title-block {
  min-width: 148px;
  padding-bottom: 3px;
}

.title-block h1 { font-size: 25px; font-weight: 730; }
.title-block p { margin-top: 6px; color: var(--text-secondary); font-size: 14px; white-space: nowrap; }

.head-console {
  position: absolute;
  inset: 24px 0 8px 180px;
}

.headline-metrics { position: absolute; right: 0; bottom: 0; display: flex; min-width: 0; gap: 8px; }

.headline-metric {
  position: relative;
  display: grid;
  width: 118px;
  height: 58px;
  grid-template-columns: 19px minmax(0, 1fr);
  grid-template-rows: 19px 22px;
  column-gap: 7px;
  align-items: center;
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(205, 216, 231, 0.92);
  border-radius: 7px;
  box-shadow: 0 5px 16px rgba(37, 55, 82, 0.055), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  color: var(--text-tertiary);
  overflow: hidden;
  transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast) ease, box-shadow var(--motion-standard) ease;
}

.headline-metric > svg { grid-row: 1 / 3; }
.headline-metric > span { align-self: end; font-size: 12px; font-weight: 500; }
.headline-metric > strong { overflow: hidden; align-self: start; color: var(--text-primary); font-family: var(--font-data); font-size: 15px; font-variant-numeric: tabular-nums; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.metric-subscription { color: #15926f; }
.subscription-values { display: flex; min-width: 0; align-self: start; align-items: baseline; gap: 5px; font-family: var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
.subscription-values strong { color: var(--text-primary); font-size: 15px; font-weight: 700; }
.subscription-values i { color: #a4afbf; font-size: 13px; font-style: normal; }
.subscription-values .subscription-available { color: #15926f; }
.subscription-values .subscription-exhausted { color: #db4c55; }
.metric-balance { color: var(--accent); }
.metric-balance strong { color: var(--accent-strong); }
.metric-cost { color: var(--coral); }
.metric-cost strong { color: var(--coral); }
.metric-duration { color: #7255d9; }

.head-tools { position: absolute; top: 0; right: 0; display: flex; align-items: center; gap: 8px; }
.range-control { display: flex; height: 38px; padding: 3px; background: rgba(230, 236, 245, 0.72); border: 1px solid rgba(205, 216, 231, 0.9); border-radius: 7px; }
.range-control button { min-width: 42px; padding: 0 8px; background: transparent; border: 0; border-radius: 5px; color: var(--text-tertiary); font-size: 13px; transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease; }
.range-control button:hover { color: var(--text-primary); }
.range-control button[aria-pressed='true'] { background: rgba(255, 255, 255, 0.92); box-shadow: 0 1px 5px rgba(28, 48, 76, 0.1); color: var(--accent-strong); font-weight: 680; }
.trend-range { height: 34px; flex: 0 0 auto; }
.trend-range button { min-width: 38px; padding: 0 6px; }
.range-control button:focus-visible,
.icon-button:focus-visible { outline: 2px solid rgba(37, 99, 235, 0.48); outline-offset: 2px; }

.update-time { color: var(--text-tertiary); font-size: 12px; white-space: nowrap; }
.icon-button { display: grid; width: 38px; height: 38px; padding: 0; background: rgba(255, 255, 255, 0.7); border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-secondary); place-items: center; }
.icon-button:hover:not(:disabled) { background: var(--bg-surface-hover); color: var(--accent-strong); }

.refresh-notice { display: flex; min-height: 34px; flex: 0 0 auto; align-items: center; gap: 8px; padding: 0 11px; background: var(--warning-soft); border: 1px solid var(--warning-border); border-radius: 7px; color: var(--warning); font-size: 13px; }

.dashboard-loading,
.dashboard-main { min-height: 0; flex: 1; }
.dashboard-loading { display: grid; grid-template-rows: minmax(250px, 1fr) clamp(204px, 28vh, 255px); gap: 12px; }
.loading-chart,
.loading-panel { position: relative; overflow: hidden; background: #e8edf4; border: 1px solid rgba(205,216,231,.56); border-radius: var(--radius-md); }
.loading-chart::after,
.loading-panel::after,
.is-loading .headline-metric::before { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.72) 47%, transparent 64%); background-size: 220% 100%; content: ''; pointer-events: none; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.loading-chart { display: flex; flex-direction: column; gap: 20px; padding: 20px 22px 26px; }
.loading-chart-head { display: flex; justify-content: space-between; }
.loading-chart-head i:first-child { width: 124px; height: 18px; }
.loading-chart-head i:last-child { width: 132px; height: 30px; }
.loading-chart-summary { display: flex; justify-content: flex-end; gap: 9px; }
.loading-chart-summary i { width: 108px; height: 38px; }
.loading-chart-series { display: flex; flex: 1; align-items: flex-end; justify-content: space-between; gap: 9%; padding: 8px 4% 0; border-bottom: 1px dashed rgba(154,169,190,.48); }
.loading-chart-series i { width: 7px; height: var(--loading-height, 42%); border-radius: 5px 5px 1px 1px; }
.loading-chart-series i:nth-child(1) { height: 38%; }
.loading-chart-series i:nth-child(2) { height: 55%; }
.loading-chart-series i:nth-child(3) { height: 47%; }
.loading-chart-series i:nth-child(4) { height: 74%; }
.loading-chart-series i:nth-child(5) { height: 66%; }
.loading-chart i,
.loading-panel i { display: block; background: rgba(203,212,224,.88); border-radius: 5px; }
.loading-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.loading-panel { display: flex; flex-direction: column; gap: 16px; padding: 20px; }
.loading-panel-title { width: 32%; height: 16px; }
.loading-panel-row { width: 100%; height: 24px; }
.loading-panel-row:nth-child(3) { width: 86%; }
.loading-panel-row:nth-child(4) { width: 72%; }

.dashboard-main { display: grid; grid-template-rows: minmax(250px, 1fr) clamp(204px, 28vh, 255px); gap: 12px; overflow: hidden; }
.data-panel { position: relative; min-width: 0; min-height: 0; padding: 17px 19px; overflow: hidden; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(205, 216, 231, 0.92); border-radius: var(--radius-md); box-shadow: 0 7px 22px rgba(31, 51, 78, 0.045), inset 0 1px 0 rgba(255, 255, 255, 0.88); transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast) ease, box-shadow var(--motion-standard) ease; }
.trend-panel { display: flex; flex-direction: column; overflow: hidden; }
.data-panel::after,
.headline-metric::after { position: absolute; z-index: 3; top: -20%; bottom: -20%; left: 0; width: 24%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent); content: ''; opacity: 0; pointer-events: none; transform: translateX(-115%) skewX(-12deg); }
.is-refreshing .data-panel::after,
.is-refreshing .headline-metric::after { animation: linai-highlight-sweep 820ms var(--motion-ease-out) both; }
.is-loaded .headline-metric,
.is-loaded .trend-panel,
.is-loaded .models-panel,
.is-loaded .platform-panel { animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.is-loaded .headline-metric:nth-child(2) { animation-delay: 55ms; }
.is-loaded .headline-metric:nth-child(3) { animation-delay: 110ms; }
.is-loaded .headline-metric:nth-child(4) { animation-delay: 165ms; }
.is-loaded .trend-panel { animation-delay: 80ms; }
.is-loaded .models-panel { animation-delay: 145ms; }
.is-loaded .platform-panel { animation-delay: 205ms; }

.section-head { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.section-head h2 { font-size: 15px; font-weight: 690; }
.section-head p { margin-top: 3px; color: var(--text-tertiary); font-size: 13px; }
.section-head > span { color: var(--text-tertiary); font-family: var(--font-data); font-size: 12px; }
.trend-head { margin-bottom: 7px; }

.lower-grid { display: grid; min-height: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.models-panel,
.platform-panel { overflow: hidden; }
.model-list { display: flex; flex-direction: column; gap: 13px; margin: 0; padding: 0; list-style: none; }
.model-list li { min-width: 0; }
.model-line { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) 62px 45px; align-items: center; gap: 10px; }
.model-line strong { overflow: hidden; font-family: var(--font-data); font-size: 14px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
.model-line span,
.model-line em { color: var(--text-tertiary); font-family: var(--font-data); font-size: 12px; font-style: normal; text-align: right; }
.model-line em { color: var(--accent-strong); }
.usage-track { height: 5px; margin-top: 6px; overflow: hidden; background: var(--bg-inset); border-radius: 3px; }
.usage-track span { display: block; height: 100%; background: linear-gradient(90deg, #2563eb, #4d84f3); border-radius: inherit; transform-origin: left center; animation: linai-bar-grow 680ms var(--motion-ease-out) both; }
.model-list li:nth-child(2) .usage-track span { animation-delay: 70ms; }
.model-list li:nth-child(3) .usage-track span { animation-delay: 140ms; }

.platform-visual { display: grid; height: calc(100% - 42px); min-height: 118px; grid-template-columns: minmax(116px, 0.78fr) minmax(180px, 1.22fr); align-items: center; gap: 18px; }
.platform-donut { position: relative; width: 112px; aspect-ratio: 1; justify-self: center; border-radius: 50%; box-shadow: 0 7px 20px rgba(48, 74, 112, 0.11); animation: linai-donut-reveal 720ms var(--motion-ease-out) 160ms both; }
.platform-donut::after { position: absolute; inset: 19px; background: rgba(251, 253, 255, 0.98); border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(205, 216, 231, 0.76); content: ''; }
.platform-donut > div { position: absolute; z-index: 1; inset: 19px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.platform-donut strong { font-family: var(--font-data); font-size: 15px; font-variant-numeric: tabular-nums; }
.platform-donut span { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
.platform-list { display: flex; min-width: 0; flex-direction: column; gap: 9px; margin: 0; padding: 0; list-style: none; }
.platform-list li { display: grid; min-width: 0; grid-template-columns: 7px minmax(0, 1fr) 55px 42px; align-items: center; gap: 7px; }
.platform-list li { animation: linai-surface-enter 420ms var(--motion-ease-out) both; }
.platform-list li:nth-child(2) { animation-delay: 60ms; }
.platform-list li:nth-child(3) { animation-delay: 120ms; }
.platform-list li:nth-child(4) { animation-delay: 180ms; }
.platform-list li:nth-child(5) { animation-delay: 240ms; }
.platform-list i { width: 7px; height: 7px; border-radius: 2px; }
.platform-list span { overflow: hidden; color: var(--text-secondary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.platform-list strong,
.platform-list em { color: var(--text-secondary); font-family: var(--font-data); font-size: 12px; font-style: normal; font-weight: 560; text-align: right; }
.platform-list em { color: var(--text-tertiary); }

.section-empty { display: flex; height: calc(100% - 42px); min-height: 112px; flex-direction: column; align-items: center; justify-content: center; gap: 5px; text-align: center; }
.section-empty strong { font-size: 14px; font-weight: 620; }
.section-empty span { color: var(--text-tertiary); font-size: 12px; }
.spinning { animation: spin 800ms linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

@media (hover: hover) and (pointer: fine) {
  .headline-metric:hover,
  .data-panel:hover { border-color: rgba(139,166,211,.78); box-shadow: 0 13px 30px rgba(31,51,78,.09), inset 0 1px 0 rgba(255,255,255,.95); transform: translateY(-2px); }
}

@container app-content (max-width: 1100px) {
  .dashboard-page { padding-right: 22px; padding-left: 22px; }
  .headline-metric { width: 100px; }
  .update-time { display: none; }
  .platform-visual { grid-template-columns: 86px minmax(0, 1fr); gap: 8px; }
  .platform-donut { width: 84px; }
  .platform-donut::after,
  .platform-donut > div { inset: 14px; }
  .platform-list { gap: 7px; }
  .platform-list li { grid-template-columns: 6px minmax(0, 1fr) 40px 34px; gap: 5px; }
  .platform-list i { width: 6px; height: 6px; }
  .platform-list span { font-size: 12px; }
  .platform-list strong,
  .platform-list em { font-size: 12px; }
}

@container app-content (max-width: 850px) {
  .dashboard-page { padding-right: 16px; padding-left: 16px; }
  .title-block { min-width: 132px; }
  .head-console { left: 148px; }
  .headline-metrics { gap: 6px; }
  .headline-metric { width: 94px; padding-right: 7px; padding-left: 7px; }
  .data-panel { padding-right: 16px; padding-left: 16px; }
}

@media (max-height: 680px) {
  .dashboard-page { gap: 10px; padding-bottom: 12px; }
  .page-head { min-height: 152px; padding-top: 18px; }
  .head-console { inset: 18px 0 8px 140px; }
  .dashboard-main,
  .dashboard-loading { grid-template-rows: minmax(245px, 1fr) 184px; gap: 10px; }
  .data-panel { padding: 14px 16px; }
  .section-head { margin-bottom: 8px; }
  .model-list { gap: 9px; }
  .platform-donut { width: min(96px, 100%); }
  .platform-donut::after,
  .platform-donut > div { inset: 17px; }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .loading-chart,
  .loading-panel,
  .loading-chart::after,
  .loading-panel::after,
  .headline-metric,
  .data-panel,
  .usage-track span,
  .platform-donut,
  .platform-list li { animation: none; transform: none; }
}
</style>
