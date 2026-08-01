import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProviderIcon from './ProviderIcon.vue'

describe('ProviderIcon', () => {
  it('renders the existing provider brand mark instead of a letter tile', () => {
    const wrapper = mount(ProviderIcon, { props: { provider: 'anthropic', size: 24 } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 16 16')
    expect(wrapper.text()).toBe('')
  })

  it('uses a consistent service icon for an unknown provider', () => {
    const wrapper = mount(ProviderIcon, { props: { provider: 'unknown' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the fuller Gemini sparkle mark', () => {
    const wrapper = mount(ProviderIcon, { props: { provider: 'gemini' } })
    expect(wrapper.get('svg').attributes('data-provider-icon')).toBe('gemini')
    expect(wrapper.findAll('path')).toHaveLength(2)
  })

  it('renders Grok as a distinct X mark', () => {
    const wrapper = mount(ProviderIcon, { props: { provider: 'grok' } })
    expect(wrapper.get('svg').attributes('data-provider-icon')).toBe('grok')
    expect(wrapper.findAll('path')).toHaveLength(2)
  })
})
