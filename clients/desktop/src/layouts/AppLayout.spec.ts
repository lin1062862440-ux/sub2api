import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signOut: vi.fn(),
  session: {
    runMode: 'standard' as 'standard' | 'simple',
    settings: {
      site_name: 'LinAI',
      site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
      site_subtitle: '让每一位上帝感受 AI 的爱',
    },
    user: {
      username: 'Lin',
      email: 'lin@example.com',
      role: 'user',
      avatar_url: 'https://cdn.example.com/lin.png',
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

vi.mock('@/lib/platform', () => ({
  isMacOS: () => true,
  platform: () => 'macos',
}))
vi.mock('@/features/usage-display/core/host', () => ({
  configureUsageDisplay: vi.fn().mockResolvedValue(undefined),
  notifyUsageConfigChanged: vi.fn().mockResolvedValue(undefined),
  setUsageDisplayTitle: vi.fn().mockResolvedValue(undefined),
}))

import AppLayout from './AppLayout.vue'

describe('AppLayout', () => {
  it('shows the LinAI dashboard destination and closes the session', async () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: {
            props: ['modelValue'],
            template: '<div v-if="modelValue" data-testid="usage-display-dialog">用量显示</div>',
          },
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="app-brand"]').text()).toContain('LinAI')
    expect(wrapper.findAll('[data-testid="nav-item"]')).toHaveLength(6)
    expect(wrapper.text()).toContain('使用记录')
    expect(wrapper.text()).toContain('渠道状态')
    expect(wrapper.text()).toContain('我的订阅')
    expect(wrapper.text()).toContain('兑换')
    expect(wrapper.text()).not.toContain('个人资料')
    expect(wrapper.text()).toContain('Lin')
    expect(wrapper.get('[data-testid="account-trigger-avatar"] img').attributes('src')).toBe(
      'https://cdn.example.com/lin.png',
    )

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')

    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('个人资料')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('用量显示')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('修改密码')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('退出登录')

    await wrapper.get('[data-testid="usage-display-menu-item"]').trigger('click')

    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="usage-display-dialog"]').text()).toContain('用量显示')

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')

    await wrapper.get('[data-testid="password-menu-item"]').trigger('click')

    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="password-dialog"]').text()).toContain('修改密码')

    await wrapper.get('[data-testid="close-password-dialog"]').trigger('click')
    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'login' })
  })

  it('keeps only the dashboard navigation in simple mode', () => {
    mocks.session.runMode = 'simple'
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: {
            props: ['modelValue'],
            template: '<div v-if="modelValue" data-testid="usage-display-dialog">用量显示</div>',
          },
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.text()).not.toContain('使用记录')
    expect(wrapper.text()).not.toContain('渠道状态')
    expect(wrapper.text()).not.toContain('我的订阅')
    expect(wrapper.text()).not.toContain('兑换')
    expect(wrapper.findAll('[data-testid="nav-item"]')).toHaveLength(2)
    mocks.session.runMode = 'standard'
  })
})
