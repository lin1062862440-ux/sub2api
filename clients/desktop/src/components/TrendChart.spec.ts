import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import TrendChart from './TrendChart.vue'

const getDataURL = vi.fn(() => 'data:image/png;base64,chart')

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: ['option'],
    setup(props, { expose }) {
      expose({ chart: { getDataURL } })
      return () => h('div', { 'data-testid': 'echarts-mock' }, JSON.stringify(props.option))
    },
  }),
}))

describe('TrendChart', () => {
  beforeEach(() => getDataURL.mockClear())

  it('renders an instructive empty state', () => {
    const wrapper = mount(TrendChart, { props: { points: [] } })

    expect(wrapper.get('[data-testid="trend-empty"]').text()).toContain('产生请求后')
    expect(wrapper.find('[data-testid="trend-echart"]').exists()).toBe(false)
  })

  it('renders a dual-axis gradient area option with raw totals', () => {
    const wrapper = mount(TrendChart, {
      props: {
        points: [
          { date: '2026-07-31', requests: 12, total_tokens: 1200 },
          { date: '2026-08-01', requests: 28, total_tokens: 2800 },
        ] as never,
      },
    })

    const option = wrapper.getComponent({ name: 'VChart' }).props('option') as Record<string, any>
    expect(option.series).toHaveLength(2)
    expect(option.series.every((series: Record<string, unknown>) => series.type === 'line')).toBe(true)
    expect(option.series.every((series: Record<string, unknown>) => series.stack === undefined)).toBe(true)
    expect(option.series.map((series: Record<string, unknown>) => series.yAxisIndex)).toEqual([0, 1])
    expect(option.yAxis).toHaveLength(2)
    expect(option.series.every((series: Record<string, unknown>) => series.smooth === 0.42)).toBe(true)
    expect(option.series[0].areaStyle.color.colorStops).toEqual([
      { offset: 0, color: '#6ee7b7' },
      { offset: 1, color: '#22d3ee' },
    ])
    expect(option.series[1].areaStyle.color.colorStops).toHaveLength(2)
    expect(option.tooltip.trigger).toBe('axis')
    expect(option.legend.bottom).toBe(2)
    expect(wrapper.get('[data-testid="range-request-total"]').text()).toContain('40')
    expect(wrapper.get('[data-testid="range-token-total"]').text()).toContain('4,000')
  })

  it('plots and reports raw values without percentage normalization', () => {
    const wrapper = mount(TrendChart, {
      props: {
        points: [
          { date: '2026-08-02 10:00', requests: 12, total_tokens: 1200 },
          { date: '2026-08-02 11:00', requests: 24, total_tokens: 3600 },
        ] as never,
      },
    })
    const option = wrapper.getComponent({ name: 'VChart' }).props('option') as Record<string, any>

    expect(option.series[0].data).toEqual([12, 24])
    expect(option.series[1].data).toEqual([1200, 3600])
    const tooltip = option.tooltip.formatter([{ dataIndex: 1, axisValueLabel: '2026-08-02 11:00' }])
    expect(tooltip).toContain('2026-08-02 11:00')
    expect(tooltip).toContain('24')
    expect(tooltip).toContain('3,600')
  })

  it('exports the chart as a high-resolution PNG', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mount(TrendChart, {
      props: { points: [{ date: '2026-08-02', requests: 1, total_tokens: 100 }] as never },
    })

    await wrapper.get('[aria-label="下载图表"]').trigger('click')
    expect(getDataURL).toHaveBeenCalledWith({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })
})
