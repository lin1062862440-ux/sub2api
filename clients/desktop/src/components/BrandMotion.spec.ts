import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BrandMotion from './BrandMotion.vue'

const motionMocks = vi.hoisted(() => ({
  reducedMotion: false,
  failFirstImage: false,
  imageSources: [] as string[],
  frameCallbacks: new Map<number, FrameRequestCallback>(),
  nextFrameId: 0,
  cancelAnimationFrame: vi.fn(),
  disconnectResizeObserver: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  arc: vi.fn(),
}))

function installMotionBrowserMocks() {
  vi.restoreAllMocks()
  motionMocks.reducedMotion = false
  motionMocks.failFirstImage = false
  motionMocks.imageSources = []
  motionMocks.frameCallbacks.clear()
  motionMocks.nextFrameId = 0
  motionMocks.cancelAnimationFrame = vi.fn()
  motionMocks.disconnectResizeObserver = vi.fn()
  motionMocks.drawImage = vi.fn()
  motionMocks.fill = vi.fn()
  motionMocks.stroke = vi.fn()
  motionMocks.fillText = vi.fn()
  motionMocks.arc = vi.fn()

  const context = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: motionMocks.drawImage,
    getImageData: vi.fn(() => {
      const data = new Uint8ClampedArray(16 * 16 * 4)
      for (let y = 3; y < 13; y += 1) {
        for (let x = 5; x < 11; x += 1) data[(y * 16 + x) * 4 + 3] = 255
      }
      return { width: 16, height: 16, data }
    }),
    beginPath: vi.fn(),
    arc: motionMocks.arc,
    fill: motionMocks.fill,
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: motionMocks.stroke,
    fillText: motionMocks.fillText,
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  )

  class MockImage {
    crossOrigin: string | null = null
    naturalWidth = 16
    naturalHeight = 16
    width = 16
    height = 16
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    private source = ''

    get src() {
      return this.source
    }

    set src(value: string) {
      this.source = value
      motionMocks.imageSources.push(value)
      const shouldFail = motionMocks.failFirstImage && motionMocks.imageSources.length === 1
      queueMicrotask(() => {
        if (shouldFail) this.onerror?.(new Event('error'))
        else this.onload?.(new Event('load'))
      })
    }
  }

  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 320, height: 320 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }

    unobserve() {}

    disconnect() {
      motionMocks.disconnectResizeObserver()
    }
  }

  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++motionMocks.nextFrameId
    motionMocks.frameCallbacks.set(id, callback)
    return id
  })

  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('cancelAnimationFrame', motionMocks.cancelAnimationFrame)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: motionMocks.reducedMotion,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  )
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })

  return { requestFrame }
}

describe('BrandMotion', () => {
  beforeEach(() => {
    installMotionBrowserMocks()
  })

  it('renders a decorative canvas from the L AI wordmark', async () => {
    const wrapper = mount(BrandMotion, { props: { wordmark: 'L AI' } })
    await flushPromises()

    expect(wrapper.get('canvas').attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('data-motion-wordmark')).toBe('L AI')
    expect(wrapper.attributes('data-motion-state')).toBe('running')
    expect(motionMocks.fillText).toHaveBeenCalledWith('L AI', 128, 48)
    expect(motionMocks.arc.mock.calls.length).toBeGreaterThanOrEqual(220)
    expect(motionMocks.fill).toHaveBeenCalled()
  })

  it('renders one static frame when reduced motion is requested', async () => {
    motionMocks.reducedMotion = true
    const { requestFrame } = installMotionBrowserMocks()
    motionMocks.reducedMotion = true

    const wrapper = mount(BrandMotion, { props: { wordmark: 'L AI' } })
    await flushPromises()

    expect(wrapper.attributes('data-motion-state')).toBe('static')
    expect(requestFrame).not.toHaveBeenCalled()
    expect(motionMocks.fill).toHaveBeenCalled()
  })

  it('uses L AI as the default wordmark', async () => {
    const wrapper = mount(BrandMotion)
    await flushPromises()

    expect(wrapper.attributes('data-motion-wordmark')).toBe('L AI')
    expect(motionMocks.fillText).toHaveBeenCalledWith('L AI', 128, 48)
  })

  it('pauses while the window is unfocused and resumes on focus', async () => {
    const { requestFrame } = installMotionBrowserMocks()
    const wrapper = mount(BrandMotion, { props: { wordmark: 'L AI' } })
    await flushPromises()
    const scheduledBeforeBlur = requestFrame.mock.calls.length

    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-motion-state')).toBe('paused')
    expect(motionMocks.cancelAnimationFrame).toHaveBeenCalled()

    window.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-motion-state')).toBe('running')
    expect(requestFrame.mock.calls.length).toBeGreaterThan(scheduledBeforeBlur)
  })

  it('cancels animation and disconnects observers on unmount', async () => {
    const wrapper = mount(BrandMotion, { props: { wordmark: 'L AI' } })
    await flushPromises()

    wrapper.unmount()

    expect(motionMocks.cancelAnimationFrame).toHaveBeenCalled()
    expect(motionMocks.disconnectResizeObserver).toHaveBeenCalledOnce()
  })
})
