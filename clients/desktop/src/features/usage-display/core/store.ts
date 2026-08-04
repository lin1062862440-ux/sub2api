import { reactive, readonly } from 'vue'

import * as api from '@/api'
import type { Platform } from '@/lib/platform'
import { platform } from '@/lib/platform'
import {
  formatUsageTrayTitle,
  resolveBalanceRanges,
  resolveQuotaSummary,
  resolveShortestUsageQuota,
  type UsageQuotaInput,
  type UsageQuotaSummary,
} from '@/features/usage-display/core/format'
import {
  configureUsageDisplay,
  setUsageDisplayTitle,
  type UsageDisplayHostConfig,
} from '@/features/usage-display/core/host'
import {
  defaultUsageDisplayConfig,
  loadUsageDisplayConfig,
  saveUsageDisplayConfig,
  type UsageDisplayConfig,
} from '@/features/usage-display/core/storage'
import type { User, UserSubscription, UsageFilters, UsageStats } from '@/api'
import { isTeamSubscription } from '@/lib/subscription-display'

export interface BalanceDisplaySnapshot {
  available: number | null
  today: number | null
  last7Days: number | null
  thisMonth: number | null
}

export interface UsageDisplayDependencies {
  platform: () => Platform
  now: () => Date
  loadConfig: (userId: number) => Promise<UsageDisplayConfig>
  saveConfig: (userId: number, config: UsageDisplayConfig) => Promise<void>
  configureDisplay: (config: UsageDisplayHostConfig) => Promise<void>
  setDisplayTitle: (title: string) => Promise<void>
  getCurrentUser: () => Promise<User & { run_mode?: 'standard' | 'simple' }>
  getUsageStats: (filters: UsageFilters) => Promise<UsageStats>
  getSubscriptions: () => Promise<UserSubscription[]>
  setInterval: (callback: () => void, timeout: number) => number
  clearInterval: (intervalId: number) => void
}

const defaultDependencies: UsageDisplayDependencies = {
  platform,
  now: () => new Date(),
  loadConfig: loadUsageDisplayConfig,
  saveConfig: saveUsageDisplayConfig,
  configureDisplay: configureUsageDisplay,
  setDisplayTitle: setUsageDisplayTitle,
  getCurrentUser: api.getCurrentUser,
  getUsageStats: api.getUsageStats,
  getSubscriptions: api.getSubscriptions,
  setInterval: (callback, timeout) => window.setInterval(callback, timeout),
  clearInterval: (intervalId) => window.clearInterval(intervalId),
}

function subscriptionQuotas(item: UserSubscription): UsageQuotaInput[] {
  const group = item.group
  if (!group) return []
  if (isTeamSubscription(item)) {
    return [{
      key: 'weekly',
      label: '成员周额度',
      used: item.team_weekly_usage_usd ?? 0,
      limit: item.team_weekly_limit_usd ?? 0,
      windowStart: item.team_weekly_window_start ?? null,
      windowHours: 168,
    }]
  }
  return [
    {
      key: 'daily' as const,
      label: '日额度',
      used: item.daily_usage_usd,
      limit: group.daily_limit_usd ?? 0,
      windowStart: item.daily_window_start,
      windowHours: 24 as const,
    },
    {
      key: 'weekly' as const,
      label: '周额度',
      used: item.weekly_usage_usd,
      limit: group.weekly_limit_usd ?? 0,
      windowStart: item.weekly_window_start,
      windowHours: 168 as const,
    },
    {
      key: 'monthly' as const,
      label: '月额度',
      used: item.monthly_usage_usd,
      limit: group.monthly_limit_usd ?? 0,
      windowStart: item.monthly_window_start,
      windowHours: 720 as const,
    },
  ]
}

export interface UsageDisplayStoreOptions {
  backgroundRefresh?: boolean
  syncDisplayOnAttach?: boolean
}

function supportsExternalUsageDisplay(value: Platform): boolean {
  return value === 'macos' || value === 'windows'
}

