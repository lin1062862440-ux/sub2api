import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

const mocks = vi.hoisted(() => ({
  state: {
    userId: 42,
    platform: 'macos' as 'macos' | 'windows' | 'linux' | 'unknown',
    config: {
      enabled: true,
      source: 'balance' as 'balance' | 'subscription',
      subscriptionId: null as number | null,
      surface: 'menu-bar' as 'menu-bar' | 'floating-window',
      appearance: 'sky' as UsageDisplayAppearance,
      floatingStyle: 'orb' as 'orb' | 'bar',
    },
    balance: { available: 128.6, today: 2.18, last7Days: 12.42, thisMonth: 35.6 },
    subscriptions: [
      {
        id: 9,
        status: 'active',
        group: { id: 3, name: 'Claude Pro' },
      },
    ],
    subscription: null as Record<string, unknown> | null,
    quotaSummary: null as Record<string, unknown> | null,
    loading: false,
    refreshing: false,
    error: '',
    lastUpdatedAt: new Date('2026-08-01T08:00:00Z'),
    trayTitle: '$128.60',
  },
  updateConfig: vi.fn(),
  loadSubscriptions: vi.fn(),
  refresh: vi.fn(),
  hide: vi.fn(),
}))

vi.mock('@/features/usage-display/core/store', () => ({
  usageDisplayStore: {
    state: mocks.state,
    updateConfig: mocks.updateConfig,
    loadSubscriptions: mocks.loadSubscriptions,
    refresh: mocks.refresh,
  },
}))

vi.mock('@/features/usage-display/core/host', () => ({
  hideUsageDisplay: mocks.hide,
}))

import MacOSMenuBarPopover from './MacOSMenuBarPopover.vue'

describe('MacOSMenuBarPopover', () => {
  beforeEach(() => {
    mocks.state.platform = 'macos'
    mocks.state.config = {
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'sky',
      floatingStyle: 'orb',
    }
    mocks.state.subscription = null
    mocks.state.quotaSummary = null
    mocks.state.error = ''
    mocks.state.trayTitle = '$128.60'
    mocks.updateConfig.mockReset().mockResolvedValue(undefined)
    mocks.loadSubscriptions.mockReset().mockResolvedValue(undefined)
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.hide.mockReset().mockResolvedValue(undefined)
  })

  it('shows the balance overview in the shared action-free detail card', async () => {
    const wrapper = mount(MacOSMenuBarPopover)

    expect(wrapper.find('[data-testid="macos-menu-bar-popover"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="external-usage-detail-card"]').attributes('data-appearance')).toBe('sky')
    expect(wrapper.text()).toContain('$128.60')
    expect(wrapper.text()).toContain('$2.18')
    expect(wrapper.text()).toContain('$12.42')
    expect(wrapper.text()).toContain('$35.60')

    expect(wrapper.find('[data-testid="usage-refresh"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-open-main"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-quit"]').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(false)
    await wrapper.trigger('keydown', { key: 'Escape' })

    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.hide).toHaveBeenCalledOnce()
  })

  it('does not expose internal configuration controls', () => {
    const wrapper = mount(MacOSMenuBarPopover)

    expect(wrapper.find('[data-testid="usage-settings-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-display-toggle"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('在菜单栏显示')
  })

  it('uses the native landscape detail variant for the native appearance', () => {
    mocks.state.config.appearance = 'native'
    const wrapper = mount(MacOSMenuBarPopover)

    const card = wrapper.get('[data-testid="external-usage-detail-card"]')
    expect(card.attributes('data-appearance')).toBe('native')
    expect(card.classes()).toContain('native-landscape')
  })

  it('shows equal subscription quota rows from the shortest period to the longest', () => {
    mocks.state.config = {
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'menu-bar',
      appearance: 'meadow',
      floatingStyle: 'orb',
    }
    mocks.state.subscription = {
      id: 9,
      expires_at: '2026-09-01T00:00:00Z',
      group: { name: 'Claude Pro' },
    }
    mocks.state.quotaSummary = {
      remainingPercent: 20,
      constrainedKey: 'weekly',
      unlimited: false,
      quotas: [
        { key: 'daily', label: '日额度', used: 2, limit: 10, remainingPercent: 80, resetAt: new Date('2026-08-02T00:00:00Z') },
        { key: 'weekly', label: '周额度', used: 8, limit: 10, remainingPercent: 20, resetAt: new Date('2026-08-04T00:00:00Z') },
      ],
    }
    const wrapper = mount(MacOSMenuBarPopover)

    expect(wrapper.get('[data-testid="external-usage-detail-card"]').attributes('data-appearance')).toBe('meadow')
    expect(wrapper.text()).toContain('Claude Pro')
    expect(wrapper.find('[data-testid="floating-primary-label"]').exists()).toBe(false)
    const rows = wrapper.findAll('[data-testid="usage-quota-row"]')
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.get('.quota-head strong').text())).toEqual(['日额度', '周额度'])
    expect(rows.map((row) => row.get('.quota-track').text())).toEqual(['80%', '20%'])
    expect(rows[1].text()).toContain('$8.00 / $10.00')
  })

})
