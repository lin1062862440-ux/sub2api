<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gift,
  Layers3,
  RefreshCw,
  Sparkles,
  TicketCheck,
  UsersRound,
  WalletCards,
} from '@lucide/vue'

import * as api from '@/api'
import type { RedeemHistoryItem, RedeemResult } from '@/api'
import { refreshUser, session } from '@/stores/session'
import { toast } from '@/stores/toast'

const code = ref('')
const submitting = ref(false)
const historyLoading = ref(true)
const history = ref<RedeemHistoryItem[]>([])
const result = ref<RedeemResult | null>(null)

const user = computed(() => session.user)
const canSubmit = computed(() => Boolean(code.value.trim()) && !submitting.value)

function isBalance(type: string) {
  return type === 'balance' || type === 'admin_balance'
}

function isConcurrency(type: string) {
  return type === 'concurrency' || type === 'admin_concurrency'
}

function typeLabel(item: Pick<RedeemHistoryItem, 'type' | 'value'>) {
  if (isBalance(item.type)) return item.value >= 0 ? '余额到账' : '余额调整'
  if (isConcurrency(item.type)) return item.value >= 0 ? '并发额度到账' : '并发额度调整'
  if (item.type === 'subscription') return '订阅已激活'
  return '兑换已完成'
}

function resultValue(item: RedeemResult | RedeemHistoryItem) {
  if (isBalance(item.type)) return `${item.value >= 0 ? '+' : '-'}$${Math.abs(item.value).toFixed(2)}`
  if (isConcurrency(item.type)) return `${item.value >= 0 ? '+' : ''}${item.value} 并发`
  if (item.type === 'subscription') {
    const name = ('group_name' in item ? item.group_name : undefined) || item.group?.name
    const days = item.validity_days || Math.round(item.value)
    return name ? `${name} · ${days} 天` : `${days} 天订阅`
  }
  return String(item.value)
}

