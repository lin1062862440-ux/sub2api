import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FloatingUsageCard from './FloatingUsageCard.vue'

function props(overrides: Record<string, unknown> = {}) {
  return {
    source: 'balance',
    appearance: 'default',
    balance: { available: 128.6, today: 2.18, last7Days: 12.42, thisMonth: 35.6 },
    subscription: null,
    quotaSummary: null,
    loading: false,
    error: '',
    lastUpdatedAt: new Date('2026-08-01T08:00:00Z'),
    ...overrides,
  }
}

describe('FloatingUsageCard', () => {
  it.each(['default', 'dark', 'blur'])('renders an action-free %s balance card', (appearance) => {
    const wrapper = mount(FloatingUsageCard, { props: props({ appearance }) as never })

    expect(wrapper.get('[data-testid="floating-usage-card"]').attributes('data-appearance')).toBe(appearance)
    expect(wrapper.text()).toContain('账户余额')
    expect(wrapper.text()).toContain('$128.60')
    expect(wrapper.find('[data-testid="usage-refresh"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-open-main"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-quit"]').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('renders subscription usage without decorative icons', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: {
          id: 9,
          expires_at: '2026-09-01T00:00:00Z',
          group: { name: 'Claude Pro' },
        },
        quotaSummary: {
          remainingPercent: 42,
          constrainedKey: 'weekly',
          unlimited: false,
          quotas: [
            {
              key: 'weekly',
              label: '周额度',
              used: 58,
              limit: 100,
              remainingPercent: 42,
              resetAt: new Date('2026-08-04T00:00:00Z'),
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.text()).toContain('Claude Pro')
    expect(wrapper.text()).toContain('42%')
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('shows the subscription identity once and moves expiry to the footer', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: {
          id: 45,
          expires_at: '2026-08-31T12:00:00Z',
          group: { name: '45 订阅' },
        },
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
              resetAt: new Date('2026-08-08T12:00:00Z'),
            },
            {
              key: 'monthly',
              label: '月额度',
              used: 0,
              limit: 220,
              remainingPercent: 100,
              resetAt: new Date('2026-08-31T12:00:00Z'),
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.text().match(/45 订阅/g) ?? []).toHaveLength(1)
    expect(wrapper.text()).toContain('剩余额度')
    expect(wrapper.text()).not.toContain('最紧额度剩余')
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('有效期至 8月31日')
    expect(wrapper.findAll('.quota-track')).toHaveLength(0)
  })

  it('keeps progress for quota windows that have usage', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: { id: 45, expires_at: null, group: { name: '45 订阅' } },
        quotaSummary: {
          remainingPercent: 60,
          constrainedKey: 'weekly',
          unlimited: false,
          quotas: [
            {
              key: 'weekly',
              label: '周额度',
              used: 20,
              limit: 50,
              remainingPercent: 60,
              resetAt: null,
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.findAll('.quota-track')).toHaveLength(1)
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('长期有效')
  })
})
