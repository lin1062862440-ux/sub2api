import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FloatingUsageCard from './FloatingUsageCard.vue'

function props(overrides: Record<string, unknown> = {}) {
  return {
    source: 'balance',
    appearance: 'sky',
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
  it.each(['sky', 'meadow', 'sunset'])('renders an action-free %s balance card', (appearance) => {
    const wrapper = mount(FloatingUsageCard, { props: props({ appearance }) as never })

    expect(wrapper.get('[data-testid="external-usage-detail-card"]').attributes('data-appearance')).toBe(appearance)
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
    expect(wrapper.text()).toContain('58%')
    expect(wrapper.findAll('[data-testid="usage-quota-row"]')).toHaveLength(1)
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('marks the native balance card as landscape without fabricating quota progress', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({ appearance: 'native' }) as never,
    })

    const card = wrapper.get('[data-testid="external-usage-detail-card"]')
    expect(card.classes()).toContain('native-landscape')
    expect(card.attributes('data-appearance')).toBe('native')
    expect(wrapper.get('[data-testid="balance-overview"]').text()).toContain('$128.60')
    expect(wrapper.find('[data-testid="balance-overview"] .quota-track').exists()).toBe(false)
  })

  it('keeps every configured quota in the native landscape grid', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        appearance: 'native',
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
            { key: 'weekly', label: '周额度', used: 29, limit: 50, remainingPercent: 42, resetAt: null },
            { key: 'monthly', label: '月额度', used: 52.8, limit: 220, remainingPercent: 76, resetAt: null },
          ],
        },
      }) as never,
    })

    expect(wrapper.get('[data-testid="external-usage-detail-card"]').classes()).toContain('native-landscape')
    expect(wrapper.findAll('[data-testid="usage-quota-row"]')).toHaveLength(2)
    expect(wrapper.findAll('.quota-head strong').map((item) => item.text())).toEqual(['周额度', '月额度'])
    expect(wrapper.get('[data-testid="native-primary-metric"]').text()).toContain('已使用')
    expect(wrapper.get('[data-testid="native-primary-metric"]').text()).toContain('58%')
  })

  it('renders daily weekly and monthly quotas as equal rows from shortest to longest', () => {
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
    expect(wrapper.find('[data-testid="floating-primary-label"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="floating-primary-progress"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="floating-metric-number"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="floating-subscription-overview"] [data-quota-count]').attributes('data-quota-count')).toBe('3')
    const rows = wrapper.findAll('[data-testid="usage-quota-row"]')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.get('.quota-head strong').text())).toEqual(['日额度', '周额度', '月额度'])
    expect(rows.map((row) => row.get('.quota-track span').attributes('style'))).toEqual([
      'width: 20%;',
      'width: 58%;',
      'width: 24%;',
    ])
    expect(rows.map((row) => row.get('.quota-track').text())).toEqual(['20%', '58%', '24%'])
    expect(rows.every((row) => row.find('.quota-meta').exists())).toBe(true)
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('有效期至 8月31日')
  })

  it('keeps an empty used track for an unused shortest quota', () => {
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

    const rows = wrapper.findAll('[data-testid="usage-quota-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('周额度')
    expect(rows[0].classes()).toContain('compact-value')
    expect(rows[0].get('.quota-track span').attributes('style')).toContain('width: 0%')
    expect(rows[1].text()).toContain('月额度')
    expect(wrapper.get('[data-testid="floating-subscription-expiry"]').text()).toBe('长期有效')
  })

  it('colors used quota progress from healthy green to warning orange and danger red', () => {
    const wrapper = mount(FloatingUsageCard, {
      props: props({
        source: 'subscription',
        subscription: { id: 45, expires_at: null, group: { name: '45 订阅' } },
        quotaSummary: {
          remainingPercent: 20,
          constrainedKey: 'monthly',
          unlimited: false,
          quotas: [
            { key: 'daily', label: '日额度', used: 10, limit: 100, remainingPercent: 90, resetAt: null },
            { key: 'weekly', label: '周额度', used: 60, limit: 100, remainingPercent: 40, resetAt: null },
            { key: 'monthly', label: '月额度', used: 80, limit: 100, remainingPercent: 20, resetAt: null },
          ],
        },
      }) as never,
    })

    expect(wrapper.findAll('[data-testid="usage-quota-row"]')
      .map((row) => row.attributes('data-usage-risk')))
      .toEqual(['healthy', 'warning', 'danger'])
  })
})
