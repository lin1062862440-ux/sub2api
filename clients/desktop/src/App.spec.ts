import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: { meta: { public: false } } },
    replace: vi.fn(),
  }),
}))

vi.mock('@/stores/session', () => ({
  session: {
    ready: true,
    user: { id: 1, username: 'Lin' },
  },
}))

import App from './App.vue'

describe('App', () => {
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
})
