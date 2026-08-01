import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UsageAppearanceChooser from './UsageAppearanceChooser.vue'

describe('UsageAppearanceChooser', () => {
  it('renders three visual choices with an accessible selected state', async () => {
    const wrapper = mount(UsageAppearanceChooser, { props: { modelValue: 'default' } })
    const choices = wrapper.findAll('[data-testid^="usage-appearance-"]')

    expect(choices).toHaveLength(3)
    expect(wrapper.text()).toContain('默认浅色')
    expect(wrapper.text()).toContain('深色')
    expect(wrapper.text()).toContain('Blur')
    expect(wrapper.get('[data-testid="usage-appearance-default"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="usage-appearance-default"]').find('[data-testid="appearance-check"]').exists()).toBe(true)

    await wrapper.get('[data-testid="usage-appearance-blur"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['blur']])
  })
})
