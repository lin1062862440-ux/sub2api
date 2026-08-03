import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User, UserSubscription, UsageStats } from '@/api'
import type { UsageDisplayDependencies } from './store'
import { createUsageDisplayStore } from './store'

function config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    source: 'balance' as const,
    subscriptionId: null,
    surface: 'menu-bar' as const,
    appearance: 'sky' as const,
    floatingStyle: 'orb' as const,
    ...overrides,
  }
}

function user(balance = 128.6): User {
  return { id: 42, balance } as User
}

function stats(actualCost: number): UsageStats {
  return { total_actual_cost: actualCost } as UsageStats
}

function subscription(overrides: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: 9,
    user_id: 42,
    group_id: 3,
    status: 'active',
    starts_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-09-01T00:00:00Z',
    daily_usage_usd: 2,
    weekly_usage_usd: 8,
    monthly_usage_usd: 30,
    daily_window_start: '2026-08-01T00:00:00Z',
    weekly_window_start: '2026-07-28T00:00:00Z',
    monthly_window_start: '2026-07-10T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    group: {
      id: 3,
      name: 'Claude Pro',
      daily_limit_usd: 10,
      weekly_limit_usd: 10,
      monthly_limit_usd: 100,
    },
    ...overrides,
  }
}

function dependencies(overrides: Partial<UsageDisplayDependencies> = {}): UsageDisplayDependencies {
  return {
    platform: () => 'macos',
    now: () => new Date('2026-08-18T14:00:00+08:00'),
    loadConfig: vi.fn().mockResolvedValue(config()),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    configureDisplay: vi.fn().mockResolvedValue(undefined),
    setDisplayTitle: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(user()),
    getUsageStats: vi.fn()
      .mockResolvedValueOnce(stats(2.18))
      .mockResolvedValueOnce(stats(12.42))
      .mockResolvedValueOnce(stats(35.6)),
    getSubscriptions: vi.fn().mockResolvedValue([subscription()]),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    ...overrides,
  }
}

describe('usage display store', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the tray disabled for a default-off user', async () => {
    const deps = dependencies()
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(store.state.config.enabled).toBe(false)
    expect(deps.configureDisplay).toHaveBeenCalledWith({
      enabled: false,
      surface: 'menu-bar',
      title: '',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
    expect(deps.getUsageStats).not.toHaveBeenCalled()
  })

  it('loads balance and three consumption periods for an enabled user', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({
        enabled: true,
        surface: 'floating-window',
        appearance: 'meadow',
        floatingStyle: 'bar',
      })),
    })
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(store.state.balance).toEqual({
      available: 128.6,
      today: 2.18,
      last7Days: 12.42,
      thisMonth: 35.6,
    })
    expect(store.state.trayTitle).toBe('$128.60')
    expect(deps.configureDisplay).toHaveBeenCalledWith({
      enabled: true,
      surface: 'floating-window',
      title: '$128.60',
      appearance: 'meadow',
      floatingStyle: 'bar',
    })
    expect(deps.getUsageStats).toHaveBeenCalledTimes(3)
  })

  it('keeps the persistent Windows tray tooltip current in floating-window mode', async () => {
    const deps = dependencies({
      platform: () => 'windows',
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true, surface: 'floating-window' })),
    })
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(deps.setDisplayTitle).toHaveBeenLastCalledWith('$128.60')
  })

  it('uses the shortest quota for display while preserving the constrained summary', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true, source: 'subscription', subscriptionId: 9 })),
    })
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(store.state.subscription?.id).toBe(9)
    expect(store.state.quotaSummary).toMatchObject({ remainingPercent: 20, constrainedKey: 'weekly' })
    expect(store.state.trayTitle).toBe('20%')
    expect(deps.configureDisplay).toHaveBeenCalledWith({
      enabled: true,
      surface: 'menu-bar',
      title: '--',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
    expect(deps.setDisplayTitle).toHaveBeenLastCalledWith('20%')
  })

  it('does not switch when the fixed subscription becomes unavailable', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true, source: 'subscription', subscriptionId: 9 })),
      getSubscriptions: vi.fn().mockResolvedValue([subscription({ id: 10 })]),
    })
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(store.state.subscription).toBeNull()
    expect(store.state.trayTitle).toBe('--')
    expect(store.state.error).toContain('所选订阅已失效')
    expect(deps.setDisplayTitle).toHaveBeenLastCalledWith('--')
  })

  it('keeps successful balance fields when one period fails', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true })),
      getUsageStats: vi.fn()
        .mockResolvedValueOnce(stats(2.18))
        .mockRejectedValueOnce(new Error('weekly unavailable'))
        .mockResolvedValueOnce(stats(35.6)),
    })
    const store = createUsageDisplayStore(deps)

    await store.attachUser(user())

    expect(store.state.balance).toEqual({
      available: 128.6,
      today: 2.18,
      last7Days: null,
      thisMonth: 35.6,
    })
    expect(store.state.error).toContain('部分用量更新失败')
    expect(store.state.trayTitle).toBe('$128.60')
  })

  it('keeps the last runtime snapshot after a later network failure', async () => {
    const getCurrentUser = vi.fn().mockResolvedValueOnce(user()).mockRejectedValueOnce(new Error('offline'))
    const getUsageStats = vi.fn()
      .mockResolvedValueOnce(stats(2.18))
      .mockResolvedValueOnce(stats(12.42))
      .mockResolvedValueOnce(stats(35.6))
      .mockRejectedValue(new Error('offline'))
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true })),
      getCurrentUser,
      getUsageStats,
    })
    const store = createUsageDisplayStore(deps)
    await store.attachUser(user())

    await store.refresh()

    expect(store.state.balance?.available).toBe(128.6)
    expect(store.state.trayTitle).toBe('$128.60')
    expect(store.state.error).toContain('更新失败')
  })

  it('rejects enabling subscription display without a fixed subscription', async () => {
    const store = createUsageDisplayStore(dependencies())
    await store.attachUser(user())

    await expect(store.updateConfig(config({ enabled: true, source: 'subscription', subscriptionId: null })))
      .rejects.toThrow('请选择订阅组')
  })

  it('updates the disabled preview after fixing a subscription source', async () => {
    const store = createUsageDisplayStore(dependencies())
    await store.attachUser(user())
    await store.loadSubscriptions()

    await store.updateConfig(config({ enabled: false, source: 'subscription', subscriptionId: 9 }))

    expect(store.state.subscription?.id).toBe(9)
    expect(store.state.trayTitle).toBe('20%')
  })

  it('loads a settings preview without owning tray setup or background refresh', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true, source: 'subscription', subscriptionId: 9 })),
    })
    const store = createUsageDisplayStore(deps, {
      backgroundRefresh: false,
      syncDisplayOnAttach: false,
    })

    await store.attachUser(user())
    await store.loadSubscriptions()

    expect(deps.configureDisplay).not.toHaveBeenCalled()
    expect(deps.setInterval).not.toHaveBeenCalled()
    expect(store.state.subscription?.id).toBe(9)
    expect(store.state.trayTitle).toBe('20%')
  })

  it('removes the tray and clears private runtime data on detach', async () => {
    const deps = dependencies({
      loadConfig: vi.fn().mockResolvedValue(config({ enabled: true })),
    })
    const store = createUsageDisplayStore(deps)
    await store.attachUser(user())

    await store.detachUser()

    expect(store.state.userId).toBeNull()
    expect(store.state.balance).toBeNull()
    expect(store.state.subscription).toBeNull()
    expect(deps.configureDisplay).toHaveBeenLastCalledWith({
      enabled: false,
      surface: 'menu-bar',
      title: '',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
  })
})
