import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { resolveUsageRange } from '@/lib/usage-range'
import UsageRangePicker from './UsageRangePicker.vue'

describe('UsageRangePicker', () => {
  it('emits preset changes and applies valid custom dates', async () => {
    const wrapper = mount(UsageRangePicker, {
      props: { modelValue: resolveUsageRange('last24h', new Date('2026-08-01T14:00:00+08:00')) },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="range-trigger"]').trigger('click')
    await flushPromises()
    await document.body.querySelector<HTMLElement>('[data-testid="preset-last7d"]')?.click()
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({ preset: 'last7d' })

    await wrapper.get('[data-testid="range-trigger"]').trigger('click')
    await flushPromises()
    const start = document.body.querySelector<HTMLInputElement>('[data-testid="custom-start"]')!
    const end = document.body.querySelector<HTMLInputElement>('[data-testid="custom-end"]')!
    start.value = '2026-07-15'
    start.dispatchEvent(new Event('input'))
    end.value = '2026-08-01'
    end.dispatchEvent(new Event('input'))
    document.body.querySelector<HTMLButtonElement>('[data-testid="apply-custom"]')!.click()
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0]).toMatchObject({
      preset: 'custom',
      startDate: '2026-07-15',
      endDate: '2026-08-01',
    })
  })

  it('disables invalid custom dates and closes on Escape', async () => {
    const wrapper = mount(UsageRangePicker, {
      props: { modelValue: resolveUsageRange('last24h') },
      attachTo: document.body,
    })
    await wrapper.get('[data-testid="range-trigger"]').trigger('click')
    await flushPromises()
    const start = document.body.querySelector<HTMLInputElement>('[data-testid="custom-start"]')!
    const end = document.body.querySelector<HTMLInputElement>('[data-testid="custom-end"]')!
    start.value = '2026-08-02'
    start.dispatchEvent(new Event('input'))
    end.value = '2026-08-01'
    end.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector<HTMLButtonElement>('[data-testid="apply-custom"]')!.disabled).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[data-testid="range-popover"]')).toBeNull()
  })
})
