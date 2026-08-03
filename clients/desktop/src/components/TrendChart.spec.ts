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

  it('thins dense axis labels while preserving both endpoints', () => {
    const points = Array.from({ length: 24 }, (_, hour) => ({
      date: `2026-08-02 ${String(hour).padStart(2, '0')}:00`,
      requests: hour,
      total_tokens: hour * 100,
    }))
    const wrapper = mount(TrendChart, { props: { points: points as never } })
    const labels = wrapper.findAll('[data-testid="trend-axis-label"]')

    expect(labels.length).toBeLessThanOrEqual(6)
    expect(labels[0].text()).toBe('08-02 00:00')
    expect(labels.at(-1)?.text()).toBe('08-02 23:00')
  })

  it('shows both series values for the hovered time column and clears on leave', async () => {
    const wrapper = mount(TrendChart, {
      props: {
        points: [
          { date: '2026-08-02 10:00', requests: 12, total_tokens: 1200 },
          { date: '2026-08-02 11:00', requests: 28, total_tokens: 2800 },
        ] as never,
      },
    })

    await wrapper.findAll('[data-testid="trend-hit-target"]')[1].trigger('pointerenter')
    expect(wrapper.get('[data-testid="trend-tooltip"]').text()).toContain('2026-08-02 11:00')
    expect(wrapper.get('[data-testid="trend-tooltip"]').text()).toContain('28')
    expect(wrapper.get('[data-testid="trend-tooltip"]').text()).toContain('2,800')
    expect(wrapper.find('[data-testid="trend-hover-guide"]').exists()).toBe(true)

    await wrapper.get('.plot').trigger('pointerleave')
    expect(wrapper.find('[data-testid="trend-tooltip"]').exists()).toBe(false)
  })
})
