<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  Clock3,
  RefreshCw,
  Server,
  UsersRound,
  WalletCards,
} from '@lucide/vue'

import { getAdminDashboardRealtime, getAdminDashboardSnapshot } from '@/api/admin/dashboard'
import type {
  AdminDashboardRealtime,
  AdminDashboardSnapshot,
} from '@/api/admin/types'
import TrendChart from '@/components/TrendChart.vue'
import { formatCost, formatCount, formatDateTime, formatDuration, formatNumber } from '@/lib/format'

type RangeDays = 7 | 30

const rangeDays = ref<RangeDays>(7)
const snapshot = ref<AdminDashboardSnapshot | null>(null)
const realtime = ref<AdminDashboardRealtime | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const coreError = ref('')
const partialIssues = ref<string[]>([])

const stats = computed(() => snapshot.value?.stats)
const attentionCount = computed(() => (
  (stats.value?.error_accounts ?? 0)
  + (stats.value?.ratelimit_accounts ?? 0)
  + (stats.value?.overload_accounts ?? 0)
))
const healthyPercent = computed(() => {
  const total = stats.value?.total_accounts ?? 0
  return total ? Math.round(((stats.value?.normal_accounts ?? 0) / total) * 100) : 0
})
const healthGradient = computed(() => (
  `conic-gradient(#27a06b 0 ${healthyPercent.value}%, #edf1f5 ${healthyPercent.value}% 100%)`
))
const topModels = computed(() => {
  const models = [...(snapshot.value?.models ?? [])].sort((a, b) => b.requests - a.requests).slice(0, 5)
  const peak = Math.max(1, ...models.map((item) => item.requests))
  return models.map((item) => ({ ...item, share: (item.requests / peak) * 100 }))
})
const topGroups = computed(() => {
  const groups = [...(snapshot.value?.groups ?? [])].sort((a, b) => b.requests - a.requests).slice(0, 5)
  const total = Math.max(1, groups.reduce((sum, item) => sum + item.requests, 0))
  return groups.map((item) => ({ ...item, share: (item.requests / total) * 100 }))
})
const updatedLabel = computed(() => formatDateTime(snapshot.value?.generated_at))

function dateRange(days: RangeDays) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  const date = (value: Date) => value.toISOString().slice(0, 10)
  return { start_date: date(start), end_date: date(end), granularity: 'day' as const }
}

async function load(background = false) {
  if (background) refreshing.value = true
  else loading.value = true

  coreError.value = ''
  partialIssues.value = []
  const [snapshotResult, realtimeResult] = await Promise.allSettled([
    getAdminDashboardSnapshot(dateRange(rangeDays.value)),
    getAdminDashboardRealtime(),
  ])

  if (snapshotResult.status === 'fulfilled') snapshot.value = snapshotResult.value
  else coreError.value = '管理数据加载失败，请检查网络后重试。'

  if (realtimeResult.status === 'fulfilled') realtime.value = realtimeResult.value
  else partialIssues.value.push('实时状态')

  loading.value = false
  refreshing.value = false
}

function changeRange(days: RangeDays) {
  if (rangeDays.value === days) return
  rangeDays.value = days
  void load(true)
}