function formatTime(value: string | null) {
  if (!value) return '--'
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function maskCode(value: string) {
  if (!value) return '系统调整'
  if (value.length <= 10) return value
  return `${value.slice(0, 5)}••••${value.slice(-4)}`
}

async function loadHistory() {
  historyLoading.value = true
  try {
    history.value = await api.getRedeemHistory()
    return true
  } catch {
    return false
  } finally {
    historyLoading.value = false
  }
}

async function submit() {
  const redeemValue = code.value.trim()
  if (!redeemValue || submitting.value) return
  submitting.value = true
  result.value = null
  try {
    const response = await api.redeemCode(redeemValue)
    result.value = response
    code.value = ''
    toast.success('兑换成功', { detail: `${typeLabel(response)} · ${resultValue(response)}` })
    const [userRefresh, historyRefresh] = await Promise.allSettled([refreshUser(), loadHistory()])
    if (userRefresh.status === 'rejected' || historyRefresh.status === 'rejected' || !historyRefresh.value) {
      toast.warning('兑换成功，但账户数据同步失败', { detail: '请稍后刷新页面查看最新权益。' })
    }
  } catch (error) {
    const detail = error instanceof Error && error.message
      ? error.message
      : '兑换失败，请确认兑换码后重试'
    toast.error('兑换失败', { detail })
  } finally {
    submitting.value = false
  }
}

onMounted(() => void loadHistory())
</script>

<template>
  <div class="redeem-page">
    <header class="redeem-head">
      <div>
        <h1>兑换</h1>
        <p>将兑换码转换为余额、并发额度或订阅权益</p>
      </div>
      <div class="account-glance">
        <div><WalletCards :size="15" /><span>可用余额</span><strong>${{ user?.balance?.toFixed(2) ?? '0.00' }}</strong></div>
        <div><UsersRound :size="15" /><span>并发上限</span><strong>{{ user?.concurrency ?? 0 }}</strong></div>
      </div>
    </header>

    <section class="redeem-workspace">
      <form class="redeem-ticket" @submit.prevent="submit">
        <div class="ticket-copy">
          <span class="ticket-icon"><TicketCheck :size="22" /></span>
          <div>
            <h2>输入兑换码</h2>
            <p>兑换成功后，权益会立即同步到当前账户。</p>
          </div>
        </div>

        <label class="code-field">
          <span>兑换码</span>
          <div>
            <Gift :size="18" />
            <input
              v-model="code"
              data-testid="redeem-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="LINAI-XXXX-XXXX-XXXX"
              :disabled="submitting"
              @input="result = null"
            />
          </div>
        </label>

        <button class="redeem-action" type="submit" :disabled="!canSubmit">
          <RefreshCw v-if="submitting" :size="16" class="spinning" />
          <Gift v-else :size="16" />
          <span>{{ submitting ? '正在兑换' : '立即兑换' }}</span>
          <ArrowRight v-if="!submitting" :size="15" />
        </button>

        <Transition name="result-pop">
          <div v-if="result" class="result-panel" data-testid="redeem-result">
            <span><CheckCircle2 :size="20" /></span>
            <div>
              <small>兑换成功</small>
              <strong>{{ typeLabel(result) }}</strong>
              <p>{{ resultValue(result) }}</p>
            </div>
            <div v-if="result.new_balance !== undefined" class="result-total"><span>账户余额</span><strong>${{ result.new_balance.toFixed(2) }}</strong></div>
            <div v-else-if="result.new_concurrency !== undefined" class="result-total"><span>并发上限</span><strong>{{ result.new_concurrency }}</strong></div>
          </div>
        </Transition>

      </form>

      <aside class="redeem-side">
      <section class="benefit-panel">
        <header>
          <span><Sparkles :size="19" /></span>
          <div><h2>账户权益</h2><p>兑换结果会进入对应权益类别</p></div>
        </header>
        <div class="benefit-list">
          <div><span class="benefit-icon balance"><CircleDollarSign :size="18" /></span><div><strong>余额</strong><p>用于按量计费请求</p></div><strong>${{ user?.balance?.toFixed(2) ?? '0.00' }}</strong></div>
          <div><span class="benefit-icon concurrency"><UsersRound :size="18" /></span><div><strong>并发额度</strong><p>账户同时请求上限</p></div><strong>{{ user?.concurrency ?? 0 }}</strong></div>
          <div><span class="benefit-icon subscription"><Layers3 :size="18" /></span><div><strong>订阅</strong><p>按周期使用指定服务</p></div><a href="#/subscriptions">查看</a></div>
        </div>
      </section>

    <section class="history-panel">
      <header>
        <div><Clock3 :size="16" /><div><h2>兑换记录</h2><p>最近的账户权益变动</p></div></div>
        <span>{{ history.length }} 条</span>
      </header>

      <div v-if="historyLoading" class="history-skeleton" aria-label="正在加载兑换记录">
        <div v-for="index in 3" :key="index"><i /><i /><i /></div>
      </div>
      <div v-else-if="history.length" class="history-list">
        <article v-for="(item, index) in history" :key="item.id" :style="{ '--entry-delay': `${index * 45}ms` }">
          <span class="history-type" :class="{ balance: isBalance(item.type), subscription: item.type === 'subscription' }">
            <CircleDollarSign v-if="isBalance(item.type)" :size="17" />
            <Layers3 v-else-if="item.type === 'subscription'" :size="17" />
            <UsersRound v-else :size="17" />
          </span>
          <div class="history-main"><strong>{{ typeLabel(item) }}</strong><span>{{ maskCode(item.code) }}</span></div>
          <span class="history-time">{{ formatTime(item.used_at) }}</span>
          <strong class="history-value">{{ resultValue(item) }}</strong>
        </article>
      </div>
      <div v-else class="history-empty"><Clock3 :size="22" /><strong>暂无兑换记录</strong><span>完成兑换后，权益变化会显示在这里。</span></div>
    </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.redeem-page { width: 100%; min-height: 100%; max-width: 1440px; margin: 0 auto; padding: 34px 28px 28px; }
.redeem-head { display: flex; min-height: 54px; align-items: flex-start; justify-content: space-between; gap: 20px; }
.redeem-head h1 { font-size: 22px; font-weight: 740; }
.redeem-head p { margin-top: 3px; color: var(--text-tertiary); font-size: 14px; }
.account-glance { display: flex; gap: 8px; }
.account-glance > div { display: grid; min-width: 118px; height: 48px; grid-template-columns: 18px minmax(0,1fr); grid-template-rows: 17px 19px; column-gap: 7px; align-items: center; padding: 6px 10px; background: rgba(255,255,255,.72); border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-tertiary); }
.account-glance svg { grid-row: 1 / 3; color: var(--accent); }
.account-glance span { align-self: end; font-size: 13px; }
.account-glance strong { align-self: start; color: var(--text-primary); font-size: 14px; }
.redeem-workspace { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(260px,.72fr); gap: 12px; margin-top: 12px; }
.redeem-ticket, .benefit-panel, .history-panel { position: relative; min-width: 0; background: rgba(255,255,255,.74); border: 1px solid rgba(205,216,231,.92); border-radius: 8px; box-shadow: 0 7px 22px rgba(31,51,78,.045); }
.redeem-ticket { min-height: 318px; padding: 22px; overflow: hidden; animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.redeem-ticket::after { position: absolute; top: 0; bottom: 0; right: 38px; border-right: 1px dashed rgba(164,177,196,.36); content: ''; pointer-events: none; }
.ticket-copy { display: flex; align-items: center; gap: 11px; }
.ticket-icon { display: grid; width: 42px; height: 42px; flex: 0 0 auto; background: #e5edff; border-radius: 7px; color: var(--accent-strong); place-items: center; }
.ticket-copy h2, .benefit-panel h2, .history-panel h2 { font-size: 14px; font-weight: 700; }
.ticket-copy p, .benefit-panel header p, .history-panel header p { margin-top: 2px; color: var(--text-tertiary); font-size: 14px; }
.code-field { display: grid; max-width: 650px; gap: 7px; margin-top: 25px; color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.code-field > div { display: flex; min-height: 50px; align-items: center; gap: 10px; padding: 0 14px; background: rgba(247,250,254,.9); border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-tertiary); transition: border-color var(--motion-fast) ease, box-shadow var(--motion-fast) ease; }
.code-field > div:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); color: var(--accent-strong); }
.code-field input { min-width: 0; flex: 1; background: transparent; border: 0; outline: 0; color: var(--text-primary); font-size: 14px; font-weight: 650; letter-spacing: .06em; }
.code-field input::placeholder { color: #98a5b7; font-size: 14px; font-weight: 520; letter-spacing: .03em; }
.redeem-action { display: inline-flex; min-width: 144px; height: 42px; align-items: center; justify-content: center; gap: 8px; margin-top: 14px; padding: 0 14px; background: var(--accent); border: 1px solid var(--accent); border-radius: 7px; color: white; font-size: 13px; font-weight: 700; }
.redeem-action svg:last-child { margin-left: auto; }
.redeem-action:hover:not(:disabled) { background: var(--accent-strong); }
.redeem-action:disabled { opacity: .5; }
.result-panel, .error-panel { display: flex; max-width: 650px; min-height: 62px; align-items: center; gap: 10px; margin-top: 15px; padding: 10px 12px; border-radius: 7px; }
.result-panel { background: #eef8f4; border: 1px solid #cfe9df; color: var(--success); }
.result-panel > span { display: grid; width: 34px; height: 34px; flex: 0 0 auto; background: rgba(255,255,255,.72); border-radius: 6px; place-items: center; }
.result-panel > div:nth-child(2) { display: grid; min-width: 0; flex: 1; grid-template-columns: auto 1fr; grid-template-rows: 15px 18px; column-gap: 8px; align-items: center; }
.result-panel small { grid-column: 1 / -1; font-size: 13px; }
.result-panel strong { color: var(--text-primary); font-size: 13px; }
.result-panel p { color: var(--success); font-size: 14px; font-weight: 720; }
.result-total { display: flex !important; flex: 0 0 auto !important; flex-direction: column; align-items: flex-end !important; }
.result-total span { font-size: 13px; }
.result-total strong { color: var(--success); font-size: 14px; }
.error-panel { background: var(--coral-soft); border: 1px solid var(--coral-border); color: var(--danger); }
.error-panel div { display: flex; flex-direction: column; }
.error-panel strong { font-size: 12px; }
.error-panel span { margin-top: 2px; font-size: 14px; }
.benefit-panel { min-height: 318px; padding: 20px; animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) 90ms both; }
.benefit-panel > header { display: flex; align-items: center; gap: 10px; }
.benefit-panel > header > span { display: grid; width: 38px; height: 38px; background: #e7e3ff; border-radius: 7px; color: #6552c7; place-items: center; }
.benefit-list { display: grid; gap: 8px; margin-top: 18px; }
.benefit-list > div { display: grid; min-height: 58px; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 8px 9px; background: var(--bg-base); border: 1px solid rgba(223,229,238,.85); border-radius: 7px; }
.benefit-icon { display: grid; width: 32px; height: 32px; background: #e5edff; border-radius: 6px; color: var(--accent); place-items: center; }
.benefit-icon.balance { background: #e3f3ed; color: var(--success); }
.benefit-icon.subscription { background: #ece9ff; color: #6552c7; }
.benefit-list > div > div strong, .benefit-list > div > div p { display: block; }
.benefit-list > div > div strong { font-size: 12px; }
.benefit-list > div > div p { margin-top: 1px; color: var(--text-tertiary); font-size: 13px; }
.benefit-list > div > strong { font-size: 13px; }
.benefit-list a { color: var(--accent-strong); font-size: 14px; font-weight: 680; }
.history-panel { min-height: 260px; margin-top: 12px; overflow: hidden; animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) 160ms both; }
.history-panel > header { display: flex; min-height: 58px; align-items: center; justify-content: space-between; padding: 0 17px; border-bottom: 1px solid var(--border-subtle); }
.history-panel > header > div { display: flex; align-items: center; gap: 9px; }
.history-panel > header > div > svg { color: var(--text-tertiary); }
.history-panel > header > span { padding: 3px 7px; background: var(--bg-inset); border-radius: 9px; color: var(--text-tertiary); font-size: 12px; }
.history-list article { display: grid; min-height: 58px; grid-template-columns: 34px minmax(0,1fr) 108px minmax(100px,auto); align-items: center; gap: 10px; padding: 0 17px; border-bottom: 1px solid rgba(223,229,238,.75); animation: linai-surface-enter 420ms var(--motion-ease-out) var(--entry-delay,0ms) both; }
.history-list article:last-child { border-bottom: 0; }
.history-type { display: grid; width: 32px; height: 32px; background: #e5edff; border-radius: 6px; color: var(--accent); place-items: center; }
.history-type.balance { background: #e3f3ed; color: var(--success); }
.history-type.subscription { background: #ece9ff; color: #6552c7; }
.history-main { display: flex; min-width: 0; flex-direction: column; }
.history-main strong { font-size: 12px; }
.history-main span, .history-time { color: var(--text-tertiary); font-size: 12px; }
.history-main span { margin-top: 2px; font-family: var(--font-data); }
.history-time { text-align: right; }
.history-value { color: var(--text-primary); font-size: 12px; text-align: right; }
.history-skeleton { display: grid; }
.history-skeleton > div { display: grid; height: 58px; grid-template-columns: 34px 1fr 120px; align-items: center; gap: 10px; padding: 0 17px; border-bottom: 1px solid var(--border-subtle); }
.history-skeleton i { display: block; height: 14px; background: linear-gradient(105deg,#e8edf4 30%,#f7f9fc 47%,#e8edf4 64%); background-size: 220% 100%; border-radius: 5px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.history-skeleton i:first-child { width: 32px; height: 32px; }
.history-empty { display: flex; min-height: 200px; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); }
.history-empty strong { color: var(--text-primary); font-size: 13px; }
.history-empty span { font-size: 14px; }
.spinning { animation: spin 800ms linear infinite; }
.result-pop-enter-active, .result-pop-leave-active { transition: opacity var(--motion-standard) ease, transform var(--motion-standard) var(--motion-ease-out); }
.result-pop-enter-from, .result-pop-leave-to { opacity: 0; transform: translateY(5px) scale(.99); }
@keyframes spin { to { transform: rotate(360deg); } }
@container app-content (max-width:1100px) { .redeem-page { padding-right: 20px; padding-left: 20px; } .redeem-workspace { grid-template-columns: minmax(0,1.35fr) 250px; } .redeem-ticket { padding-right: 18px; padding-left: 18px; } }
@media (prefers-reduced-motion:reduce) { .redeem-ticket,.benefit-panel,.history-panel,.history-list article,.history-skeleton i,.spinning { animation: none; transform: none; } .result-pop-enter-active,.result-pop-leave-active { transition: none; } }
</style>

<style scoped>
.redeem-page { width: 100%; min-height: 100%; max-width: 1540px; margin: 0 auto; padding: 38px 32px 42px; }
.redeem-head { display: flex; min-height: 58px; align-items: flex-start; justify-content: space-between; gap: 24px; }
.redeem-head h1 { font-size: 28px; font-weight: 760; line-height: 1.15; }
.redeem-head p { margin-top: 8px; color: var(--text-secondary); font-size: 14px; }
.account-glance { display: flex; gap: 10px; }
.account-glance > div { display: grid; min-width: 152px; height: 54px; grid-template-columns: 24px minmax(0,1fr); grid-template-rows: 20px 24px; column-gap: 8px; align-items: center; padding: 6px 14px; background: white; border: 1px solid var(--border-subtle); border-radius: 10px; color: var(--text-tertiary); }
.account-glance svg { grid-row: 1 / 3; color: var(--accent); }
.account-glance span { align-self: end; font-size: 13px; }
.account-glance strong { align-self: start; color: var(--text-primary); font-size: 16px; font-weight: 730; }
.redeem-workspace { display: grid; min-height: 0; grid-template-columns: minmax(0,1.2fr) minmax(360px,.8fr); align-items: start; gap: 18px; margin-top: 22px; }
.redeem-ticket,.benefit-panel,.history-panel { min-width: 0; background: white; border: 1px solid var(--border-subtle); border-radius: 14px; box-shadow: none; }
.redeem-ticket { position: relative; min-height: 390px; padding: 34px; overflow: hidden; animation: redeem-enter 620ms var(--motion-ease-out) both; }
.redeem-ticket::after { display: none; }
.ticket-copy { display: flex; align-items: center; gap: 14px; }
.ticket-icon { display: grid; width: 50px; height: 50px; flex: 0 0 auto; background: #e8efff; border-radius: 12px; color: var(--accent-strong); place-items: center; transition: transform var(--motion-standard) var(--motion-ease-out); }
.ticket-copy h2,.benefit-panel h2,.history-panel h2 { font-size: 19px; font-weight: 740; }
.ticket-copy p,.benefit-panel header p,.history-panel header p { margin-top: 4px; color: var(--text-tertiary); font-size: 14px; }
.code-field { display: grid; max-width: none; gap: 9px; margin-top: 42px; color: var(--text-secondary); font-size: 14px; font-weight: 680; }
.code-field > div { position: relative; display: flex; min-height: 64px; align-items: center; gap: 12px; padding: 0 18px; overflow: hidden; background: #f7f9fc; border: 1px solid var(--border-strong); border-radius: 11px; color: var(--text-tertiary); transition: border-color var(--motion-fast),box-shadow var(--motion-fast),background var(--motion-fast); }
.code-field > div::after { position: absolute; right: 18px; bottom: 0; left: 18px; height: 2px; background: var(--accent); content: ''; transform: scaleX(0); transform-origin: left; transition: transform var(--motion-standard) var(--motion-ease-out); }
.code-field > div:focus-within { background: white; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); color: var(--accent-strong); }
.code-field > div:focus-within::after { transform: scaleX(1); }
.code-field input { min-width: 0; flex: 1; background: transparent; border: 0; outline: 0; color: var(--text-primary); font-size: 18px; font-weight: 680; letter-spacing: .04em; }
.code-field input::placeholder { color: #6f7c8e; font-size: 15px; font-weight: 520; letter-spacing: 0; }
.redeem-action { display: inline-flex; min-width: 184px; height: 50px; align-items: center; justify-content: center; gap: 9px; margin-top: 16px; padding: 0 18px; background: var(--accent); border: 1px solid var(--accent); border-radius: 10px; color: white; font-size: 14px; font-weight: 720; transition: background var(--motion-fast),transform var(--motion-fast); }
.redeem-action svg:last-child { margin-left: auto; transition: transform var(--motion-fast); }
.redeem-action:hover:not(:disabled) { background: var(--accent-strong); }
.redeem-action:hover:not(:disabled) svg:last-child { transform: translateX(3px); }
.redeem-action:active:not(:disabled) { transform: scale(.98); }
.redeem-action:disabled { opacity: .5; }
.result-panel,.error-panel { display: flex; max-width: none; min-height: 84px; align-items: center; gap: 13px; margin-top: 24px; padding: 14px 16px; border-radius: 11px; }
.result-panel { background: #eef8f4; border: 1px solid #cfe9df; color: var(--success); }
.result-panel > span { display: grid; width: 44px; height: 44px; flex: 0 0 auto; background: white; border-radius: 10px; place-items: center; animation: success-settle 520ms var(--motion-ease-out) both; }
.result-panel > div:nth-child(2) { display: grid; min-width: 0; flex: 1; grid-template-columns: auto 1fr; grid-template-rows: 19px 23px; column-gap: 10px; align-items: center; }
.result-panel small { grid-column: 1 / -1; font-size: 13px; }
.result-panel strong { color: var(--text-primary); font-size: 14px; }
.result-panel p { color: var(--success); font-size: 16px; font-weight: 760; }
.result-total { display: flex !important; flex: 0 0 auto !important; flex-direction: column; align-items: flex-end !important; animation: balance-flash 900ms ease-out both; }
.result-total span { font-size: 13px; }
.result-total strong { color: var(--success); font-size: 16px; }
.error-panel { background: var(--coral-soft); border: 1px solid var(--coral-border); color: var(--danger); }
.error-panel div { display: flex; flex-direction: column; }
.error-panel strong { font-size: 14px; }
.error-panel span { margin-top: 3px; font-size: 14px; }
.redeem-side { display: grid; min-width: 0; grid-template-rows: auto minmax(0,1fr); gap: 18px; }
.benefit-panel { min-height: 224px; padding: 22px; animation: redeem-enter 620ms var(--motion-ease-out) 80ms both; }
.benefit-panel > header { display: flex; align-items: center; gap: 12px; }
.benefit-panel > header > span { display: grid; width: 44px; height: 44px; background: #ece9ff; border-radius: 10px; color: #6552c7; place-items: center; }
.benefit-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin-top: 18px; }
.benefit-list > div { display: flex; min-height: 92px; align-items: flex-start; flex-direction: column; gap: 5px; padding: 12px; background: #f7f9fc; border: 0; border-radius: 10px; }
.benefit-icon { display: grid; width: 32px; height: 32px; flex: 0 0 auto; background: #e5edff; border-radius: 8px; color: var(--accent); place-items: center; }
.benefit-icon.balance { background: #e3f3ed; color: var(--success); }
.benefit-icon.subscription { background: #ece9ff; color: #6552c7; }
.benefit-list > div > div strong,.benefit-list > div > div p { display: block; }
.benefit-list > div > div strong { font-size: 14px; }
.benefit-list > div > div p { display: none; }
.benefit-list > div > strong { margin-top: auto; font-size: 14px; }
.benefit-list a { margin-top: auto; color: var(--accent-strong); font-size: 14px; font-weight: 700; }
.history-panel { display: flex; min-height: 0; margin-top: 0; flex-direction: column; overflow: hidden; animation: redeem-enter 620ms var(--motion-ease-out) 150ms both; }
.history-panel > header { display: flex; min-height: 68px; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--border-subtle); }
.history-panel > header > div { display: flex; align-items: center; gap: 11px; }
.history-panel > header > div > svg { color: var(--accent); }
.history-panel > header > span { padding: 4px 8px; background: var(--bg-inset); border-radius: 999px; color: var(--text-tertiary); font-size: 12px; }
.history-list { overflow-x: hidden; overflow-y: auto; }
.history-list article { display: grid; min-height: 70px; grid-template-columns: 38px minmax(0,1fr) 80px; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-subtle); animation: history-in 480ms var(--motion-ease-out) var(--entry-delay,0ms) both; }
.history-list article:last-child { border-bottom: 0; }
.history-type { display: grid; width: 36px; height: 36px; background: #e5edff; border-radius: 9px; color: var(--accent); place-items: center; }
.history-type.balance { background: #e3f3ed; color: var(--success); }
.history-type.subscription { background: #ece9ff; color: #6552c7; }
.history-main { display: flex; min-width: 0; flex-direction: column; }
.history-main strong { font-size: 14px; }
.history-main span { margin-top: 3px; overflow: hidden; color: var(--text-tertiary); font-family: var(--font-data); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.history-time { display: none; }
.history-value { color: var(--text-primary); font-size: 14px; text-align: right; }
.history-skeleton { display: grid; }
.history-skeleton > div { display: grid; height: 70px; grid-template-columns: 38px 1fr 80px; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-subtle); }
.history-skeleton i { display: block; height: 15px; background: linear-gradient(105deg,#e8edf4 30%,#f8fafd 48%,#e8edf4 66%); background-size: 220% 100%; border-radius: 6px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.history-skeleton i:first-child { width: 36px; height: 36px; border-radius: 9px; }
.history-empty { display: flex; min-height: 240px; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-tertiary); }
.history-empty strong { color: var(--text-primary); font-size: 14px; }
.history-empty span { font-size: 14px; }
.spinning { animation: spin 800ms linear infinite; }
.result-pop-enter-active,.result-pop-leave-active { transition: opacity var(--motion-standard),transform var(--motion-standard) var(--motion-ease-out); }
.result-pop-enter-from,.result-pop-leave-to { opacity: 0; transform: translateY(10px) scale(.985); }
@keyframes redeem-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes history-in { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
@keyframes success-settle { from { opacity: 0; transform: scale(.55) rotate(-14deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes balance-flash { 0%,45% { background: rgba(8,127,91,.14); } 100% { background: transparent; } }
@container app-content (max-width:1100px) { .redeem-page { padding-right: 22px; padding-left: 22px; } .redeem-workspace { grid-template-columns: minmax(0,1.1fr) minmax(300px,.9fr); } .redeem-ticket { padding: 28px; } .benefit-list { grid-template-columns: 1fr; } .benefit-list > div { min-height: 54px; align-items: center; flex-direction: row; } .benefit-list > div > strong,.benefit-list a { margin-top: 0; margin-left: auto; } }
@container app-content (max-width:860px) { .redeem-workspace { grid-template-columns: 1fr; } .redeem-ticket { min-height: 390px; } .account-glance { display: none; } .redeem-side { grid-template-columns: minmax(260px,.75fr) minmax(0,1.25fr); grid-template-rows: auto; } }
@container app-content (max-width:700px) { .redeem-page { padding-right: 16px; padding-left: 16px; } .redeem-side { grid-template-columns: 1fr; } .redeem-ticket { min-height: 0; padding: 22px; } .code-field { margin-top: 30px; } .result-panel { align-items: flex-start; flex-wrap: wrap; } .result-total { width: 100%; align-items: flex-start !important; padding-top: 10px; border-top: 1px solid #cfe9df; } .history-list article { grid-template-columns: 38px minmax(0,1fr) auto; } }
@media (prefers-reduced-motion:reduce) { .redeem-ticket,.benefit-panel,.history-panel,.history-list article,.result-panel > span,.result-total,.history-skeleton i,.spinning { animation: none; transform: none; } .result-pop-enter-active,.result-pop-leave-active { transition: none; } }
</style>
