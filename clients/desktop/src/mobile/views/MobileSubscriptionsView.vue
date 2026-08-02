<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CalendarClock, RefreshCw, TriangleAlert } from '@lucide/vue'

import * as api from '@/api'
import type { SubscriptionGroup, UserSubscription } from '@/api'
import ProviderIcon from '@/components/ProviderIcon.vue'
import {
  formatSubscriptionDate,
  isSubscriptionExhausted,
  subscriptionProgress,
  subscriptionQuotaWindows,
  subscriptionStatusLabel,
} from '@/lib/subscription-display'
import MobilePage from '@/mobile/components/MobilePage.vue'

const subscriptions = ref<UserSubscription[]>([])
const loaded = ref(false)
const loading = ref(true)
const refreshing = ref(false)
const fatalError = ref('')
const inlineError = ref('')
let mounted = false
let requestGeneration = 0

const busy = computed(() => loading.value || refreshing.value)
const orderedSubscriptions = computed(() => subscriptions.value.slice().sort((left, right) => {
  if (left.status === 'active' && right.status !== 'active') return -1
  if (left.status !== 'active' && right.status === 'active') return 1
  const leftUpdated = Date.parse(left.updated_at)
  const rightUpdated = Date.parse(right.updated_at)
  return (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0)
}))
const activeCount = computed(() => subscriptions.value.filter((item) => item.status === 'active').length)
const exhaustedCount = computed(() => subscriptions.value.filter((item) => (
  item.status === 'active' && isSubscriptionExhausted(item)
)).length)

function platformLabel(group?: SubscriptionGroup): string {
  const platform = group?.platform ?? ''
  const labels: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    antigravity: 'Antigravity',
    grok: 'Grok',
    composite: '混合线路',
  }
  return labels[platform] ?? (platform || '订阅线路')
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`
}

async function load(isRefresh = false): Promise<void> {
  const generation = ++requestGeneration
  if (isRefresh) refreshing.value = true
  else loading.value = true
  fatalError.value = ''
  inlineError.value = ''

  try {
    const value = await api.getSubscriptions()
    if (!mounted || generation !== requestGeneration) return
    subscriptions.value = value ?? []
    loaded.value = true
  } catch {
    if (!mounted || generation !== requestGeneration) return
    if (loaded.value) inlineError.value = '刷新失败，请检查网络后重试。'
    else fatalError.value = '订阅信息暂时无法获取，请检查网络后重试。'
  } finally {
    if (mounted && generation === requestGeneration) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function refresh(): void {
  if (busy.value) return
  void load(loaded.value)
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
    title="我的订阅"
    :loading="loading && !loaded"
    :error="fatalError"
    :empty="loaded && subscriptions.length === 0"
    :aria-busy="busy"
    loading-label="正在加载订阅"
    empty-title="暂无订阅"
    empty-message="当前账户还没有可用订阅。"
    @refresh="refresh"
    @retry="refresh"
  >
    <template #action>
      <button
        class="refresh-button"
        type="button"
        data-testid="subscriptions-refresh"
        :title="refreshing ? '正在刷新订阅' : loading ? '正在加载订阅' : '刷新订阅'"
        :aria-label="refreshing ? '正在刷新订阅' : loading ? '正在加载订阅' : '刷新订阅'"
        :disabled="busy"
        @click="refresh"
      >
        <RefreshCw :size="18" :class="{ spinning: refreshing }" />
      </button>
    </template>

    <template #loading>
      <div class="subscriptions-skeleton" aria-hidden="true">
        <div class="summary-skeleton"><i v-for="index in 3" :key="index" /></div>
        <div v-for="index in 3" :key="index" class="card-skeleton"><i /><i /><i /><i /></div>
      </div>
    </template>

    <div v-if="inlineError" class="inline-error" data-testid="subscriptions-inline-error" role="alert">
      <TriangleAlert :size="17" />
      <span>{{ inlineError }}</span>
      <button type="button" :disabled="busy" @click="refresh">重试</button>
    </div>

    <section class="summary-band" data-testid="subscriptions-summary" aria-label="订阅汇总">
      <div data-testid="subscriptions-active-total">
        <span>有效</span>
        <strong>{{ activeCount }}</strong>
      </div>
      <div data-testid="subscriptions-exhausted-total">
        <span>额度用满</span>
        <strong>{{ exhaustedCount }}</strong>
      </div>
      <div data-testid="subscriptions-all-total">
        <span>全部</span>
        <strong>{{ subscriptions.length }}</strong>
      </div>
    </section>

    <section class="subscription-list" aria-label="订阅列表">
      <article
        v-for="item in orderedSubscriptions"
        :key="item.id"
        class="subscription-card"
        :class="[`subscription-${item.status}`, { exhausted: isSubscriptionExhausted(item) }]"
        data-testid="subscription-card"
      >
        <header class="card-header">
          <span class="provider-mark" :class="`provider-${item.group?.platform || 'unknown'}`">
            <ProviderIcon :provider="item.group?.platform" :size="22" />
          </span>
          <div class="subscription-name">
            <h2>{{ item.group?.name || `订阅 #${item.group_id}` }}</h2>
            <p>{{ platformLabel(item.group) }} · 倍率 ×{{ item.group?.rate_multiplier ?? 1 }}</p>
          </div>
          <div class="status-stack">
            <span class="status-pill">{{ subscriptionStatusLabel(item.status) }}</span>
            <span v-if="isSubscriptionExhausted(item)" class="exhausted-pill">额度已用满</span>
          </div>
        </header>

        <div class="expiry-row">
          <CalendarClock :size="16" />
          <span>{{ item.status === 'active' ? '到期时间' : '有效期' }}</span>
          <strong>{{ formatSubscriptionDate(item.expires_at) }}</strong>
        </div>

        <div v-if="subscriptionQuotaWindows(item).length" class="quota-list">
          <div
            v-for="window in subscriptionQuotaWindows(item)"
            :key="window.key"
            class="quota-row"
            :class="{ full: subscriptionProgress(window.used, window.limit) >= 100 }"
            :data-testid="`subscription-quota-${window.key}`"
          >
            <div class="quota-heading">
              <div><strong>{{ window.label }}</strong><span>{{ window.resetLabel }}</span></div>
              <div>
                <strong>{{ formatMoney(window.used) }} / {{ formatMoney(window.limit) }}</strong>
                <span>{{ subscriptionProgress(window.used, window.limit).toFixed(0) }}%</span>
              </div>
            </div>
            <div
              class="progress-track"
              data-testid="subscription-progress"
              role="progressbar"
              :aria-label="`${window.label}使用进度`"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="subscriptionProgress(window.used, window.limit)"
            >
              <span
                data-testid="subscription-progress-bar"
                :style="{ width: `${subscriptionProgress(window.used, window.limit)}%` }"
              />
            </div>
          </div>
        </div>

        <div v-else class="unlimited" data-testid="subscription-unlimited">
          <span aria-hidden="true">∞</span>
          <div><strong>无周期额度上限</strong><p>按当前订阅规则持续使用</p></div>
        </div>

        <footer v-if="item.group?.description" class="card-footer">{{ item.group.description }}</footer>
      </article>
    </section>
  </MobilePage>