let refreshTimer: number | undefined
onMounted(() => {
  void load()
  refreshTimer = window.setInterval(() => void load(true), 60_000)
})
onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="admin-dashboard" :class="{ refreshing }">
    <header class="admin-header drag-region">
      <div>
        <span class="header-eyebrow">ADMIN WORKSPACE</span>
        <h1>管理概览</h1>
        <p>关注平台负载、账号健康与全站用量变化。</p>
      </div>
      <div class="header-actions no-drag">
        <span v-if="snapshot">更新于 {{ updatedLabel }}</span>
        <div class="range-switch" aria-label="统计时间范围">
          <button v-for="days in [7, 30] as RangeDays[]" :key="days" type="button" :aria-pressed="rangeDays === days" @click="changeRange(days)">
            {{ days }}天
          </button>
        </div>
        <button class="refresh-button" type="button" title="刷新管理数据" :disabled="refreshing" @click="load(true)">
          <RefreshCw :size="17" :class="{ spinning: refreshing }" />
        </button>
      </div>
    </header>

    <div v-if="partialIssues.length" class="partial-warning" data-testid="partial-warning" role="status">
      <AlertTriangle :size="16" />
      <span>{{ partialIssues.join('、') }}暂时不可用，其他数据已正常更新。</span>
    </div>

    <div v-if="loading && !snapshot" class="dashboard-loading" data-testid="admin-dashboard-loading" aria-label="正在加载管理概览">
      <div v-for="index in 4" :key="index" class="loading-metric"><i /><span /><strong /></div>
      <div class="loading-wide"><span /><i v-for="line in 6" :key="line" /></div>
      <div class="loading-panel"><span /><i v-for="line in 4" :key="line" /></div>
    </div>

    <div v-else-if="coreError && !snapshot" class="dashboard-error" data-testid="admin-dashboard-error">
      <span><AlertTriangle :size="24" /></span>
      <h2>管理数据加载失败</h2>
      <p>{{ coreError }}</p>
      <button type="button" data-testid="retry-dashboard" @click="load()">
        <RefreshCw :size="16" />
        重新加载
      </button>
    </div>

    <main v-else-if="snapshot" class="dashboard-content">
      <section class="metric-grid" aria-label="平台关键指标">
        <article class="metric-card users-card" data-testid="metric-users">
          <span class="metric-icon"><UsersRound :size="19" /></span>
          <div><span>总用户</span><strong>{{ formatNumber(stats?.total_users) }}</strong></div>
          <em>今日 +{{ formatNumber(stats?.today_new_users) }}</em>
        </article>
        <article class="metric-card" data-testid="metric-today-cost">
          <span class="metric-icon cost"><WalletCards :size="19" /></span>
          <div><span>今日实际消费</span><strong>{{ formatCost(stats?.today_actual_cost) }}</strong></div>
          <em>账号成本 {{ formatCost(stats?.today_account_cost) }}</em>
        </article>
        <article class="metric-card" data-testid="metric-active-requests">
          <span class="metric-icon live"><Activity :size="19" /></span>
          <div><span>实时请求</span><strong>{{ formatNumber(realtime?.active_requests) }}</strong></div>
          <em>{{ formatNumber(realtime?.requests_per_minute ?? stats?.rpm) }} RPM</em>
        </article>
        <article class="metric-card">
          <span class="metric-icon duration"><Clock3 :size="19" /></span>
          <div><span>平均响应</span><strong>{{ formatDuration(realtime?.average_response_time ?? stats?.average_duration_ms) }}</strong></div>
          <em>错误率 {{ realtime ? `${realtime.error_rate.toFixed(1)}%` : '—' }}</em>
        </article>
      </section>

      <section class="overview-grid">
        <article class="surface trend-surface">
          <header class="section-header">
            <div><h2>全站请求趋势</h2><p>请求数与 Token 变化</p></div>
            <span>{{ snapshot.start_date }} 至 {{ snapshot.end_date }}</span>
          </header>
          <TrendChart :points="snapshot.trend ?? []" />
        </article>

        <article class="surface health-surface" data-testid="account-health">
          <header class="section-header"><div><h2>账号健康</h2><p>当前可调度状态</p></div><Server :size="18" /></header>
          <div class="health-visual">
            <div class="health-ring" :style="{ background: healthGradient }">
              <div><strong>{{ healthyPercent }}%</strong><span>健康率</span></div>
            </div>
            <div class="health-summary">
              <div><span>正常</span><strong>{{ formatNumber(stats?.normal_accounts) }}</strong></div>
              <div><span>总账号</span><strong>{{ formatNumber(stats?.total_accounts) }}</strong></div>
            </div>
          </div>
          <div class="attention-row">
            <div><span>错误</span><strong>{{ formatNumber(stats?.error_accounts) }}</strong></div>
            <div><span>限流</span><strong>{{ formatNumber(stats?.ratelimit_accounts) }}</strong></div>
            <div><span>过载</span><strong>{{ formatNumber(stats?.overload_accounts) }}</strong></div>
          </div>
          <div class="attention-total" :class="{ clear: attentionCount === 0 }">
            <AlertTriangle :size="16" />
            <span>需要关注</span>
            <strong data-testid="attention-count">{{ attentionCount }}</strong>
          </div>
        </article>
      </section>

      <section class="ranking-grid">
        <article class="surface ranking-surface">
          <header class="section-header"><div><h2>模型用量</h2><p>按请求量排序</p></div><span>Top {{ topModels.length }}</span></header>
          <div v-if="!topModels.length" class="empty-state">暂无模型用量</div>
          <ol v-else class="ranking-list">
            <li v-for="(model, index) in topModels" :key="model.model">
              <span class="rank">{{ index + 1 }}</span>
              <div><strong>{{ model.model }}</strong><i><b :style="{ width: `${model.share}%` }" /></i></div>
              <span>{{ formatCount(model.requests) }}</span>
              <em>{{ formatCost(model.actual_cost) }}</em>
            </li>
          </ol>
        </article>

        <article class="surface ranking-surface">
          <header class="section-header"><div><h2>分组分布</h2><p>所选时间范围</p></div><span>{{ formatCount(stats?.today_requests) }} 今日请求</span></header>
          <div v-if="!topGroups.length" class="empty-state">暂无分组用量</div>
          <ol v-else class="group-list">
            <li v-for="group in topGroups" :key="group.group_id">
              <div><strong>{{ group.group_name }}</strong><span>{{ group.share.toFixed(1) }}%</span></div>
              <i><b :style="{ width: `${group.share}%` }" /></i>
              <footer><span>{{ formatCount(group.requests) }} 次请求</span><em>{{ formatCost(group.actual_cost) }}</em></footer>
            </li>
          </ol>
        </article>
      </section>
    </main>
  </div>
