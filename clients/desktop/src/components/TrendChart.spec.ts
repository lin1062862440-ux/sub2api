import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TrendChart from './TrendChart.vue'

describe('TrendChart', () => {
  it('renders an instructive empty state', () => {
    const wrapper = mount(TrendChart, { props: { points: [] } })

    expect(wrapper.get('[data-testid="trend-empty"]').text()).toContain('产生请求后')
  })

  it('renders a line and one inspectable point per day', () => {
    const wrapper = mount(TrendChart, {
      props: {
        points: [
          { date: '2026-07-31', requests: 12 },
          { date: '2026-08-01', requests: 28 },
        ] as never,
      },
    })

    expect(wrapper.get('[data-testid="trend-line"]').attributes('d')).toContain('L')
    expect(wrapper.findAll('[data-testid="trend-point"]')).toHaveLength(2)
  })
})