</template>

<style scoped>
.refresh-button {
  display: grid;
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  place-items: center;
}

.refresh-button:disabled,
.inline-error button:disabled {
  cursor: default;
  opacity: 0.5;
}

.inline-error {
  display: grid;
  min-height: 44px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 10px;
  border: 1px solid var(--warning-border);
  border-radius: 7px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 12px;
  line-height: 1.4;
}

.inline-error button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
}

.summary-band {
  display: grid;
  min-height: 72px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 2px 16px;
  padding: 10px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.summary-band > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-left: 1px solid var(--border-subtle);
}

.summary-band > div:first-child {
  border-left: 0;
}

.summary-band span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.summary-band strong {
  color: var(--text-primary);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.subscription-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.subscription-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-top: 3px solid #5369cf;
  border-radius: 8px;
  background: var(--bg-surface);
}

.subscription-card.exhausted {
  border-top-color: var(--coral);
}

.subscription-expired,
.subscription-revoked,
.subscription-suspended {
  border-top-color: #9ba5b3;
}

.card-header {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.provider-mark {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: 7px;
  background: var(--bg-inset);
  color: var(--text-secondary);
  place-items: center;
}

.provider-anthropic { background: #fff7ed; color: #c45612; }
.provider-openai { background: #ecfdf5; color: #057a55; }
.provider-gemini { background: #eef4ff; color: #4167b3; }

.subscription-name {
  min-width: 0;
}

.subscription-name h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 16px;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1.35;
}

.subscription-name p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
}

.status-stack {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 4px;
}

.status-pill,
.exhausted-pill {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
}

.status-pill {
  background: var(--success-soft);
  color: var(--success);
}

.subscription-expired .status-pill,
.subscription-revoked .status-pill,
.subscription-suspended .status-pill {
  background: var(--bg-inset);
  color: var(--text-tertiary);
}

.exhausted-pill {
  background: var(--coral-soft);
  color: var(--coral);
}

.expiry-row {
  display: grid;
  grid-template-columns: 18px auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 11px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 12px;
}

.expiry-row svg {
  color: var(--accent);
}

.expiry-row strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  text-align: right;
  overflow-wrap: anywhere;
}

.quota-list {
  display: grid;
  gap: 15px;
  margin-top: 15px;
}

.quota-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.quota-heading > div:last-child {
  text-align: right;
}

.quota-heading strong,
.quota-heading span {
  display: block;
}

.quota-heading strong {
  font-size: 13px;
  font-weight: 680;
}

.quota-heading span {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.35;
}

.quota-row.full .quota-heading > div:last-child strong {
  color: var(--coral);
}

.progress-track {
  width: 100%;
  height: 8px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--bg-inset);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #5369cf;
}

.quota-row.full .progress-track span {
  background: var(--coral);
}

.unlimited {
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 12px;
  margin-top: 15px;
  padding: 10px 12px;
  border-radius: 7px;
  background: #f2f6ff;
}

.unlimited > span {
  color: var(--accent);
  font-size: 30px;
  line-height: 1;
}

.unlimited strong {
  font-size: 13px;
}

.unlimited p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
}

.card-footer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.subscriptions-skeleton {
  display: grid;
  gap: 12px;
}

.summary-skeleton {
  display: grid;
  min-height: 72px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 15px 10px;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.summary-skeleton i,
.card-skeleton i {
  border-radius: 5px;
  background: #e8edf4;
}

.card-skeleton {
  display: grid;
  min-height: 220px;
  grid-template-rows: 40px 38px 46px 8px;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}

.spinning {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 350px) {
  .card-header {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .provider-mark {
    width: 36px;
    height: 36px;
  }

  .status-stack {
    grid-column: 2;
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .quota-heading {
    grid-template-columns: minmax(0, 1fr);
  }

  .quota-heading > div:last-child {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}
</style>