</template>

<style scoped>
.admin-dashboard { width:100%; min-height:100%; padding:28px 30px 34px; overflow:auto; color:var(--text-primary); }
.admin-header { display:flex; min-height:74px; align-items:flex-end; justify-content:space-between; gap:24px; }
.header-eyebrow { display:block; margin-bottom:5px; color:var(--accent); font-size:11px; font-weight:720; letter-spacing:.08em; }
.admin-header h1 { margin:0; font-size:25px; line-height:1.15; letter-spacing:0; }
.admin-header p { margin:7px 0 0; color:var(--text-secondary); font-size:14px; }
.header-actions { display:flex; align-items:center; gap:10px; }
.header-actions > span { color:var(--text-tertiary); font-size:12px; white-space:nowrap; }
.range-switch { display:flex; height:34px; padding:3px; background:rgba(229,235,244,.82); border:1px solid rgba(205,215,229,.9); border-radius:7px; }
.range-switch button { min-width:48px; padding:0 10px; border:0; border-radius:5px; background:transparent; color:var(--text-secondary); font-size:13px; cursor:pointer; }
.range-switch button[aria-pressed="true"] { background:white; color:var(--accent-strong); box-shadow:0 2px 7px rgba(44,64,92,.1); font-weight:650; }
.refresh-button { display:grid; width:34px; height:34px; padding:0; border:1px solid var(--border-subtle); border-radius:7px; background:rgba(255,255,255,.76); color:var(--text-secondary); cursor:pointer; place-items:center; }
.refresh-button:hover { color:var(--accent); border-color:rgba(71,117,207,.42); }
.refresh-button:disabled { cursor:default; opacity:.6; }
.partial-warning { display:flex; min-height:38px; align-items:center; gap:8px; margin-top:15px; padding:8px 12px; background:#fff8e8; border:1px solid #f2dfad; border-radius:7px; color:#8b6317; font-size:13px; }
.dashboard-content { display:grid; gap:14px; margin-top:20px; }
.metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.metric-card { position:relative; display:grid; min-width:0; min-height:92px; grid-template-columns:40px minmax(0,1fr); grid-template-rows:1fr auto; align-items:center; gap:0 12px; padding:14px 15px; overflow:hidden; background:rgba(255,255,255,.77); border:1px solid rgba(205,216,231,.92); border-radius:8px; box-shadow:0 6px 18px rgba(31,51,78,.045); animation:admin-enter 480ms var(--motion-ease-out) both; }
.metric-card:nth-child(2) { animation-delay:55ms; }.metric-card:nth-child(3) { animation-delay:110ms; }.metric-card:nth-child(4) { animation-delay:165ms; }
.metric-card:hover { border-color:rgba(83,126,205,.42); transform:translateY(-2px); box-shadow:0 10px 24px rgba(31,51,78,.08); }
.metric-icon { display:grid; width:38px; height:38px; grid-row:1 / 3; background:#e9f0ff; border-radius:9px; color:#356bcc; place-items:center; }
.metric-icon.cost { background:#e9f8f1; color:#22845c; }.metric-icon.live { background:#f1edff; color:#704bd1; }.metric-icon.duration { background:#fff2e8; color:#ba6429; }
.metric-card > div { display:grid; min-width:0; grid-template-columns:minmax(0,1fr) auto; align-items:baseline; gap:8px; }
.metric-card > div span { overflow:hidden; color:var(--text-secondary); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.metric-card > div strong { font-family:var(--font-data); font-size:22px; font-variant-numeric:tabular-nums; }
.metric-card > em { grid-column:2; color:var(--text-tertiary); font-size:12px; font-style:normal; }
.overview-grid { display:grid; min-height:312px; grid-template-columns:minmax(0,1.85fr) minmax(250px,.72fr); gap:14px; }
.surface { min-width:0; overflow:hidden; background:rgba(255,255,255,.76); border:1px solid rgba(205,216,231,.92); border-radius:8px; box-shadow:0 7px 22px rgba(31,51,78,.045); }
.trend-surface { display:flex; min-height:312px; flex-direction:column; padding:18px 20px 12px; animation:admin-enter 520ms var(--motion-ease-out) 90ms both; }
.section-header { display:flex; min-height:42px; align-items:flex-start; justify-content:space-between; gap:14px; }
.section-header h2 { margin:0; font-size:16px; font-weight:690; }.section-header p { margin:4px 0 0; color:var(--text-tertiary); font-size:12px; }
.section-header > span,.section-header > svg { color:var(--text-tertiary); font-family:var(--font-data); font-size:12px; }
.health-surface { padding:18px; animation:admin-enter 520ms var(--motion-ease-out) 150ms both; }
.health-visual { display:grid; grid-template-columns:116px minmax(0,1fr); align-items:center; gap:17px; margin-top:13px; }
.health-ring { display:grid; width:112px; aspect-ratio:1; border-radius:50%; place-items:center; animation:ring-in 700ms var(--motion-ease-out) both; }
.health-ring > div { display:grid; width:82px; aspect-ratio:1; background:white; border-radius:50%; place-content:center; text-align:center; box-shadow:inset 0 0 0 1px rgba(218,226,236,.85); }
.health-ring strong { font-family:var(--font-data); font-size:20px; }.health-ring span { margin-top:2px; color:var(--text-tertiary); font-size:11px; }
.health-summary { display:grid; gap:10px; }.health-summary div { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }.health-summary span { color:var(--text-secondary); font-size:12px; }.health-summary strong { font-family:var(--font-data); font-size:17px; }
.attention-row { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:15px; }.attention-row div { display:grid; gap:3px; padding:8px; background:var(--bg-base); border-radius:6px; }.attention-row span { color:var(--text-tertiary); font-size:11px; }.attention-row strong { font-family:var(--font-data); font-size:15px; }
.attention-total { display:flex; height:38px; align-items:center; gap:7px; margin-top:9px; padding:0 11px; background:#fff0ed; border:1px solid #f4ccc5; border-radius:6px; color:#af4938; font-size:12px; }.attention-total strong { margin-left:auto; font-family:var(--font-data); font-size:15px; }.attention-total.clear { background:#ecf8f2; border-color:#c6e8d7; color:#227a57; }
.ranking-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }.ranking-surface { min-height:220px; padding:18px 20px; animation:admin-enter 520ms var(--motion-ease-out) 210ms both; }
.ranking-list,.group-list { display:grid; gap:9px; margin:12px 0 0; padding:0; list-style:none; }
.ranking-list li { display:grid; grid-template-columns:22px minmax(0,1fr) 58px 68px; align-items:center; gap:10px; min-height:29px; font-size:12px; }.rank { display:grid; width:21px; height:21px; background:var(--bg-base); border-radius:5px; color:var(--text-tertiary); place-items:center; }.ranking-list li > div { display:grid; min-width:0; gap:5px; }.ranking-list strong { overflow:hidden; font-family:var(--font-data); font-size:12px; font-weight:620; text-overflow:ellipsis; white-space:nowrap; }.ranking-list i,.group-list i { display:block; height:4px; overflow:hidden; background:#edf1f6; border-radius:4px; }.ranking-list i b,.group-list i b { display:block; height:100%; background:linear-gradient(90deg,#3973da,#759eea); border-radius:inherit; transform-origin:left; animation:bar-in 620ms var(--motion-ease-out) both; }.ranking-list li > span:nth-last-child(2),.ranking-list em { color:var(--text-secondary); font-family:var(--font-data); font-style:normal; text-align:right; }
.group-list li { display:grid; gap:6px; }.group-list li > div,.group-list footer { display:flex; justify-content:space-between; gap:12px; }.group-list strong { font-size:13px; }.group-list span,.group-list em { color:var(--text-tertiary); font-size:12px; font-style:normal; }.group-list i b { background:linear-gradient(90deg,#7954d5,#aa8de8); }
.empty-state { display:grid; min-height:150px; color:var(--text-tertiary); font-size:13px; place-items:center; }
.dashboard-loading { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:20px; }.loading-metric,.loading-wide,.loading-panel { overflow:hidden; background:rgba(255,255,255,.72); border:1px solid var(--border-subtle); border-radius:8px; }.loading-metric { display:grid; min-height:92px; grid-template-columns:38px 1fr; gap:11px; padding:15px; }.loading-metric i { grid-row:1/3; border-radius:9px; }.loading-metric span { width:70%; }.loading-metric strong { width:48%; }.loading-wide { min-height:312px; grid-column:span 3; padding:20px; }.loading-panel { min-height:312px; padding:20px; }.dashboard-loading i,.dashboard-loading span,.dashboard-loading strong { display:block; height:13px; background:linear-gradient(90deg,#edf1f5 25%,#f8fafc 45%,#edf1f5 65%); background-size:240% 100%; border-radius:5px; animation:shimmer 1.15s linear infinite; }.loading-wide > span,.loading-panel > span { width:30%; margin-bottom:38px; }.loading-wide > i,.loading-panel > i { margin-top:22px; }
.dashboard-error { display:grid; min-height:calc(100vh - 170px); place-content:center; justify-items:center; color:var(--text-secondary); text-align:center; }.dashboard-error > span { display:grid; width:54px; height:54px; background:#fff0ed; border-radius:10px; color:#b74d3b; place-items:center; }.dashboard-error h2 { margin:15px 0 0; color:var(--text-primary); font-size:19px; }.dashboard-error p { margin:7px 0 18px; font-size:13px; }.dashboard-error button { display:flex; height:36px; align-items:center; gap:7px; padding:0 14px; border:0; border-radius:7px; background:var(--accent); color:white; cursor:pointer; }
.refreshing .surface,.refreshing .metric-card { opacity:.84; }.spinning { animation:spin .75s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } } @keyframes shimmer { to { background-position:-240% 0; } } @keyframes admin-enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } } @keyframes bar-in { from { transform:scaleX(0); } } @keyframes ring-in { from { opacity:0; transform:rotate(-24deg) scale(.9); } }
@container app-content (max-width: 960px) { .admin-dashboard { padding:24px; }.metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.overview-grid { grid-template-columns:minmax(0,1fr); }.health-surface { display:grid; grid-template-columns:minmax(220px,.7fr) minmax(0,1fr); gap:0 18px; }.health-surface .section-header { grid-column:1/-1; }.health-visual { margin-top:10px; }.attention-row { align-self:center; }.attention-total { grid-column:2; }.dashboard-loading { grid-template-columns:repeat(2,1fr); }.loading-wide { grid-column:1/-1; }.loading-panel { grid-column:1/-1; } }
@container app-content (max-width: 720px) { .admin-header { align-items:flex-start; flex-direction:column; }.header-actions { width:100%; }.header-actions > span { margin-right:auto; }.ranking-grid { grid-template-columns:minmax(0,1fr); }.health-surface { display:block; }.metric-card > div strong { font-size:20px; }.attention-total { margin-top:9px; } }
@media (prefers-reduced-motion: reduce) { .metric-card,.surface,.health-ring,.ranking-list i b,.group-list i b,.dashboard-loading * { animation:none !important; transition:none !important; transform:none !important; } }
</style>
