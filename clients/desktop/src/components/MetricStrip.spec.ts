import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MetricStrip from './MetricStrip.vue'

describe('MetricStrip', () => {
  it('renders stable operational metrics', () => {
    const wrapper = mount(MetricStrip, {
      props: {
        items: [
          { id: 'today-requests', label: '今日请求', value: '1,240', detail: '累计 9,400' },
          { id: 'balance', label: '账户余额', value: '$18.20', detail: '可用余额', tone: 'brand' },
        ],
      },
    })

    expect(wrapper.get('[data-testid="metric-today-requests"]').text()).toContain('1,240')
    expect(wrapper.get('[data-testid="metric-balance"]').classes()).toContain('metric-brand')
  })
})
