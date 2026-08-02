import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mobile: false,
  notifyUsageSessionChanged: vi.fn(),
  session: {
    ready: true,
    user: { id: 1, username: 'Lin' } as { id: number; username: string } | null,
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: { meta: { public: false } } },
    replace: vi.fn(),
  }),
}))

vi.mock('@/stores/session', async () => {
  const { reactive } = await import('vue')
  return { session: reactive(mocks.session) }
})

vi.mock('@/features/usage-display/core/host', () => ({
  notifyUsageSessionChanged: mocks.notifyUsageSessionChanged,
}))

vi.mock('@/lib/platform-capabilities', () => ({
  appCapabilities: {
    get mobile() { return mocks.mobile },
    get externalUsageDisplay() { return !mocks.mobile },
  },
}))

import App from './App.vue'
import { session as reactiveSession } from '@/stores/session'

describe('App', () => {
  beforeEach(() => {
    mocks.mobile = false
    ;(reactiveSession as typeof mocks.session).user = { id: 1, username: 'Lin' }
    mocks.notifyUsageSessionChanged.mockReset().mockResolvedValue(undefined)
  })

  it('provides a native Tauri window drag region above every route', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: { template: '<main />' },
        },
      },
    })

    const region = wrapper.get('[data-testid="window-drag-region"]')
    expect(region.attributes()).toHaveProperty('data-tauri-drag-region')
  })

  it('broadcasts the current user and logout to the usage popover', async () => {
    mount(App, {
      global: {
        stubs: { RouterView: { template: '<main />' } },
      },
    })

    expect(mocks.notifyUsageSessionChanged).toHaveBeenCalledWith(1)

    ;(reactiveSession as typeof mocks.session).user = null
    await nextTick()

    expect(mocks.notifyUsageSessionChanged).toHaveBeenLastCalledWith(null)
  })

  it('omits drag chrome and usage-display events on mobile', () => {
    mocks.mobile = true

    const wrapper = mount(App, {
      global: {
        stubs: { RouterView: { template: '<main />' } },
      },
    })

    expect(wrapper.find('[data-testid="window-drag-region"]').exists()).toBe(false)
    expect(mocks.notifyUsageSessionChanged).not.toHaveBeenCalled()
  })
})
