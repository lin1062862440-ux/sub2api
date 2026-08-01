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

  it('promotes monthly quota and lists only shorter periods with remaining progress', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: {
          id: 45,
          expires_at: '2026-08-31T12:00:00Z',
          group: { name: '45 订阅' },
        },
        quotaSummary: {
          remainingPercent: 42,
          constrainedKey: 'weekly',
          unlimited: false,
          quotas: [
            {
              key: 'daily',
              label: '日额度',
              used: 2,
              limit: 10,
              remainingPercent: 80,
              resetAt: new Date('2026-08-02T12:00:00Z'),
            },
            {
              key: 'weekly',
              label: '周额度',
              used: 29,
              limit: 50,
              remainingPercent: 42,
              resetAt: new Date('2026-08-08T12:00:00Z'),
            },
            {
              key: 'monthly',
              label: '月额度',
              used: 52.8,
              limit: 220,
              remainingPercent: 76,
              resetAt: new Date('2026-08-31T12:00:00Z'),
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.text().match(/45 订阅/g) ?? []).toHaveLength(1)
    expect(wrapper.get('[data-testid="floating-primary-label"]').text()).toBe('月额度剩余')
    expect(wrapper.text()).not.toContain('最紧额度剩余')
    expect(wrapper.get('[data-testid="floating-metric-number"]').text()).toBe('76')
    expect(wrapper.get('[data-testid="floating-metric-suffix"]').text()).toBe('%')
    expect(wrapper.get('[data-testid="floating-primary-progress"] span').attributes('style')).toContain('width: 76%')
    const rows = wrapper.findAll('[data-testid="usage-quota-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('周额度')
    expect(rows[0].get('.quota-track span').attributes('style')).toContain('width: 42%')
    expect(rows[1].text()).toContain('日额度')
    expect(rows[1].get('.quota-track span').attributes('style')).toContain('width: 80%')
    expect(wrapper.text().match(/月额度/g) ?? []).toHaveLength(1)
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('有效期至 8月31日')
  })

  it('keeps a full remaining track for an unused secondary quota', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: { id: 45, expires_at: null, group: { name: '45 订阅' } },
        quotaSummary: {
          remainingPercent: 76,
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
            {
              key: 'monthly',
              label: '月额度',
              used: 52.8,
              limit: 220,
              remainingPercent: 76,
              resetAt: null,
            },
          ],
        },
      }) as never,
    })

    expect(wrapper.findAll('.quota-track')).toHaveLength(1)
    expect(wrapper.get('.quota-track span').attributes('style')).toContain('width: 100%')
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('长期有效')
  })
})
