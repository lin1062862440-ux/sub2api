<script setup lang="ts">
/**
 * Dashboard: balance, today's usage, live rate, trend and per-model breakdown.
 *
 * The three requests are independent, so they run concurrently and each degrades
 * on its own — a failing model breakdown does not blank out the headline stats.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as api from '@/api'
import type { DashboardStats, ModelStat, TrendPoint } from '@/api'
import { ApiError } from '@/lib/http'
import { formatCost, formatCount, formatDuration, formatNumber, formatPlatform } from '@/lib/format'
import { refreshUser, session } from '@/stores/session'
import StatCard from '@/components/StatCard.vue'
import TrendChart from '@/components/TrendChart.vue'

const stats = ref<DashboardStats | null>(null)
const trend = ref<TrendPoint[]>([])
const models = ref<ModelStat[]>([])
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')

const user = computed(() => session.user)
const isSimpleMode = computed(() => session.runMode === 'simple')

/** Trend and model breakdown both cover the trailing 7 days including today. */
function dateRange(): { start_date: string; end_date: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { start_date: iso(start), end_date: iso(end) }
}

const topModels = computed(() => {
  const total = models.value.reduce((sum, model) => sum + (model.requests ?? 0), 0)
  return models.value.slice(0, 6).map((model) => ({
    ...model,
    share: total > 0 ? (model.requests / total) * 100 : 0,
  }))
})

const platformRows = computed(() =>
  (stats.value?.by_platform ?? []).filter((row) => row.total_requests > 0)
)

async function load(isRefresh = false) {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''

  const range = dateRange()
  const [statsResult, trendResult, modelsResult] = await Promise.allSettled([
    api.getDashboardStats(),
    api.getDashboardTrend({ ...range, granularity: 'day' }),
    api.getDashboardModels({ ...range, limit: 10 }),
  ])

  if (statsResult.status === 'fulfilled') {
    stats.value = statsResult.value
  } else {
    const reason = statsResult.reason
    error.value =
      reason instanceof ApiError && reason.status === 0
        ? '无法连接到服务器'
        : reason instanceof ApiError
          ? reason.message
          : '加载失败'
  }

  trend.value = trendResult.status === 'fulfilled' ? (trendResult.value.trend ?? []) : []
  models.value = modelsResult.status === 'fulfilled' ? (modelsResult.value.models ?? []) : []

  // Balance lives on the user record, not in the stats payload.
  try {
    await refreshUser()
  } catch {
    // A stale balance is better than a broken page.
  }

  loading.value = false
  refreshing.value = false
}

let timer: number | undefined

