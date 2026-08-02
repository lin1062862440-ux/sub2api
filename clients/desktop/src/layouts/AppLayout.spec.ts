import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mobile: false,
  adminDeniedListener: null as null | (() => void),
  openUrl: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
  session: {
    runMode: 'standard' as 'standard' | 'simple',
    userGroupCapabilities: null as null | { can_access: boolean; can_manage: boolean; group_count: number },
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

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }))
vi.mock('@/lib/http', () => ({
  ApiError: class ApiError extends Error {},
  onAdminAccessDenied: (listener: () => void) => {
    mocks.adminDeniedListener = listener
    return () => {
      mocks.adminDeniedListener = null
    }
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => ({ name: 'dashboard', meta: {} }),
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  signOut: mocks.signOut,
}))

vi.mock('@/lib/platform', () => ({
  isMacOS: () => true,
  platform: () => 'macos',
}))
vi.mock('@/lib/platform-capabilities', () => ({
  appCapabilities: {
    get mobile() { return mocks.mobile },
    get apiKeys() { return !mocks.mobile },
    get externalUsageDisplay() { return !mocks.mobile },
  },
}))
vi.mock('@/features/usage-display/core/host', () => ({
  configureUsageDisplay: vi.fn().mockResolvedValue(undefined),
  notifyUsageConfigChanged: vi.fn().mockResolvedValue(undefined),
  setUsageDisplayTitle: vi.fn().mockResolvedValue(undefined),
}))

import AppLayout from './AppLayout.vue'

describe('AppLayout', () => {
  beforeEach(() => {
    mocks.mobile = false
  })

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
    expect(wrapper.find('[data-testid="workspace-switch"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-nav-item"]').exists()).toBe(false)
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
    expect(wrapper.find('[data-testid="web-admin-menu-item"]').exists()).toBe(false)

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

  it('shows workspace switching and administrator navigation only to administrators', async () => {
    localStorage.clear()
    mocks.session.user.role = 'admin'
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="workspace-switch"]').text()).toContain('个人')
    expect(wrapper.get('[data-testid="workspace-switch"]').text()).toContain('管理')
    expect(wrapper.text()).toContain('管理概览')
    expect(wrapper.text()).toContain('账号管理')
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.get('[aria-label="管理导航"]').text()).toContain('分组管理')
    expect(wrapper.get('[aria-label="管理导航"]').text()).toContain('用户组')
    expect(wrapper.text()).not.toContain('API 密钥')

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="web-admin-menu-item"]').text()).toContain('打开网页管理后台')
    await wrapper.get('[data-testid="web-admin-menu-item"]').trigger('click')
    expect(mocks.openUrl).toHaveBeenCalledWith('https://lynn.lat/admin')

    await wrapper.get('[data-testid="workspace-personal"]').trigger('click')

    expect(wrapper.text()).toContain('API 密钥')
    expect(wrapper.text()).not.toContain('账号管理')
    mocks.session.user.role = 'user'
  })

  it('shows the personal user-group entry only to granted ordinary users', () => {
    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 2 }
    const granted = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(granted.get('[data-testid="user-group-nav-item"]').text()).toContain('用户组')
    granted.unmount()

    mocks.session.userGroupCapabilities = { can_access: false, can_manage: false, group_count: 0 }
    const ungranted = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })
    expect(ungranted.find('[data-testid="user-group-nav-item"]').exists()).toBe(false)
    mocks.session.userGroupCapabilities = null
  })

  it('keeps simple-mode administrator navigation aligned with the web console', () => {
    localStorage.clear()
    mocks.session.user.role = 'admin'
    mocks.session.runMode = 'simple'
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    const navigation = wrapper.get('[aria-label="管理导航"]').text()
    expect(navigation).toContain('管理概览')
    expect(navigation).toContain('账号管理')
    expect(navigation).toContain('全站用量')
    expect(navigation).toContain('公告管理')
    expect(navigation).not.toContain('分组管理')
    expect(navigation).not.toContain('用户管理')
    expect(navigation).not.toContain('渠道监控')
    expect(navigation).not.toContain('审计日志')
    expect(navigation).not.toContain('订阅管理')
    expect(navigation).not.toContain('兑换码')

    mocks.session.runMode = 'standard'
    mocks.session.user.role = 'user'
  })

  it('leaves and hides the administrator workspace after a forbidden admin request', async () => {
    localStorage.clear()
    mocks.session.user.role = 'admin'
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(mocks.adminDeniedListener).toBeTypeOf('function')
    mocks.adminDeniedListener?.()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="workspace-switch"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="admin-nav-item"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="admin-access-notice"]').text()).toContain('管理员权限已失效')
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'dashboard' })
    mocks.session.user.role = 'user'
  })

  it('uses a mobile drawer without desktop-only destinations', async () => {
    mocks.mobile = true
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="mobile-app-bar"]').text()).toContain('仪表盘')
    expect(wrapper.find('[data-testid="mobile-drawer"]').exists()).toBe(false)

    await wrapper.get('[data-testid="mobile-menu-trigger"]').trigger('click')
    const drawer = wrapper.get('[data-testid="mobile-drawer"]')
    expect(drawer.text()).not.toContain('API 密钥')
    expect(drawer.text()).not.toContain('用量显示')
    expect(drawer.text()).toContain('使用记录')
  })

  it('closes the mobile drawer from the visible control and browser back', async () => {
    mocks.mobile = true
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          UsageDisplayDialog: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    await wrapper.get('[data-testid="mobile-menu-trigger"]').trigger('click')
    await wrapper.get('[data-testid="mobile-drawer-close"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-drawer"]').exists()).toBe(false)

    await wrapper.get('[data-testid="mobile-menu-trigger"]').trigger('click')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mobile-drawer"]').exists()).toBe(false)
  })
})
