import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mobile: false,
  adminDeniedListener: null as null | (() => void),
  openUrl: vi.fn(),
  checkUpdate: vi.fn(),
  installUpdate: vi.fn(),
  attachUsageUser: vi.fn(),
  loadUsageSubscriptions: vi.fn(),
  updateUsageConfig: vi.fn(),
  stopUsageStore: vi.fn(),
  notifyUsageConfigChanged: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  usageState: {
    platform: 'macos' as const,
    config: {
      enabled: true,
      source: 'balance' as 'balance' | 'subscription',
      subscriptionId: null as number | null,
      surface: 'menu-bar' as 'menu-bar' | 'floating-window',
      appearance: 'sky' as const,
      floatingStyle: 'orb' as 'orb' | 'bar',
    },
    subscriptions: [],
    trayTitle: '余额 $128.60',
    error: '',
  },
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
vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('LinAI'),
  getVersion: vi.fn().mockResolvedValue('0.1.2'),
}))
vi.mock('@/lib/desktop-updater', () => ({
  checkDesktopUpdate: mocks.checkUpdate,
  installDesktopUpdate: mocks.installUpdate,
  desktopUpdateErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}))
vi.mock('@/features/usage-display/core/store', () => ({
  createUsageDisplayStore: () => ({
    state: mocks.usageState,
    attachUser: mocks.attachUsageUser,
    loadSubscriptions: mocks.loadUsageSubscriptions,
    updateConfig: mocks.updateUsageConfig,
    stop: mocks.stopUsageStore,
  }),
}))
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

vi.mock('@/stores/toast', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
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
    get desktopUpdater() { return !mocks.mobile },
  },
}))
vi.mock('@/features/usage-display/core/host', () => ({
  configureUsageDisplay: vi.fn().mockResolvedValue(undefined),
  notifyUsageConfigChanged: mocks.notifyUsageConfigChanged,
  setUsageDisplayTitle: vi.fn().mockResolvedValue(undefined),
}))

import AppLayout from './AppLayout.vue'

describe('AppLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.mobile = false
    mocks.checkUpdate.mockReset()
    mocks.installUpdate.mockReset()
    mocks.attachUsageUser.mockReset().mockResolvedValue(undefined)
    mocks.loadUsageSubscriptions.mockReset().mockResolvedValue(undefined)
    mocks.updateUsageConfig.mockReset().mockResolvedValue(undefined)
    mocks.stopUsageStore.mockReset()
    mocks.notifyUsageConfigChanged.mockReset().mockResolvedValue(undefined)
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('shows the LinAI dashboard destination and closes the session', async () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
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
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('设置')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('修改密码')
    expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('退出登录')
    expect(wrapper.find('[data-testid="web-admin-menu-item"]').exists()).toBe(false)

    await wrapper.get('[data-testid="settings-menu-item"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="settings-dialog"]').text()).toContain('设置')
    expect(wrapper.get('[data-testid="settings-dialog"]').text()).toContain('用量显示')
    expect(wrapper.get('[data-testid="settings-dialog"]').text()).toContain('关于信息')
    expect(wrapper.get('[data-testid="settings-dialog"]').text()).toContain('检查更新')
    expect(mocks.attachUsageUser).toHaveBeenCalledWith(mocks.session.user)

    await wrapper.get('[data-testid="settings-tab-about"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="settings-app-version"]').text()).toBe('0.1.2')
    await wrapper.get('[data-testid="close-settings-dialog"]').trigger('click')

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
    expect(wrapper.get('[aria-label="管理导航"]').text()).toContain('团队管理')
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

  it('checks and installs a desktop update from the account menu', async () => {
    const update = { version: '0.1.3' }
    mocks.checkUpdate.mockResolvedValue({
      available: true,
      update,
      info: { version: '0.1.3', currentVersion: '0.1.2', notes: '修复桌面端问题' },
    })
    mocks.installUpdate.mockImplementation(async (_update, onProgress) => {
      onProgress({ downloaded: 50, total: 100, percent: 50 })
    })

    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')
    await wrapper.get('[data-testid="settings-menu-item"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="settings-tab-updates"]').trigger('click')
    await wrapper.get('[data-testid="check-update-button"]').trigger('click')
    await flushPromises()

    expect(mocks.checkUpdate).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="desktop-update-status"]').text()).toContain('发现新版本 0.1.3')
    expect(mocks.toastInfo).toHaveBeenCalledWith('发现新版本 0.1.3')

    await wrapper.get('[data-testid="install-update"]').trigger('click')
    await flushPromises()

    expect(mocks.installUpdate).toHaveBeenCalledWith(update, expect.any(Function))
    expect(wrapper.get('[data-testid="desktop-update-status"]').text()).toContain('更新已安装，正在重启')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('更新已安装，正在重启')
  })

  it('reports desktop update check failures through Toast', async () => {
    mocks.checkUpdate.mockRejectedValue(new Error('更新服务不可用'))
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click')
    await wrapper.get('[data-testid="settings-menu-item"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="settings-tab-updates"]').trigger('click')
    await wrapper.get('[data-testid="check-update-button"]').trigger('click')
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('检查更新失败', {
      detail: '更新服务不可用',
    })
  })

  it('shows the personal user-group entry only to granted ordinary users', () => {
    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 2 }
    const granted = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(granted.get('[data-testid="user-group-nav-item"]').text()).toContain('团队管理')
    granted.unmount()

    mocks.session.userGroupCapabilities = { can_access: false, can_manage: false, group_count: 0 }
    const ungranted = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
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

  it('renders the unchanged desktop shell without mobile chrome', () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<div />' },
        },
      },
    })

    expect(wrapper.get('.app-rail').classes()).toContain('app-rail')
    expect(wrapper.text()).toContain('API 密钥')
    expect(wrapper.text()).toContain('渠道状态')
    expect(wrapper.text()).toContain('兑换')
    expect(wrapper.find('[data-testid="mobile-app-bar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-bottom-nav"]').exists()).toBe(false)
  })
})