onMounted(() => {
  void load()
  // RPM/TPM are 5-minute rolling values; a one-minute poll keeps them current
  // without hammering the backend.
  timer = window.setInterval(() => void load(true), 60_000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <header class="head drag-region">
      <div class="no-drag">
        <h1>仪表盘</h1>
        <p class="sub">{{ user?.username }} · 近 7 天概览</p>
      </div>
      <button class="btn btn-ghost no-drag" type="button" :disabled="refreshing" @click="load(true)">
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

    <div v-if="loading" class="skeleton-grid">
      <div v-for="n in 4" :key="n" class="skeleton" />
    </div>

    <template v-else>
      <section class="stats">
        <StatCard
          v-if="!isSimpleMode"
          accent
          label="账户余额"
          :value="formatCost(user?.balance)"
          :hint="user?.frozen_balance ? `冻结 ${formatCost(user.frozen_balance)}` : undefined"
        />
        <StatCard
          label="今日请求"
          :value="formatCount(stats?.today_requests)"
          :hint="`累计 ${formatCount(stats?.total_requests)}`"
        />
        <StatCard
          label="今日 Token"
          :value="formatCount(stats?.today_tokens)"
          :hint="`累计 ${formatCount(stats?.total_tokens)}`"
        />
        <StatCard
          v-if="!isSimpleMode"
          label="今日消费"
          :value="formatCost(stats?.today_actual_cost)"
          :hint="`累计 ${formatCost(stats?.total_actual_cost)}`"
        />
        <StatCard
          v-else
          label="API Key"
          :value="formatNumber(stats?.active_api_keys)"
          :hint="`共 ${formatNumber(stats?.total_api_keys)} 个`"
        />
      </section>

      <section class="live">
        <div class="live-item">
          <span class="live-label">RPM</span>
          <span class="live-value">{{ formatNumber(stats?.rpm) }}</span>
        </div>
        <div class="live-item">
          <span class="live-label">TPM</span>
          <span class="live-value">{{ formatCount(stats?.tpm) }}</span>
        </div>
        <div class="live-item">
          <span class="live-label">平均耗时</span>
          <span class="live-value">{{ formatDuration(stats?.average_duration_ms) }}</span>
        </div>
        <div class="live-item">
          <span class="live-label">并发上限</span>
          <span class="live-value">{{ formatNumber(user?.concurrency) }}</span>
        </div>
        <div class="live-item">
          <span class="live-label">活跃 Key</span>
          <span class="live-value">
            {{ formatNumber(stats?.active_api_keys) }} / {{ formatNumber(stats?.total_api_keys) }}
          </span>
        </div>
      </section>

      <section class="card block">
        <div class="block-head">
          <h2>请求趋势</h2>
          <span class="block-hint">近 7 天</span>
        </div>
        <TrendChart :points="trend" />
      </section>

      <div class="split">
        <section class="card block">
          <div class="block-head">
            <h2>模型用量</h2>
            <span class="block-hint">近 7 天 Top {{ topModels.length }}</span>
          </div>

          <div v-if="topModels.length === 0" class="empty">暂无数据</div>
          <ul v-else class="model-list">
            <li v-for="model in topModels" :key="model.model" class="model-row">
              <div class="model-head">
                <span class="model-name" :title="model.model">{{ model.model }}</span>
                <span class="model-count">{{ formatCount(model.requests) }}</span>
              </div>
              <div class="bar">
                <div class="bar-fill" :style="{ width: `${Math.max(model.share, 1.5)}%` }" />
              </div>
              <div class="model-meta">
                <span>{{ formatCount(model.total_tokens) }} tokens</span>
                <span v-if="!isSimpleMode">{{ formatCost(model.actual_cost) }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="card block">
          <div class="block-head">
            <h2>平台分布</h2>
            <span class="block-hint">累计</span>
          </div>

          <div v-if="platformRows.length === 0" class="empty">暂无数据</div>
          <table v-else class="table">
            <thead>
              <tr>
                <th>平台</th>
                <th class="num">请求</th>
                <th class="num">Token</th>
                <th v-if="!isSimpleMode" class="num">消费</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in platformRows" :key="row.platform">
                <td>{{ formatPlatform(row.platform) }}</td>
                <td class="num">{{ formatCount(row.total_requests) }}</td>
                <td class="num">{{ formatCount(row.total_tokens) }}</td>
                <td v-if="!isSimpleMode" class="num">{{ formatCost(row.total_actual_cost) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section v-if="!isSimpleMode" class="card block">
        <div class="block-head">
          <h2>Token 明细</h2>
          <span class="block-hint">累计</span>
        </div>
        <div class="token-grid">
          <div class="token-item">
            <span class="token-label">输入</span>
            <span class="token-value">{{ formatNumber(stats?.total_input_tokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">输出</span>
            <span class="token-value">{{ formatNumber(stats?.total_output_tokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">缓存写入</span>
            <span class="token-value">{{ formatNumber(stats?.total_cache_creation_tokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">缓存读取</span>
            <span class="token-value">{{ formatNumber(stats?.total_cache_read_tokens) }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 28px 28px;
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  /* Clears the overlay title bar and doubles as the window drag strip. */
  padding: 30px 0 4px;
}

h1 {
  font-size: 20px;
}

.sub {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.live {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  padding: 14px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.live-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.live-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.live-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.block {
  padding: 18px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

h2 {
  font-size: 14px;
}

.block-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.model-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-count {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.bar {
  height: 4px;
  background: var(--bg-inset);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #7b5cff);
  border-radius: 2px;
}

.model-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-align: left;
}

.table td {
  padding: 9px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.token-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  background: var(--bg-inset);
  border-radius: var(--radius-sm);
}

.token-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.token-value {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.empty {
  padding: 28px 0;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.skeleton {
  height: 92px;
  background: linear-gradient(90deg, var(--bg-surface), var(--bg-surface-hover), var(--bg-surface));
  background-size: 200% 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
