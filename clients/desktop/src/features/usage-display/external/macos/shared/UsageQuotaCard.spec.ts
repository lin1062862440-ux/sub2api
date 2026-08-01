import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UsageQuotaCard from './UsageQuotaCard.vue'

function props(overrides: Record<string, unknown> = {}) {
  return {
    source: 'balance',
    appearance: 'default',
    balance: { available: 128.6, today: 2.18, last7Days: 12.42, thisMonth: 35.6 },
    subscription: null,
    quotaSummary: null,
    loading: false,
    refreshing: false,
    error: '',
    lastUpdatedAt: new Date('2026-08-01T08:00:00Z'),
    draggable: false,
    ...overrides,
  }
}

describe('UsageQuotaCard', () => {
  it.each(['default', 'dark', 'blur'])('applies the %s appearance without changing balance content', (appearance) => {
    const wrapper = mount(UsageQuotaCard, { props: props({ appearance }) as never })

    expect(wrapper.get('[data-testid="usage-quota-card"]').attributes('data-appearance')).toBe(appearance)
    expect(wrapper.text()).toContain('$128.60')
    expect(wrapper.text()).toContain('今日消费')
    expect(wrapper.text()).toContain('$2.18')
    expect(wrapper.find('.quota-track').exists()).toBe(false)
  })

  it('emits lifecycle actions and never exposes settings', async () => {
    const wrapper = mount(UsageQuotaCard, { props: props() as never })

    await wrapper.get('[data-testid="usage-refresh"]').trigger('click')
    await wrapper.get('[data-testid="usage-open-main"]').trigger('click')
    await wrapper.get('[data-testid="usage-quit"]').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('open-main')).toHaveLength(1)
    expect(wrapper.emitted('quit')).toHaveLength(1)
    expect(wrapper.find('[data-testid="usage-settings-action"]').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('shows the constrained subscription quota and stale state', () => {
    const wrapper = mount(UsageQuotaCard, {
      props: props({
        source: 'subscription',
        error: '更新失败，正在显示上次成功数据',
        subscription: {
          id: 9,
          expires_at: '2026-09-01T00:00:00Z',
          group: { name: 'Claude Pro' },
        },
        quotaSummary: {
          remainingPercent: 20,
          constrainedKey: 'weekly',
          unlimited: false,
          quotas: [
            { key: 'daily', label: '日额度', used: 2, limit: 10, remainingPercent: 80, resetAt: new Date('2026-08-02T00:00:00Z') },
            { key: 'weekly', label: '周额度', used: 8, limit: 10, remainingPercent: 20, resetAt: new Date('2026-08-04T00:00:00Z') },
            { key: 'monthly', label: '月额度', used: 24, limit: 100, remainingPercent: 76, resetAt: new Date('2026-09-01T00:00:00Z') },
          ],
        },
      }) as never,
    })

    expect(wrapper.text()).toContain('Claude Pro')
    expect(wrapper.text()).toContain('20%')
    expect(wrapper.text()).toContain('$8.00 / $10.00')
    expect(wrapper.findAll('[data-testid="usage-quota-row"]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="usage-card-notice"]').text()).toContain('更新失败')
  })

  it('renders an unlimited subscription without a fabricated percentage', () => {
    const wrapper = mount(UsageQuotaCard, {
      props: props({
        source: 'subscription',
        subscription: { id: 9, expires_at: null, group: { name: 'Claude Unlimited' } },
        quotaSummary: { remainingPercent: null, constrainedKey: null, unlimited: true, quotas: [] },
      }) as never,
    })

    expect(wrapper.text()).toContain('∞')
    expect(wrapper.text()).toContain('无周期额度限制')
  })

  it('keeps empty quota tracks in the shared menu-bar card', () => {
    const wrapper = mount(UsageQuotaCard, {
      props: props({
        source: 'subscription',
        subscription: { id: 9, expires_at: null, group: { name: 'Claude Pro' } },
        quotaSummary: {
          remainingPercent: 100,
          constrainedKey: 'weekly',
          unlimited: false,
          quotas: [
            {
              key: 'weekly',
              label: '周额度',
              used: 0,
              limit: 50,
              remainingPercent: 100,
              resetAt: null,
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.findAll('.quota-track')).toHaveLength(1)
    expect(wrapper.get('.quota-track span').attributes('style')).toContain('width: 0%')
  })
})
