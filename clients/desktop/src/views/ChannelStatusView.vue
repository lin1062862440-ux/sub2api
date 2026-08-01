<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gauge,
  RefreshCw,
  ServerCog,
  TriangleAlert,
  X,
} from '@lucide/vue'

import * as api from '@/api'
import type { ChannelMonitor, ChannelMonitorDetail, MonitorStatus } from '@/api'
import attentionIconUrl from '@/assets/icons/channel-attention.svg'
import ProviderIcon from '@/components/ProviderIcon.vue'

const monitors = ref<ChannelMonitor[]>([])
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const lastUpdated = ref<Date | null>(null)
const selected = ref<ChannelMonitor | null>(null)
const detail = ref<ChannelMonitorDetail | null>(null)
const detailLoading = ref(false)
let loadSequence = 0
let detailSequence = 0

const attentionCount = computed(() => monitors.value.filter((item) => item.primary_status !== 'operational').length)
const operationalCount = computed(() => monitors.value.length - attentionCount.value)
const availability = computed(() => {
  if (!monitors.value.length) return 0
  return monitors.value.reduce((sum, item) => sum + item.availability_7d, 0) / monitors.value.length
})
const averageLatency = computed(() => {
  const values = monitors.value.flatMap((item) => item.primary_latency_ms == null ? [] : [item.primary_latency_ms])
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
})
const updateLabel = computed(() => lastUpdated.value
  ? `更新于 ${lastUpdated.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  : '等待检测数据')

function statusLabel(status: MonitorStatus) {
  return {
    operational: '运行正常',
    degraded: '响应偏慢',
    failed: '服务异常',
    error: '检测失败',
  }[status]
}

function providerLabel(provider: string) {
  return ({ anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', grok: 'Grok' } as Record<string, string>)[provider] ?? provider
}

function formatLatency(value: number | null) {
  return value == null ? '--' : `${value.toLocaleString()} ms`
}

function formatAvailability(value: number) {
  return `${value.toFixed(2)}%`
}

function signalHeight(latency: number | null, index: number) {
  if (latency == null) return '30%'
  return `${Math.max(30, Math.min(100, 38 + latency / 34 + (index % 4) * 5))}%`
}

async function load(isRefresh = false) {
  const current = ++loadSequence
  if (isRefresh) refreshing.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.getChannelMonitors()
    if (current !== loadSequence) return
    monitors.value = response.items ?? []
    lastUpdated.value = new Date()
  } catch (error) {
    if (current !== loadSequence) return
    errorMessage.value = error instanceof Error ? error.message : '渠道状态暂时无法获取'
  } finally {
    if (current === loadSequence) {
      loading.value = false
      refreshing.value = false
    }
  }
}

async function openDetail(item: ChannelMonitor) {
  selected.value = item
  detail.value = null
  detailLoading.value = true
  const current = ++detailSequence
  try {
    const response = await api.getChannelMonitorDetail(item.id)
    if (current === detailSequence) detail.value = response
  } catch {
    if (current === detailSequence) detail.value = null
  } finally {
    if (current === detailSequence) detailLoading.value = false
  }
}

function closeDetail() {
  detailSequence += 1
  selected.value = null
  detail.value = null
  detailLoading.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDetail()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  void load()
})

onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="channel-page" :class="{ 'is-loading': loading, 'is-loaded': !loading, 'is-refreshing': refreshing }">
    <header class="channel-head">
      <div>
        <h1>渠道状态</h1>
        <p>查看各模型线路的实时可用性与响应表现</p>
      </div>
      <div class="head-tools">
        <span>{{ updateLabel }}</span>
        <button class="icon-button" type="button" title="刷新渠道状态" aria-label="刷新渠道状态" :disabled="loading || refreshing" @click="load(true)">
          <RefreshCw :size="15" :class="{ spinning: refreshing }" />
        </button>
      </div>
    </header>

    <section class="status-toolbar" data-testid="channel-summary">
      <div class="overall-state" :class="{ attention: attentionCount > 0 }">
        <span class="state-icon">
          <CheckCircle2 v-if="attentionCount === 0" :size="18" />
          <img v-else :src="attentionIconUrl" width="24" height="24" alt="" />
        </span>
        <div>
          <strong>{{ loading ? '正在同步渠道状态' : attentionCount === 0 ? '所有线路运行正常' : `${attentionCount} 个需要关注` }}</strong>
          <span>{{ loading ? '读取最新检测结果' : `${operationalCount} / ${monitors.length} 个渠道可正常使用` }}</span>
        </div>
      </div>
      <div class="toolbar-metrics">
        <div><Activity :size="16" /><span>7 天可用率</span><strong>{{ !loading && monitors.length ? formatAvailability(availability) : '--' }}</strong></div>
        <div><Gauge :size="16" /><span>平均响应</span><strong>{{ loading ? '--' : formatLatency(averageLatency) }}</strong></div>
        <div><ServerCog :size="16" /><span>监测渠道</span><strong>{{ loading ? '--' : monitors.length }}</strong></div>
      </div>
    </section>

    <div v-if="errorMessage" class="inline-notice">
      <TriangleAlert :size="15" />
      <span>{{ errorMessage }}</span>
      <button type="button" @click="load()">重新加载</button>
    </div>

    <section v-if="loading" class="channel-grid" aria-label="正在加载渠道状态">
      <div v-for="index in 3" :key="index" class="channel-card skeleton-card">
        <i /><i /><i /><i /><i />
      </div>
    </section>

    <section v-else-if="monitors.length" class="channel-grid" aria-label="渠道列表">
      <button
        v-for="(item, index) in monitors"
        :key="item.id"
        class="channel-card"
        :class="`status-${item.primary_status}`"
        :style="{ '--entry-delay': `${index * 55}ms` }"
        type="button"
        :data-testid="`channel-card-${item.id}`"
        @click="openDetail(item)"
      >
        <header class="card-head">
          <div class="channel-identity">
            <span class="provider-mark" :class="`provider-${item.provider}`"><ProviderIcon :provider="item.provider" :size="24" /></span>
            <div>
              <strong>{{ item.name }}</strong>
              <span><b>{{ providerLabel(item.provider) }}</b>{{ item.primary_model }}</span>
            </div>
          </div>
          <span class="status-pill"><i />{{ statusLabel(item.primary_status) }}</span>
        </header>

        <div class="latency-pair">
          <div><span><Gauge :size="14" /> 对话延迟</span><strong>{{ formatLatency(item.primary_latency_ms) }}</strong></div>
          <div><span><ServerCog :size="14" /> 节点 PING</span><strong>{{ formatLatency(item.primary_ping_latency_ms) }}</strong></div>
        </div>

        <div class="availability-line">
          <span>可用率 · 7 天</span>
          <strong>{{ formatAvailability(item.availability_7d) }}</strong>
        </div>

        <div class="timeline-head"><span>最近 {{ Math.min(60, item.timeline.length) }} 次记录</span><span>过去 <i /> 现在</span></div>
        <div class="signal-strip" aria-label="最近检测结果">
          <i
            v-for="(point, pointIndex) in item.timeline.slice().reverse().slice(-60)"
            :key="`${point.checked_at}-${pointIndex}`"
            :class="`signal-${point.status}`"
            :style="{ height: signalHeight(point.latency_ms, pointIndex), '--signal-delay': `${pointIndex * 12}ms` }"
          />
        </div>

        <footer class="card-foot">
          <span>{{ item.group_name }} · {{ 1 + item.extra_models.length }} 个模型</span>
          <span>查看多周期明细 <ArrowUpRight :size="14" /></span>
        </footer>
      </button>
    </section>

    <section v-else-if="!errorMessage" class="empty-state">
      <Activity :size="26" />
      <strong>暂无渠道监测数据</strong>
      <span>平台尚未开启渠道监测，或当前没有对用户公开的线路。</span>
    </section>

    <div v-if="selected" class="detail-backdrop" @pointerdown.self="closeDetail">
      <aside class="detail-drawer" data-testid="channel-detail" aria-label="渠道状态详情">
        <header class="detail-head">
          <div>
            <span>{{ providerLabel(selected.provider) }} · {{ selected.group_name }}</span>
            <h2>{{ selected.name }}</h2>
          </div>
          <button type="button" title="关闭" aria-label="关闭" @click="closeDetail"><X :size="17" /></button>
        </header>

        <div class="detail-overview">
          <div><Activity :size="15" /><span>当前状态</span><strong>{{ statusLabel(selected.primary_status) }}</strong></div>
          <div><Gauge :size="15" /><span>响应耗时</span><strong>{{ formatLatency(selected.primary_latency_ms) }}</strong></div>
          <div><Clock3 :size="15" /><span>网络延迟</span><strong>{{ formatLatency(selected.primary_ping_latency_ms) }}</strong></div>
        </div>

        <div v-if="detailLoading" class="detail-loading"><i /><i /><i /></div>
        <div v-else-if="detail?.models.length" class="detail-models">
          <article v-for="model in detail.models" :key="model.model">
            <header><strong>{{ model.model }}</strong><span :class="`status-${model.latest_status}`">{{ statusLabel(model.latest_status) }}</span></header>
            <div class="window-grid">
              <div><span>7 天</span><strong>{{ formatAvailability(model.availability_7d) }}</strong></div>
              <div><span>15 天</span><strong>{{ formatAvailability(model.availability_15d) }}</strong></div>
              <div><span>30 天</span><strong>{{ formatAvailability(model.availability_30d) }}</strong></div>
            </div>
            <footer><span>7 天平均响应</span><strong>{{ formatLatency(model.avg_latency_7d_ms) }}</strong></footer>
          </article>
        </div>
        <div v-else class="detail-empty">多周期明细暂时不可用</div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.channel-page { position: relative; width: 100%; min-height: 100%; max-width: 1540px; margin: 0 auto; padding: 38px 32px 42px; }
.channel-head { display: flex; min-height: 58px; align-items: flex-start; justify-content: space-between; gap: 24px; }
.channel-head h1 { font-size: 28px; font-weight: 760; line-height: 1.15; }
.channel-head p { margin-top: 8px; color: var(--text-secondary); font-size: 14px; }
.head-tools { display: flex; align-items: center; gap: 12px; }
.head-tools > span { color: var(--text-tertiary); font-size: 14px; }
.icon-button { display: grid; width: 40px; height: 40px; padding: 0; background: white; border: 1px solid var(--border-strong); border-radius: 10px; color: var(--text-secondary); place-items: center; transition: border-color var(--motion-fast), color var(--motion-fast), transform var(--motion-fast); }
.icon-button:hover:not(:disabled) { border-color: #9bb5dd; color: var(--accent-strong); transform: translateY(-1px); }
.status-toolbar { display: flex; min-height: 76px; align-items: center; justify-content: space-between; gap: 24px; margin-top: 22px; padding: 12px 14px 12px 16px; background: white; border: 1px solid var(--border-subtle); border-radius: 12px; }
.overall-state { display: flex; min-width: 230px; align-items: center; gap: 12px; }
.state-icon { display: grid; width: 42px; height: 42px; flex: 0 0 auto; background: var(--success-soft); border-radius: 10px; color: var(--success); place-items: center; }
.overall-state.attention .state-icon { background: var(--warning-soft); color: var(--warning); }
.state-icon > img,.state-icon > svg { display: block; }
.overall-state > div strong,.overall-state > div span { display: block; }
.overall-state > div strong { font-size: 14px; font-weight: 720; }
.overall-state > div span { margin-top: 3px; color: var(--text-tertiary); font-size: 14px; }
.toolbar-metrics { display: flex; align-self: stretch; }
.toolbar-metrics > div { display: grid; min-width: 150px; grid-template-columns: 24px minmax(0,1fr); grid-template-rows: 20px 24px; align-content: center; padding: 0 18px; border-left: 1px solid var(--border-subtle); color: var(--text-tertiary); }
.toolbar-metrics svg { grid-row: 1 / 3; align-self: center; color: var(--accent); }
.toolbar-metrics span { font-size: 13px; }
.toolbar-metrics strong { overflow: hidden; color: var(--text-primary); font-size: 16px; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.inline-notice { display: flex; min-height: 42px; align-items: center; gap: 10px; margin-top: 14px; padding: 0 14px; background: var(--warning-soft); border: 1px solid var(--warning-border); border-radius: 10px; color: var(--warning); font-size: 14px; }
.inline-notice span { flex: 1; }
.inline-notice button { padding: 0; background: none; border: 0; color: inherit; font-weight: 700; }
.channel-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 18px; margin-top: 18px; }
.channel-card { position: relative; display: flex; min-width: 0; min-height: 350px; flex-direction: column; padding: 20px; overflow: hidden; background: white; border: 1px solid var(--border-subtle); border-radius: 14px; color: var(--text-primary); text-align: left; transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast), box-shadow var(--motion-standard); animation: channel-enter 620ms var(--motion-ease-out) var(--entry-delay,0ms) both; }
.channel-card:hover { border-color: #a8bddf; box-shadow: 0 6px 8px rgba(48,72,106,.08); transform: translateY(-4px); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.channel-identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.provider-mark { display: grid; width: 46px; height: 46px; flex: 0 0 auto; background: linear-gradient(135deg,#f3f4f6,#e5e7eb); border-radius: 11px; box-shadow: inset 0 0 0 1px rgba(15,23,42,.05); color: #667085; place-items: center; }
.provider-mark.provider-anthropic { background: linear-gradient(135deg,#fff7ed,#fef3c7); color: #ea580c; }
.provider-mark.provider-openai { background: linear-gradient(135deg,#ecfdf5,#d1fae5); color: #059669; }
.provider-mark.provider-gemini { background: linear-gradient(135deg,#f0f9ff,#e0e7ff); color: #0284c7; }
.provider-mark.provider-grok { background: linear-gradient(135deg,#fafafa,#e5e5e5); color: #3f3f46; }
.provider-mark > svg { display: block; color: inherit; }
.channel-identity > div { min-width: 0; }
.channel-identity > div strong,.channel-identity > div > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-identity > div strong { font-size: 17px; font-weight: 740; }
.channel-identity > div > span { display: flex; align-items: center; gap: 7px; margin-top: 4px; color: var(--text-tertiary); font-size: 14px; }
.channel-identity b { padding: 2px 7px; background: var(--bg-base); border-radius: 5px; color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.status-pill { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; padding: 5px 9px; background: var(--success-soft); border-radius: 999px; color: var(--success); font-size: 13px; font-weight: 680; }
.status-pill i { width: 6px; height: 6px; background: currentColor; border-radius: 50%; animation: status-pulse 1.8s ease-out infinite; }
.status-degraded .status-pill { background: var(--warning-soft); color: var(--warning); }
.status-failed .status-pill,.status-error .status-pill { background: var(--coral-soft); color: var(--danger); }
.latency-pair { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 22px; }
.latency-pair > div { min-width: 0; padding: 14px; background: #f7f9fc; border-radius: 10px; }
.latency-pair span { display: flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 13px; }
.latency-pair strong { display: block; margin-top: 8px; overflow: hidden; font-size: 18px; font-weight: 740; text-overflow: ellipsis; white-space: nowrap; }
.availability-line { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.availability-line span { color: var(--text-tertiary); font-size: 14px; }
.availability-line strong { color: var(--success); font-size: 30px; font-weight: 760; line-height: 1; }
.status-degraded .availability-line strong { color: #af7600; }
.status-failed .availability-line strong,.status-error .availability-line strong { color: var(--danger); }
.timeline-head { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; color: var(--text-tertiary); font-size: 12px; }
.timeline-head span:last-child { display: flex; align-items: center; gap: 6px; }
.timeline-head i { width: 28px; height: 1px; background: var(--border-strong); }
.signal-strip { display: flex; height: 38px; align-items: flex-end; gap: 2px; margin-top: 7px; overflow: hidden; }
.signal-strip i { min-width: 2px; flex: 1; background: var(--success); border-radius: 2px 2px 1px 1px; transform-origin: center bottom; animation: signal-rise 600ms var(--motion-ease-out) var(--signal-delay,0ms) both; }
.signal-strip .signal-degraded { background: #d59b24; }
.signal-strip .signal-failed,.signal-strip .signal-error { background: var(--danger); }
.card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 16px; color: var(--text-tertiary); font-size: 13px; }
.card-foot span:last-child { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-strong); font-size: 14px; font-weight: 650; }
.skeleton-card { display: grid; min-height: 350px; grid-template-rows: 46px 70px 42px 38px 20px; gap: 16px; pointer-events: none; animation: none; }
.skeleton-card i,.detail-loading i { background: linear-gradient(105deg,#e8edf4 30%,#f8fafd 48%,#e8edf4 66%); background-size: 220% 100%; border-radius: 8px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.skeleton-card i:nth-child(2) { margin-top: 8px; }
.skeleton-card i:nth-child(3) { width: 65%; }
.empty-state { display: flex; min-height: 340px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; margin-top: 18px; background: white; border-radius: 14px; color: var(--text-tertiary); text-align: center; }
.empty-state strong { color: var(--text-primary); font-size: 16px; }
.empty-state span { max-width: 420px; font-size: 14px; }
.detail-backdrop { position: fixed; z-index: 60; inset: 0; display: flex; justify-content: flex-end; background: rgba(35,47,66,.22); backdrop-filter: blur(4px); animation: backdrop-in 180ms ease-out both; }
.detail-drawer { width: min(500px,50vw); min-width: 420px; height: 100%; padding: 30px; overflow-y: auto; background: rgba(248,251,255,.96); box-shadow: -10px 0 28px rgba(32,48,70,.16); backdrop-filter: blur(18px); animation: drawer-in var(--motion-standard) var(--motion-ease-out) both; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-top: 12px; }
.detail-head span { color: var(--text-tertiary); font-size: 14px; }
.detail-head h2 { margin-top: 5px; font-size: 24px; font-weight: 750; }
.detail-head button { display: grid; width: 36px; height: 36px; padding: 0; background: white; border: 1px solid var(--border-strong); border-radius: 9px; color: var(--text-secondary); place-items: center; }
.detail-overview { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin-top: 24px; }
.detail-overview > div { display: grid; min-width: 0; grid-template-columns: 20px 1fr; grid-template-rows: 20px 24px; padding: 13px; background: white; border-radius: 10px; color: var(--text-tertiary); }
.detail-overview svg { grid-row: 1 / 3; align-self: center; color: var(--accent); }
.detail-overview span { font-size: 12px; }
.detail-overview strong { overflow: hidden; color: var(--text-primary); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.detail-loading { display: grid; gap: 12px; margin-top: 20px; }
.detail-loading i { display: block; height: 124px; }
.detail-models { display: grid; gap: 12px; margin-top: 20px; }
.detail-models article { padding: 17px; background: white; border: 1px solid var(--border-subtle); border-radius: 12px; animation: linai-surface-enter 420ms var(--motion-ease-out) both; }
.detail-models article > header,.detail-models article > footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.detail-models article > header strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.detail-models article > header span { padding: 4px 8px; background: var(--success-soft); border-radius: 999px; color: var(--success); font-size: 12px; }
.detail-models article > header span.status-degraded { background: var(--warning-soft); color: var(--warning); }
.detail-models article > header span.status-failed,.detail-models article > header span.status-error { background: var(--coral-soft); color: var(--danger); }
.window-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 15px; }
.window-grid > div { padding: 11px; background: var(--bg-base); border-radius: 8px; }
.window-grid span,.window-grid strong { display: block; }
.window-grid span { color: var(--text-tertiary); font-size: 12px; }
.window-grid strong { margin-top: 3px; font-size: 14px; }
.detail-models article > footer { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 13px; }
.detail-models article > footer strong { color: var(--text-secondary); }
.detail-empty { display: grid; min-height: 190px; color: var(--text-tertiary); font-size: 14px; place-items: center; }
.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes channel-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes signal-rise { from { opacity: .15; transform: scaleY(.08); } to { opacity: 1; transform: scaleY(1); } }
@keyframes status-pulse { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 4px transparent; } }
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes drawer-in { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
@container app-content (max-width: 1100px) { .channel-page { padding-right: 22px; padding-left: 22px; } .channel-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .toolbar-metrics > div { min-width: 132px; padding: 0 13px; } }
@container app-content (max-width: 860px) { .status-toolbar { align-items: stretch; flex-direction: column; } .toolbar-metrics > div:first-child { border-left: 0; } .channel-grid { grid-template-columns: 1fr; } .detail-drawer { width: min(500px,100vw); min-width: 0; max-width: 100%; } }
@container app-content (max-width: 700px) { .channel-page { padding-right: 16px; padding-left: 16px; } .channel-head { gap: 14px; } .head-tools > span { display: none; } .toolbar-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); } .toolbar-metrics > div { min-width: 0; } .detail-drawer { width: 100vw; padding: 22px; } .detail-overview,.window-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .channel-card,.signal-strip i,.status-pill i,.skeleton-card i,.detail-backdrop,.detail-drawer,.detail-models article,.spinning { animation: none; transform: none; } }
</style>
