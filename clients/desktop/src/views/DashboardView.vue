<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Activity, Clock3, Gauge, KeyRound, RefreshCw, UsersRound } from '@lucide/vue'

import * as api from '@/api'
import type { DashboardStats, ModelStat, TrendPoint } from '@/api'
import MetricStrip from '@/components/MetricStrip.vue'
import TrendChart from '@/components/TrendChart.vue'
import { ApiError } from '@/lib/http'
import { formatCost, formatCount, formatDuration, formatNumber, formatPlatform } from '@/lib/format'
import { refreshUser, session } from '@/stores/session'

const stats = ref<DashboardStats | null>(null)
const trend = ref<TrendPoint[]>([])
const models = ref<ModelStat[]>([])
const loading = ref(true)
const refreshing = ref(false)
const issues = ref<string[]>([])
const lastUpdated = ref<Date | null>(null)

const user = computed(() => session.user)
const isSimpleMode = computed(() => session.runMode === 'simple')

function dateRange(): { start_date: string; end_date: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

const metricItems = computed(() => {
  const common = [
    {
      id: 'today-requests',
      label: '今日请求',
      value: formatCount(stats.value?.today_requests),
      detail: `累计 ${formatCount(stats.value?.total_requests)}`,
    },
    {
      id: 'today-tokens',
      label: '今日 Token',
      value: formatCount(stats.value?.today_tokens),
      detail: `累计 ${formatCount(stats.value?.total_tokens)}`,
    },
  ]

  if (isSimpleMode.value) {
    return [
      ...common,
      {
        id: 'api-keys',
        label: '活跃 API Key',
        value: formatNumber(stats.value?.active_api_keys),
        detail: `共 ${formatNumber(stats.value?.total_api_keys)} 个`,
        tone: 'brand' as const,
      },
    ]
  }

  return [
    {
      id: 'balance',
      label: '账户余额',
      value: formatCost(user.value?.balance),
      detail: user.value?.frozen_balance
        ? `冻结 ${formatCost(user.value.frozen_balance)}`
        : '当前可用余额',
      tone: 'brand' as const,
    },
    ...common,
    {
      id: 'cost',
      label: '今日消费',
      value: formatCost(stats.value?.today_actual_cost),
      detail: `累计 ${formatCost(stats.value?.total_actual_cost)}`,
      tone: 'cost' as const,
    },
  ]
})

const topModels = computed(() => {
  const total = models.value.reduce((sum, model) => sum + (model.requests ?? 0), 0)
  return models.value.slice(0, 6).map((model) => ({
    ...model,
    share: total > 0 ? (model.requests / total) * 100 : 0,
  }))
})

const platformRows = computed(() =>
  (stats.value?.by_platform ?? []).filter((row) => row.total_requests > 0),
)

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
  const [statsResult, trendResult, modelsResult] = await Promise.allSettled([
    api.getDashboardStats(),
    api.getDashboardTrend({ ...range, granularity: 'day' }),
    api.getDashboardModels({ ...range, limit: 10 }),
  ])

  if (statsResult.status === 'fulfilled') {
    stats.value = statsResult.value
  } else {
    issues.value.push('核心指标')
  }

  if (trendResult.status === 'fulfilled') {
    trend.value = trendResult.value.trend ?? []
  } else {
    issues.value.push('请求趋势')
  }

  if (modelsResult.status === 'fulfilled') {
    models.value = modelsResult.value.models ?? []
  } else {
    issues.value.push('模型用量')
  }

  try {
    await refreshUser()
  } catch (reason) {
    if (issueMessage(reason)) issues.value.push('账户余额')
  }

  lastUpdated.value = new Date()
  loading.value = false
  refreshing.value = false
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
  <div class="dashboard-page">
    <header class="page-head drag-region">
      <div>
        <h1>仪表盘</h1>
        <p>{{ user?.username || 'LinAI 用户' }}，这是最近 7 天的服务概览。</p>
      </div>
      <div class="head-actions no-drag">
        <span>{{ updateLabel }}</span>
        <button
          class="icon-button"
          type="button"
          title="刷新数据"
          aria-label="刷新数据"
          :disabled="refreshing"
          @click="load(true)"
        >
          <RefreshCw :size="17" :class="{ spinning: refreshing }" />
        </button>
      </div>
    </header>

    <div v-if="issues.length" class="refresh-notice" data-testid="refresh-notice" role="status">
      <Activity :size="16" />
      <span>部分数据未更新：{{ issues.join('、') }}</span>
    </div>

    <div v-if="loading" class="dashboard-loading" aria-label="正在加载仪表盘">
      <div class="loading-strip" />
      <div class="loading-line" />
      <div class="loading-panel" />
    </div>

    <template v-else>
      <MetricStrip :items="metricItems" />

      <section class="health-strip" aria-label="实时运行指标">
        <div class="health-state">
          <span class="pulse" aria-hidden="true" />
          <strong>服务运行中</strong>
        </div>
        <dl>
          <div>
            <dt><Gauge :size="14" /> RPM</dt>
            <dd>{{ formatNumber(stats?.rpm) }}</dd>
          </div>
          <div>
            <dt><Activity :size="14" /> TPM</dt>
            <dd>{{ formatCount(stats?.tpm) }}</dd>
          </div>
          <div>
            <dt><Clock3 :size="14" /> 平均耗时</dt>
            <dd>{{ formatDuration(stats?.average_duration_ms) }}</dd>
          </div>
          <div>
            <dt><UsersRound :size="14" /> 并发上限</dt>
            <dd>{{ formatNumber(user?.concurrency) }}</dd>
          </div>
          <div>
            <dt><KeyRound :size="14" /> 活跃 Key</dt>
            <dd>{{ formatNumber(stats?.active_api_keys) }} / {{ formatNumber(stats?.total_api_keys) }}</dd>
          </div>
        </dl>
      </section>

      <section class="data-panel trend-panel">
        <header class="section-head">
          <div>
            <h2>请求趋势</h2>
            <p>每日成功计入的请求数量</p>
          </div>
          <span>近 7 天</span>
        </header>
        <TrendChart :points="trend" />
      </section>

      <div class="lower-grid">
        <section class="data-panel models-panel">
          <header class="section-head">
            <div>
              <h2>模型用量</h2>
              <p>按请求数量排序</p>
            </div>
            <span>Top {{ topModels.length }}</span>
          </header>

          <div v-if="topModels.length === 0" class="section-empty">
            <strong>还没有模型数据</strong>
            <span>发起调用后，模型排行会显示在这里。</span>
          </div>
          <ol v-else class="model-list">
            <li v-for="(model, index) in topModels" :key="model.model">
              <span class="model-rank">{{ index + 1 }}</span>
              <div class="model-body">
                <div class="model-line">
                  <strong :title="model.model">{{ model.model }}</strong>
                  <span>{{ formatCount(model.requests) }} 次</span>
                </div>
                <div class="usage-track" aria-hidden="true">
                  <span :style="{ width: `${Math.max(model.share, 2)}%` }" />
                </div>
                <div class="model-meta">
                  <span>{{ formatCount(model.total_tokens) }} tokens</span>
                  <span v-if="!isSimpleMode">{{ formatCost(model.actual_cost) }}</span>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section class="data-panel platform-panel">
          <header class="section-head">
            <div>
              <h2>平台分布</h2>
              <p>累计用量</p>
            </div>
          </header>

          <div v-if="platformRows.length === 0" class="section-empty">
            <strong>还没有平台数据</strong>
            <span>平台用量会随调用自动汇总。</span>
          </div>
          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>平台</th>
                  <th>请求</th>
                  <th>Token</th>
                  <th v-if="!isSimpleMode">消费</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in platformRows" :key="row.platform">
                  <td><span class="platform-mark" />{{ formatPlatform(row.platform) }}</td>
                  <td>{{ formatCount(row.total_requests) }}</td>
                  <td>{{ formatCount(row.total_tokens) }}</td>
                  <td v-if="!isSimpleMode">{{ formatCost(row.total_actual_cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section v-if="!isSimpleMode" class="token-ledger">
        <header>
          <h2>Token 构成</h2>
          <span>累计</span>
        </header>
        <dl>
          <div><dt>输入</dt><dd>{{ formatNumber(stats?.total_input_tokens) }}</dd></div>
          <div><dt>输出</dt><dd>{{ formatNumber(stats?.total_output_tokens) }}</dd></div>
          <div><dt>缓存写入</dt><dd>{{ formatNumber(stats?.total_cache_creation_tokens) }}</dd></div>
          <div><dt>缓存读取</dt><dd>{{ formatNumber(stats?.total_cache_read_tokens) }}</dd></div>
        </dl>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  min-width: 0;
  max-width: 1440px;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
  padding: 0 30px 36px;
}

.page-head {
  display: flex;
  min-height: 92px;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 28px 0 8px;
}

.page-head h1 {
  font-size: 23px;
  font-weight: 700;
}

.page-head p {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 13px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head-actions > span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.icon-button {
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  color: var(--text-secondary);
  place-items: center;
}

.icon-button:hover:not(:disabled) {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.refresh-notice {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 12px;
  background: var(--warning-soft);
  border: 1px solid var(--warning-border);
  border-radius: 7px;
  color: var(--warning);
  font-size: 12px;
}

.dashboard-loading {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.loading-strip,
.loading-line,
.loading-panel {
  background: var(--skeleton);
  border-radius: var(--radius-md);
  animation: breathe 1.4s ease-in-out infinite alternate;
}

.loading-strip { height: 116px; }
.loading-line { height: 54px; }
.loading-panel { height: 330px; }

.health-strip {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 24px;
  padding: 0 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.health-state {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  color: var(--success);
  font-size: 12px;
}

.pulse {
  width: 7px;
  height: 7px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--success-soft);
}

.health-strip dl {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 0;
}

.health-strip dl > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.health-strip dt {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 11px;
  white-space: nowrap;
}

.health-strip dd {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  white-space: nowrap;
}

.data-panel {
  padding: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.section-head h2,
.token-ledger h2 {
  font-size: 14px;
  font-weight: 680;
}

.section-head p {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.section-head > span,
.token-ledger header > span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.lower-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.model-rank {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  background: var(--bg-base);
  border-radius: 6px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 10px;
  place-items: center;
}

.model-body {
  min-width: 0;
  flex: 1;
}

.model-line,
.model-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.model-line strong {
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-line span,
.model-meta {
  color: var(--text-tertiary);
  font-size: 10px;
}

.usage-track {
  height: 4px;
  margin: 7px 0 5px;
  overflow: hidden;
  background: var(--bg-inset);
  border-radius: 2px;
}

.usage-track span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  padding: 0 0 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 560;
  text-align: right;
}

th:first-child { text-align: left; }

td {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

td:first-child {
  font-family: var(--font-sans);
  text-align: left;
}

tbody tr:last-child td { border-bottom: 0; }

.platform-mark {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  background: var(--cyan);
  border-radius: 2px;
}

.section-empty {
  display: flex;
  min-height: 160px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-align: center;
}

.section-empty strong {
  font-size: 12px;
  font-weight: 620;
}

.section-empty span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.token-ledger {
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 16px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.token-ledger header {
  display: flex;
  min-width: 94px;
  flex-direction: column;
}

.token-ledger dl {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.token-ledger dl > div {
  padding: 0 18px;
  border-left: 1px solid var(--border-subtle);
}

.token-ledger dt {
  color: var(--text-tertiary);
  font-size: 10px;
}

.token-ledger dd {
  margin: 3px 0 0;
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.spinning { animation: spin 800ms linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { to { opacity: 0.55; } }

@media (max-width: 1080px) {
  .health-strip { gap: 14px; }
  .health-strip dl { gap: 10px; }
  .health-strip dt svg { display: none; }
  .lower-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .loading-strip,
  .loading-line,
  .loading-panel {
    animation: none;
  }
}
</style>
