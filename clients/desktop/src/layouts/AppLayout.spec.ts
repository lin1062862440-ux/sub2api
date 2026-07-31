import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signOut: vi.fn(),
  session: {
    settings: {
      site_name: 'LinAI',
      site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
      site_subtitle: '让每一位上帝感受 AI 的爱',
    },
    user: {
      username: 'Lin',
      email: 'lin@example.com',
      role: 'user',
    },
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  signOut: mocks.signOut,
}))

vi.mock('@/lib/platform', () => ({ isMacOS: () => true }))

import AppLayout from './AppLayout.vue'

describe('AppLayout', () => {
  it('shows the LinAI dashboard destination and closes the session', async () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="app-brand"]').text()).toContain('LinAI')
    expect(wrapper.findAll('[data-testid="nav-item"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('个人信息')

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'login' })
  })
})
