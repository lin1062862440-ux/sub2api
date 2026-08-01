import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ExternalMetricValue from './ExternalMetricValue.vue'

describe('ExternalMetricValue', () => {
  it('renders a percentage as a large number with a separate suffix', () => {
    const wrapper = mount(ExternalMetricValue, { props: { value: '100%' } })

    expect(wrapper.get('[data-testid="floating-metric-number"]').text()).toBe('100')
    expect(wrapper.get('[data-testid="floating-metric-suffix"]').text()).toBe('%')
    expect(wrapper.get('.external-metric-value').classes()).toContain('is-percentage')
  })

  it.each(['$129', '∞', '--'])('keeps %s as a single metric value', (value) => {
    const wrapper = mount(ExternalMetricValue, { props: { value } })

    expect(wrapper.get('[data-testid="floating-metric-number"]').text()).toBe(value)
    expect(wrapper.find('[data-testid="floating-metric-suffix"]').exists()).toBe(false)
    expect(wrapper.get('.external-metric-value').classes()).not.toContain('is-percentage')
  })
})
