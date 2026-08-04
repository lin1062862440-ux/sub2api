import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ToastViewport from './ToastViewport.vue'
import source from './ToastViewport.vue?raw'
import desktopLayoutSource from '@/layouts/DesktopAppLayout.vue?raw'
import mobileLayoutSource from '@/layouts/MobileAppLayout.vue?raw'
import { clearToasts, toast, toastState } from '@/stores/toast'

let resizeCallback: ResizeObserverCallback | null = null
const observe = vi.fn()
const disconnect = vi.fn()

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback
  }

  observe = observe
  disconnect = disconnect
  unobserve = vi.fn()
}

describe('ToastViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    resizeCallback = null
    observe.mockClear()
    disconnect.mockClear()
    clearToasts()
  })

  afterEach(() => {
    clearToasts()
    document.documentElement.style.removeProperty('--toast-scroll-reserve')
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders semantic status and error notifications with close controls', () => {
    toast.success('团队已创建', { detail: '现在可以添加成员。' })
    toast.error('成员配额保存失败', { detail: '分配额度不能超过团队周配额。' })

    const wrapper = mount(ToastViewport)

    expect(wrapper.get('[data-testid="toast-viewport"]').attributes('aria-label')).toBe('操作通知')
    expect(wrapper.findAll('[data-testid="toast-item"]')).toHaveLength(2)
    expect(wrapper.find('[role="alert"]')?.text()).toContain('成员配额保存失败')
    expect(wrapper.find('[role="status"]')?.text()).toContain('团队已创建')
    expect(wrapper.findAll('[data-testid="dismiss-toast"]')).toHaveLength(2)
  })

  it('pauses on hover and invokes an optional action', async () => {
    const retry = vi.fn()
    const id = toast.error('更新失败', { action: { label: '重试', run: retry } })
    const wrapper = mount(ToastViewport)

    await wrapper.get(`[data-toast-id="${id}"]`).trigger('mouseenter')
    expect(toastState.items.find((item) => item.id === id)?.paused).toBe(true)

    await wrapper.get('[data-testid="toast-action"]').trigger('click')
    expect(retry).toHaveBeenCalledTimes(1)
    expect(toastState.items).toHaveLength(0)
  })

  it('includes Android safe-area placement and reduced-motion behavior', () => {
    expect(source).toContain("html[data-mobile='true']")
    expect(source).toContain('env(safe-area-inset-bottom)')
    expect(source).toContain(":global(html:has([role='dialog']) .toast-viewport)")
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('reserves desktop and Android scroll space from the measured toast height', async () => {
    const wrapper = mount(ToastViewport)

    toast.success('团队周配额已保存')
    await nextTick()
    const viewport = wrapper.get('[data-testid="toast-viewport"]').element
    resizeCallback?.(
      [{ target: viewport, contentRect: { height: 94 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    )

    expect(observe).toHaveBeenCalledWith(viewport)
    expect(document.documentElement.style.getPropertyValue('--toast-scroll-reserve')).toBe('126px')
    expect(desktopLayoutSource).toContain('padding-bottom: var(--toast-scroll-reserve, 0px)')
    expect(mobileLayoutSource).toContain('padding-bottom: var(--toast-scroll-reserve, 0px)')

    clearToasts()
    await nextTick()

    expect(document.documentElement.style.getPropertyValue('--toast-scroll-reserve')).toBe('')
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
