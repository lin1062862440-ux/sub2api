<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CalendarClock,
  CircleGauge,
  Layers3,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  WalletCards,
} from '@lucide/vue'

import * as api from '@/api'
import type { SubscriptionGroup, UserSubscription } from '@/api'
import ProviderIcon from '@/components/ProviderIcon.vue'
import {
  formatSubscriptionDate as formatDate,
  isSubscriptionExhausted as isExhausted,
  isTeamSubscription,
  subscriptionProgress as progress,
  subscriptionQuotaWindows as quotaWindows,
  subscriptionStatusLabel as statusLabel,
} from '@/lib/subscription-display'

const subscriptions = ref<UserSubscription[]>([])
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
let loadSequence = 0

const orderedSubscriptions = computed(() => subscriptions.value.slice().sort((a, b) => {
  if (a.status === 'active' && b.status !== 'active') return -1
  if (a.status !== 'active' && b.status === 'active') return 1
  return Date.parse(b.updated_at) - Date.parse(a.updated_at)
}))
const activeCount = computed(() => subscriptions.value.filter((item) => item.status === 'active').length)
const exhaustedCount = computed(() => subscriptions.value.filter((item) => item.status === 'active' && isExhausted(item)).length)
const nextExpiry = computed(() => subscriptions.value
  .filter((item) => item.status === 'active' && item.expires_at)
  .sort((a, b) => Date.parse(a.expires_at!) - Date.parse(b.expires_at!))[0]?.expires_at ?? null)

