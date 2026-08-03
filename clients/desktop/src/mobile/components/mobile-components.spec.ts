import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MobileBottomSheet from './MobileBottomSheet.vue'
import mobileBottomSheetSource from './MobileBottomSheet.vue?raw'
import MobilePage from './MobilePage.vue'
import MobilePagination from './MobilePagination.vue'

const wrappers: Array<{ unmount: () => void }> = []

function mountComponent(component: any, options: any = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('MobilePage', () => {
  it('does not add a second main landmark inside the mobile content shell', () => {
    const wrapper = mountComponent(
      defineComponent({
        components: { MobilePage },
        template: '<main class="mobile-content"><MobilePage title="用量" /></main>',
      }),
    )

    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.get('.mobile-page-scroll').element.tagName).toBe('DIV')
  })

  it('keeps its page shell and action region stable while rendering content', () => {
    const wrapper = mountComponent(MobilePage, {
      props: { title: '用量', subtitle: '近 30 天' },
      slots: { action: '<button type="button">新增</button>', default: '<p>内容</p>' },
    })

    expect(wrapper.find('.mobile-page-scroll').exists()).toBe(true)
    expect(wrapper.get('.mobile-page-action').text()).toContain('新增')
    expect(wrapper.get('.mobile-page-content').text()).toContain('内容')
  })

  it('renders useful loading, error, and empty states without removing the shell', async () => {
    const wrapper = mountComponent(MobilePage, { props: { title: '订阅', loading: true } })

    expect(wrapper.find('.mobile-page-scroll').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mobile-page-loading"]').attributes('role')).toBe('status')
    expect(wrapper.get('[data-testid="mobile-page-loading"]').attributes('aria-label')).toBeTruthy()

    await wrapper.setProps({ loading: false, error: '加载失败' })
    expect(wrapper.get('[data-testid="mobile-page-error"]').attributes('role')).toBe('alert')
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)

    await wrapper.setProps({ error: '', empty: true })
    expect(wrapper.get('[data-testid="mobile-page-empty"]').attributes('role')).toBe('status')
    await wrapper.get('[data-testid="mobile-page-refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
})

describe('MobileBottomSheet', () => {
  it('removes sheet transitions when the user requests reduced motion', () => {
    expect(mobileBottomSheetSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(mobileBottomSheetSource).toMatch(/\.mobile-bottom-sheet-enter-active[\s\S]*transition:\s*none/)
    expect(mobileBottomSheetSource).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mobile-bottom-sheet-enter-from[\s\S]*transform:\s*none/)
  })

  it('teleports a labelled modal, focuses its first control, and restores prior focus on Escape', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '筛选' },
      slots: { default: '<button type="button">选项</button>' },
    })

    await flushPromises()
    const sheet = document.body.querySelector<HTMLElement>('[data-testid="mobile-bottom-sheet"]')
    expect(sheet?.getAttribute('role')).toBe('dialog')
    expect(sheet?.getAttribute('aria-modal')).toBe('true')
    expect(sheet?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(document.activeElement).toBe(document.body.querySelector('[data-testid="mobile-bottom-sheet-close"]'))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ modelValue: false })
    expect(document.activeElement).toBe(trigger)
  })

  it('closes from the scrim and traps Tab focus inside the sheet', async () => {
    const wrapper = mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '操作' },
      slots: { default: '<button type="button" data-testid="first-action">第一项</button><button type="button" data-testid="last-action">最后一项</button>' },
    })
    await flushPromises()

    const close = document.body.querySelector<HTMLButtonElement>('[data-testid="mobile-bottom-sheet-close"]')!
    const last = document.body.querySelector<HTMLButtonElement>('[data-testid="last-action"]')!
    last.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(document.activeElement).toBe(close)

    close.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(last)

    document.body.querySelector<HTMLElement>('[data-testid="mobile-bottom-sheet-scrim"]')!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('keeps focus in the dialog when closing is disabled and no enabled controls exist', async () => {
    mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '提交中', closeDisabled: true },
      slots: { default: '<button type="button" disabled>不可用</button>' },
    })
    await flushPromises()

    const sheet = document.body.querySelector<HTMLElement>('[data-testid="mobile-bottom-sheet"]')!
    expect(sheet.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(sheet)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(sheet)

    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    document.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(sheet)
  })

  it('wraps Tab and Shift+Tab when the sheet has one enabled control', async () => {
    mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '提交中', closeDisabled: true },
      slots: { default: '<button type="button" data-testid="only-action">继续</button>' },
    })
    await flushPromises()

    const action = document.body.querySelector<HTMLButtonElement>('[data-testid="only-action"]')!
    expect(document.activeElement).toBe(action)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(action)

    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    document.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(action)
  })

  it('does not emit from any close path while closeDisabled', async () => {
    const wrapper = mountComponent(MobileBottomSheet, { props: { modelValue: true, title: '提交中', closeDisabled: true } })
    await flushPromises()

    document.body.querySelector<HTMLButtonElement>('[data-testid="mobile-bottom-sheet-close"]')!.click()
    document.body.querySelector<HTMLElement>('[data-testid="mobile-bottom-sheet-scrim"]')!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders default and footer controls inside the shared sheet regions', async () => {
    mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '操作' },
      slots: {
        default: '<button type="button" data-testid="sheet-default-control">继续</button>',
        footer: '<button type="button" data-testid="sheet-footer-control">确认</button>',
      },
    })
    await flushPromises()

    expect(document.body.querySelector('[data-testid="sheet-default-control"]')?.closest('.mobile-bottom-sheet-content')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="sheet-footer-control"]')?.closest('.mobile-bottom-sheet-footer')).toBeTruthy()
  })

  it('removes its Escape listener when unmounted', async () => {
    const update = vi.fn()
    const wrapper = mountComponent(MobileBottomSheet, {
      props: { modelValue: true, title: '操作', 'onUpdate:modelValue': update },
    })
    await flushPromises()
    wrapper.unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(update).not.toHaveBeenCalled()
  })
})

describe('MobilePagination', () => {
  it('renders stable navigation and emits exact valid target pages', async () => {
    const wrapper = mountComponent(MobilePagination, { props: { page: 2, pageCount: 3 } })

    expect(wrapper.get('nav').attributes('aria-label')).toBeTruthy()
    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toBe('第 2 / 3 页')
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[1], [3]])
  })

  it('disables the lower boundary and clamps values below the supported range', async () => {
    const wrapper = mountComponent(MobilePagination, { props: { page: -4, pageCount: 3 } })

    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toBe('第 1 / 3 页')
    expect(wrapper.get('[data-testid="mobile-pagination-previous"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[2]])
  })

  it('disables the upper boundary and clamps values above the supported range', async () => {
    const wrapper = mountComponent(MobilePagination, { props: { page: 99, pageCount: 3 } })

    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toBe('第 3 / 3 页')
    expect(wrapper.get('[data-testid="mobile-pagination-next"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[2]])
  })

  it('uses one page when pageCount is below one', () => {
    const wrapper = mountComponent(MobilePagination, { props: { page: 0, pageCount: 0 } })

    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toBe('第 1 / 1 页')
    expect(wrapper.get('[data-testid="mobile-pagination-previous"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="mobile-pagination-next"]').attributes('disabled')).toBeDefined()
  })
})
