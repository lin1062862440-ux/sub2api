import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TrendChart from './TrendChart.vue'

describe('TrendChart', () => {
  it('renders an instructive empty state', () => {
    const wrapper = mount(TrendChart, { props: { points: [] } })

    expect(wrapper.get('[data-testid="trend-empty"]').text()).toContain('产生请求后')
  })

  it('renders request and token lines with one inspectable point per day', () => {
    const wrapper = mount(TrendChart, {
      props: {
        points: [
          { date: '2026-07-31', requests: 12, total_tokens: 1200 },
          { date: '2026-08-01', requests: 28, total_tokens: 2800 },
        ] as never,
      },
    })

    expect(wrapper.get('[data-testid="trend-line"]').attributes('d')).toContain('L')
    expect(wrapper.get('[data-testid="token-line"]').attributes('d')).toContain('L')
    expect(wrapper.findAll('[data-testid="trend-point"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="token-point"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="range-request-total"]').text()).toContain('40')
    expect(wrapper.get('[data-testid="range-token-total"]').text()).toContain('4,000')
  })
})
