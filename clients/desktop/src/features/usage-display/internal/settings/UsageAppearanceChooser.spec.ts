import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UsageAppearanceChooser from './UsageAppearanceChooser.vue'

describe('UsageAppearanceChooser', () => {
  it('renders four visual choices with an accessible selected state', async () => {
    const wrapper = mount(UsageAppearanceChooser, { props: { modelValue: 'sky', platform: 'macos' } })
    const choices = wrapper.findAll('[data-testid^="usage-appearance-"]')

    expect(choices).toHaveLength(4)
    expect(wrapper.text()).toContain('清透蓝')
    expect(wrapper.text()).toContain('青柠黄')
    expect(wrapper.text()).toContain('珊瑚红')
    expect(wrapper.text()).toContain('苹果原生风')
    expect(wrapper.get('[data-testid="usage-appearance-sky"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="usage-appearance-sky"]').find('[data-testid="appearance-check"]').exists()).toBe(true)

    await wrapper.get('[data-testid="usage-appearance-native"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['native']])
  })

  it('hides the native appearance outside macOS', () => {
    const wrapper = mount(UsageAppearanceChooser, { props: { modelValue: 'sky', platform: 'windows' } })

    expect(wrapper.findAll('[data-testid^="usage-appearance-"]')).toHaveLength(3)
    expect(wrapper.find('[data-testid="usage-appearance-native"]').exists()).toBe(false)
  })
})
