import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UsageAppearanceChooser from './UsageAppearanceChooser.vue'

describe('UsageAppearanceChooser', () => {
  it('renders three visual choices with an accessible selected state', async () => {
    const wrapper = mount(UsageAppearanceChooser, { props: { modelValue: 'sky' } })
    const choices = wrapper.findAll('[data-testid^="usage-appearance-"]')

    expect(choices).toHaveLength(3)
    expect(wrapper.text()).toContain('清透蓝')
    expect(wrapper.text()).toContain('青柠黄')
    expect(wrapper.text()).toContain('珊瑚红')
    expect(wrapper.get('[data-testid="usage-appearance-sky"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="usage-appearance-sky"]').find('[data-testid="appearance-check"]').exists()).toBe(true)

    await wrapper.get('[data-testid="usage-appearance-sunset"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['sunset']])
  })
})
