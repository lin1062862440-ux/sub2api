import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: {
    config: {
      enabled: true,
      source: 'balance' as 'balance' | 'subscription',
      subscriptionId: null as number | null,
      surface: 'floating-window' as const,
      appearance: 'default' as 'default' | 'dark' | 'blur',
    },
    balance: { available: 128.6, today: 2.18, last7Days: 12.42, thisMonth: 35.6 },
    subscription: null,
    quotaSummary: null,
    loading: false,
    refreshing: false,
    error: '',
    lastUpdatedAt: new Date('2026-08-01T08:00:00Z'),
  },
  refresh: vi.fn(),
  setExpanded: vi.fn(),
  startDrag: vi.fn(),
  openMain: vi.fn(),
  quit: vi.fn(),
}))

vi.mock('@/features/usage-display/core/store', () => ({
  usageDisplayStore: { state: mocks.state, refresh: mocks.refresh },
}))

vi.mock('@/features/usage-display/core/host', () => ({
  setFloatingUsageExpanded: mocks.setExpanded,
  startFloatingUsageDrag: mocks.startDrag,
  openMainWindow: mocks.openMain,
  quitDesktopApp: mocks.quit,
}))

import MacOSFloatingWindow from './MacOSFloatingWindow.vue'

describe('MacOSFloatingWindow', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.state.config.appearance = 'default'
    mocks.state.error = ''
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.setExpanded.mockReset().mockResolvedValue(undefined)
    mocks.startDrag.mockReset().mockResolvedValue(undefined)
    mocks.openMain.mockReset().mockResolvedValue(undefined)
    mocks.quit.mockReset().mockResolvedValue(undefined)
  })

  it.each(['default', 'dark', 'blur'])('renders a stable collapsed orb for %s', async (appearance) => {
    mocks.state.config.appearance = appearance as 'default' | 'dark' | 'blur'
    const wrapper = mount(MacOSFloatingWindow)

    const orb = wrapper.get('[data-testid="floating-usage-orb"]')
    expect(orb.attributes('data-appearance')).toBe(appearance)
    expect(orb.text()).toBe('$129')
    expect(orb.find('.orb-brand').exists()).toBe(false)
    expect(orb.find('i').exists()).toBe(false)

    await orb.trigger('mousedown')
    expect(mocks.startDrag).toHaveBeenCalledOnce()
  })

  it('waits for native expansion before revealing the shared card', async () => {
    let resolveExpansion: (() => void) | undefined
    mocks.setExpanded.mockImplementation(() => new Promise<void>((resolve) => { resolveExpansion = resolve }))
    const wrapper = mount(MacOSFloatingWindow)

    await wrapper.get('[data-testid="floating-usage-orb"]').trigger('mouseenter')
    expect(mocks.setExpanded).toHaveBeenCalledWith(true)
    expect(wrapper.find('[data-testid="usage-quota-card"]').exists()).toBe(false)

    resolveExpansion?.()
    await flushPromises()
    expect(wrapper.find('[data-testid="usage-quota-card"]').exists()).toBe(true)
  })

  it('expands when the orb button is activated', async () => {
    const wrapper = mount(MacOSFloatingWindow)

    await wrapper.get('[data-testid="floating-usage-orb"]').trigger('click')
    await flushPromises()

    expect(mocks.setExpanded).toHaveBeenCalledWith(true)
    expect(wrapper.find('[data-testid="usage-quota-card"]').exists()).toBe(true)
  })

  it('collapses after 180 milliseconds and cancels collapse on re-entry', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MacOSFloatingWindow)
    await wrapper.get('[data-testid="floating-usage-orb"]').trigger('mouseenter')
    await flushPromises()

    await wrapper.get('[data-testid="usage-quota-card"]').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(179)
    expect(wrapper.find('[data-testid="usage-quota-card"]').exists()).toBe(true)
    await wrapper.get('[data-testid="usage-quota-card"]').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find('[data-testid="usage-quota-card"]').exists()).toBe(true)

    await wrapper.get('[data-testid="usage-quota-card"]').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()
    expect(mocks.setExpanded).toHaveBeenLastCalledWith(false)
    expect(wrapper.find('[data-testid="floating-usage-orb"]').exists()).toBe(true)
  })

  it('keeps the orb usable when native expansion fails', async () => {
    mocks.setExpanded.mockRejectedValue(new Error('resize failed'))
    const wrapper = mount(MacOSFloatingWindow)

    await wrapper.get('[data-testid="floating-usage-orb"]').trigger('mouseenter')
    await flushPromises()

    expect(wrapper.find('[data-testid="floating-usage-orb"]').exists()).toBe(true)
    const orb = wrapper.get('[data-testid="floating-usage-orb"]')
    expect(orb.find('[data-testid="floating-native-error"]').exists()).toBe(false)
    expect(orb.attributes('aria-description')).toBe('展开失败')
  })
})