function platformLabel(group?: SubscriptionGroup) {
  const platform = group?.platform ?? ''
  return ({ anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', antigravity: 'Antigravity', grok: 'Grok', composite: '混合线路' } as Record<string, string>)[platform] ?? (platform || '订阅线路')
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function daysRemaining(value: string | null) {
  if (!value) return null
  const remaining = Math.ceil((Date.parse(value) - Date.now()) / 86_400_000)
  return Math.max(0, remaining)
}

async function load(isRefresh = false) {
  const current = ++loadSequence
  if (isRefresh) refreshing.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.getSubscriptions()
    if (current === loadSequence) subscriptions.value = response ?? []
  } catch (error) {
    if (current === loadSequence) errorMessage.value = error instanceof Error ? error.message : '订阅信息暂时无法获取'
  } finally {
    if (current === loadSequence) {
      loading.value = false
      refreshing.value = false
    }
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="subscriptions-page" :class="{ 'is-loading': loading, 'is-loaded': !loading, 'is-refreshing': refreshing }">
    <header class="subscriptions-head">
      <div>
        <h1>我的订阅</h1>
        <p>掌握每个订阅的有效期、额度周期与实时使用进度</p>
      </div>
      <button class="icon-button" type="button" title="刷新订阅" aria-label="刷新订阅" :disabled="loading || refreshing" @click="load(true)">
        <RefreshCw :size="15" :class="{ spinning: refreshing }" />
      </button>
    </header>

    <section class="subscription-overview" data-testid="subscription-summary">
      <div class="overview-state">
        <span><Layers3 :size="20" /></span>
        <div><strong>{{ loading ? '正在同步订阅' : `${activeCount} 个有效订阅` }}</strong><small>{{ loading ? '读取额度与有效期' : exhaustedCount ? `${exhaustedCount} 个额度已用满` : '当前额度状态良好' }}</small></div>
      </div>
      <div class="overview-stats">
        <div class="active"><Sparkles :size="17" /><span>有效</span><strong>{{ loading ? '--' : activeCount }}</strong></div>
        <div class="exhausted"><CircleGauge :size="17" /><span>用满</span><strong>{{ loading ? '--' : exhaustedCount }}</strong></div>
        <div><WalletCards :size="17" /><span>总订阅</span><strong>{{ loading ? '--' : subscriptions.length }}</strong></div>
        <div class="expiry"><CalendarClock :size="17" /><span>最近到期</span><strong>{{ !loading && nextExpiry ? formatDate(nextExpiry) : '--' }}</strong></div>
      </div>
    </section>

    <div v-if="errorMessage" class="inline-notice">
      <TriangleAlert :size="15" /><span>{{ errorMessage }}</span><button type="button" @click="load()">重新加载</button>
    </div>

    <section v-if="loading" class="subscription-list" aria-label="正在加载订阅">
      <div v-for="index in 3" :key="index" class="subscription-card skeleton-card"><i /><i /><i /><i /><i /></div>
    </section>

    <section v-else-if="orderedSubscriptions.length" class="subscription-list" aria-label="订阅列表">
      <article
        v-for="(item, index) in orderedSubscriptions"
        :key="item.id"
        class="subscription-card"
        :class="[`subscription-${item.status}`, { exhausted: isExhausted(item) }]"
        :style="{ '--entry-delay': `${index * 65}ms` }"
      >
        <header class="card-head">
          <div class="subscription-identity">
            <span class="platform-mark" :class="`platform-${item.group?.platform || 'unknown'}`"><ProviderIcon :provider="item.group?.platform" :size="24" /></span>
            <div>
              <div class="title-line">
                <h2>{{ item.group?.name || `订阅 #${item.group_id}` }}</h2>
              </div>
              <p>{{ platformLabel(item.group) }} · 倍率 ×{{ item.group?.rate_multiplier ?? 1 }}</p>
            </div>
          </div>
          <div class="status-area">
            <span class="status-pill"><i />{{ statusLabel(item.status) }}</span>
            <span v-if="isExhausted(item)" class="full-pill">额度已用满</span>
          </div>
        </header>

        <div class="expiry-line">
          <CalendarClock :size="16" />
          <span>{{ item.status === 'active' ? '到期时间' : '有效期' }}</span>
          <strong>{{ formatDate(item.expires_at) }}</strong>
          <b v-if="item.status === 'active' && daysRemaining(item.expires_at) !== null">剩余 {{ daysRemaining(item.expires_at) }} 天</b>
        </div>

        <div class="subscription-body">
          <div class="quota-column">
            <template v-if="quotaWindows(item).length">
              <div v-for="window in quotaWindows(item)" :key="window.key" class="quota-row" :class="{ full: progress(window.used, window.limit) >= 100 }">
                <div class="quota-line">
                  <div><strong>{{ window.label }}</strong><span>{{ window.resetLabel }}</span></div>
                  <div><strong>{{ formatMoney(window.used) }} / {{ formatMoney(window.limit) }}</strong><span>{{ progress(window.used, window.limit).toFixed(0) }}%</span></div>
                </div>
                <div class="progress-track"><span :style="{ width: `${progress(window.used, window.limit)}%`, '--bar-delay': `${index * 80}ms` }" /></div>
              </div>
            </template>
            <div v-else-if="isTeamSubscription(item)" class="unlimited-quota team-unallocated" data-testid="subscription-team-unallocated">
              <div><strong>暂未分配团队额度</strong><p>请联系团队配额管理员分配本周额度。</p></div>
            </div>
            <div v-else class="unlimited-quota">
              <span>∞</span>
              <div><strong>无周期额度上限</strong><p>按订阅规则持续使用，不受日、周、月额度限制。</p></div>
            </div>
          </div>

        </div>
        <footer class="subscription-foot">
          <span>{{ item.group?.description || '该订阅已关联到你的账户' }}</span>
          <span>生效于 {{ formatDate(item.starts_at) }}</span>
        </footer>
      </article>
    </section>

    <section v-else-if="!errorMessage" class="empty-state" data-testid="subscriptions-empty">
      <Layers3 :size="27" />
      <strong>暂无订阅</strong>
      <span>获得订阅兑换码后，可前往兑换页面激活对应服务。</span>
      <a href="#/redeem">使用兑换码</a>
    </section>
  </div>
</template>

<style scoped>
.subscriptions-page { width: 100%; min-height: 100%; max-width: 1540px; margin: 0 auto; padding: 38px 32px 42px; }
.subscriptions-head { display: flex; min-height: 58px; align-items: flex-start; justify-content: space-between; gap: 24px; }
.subscriptions-head h1 { font-size: 28px; font-weight: 760; line-height: 1.15; }
.subscriptions-head p { margin-top: 8px; color: var(--text-secondary); font-size: 14px; }
.icon-button { display: grid; width: 40px; height: 40px; padding: 0; background: white; border: 1px solid var(--border-strong); border-radius: 10px; color: var(--text-secondary); place-items: center; transition: border-color var(--motion-fast),color var(--motion-fast),transform var(--motion-fast); }
.icon-button:hover:not(:disabled) { border-color: #9bb5dd; color: var(--accent-strong); transform: translateY(-1px); }
.subscription-overview { display: flex; min-height: 76px; align-items: stretch; justify-content: space-between; gap: 24px; margin-top: 22px; padding: 0 14px 0 16px; background: white; border: 1px solid var(--border-subtle); border-radius: 12px; }
.overview-state { display: flex; min-width: 230px; align-items: center; gap: 12px; }
.overview-state > span { display: grid; width: 42px; height: 42px; flex: 0 0 auto; background: #e8eeff; border-radius: 10px; color: #5369cf; place-items: center; }
.overview-state strong,.overview-state small { display: block; }
.overview-state strong { font-size: 14px; font-weight: 720; }
.overview-state small { margin-top: 3px; color: var(--text-tertiary); font-size: 14px; }
.overview-stats { display: flex; }
.overview-stats > div { display: grid; min-width: 116px; grid-template-columns: 24px 1fr; grid-template-rows: 20px 24px; align-content: center; padding: 0 16px; border-left: 1px solid var(--border-subtle); color: var(--text-tertiary); }
.overview-stats svg { grid-row: 1 / 3; align-self: center; color: #6574c9; }
.overview-stats .active svg { color: var(--success); }
.overview-stats .exhausted svg { color: var(--coral); }
.overview-stats span { font-size: 13px; }
.overview-stats strong { color: var(--text-primary); font-size: 16px; font-weight: 730; }
.overview-stats .expiry { min-width: 170px; }
.inline-notice { display: flex; min-height: 42px; align-items: center; gap: 10px; margin-top: 14px; padding: 0 14px; background: var(--warning-soft); border: 1px solid var(--warning-border); border-radius: 10px; color: var(--warning); font-size: 14px; }
.inline-notice span { flex: 1; }
.inline-notice button { padding: 0; background: none; border: 0; color: inherit; font-weight: 700; }
.subscription-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 18px; margin-top: 18px; }
.subscription-card { position: relative; display: flex; min-width: 0; min-height: 390px; flex-direction: column; padding: 22px; overflow: hidden; background: white; border: 1px solid var(--border-subtle); border-radius: 14px; animation: subscription-enter 620ms var(--motion-ease-out) var(--entry-delay,0ms) both; }
.subscription-card::after { position: absolute; top: 0; right: 0; left: 0; height: 3px; background: #5369cf; content: ''; }
.subscription-card.exhausted::after { background: var(--coral); }
.subscription-expired,.subscription-revoked,.subscription-suspended { opacity: .72; filter: saturate(.55); }
.subscription-expired::after,.subscription-revoked::after,.subscription-suspended::after { background: #9ba5b3; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.subscription-identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.platform-mark { display: grid; width: 46px; height: 46px; flex: 0 0 auto; background: linear-gradient(135deg,#f3f4f6,#e5e7eb); border-radius: 11px; box-shadow: inset 0 0 0 1px rgba(15,23,42,.05); color: #667085; place-items: center; }
.platform-mark.platform-anthropic { background: linear-gradient(135deg,#fff7ed,#fef3c7); color: #ea580c; }
.platform-mark.platform-openai { background: linear-gradient(135deg,#ecfdf5,#d1fae5); color: #059669; }
.platform-mark.platform-gemini { background: linear-gradient(135deg,#f0f9ff,#e0e7ff); color: #0284c7; }
.platform-mark.platform-grok { background: linear-gradient(135deg,#fafafa,#e5e5e5); color: #3f3f46; }
.platform-mark > svg { color: inherit; }
.subscription-identity > div { min-width: 0; }
.title-line { display: flex; min-width: 0; align-items: center; gap: 8px; }
.title-line h2 { overflow: hidden; font-size: 17px; font-weight: 740; text-overflow: ellipsis; white-space: nowrap; }
.title-line > span { flex: 0 0 auto; padding: 3px 7px; background: var(--bg-inset); border-radius: 999px; color: var(--text-secondary); font-size: 12px; }
.subscription-identity p { margin-top: 5px; color: var(--text-tertiary); font-size: 14px; }
.status-area { display: flex; flex: 0 0 auto; align-items: flex-end; flex-direction: column; gap: 6px; }
.status-pill,.full-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 999px; font-size: 13px; font-weight: 680; }
.status-pill { background: var(--success-soft); color: var(--success); }
.status-pill i { width: 6px; height: 6px; background: currentColor; border-radius: 50%; animation: subscription-pulse 1.8s ease-out infinite; }
.subscription-expired .status-pill,.subscription-revoked .status-pill,.subscription-suspended .status-pill { background: var(--bg-inset); color: var(--text-tertiary); }
.full-pill { background: var(--coral-soft); color: var(--coral); }
.expiry-line { display: grid; grid-template-columns: 22px auto 1fr auto; align-items: center; gap: 7px; margin-top: 20px; padding: 13px 0; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 14px; }
.expiry-line svg { color: var(--accent); }
.expiry-line strong { color: var(--text-primary); font-size: 14px; text-align: right; }
.expiry-line b { padding: 4px 7px; background: #eef8f4; border-radius: 999px; color: var(--success); font-size: 12px; font-weight: 680; }
.subscription-body { margin-top: 18px; }
.quota-column { display: grid; gap: 18px; }
.quota-line { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; }
.quota-line > div:last-child { text-align: right; }
.quota-line strong,.quota-line span { display: block; }
.quota-line strong { font-size: 14px; font-weight: 680; }
.quota-line span { margin-top: 3px; color: var(--text-tertiary); font-size: 13px; }
.quota-line > div:last-child strong { font-size: 14px; }
.quota-row.full .quota-line > div:last-child strong { color: var(--coral); }
.progress-track { height: 8px; margin-top: 9px; overflow: hidden; background: var(--bg-inset); border-radius: 4px; }
.progress-track span { display: block; height: 100%; background: #5369cf; border-radius: inherit; transform-origin: left center; animation: linai-bar-grow 820ms var(--motion-ease-out) var(--bar-delay,0ms) both; }
.quota-row.full .progress-track span { background: var(--coral); }
.unlimited-quota { display: flex; min-height: 96px; align-items: center; gap: 15px; padding: 14px; background: #f2f6ff; border-radius: 10px; }
.unlimited-quota > span { color: var(--accent); font-size: 34px; line-height: 1; }
.unlimited-quota strong { font-size: 14px; }
.unlimited-quota p { margin-top: 4px; color: var(--text-tertiary); font-size: 14px; }
.subscription-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: auto; padding-top: 18px; color: var(--text-tertiary); font-size: 13px; }
.subscription-foot span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subscription-foot span:last-child { flex: 0 0 auto; }
.skeleton-card { display: grid; min-height: 390px; grid-template-rows: 46px 44px 46px 46px 22px; gap: 18px; pointer-events: none; animation: none; }
.skeleton-card i { background: linear-gradient(105deg,#e8edf4 30%,#f8fafd 48%,#e8edf4 66%); background-size: 220% 100%; border-radius: 8px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.skeleton-card i:nth-child(1) { width: 62%; }
.skeleton-card i:nth-child(2) { width: 78%; }
.empty-state { display: flex; min-height: 350px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; margin-top: 18px; background: white; border-radius: 14px; color: var(--text-tertiary); text-align: center; }
.empty-state strong { color: var(--text-primary); font-size: 16px; }
.empty-state span { font-size: 14px; }
.empty-state a { margin-top: 6px; color: var(--accent-strong); font-size: 14px; font-weight: 700; }
.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes subscription-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes subscription-pulse { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 4px transparent; } }
@media (hover:hover) and (pointer:fine) { .subscription-card { transition: transform var(--motion-standard) var(--motion-ease-out),border-color var(--motion-fast),box-shadow var(--motion-standard); } .subscription-card:hover { border-color: #a8bddf; box-shadow: 0 6px 8px rgba(48,72,106,.08); transform: translateY(-4px); } }
@container app-content (max-width:1100px) { .subscriptions-page { padding-right: 22px; padding-left: 22px; } .overview-stats > div { min-width: 100px; padding: 0 12px; } .overview-stats .expiry { min-width: 150px; } .subscription-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@container app-content (max-width:860px) { .subscription-overview { align-items: stretch; flex-direction: column; gap: 12px; padding: 14px 16px; } .overview-state { min-width: 0; } .overview-stats { width: 100%; } .overview-stats > div { min-width: 0; flex: 1 1 0; } .overview-stats > div:first-child { border-left: 0; } .overview-stats .expiry { min-width: 0; flex-grow: 1.4; } .subscription-list { grid-template-columns: 1fr; } }
@container app-content (max-width:720px) { .subscriptions-page { padding-right: 16px; padding-left: 16px; } .overview-stats { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } .overview-stats > div { min-height: 58px; border-left: 0; } .overview-stats > div:nth-child(even) { border-left: 1px solid var(--border-subtle); } .overview-stats > div:nth-child(n+3) { border-top: 1px solid var(--border-subtle); } .card-head { flex-wrap: wrap; } .status-area { align-items: flex-start; flex-direction: row; flex-wrap: wrap; } .expiry-line { grid-template-columns: 22px auto 1fr; } .expiry-line strong { text-align: left; } .expiry-line b { grid-column: 2 / -1; justify-self: start; } .quota-line { align-items: flex-start; flex-direction: column; gap: 8px; } .quota-line > div:last-child { width: 100%; display: flex; align-items: baseline; justify-content: space-between; text-align: left; } .subscription-foot { align-items: flex-start; flex-direction: column; gap: 6px; } .subscription-foot span:first-child { overflow: visible; white-space: normal; } }
@media (prefers-reduced-motion:reduce) { .subscription-card,.progress-track span,.status-pill i,.skeleton-card i,.spinning { animation: none; transform: none; } }
</style>