export function createUsageDisplayStore(
  deps: UsageDisplayDependencies = defaultDependencies,
  options: UsageDisplayStoreOptions = {},
) {
  const backgroundRefresh = options.backgroundRefresh ?? true
  const syncDisplayOnAttach = options.syncDisplayOnAttach ?? true
  const state = reactive({
    userId: null as number | null,
    platform: deps.platform(),
    config: defaultUsageDisplayConfig(),
    balance: null as BalanceDisplaySnapshot | null,
    subscriptions: [] as UserSubscription[],
    subscription: null as UserSubscription | null,
    quotaSummary: null as UsageQuotaSummary | null,
    loading: false,
    refreshing: false,
    error: '',
    lastUpdatedAt: null as Date | null,
    trayTitle: '--',
  })

  let sequence = 0
  let intervalId: number | null = null

  function clearTimer() {
    if (intervalId !== null) deps.clearInterval(intervalId)
    intervalId = null
  }

  function clearSnapshots() {
    state.balance = null
    state.subscriptions = []
    state.subscription = null
    state.quotaSummary = null
    state.lastUpdatedAt = null
    state.error = ''
    state.trayTitle = '--'
  }

  function selectedSubscription(items = state.subscriptions): UserSubscription | null {
    if (state.config.source !== 'subscription' || state.config.subscriptionId === null) return null
    return items.find((item) => item.id === state.config.subscriptionId && item.status === 'active') ?? null
  }

  function updateSubscriptionState(items: UserSubscription[]) {
    state.subscriptions = items.filter((item) => item.status === 'active')
    state.subscription = selectedSubscription(state.subscriptions)
    state.quotaSummary = state.subscription
      ? resolveQuotaSummary(subscriptionQuotas(state.subscription))
      : null
  }

  function resolveTrayTitle(): string {
    if (state.config.source === 'balance') {
      return state.balance?.available === null || state.balance?.available === undefined
        ? formatUsageTrayTitle({ kind: 'unavailable' })
        : formatUsageTrayTitle({ kind: 'balance', balance: state.balance.available })
    }
    if (!state.subscription || !state.quotaSummary) return formatUsageTrayTitle({ kind: 'unavailable' })
    const quota = resolveShortestUsageQuota(state.quotaSummary.quotas)
    return formatUsageTrayTitle({
      kind: 'subscription',
      name: state.subscription.group?.name || `订阅 #${state.subscription.id}`,
      remainingPercent: quota?.remainingPercent ?? null,
    })
  }

  async function syncDisplay(reconfigure = false) {
    state.trayTitle = resolveTrayTitle()
    const enabled = supportsExternalUsageDisplay(state.platform) && state.userId !== null && state.config.enabled
    if (reconfigure || !enabled) {
      await deps.configureDisplay({
        enabled,
        surface: state.config.surface,
        title: enabled ? state.trayTitle : '',
        appearance: state.config.appearance,
        floatingStyle: state.config.floatingStyle,
      })
      return
    }
    if (state.config.surface === 'menu-bar' || state.platform === 'windows') {
      await deps.setDisplayTitle(state.trayTitle)
    }
  }

  async function refreshBalance(current: number) {
    const ranges = resolveBalanceRanges(deps.now())
    const results = await Promise.allSettled([
      deps.getCurrentUser(),
      deps.getUsageStats(ranges.today),
      deps.getUsageStats(ranges.last7Days),
      deps.getUsageStats(ranges.thisMonth),
    ])
    if (current !== sequence) return

    const previous = state.balance ?? { available: null, today: null, last7Days: null, thisMonth: null }
    const [userResult, todayResult, weekResult, monthResult] = results
    state.balance = {
      available: userResult.status === 'fulfilled' ? userResult.value.balance : previous.available,
      today: todayResult.status === 'fulfilled' ? todayResult.value.total_actual_cost : previous.today,
      last7Days: weekResult.status === 'fulfilled' ? weekResult.value.total_actual_cost : previous.last7Days,
      thisMonth: monthResult.status === 'fulfilled' ? monthResult.value.total_actual_cost : previous.thisMonth,
    }

    const successes = results.filter((result) => result.status === 'fulfilled').length
    if (successes > 0) state.lastUpdatedAt = deps.now()
    if (successes === 0) state.error = '更新失败，正在显示上次成功数据'
    else if (successes < results.length) state.error = '部分用量更新失败'
  }

  async function refreshSubscription(current: number) {
    try {
      const items = await deps.getSubscriptions()
      if (current !== sequence) return
      updateSubscriptionState(items)
      if (!state.subscription) {
        state.error = '所选订阅已失效，请重新选择'
        return
      }
      state.lastUpdatedAt = deps.now()
    } catch {
      if (current !== sequence) return
      state.error = '更新失败，正在显示上次成功数据'
    }
  }

  async function refresh() {
    if (!supportsExternalUsageDisplay(state.platform) || state.userId === null || !state.config.enabled) return
    const current = ++sequence
    const initial = state.lastUpdatedAt === null
    state.loading = initial
    state.refreshing = !initial
    state.error = ''
    try {
      if (state.config.source === 'balance') await refreshBalance(current)
      else await refreshSubscription(current)
      if (current === sequence) await syncDisplay()
    } finally {
      if (current === sequence) {
        state.loading = false
        state.refreshing = false
      }
    }
  }

  async function start() {
    clearTimer()
    if (!supportsExternalUsageDisplay(state.platform) || state.userId === null || !state.config.enabled) return
    await refresh()
    intervalId = deps.setInterval(() => void refresh(), 60_000)
  }

  function stop(clear = false) {
    clearTimer()
    sequence += 1
    state.loading = false
    state.refreshing = false
    if (clear) clearSnapshots()
  }

  async function attachUser(user: User) {
    stop(true)
    state.userId = user.id
    state.balance = { available: user.balance, today: null, last7Days: null, thisMonth: null }
    state.config = await deps.loadConfig(user.id)
    if (syncDisplayOnAttach) await syncDisplay(true)
    else state.trayTitle = resolveTrayTitle()
    if (backgroundRefresh) await start()
  }

  async function detachUser() {
    stop(true)
    state.userId = null
    state.config = defaultUsageDisplayConfig()
    await syncDisplay(true)
  }

  async function updateConfig(config: UsageDisplayConfig) {
    if (state.userId === null) throw new Error('请先登录')
    if (config.enabled && config.source === 'subscription' && config.subscriptionId === null) {
      throw new Error('请选择订阅组')
    }
    await deps.saveConfig(state.userId, config)
    stop(false)
    state.config = { ...config }
    state.error = ''
    if (config.source === 'subscription') updateSubscriptionState(state.subscriptions)
    state.trayTitle = resolveTrayTitle()
    await syncDisplay(true)
    if (!config.enabled) return
    if (backgroundRefresh) await start()
  }

  async function loadSubscriptions() {
    if (state.userId === null) return
    try {
      const items = await deps.getSubscriptions()
      updateSubscriptionState(items)
      state.trayTitle = resolveTrayTitle()
    } catch {
      state.error = '订阅列表暂时无法获取'
    }
  }

  return {
    state: readonly(state),
    attachUser,
    detachUser,
    updateConfig,
    loadSubscriptions,
    refresh,
    start,
    stop,
  }
}

export const usageDisplayStore = createUsageDisplayStore()
