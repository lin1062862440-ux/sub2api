import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

const mocks = vi.hoisted(() => ({
  state: {
    platform: 'macos' as const,
    config: {
      enabled: true,
      source: 'balance' as 'balance' | 'subscription',
      subscriptionId: null as number | null,
      surface: 'menu-bar' as 'menu-bar' | 'floating-window',
      appearance: 'sky' as UsageDisplayAppearance,
      floatingStyle: 'orb' as 'orb' | 'bar',
    },
    subscriptions: [
      { id: 9, status: 'active', group: { id: 3, name: 'Claude Pro' } },
    ],
    trayTitle: '余额 $128.60',
    error: '',
  },
  attachUser: vi.fn(),
  loadSubscriptions: vi.fn(),
  updateConfig: vi.fn(),
  stop: vi.fn(),
  notifyConfigChanged: vi.fn(),
}))

vi.mock('@/features/usage-display/core/store', () => ({
  createUsageDisplayStore: () => ({
    state: mocks.state,
    attachUser: mocks.attachUser,
    loadSubscriptions: mocks.loadSubscriptions,
    updateConfig: mocks.updateConfig,
    stop: mocks.stop,
  }),
}))

vi.mock('@/features/usage-display/core/host', () => ({
  notifyUsageConfigChanged: mocks.notifyConfigChanged,
}))

import UsageDisplayDialog from './UsageDisplayDialog.vue'

const user = { id: 42, username: 'Lin', balance: 128.6 }

function mountDialog() {
  return mount(UsageDisplayDialog, {
    props: { modelValue: true, user: user as never },
    global: { stubs: { Teleport: true } },
  })
}

describe('UsageDisplayDialog', () => {
  beforeEach(() => {
    mocks.state.config = {
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'sky',
      floatingStyle: 'orb',
    }
    mocks.state.trayTitle = '余额 $128.60'
    mocks.state.error = ''
    mocks.attachUser.mockReset().mockResolvedValue(undefined)
    mocks.loadSubscriptions.mockReset().mockResolvedValue(undefined)
    mocks.updateConfig.mockReset().mockResolvedValue(undefined)
    mocks.stop.mockReset()
    mocks.notifyConfigChanged.mockReset().mockResolvedValue(undefined)
  })

  it('uses an internal settings dialog without external lifecycle actions', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-display-dialog"]').attributes('role')).toBe('dialog')
    expect(wrapper.text()).toContain('设置系统外部用量展示')
    expect(wrapper.text()).toContain('启用外部用量显示')
    expect(wrapper.text()).toContain('展示位置')
    expect(wrapper.text()).toContain('菜单栏')
    expect(wrapper.text()).toContain('悬浮窗')
    expect(wrapper.text()).toContain('账户余额')
    expect(wrapper.text()).toContain('订阅组')
    expect(wrapper.text()).toContain('展示样式')
    expect(wrapper.text()).toContain('清透蓝')
    expect(wrapper.text()).toContain('青柠黄')
    expect(wrapper.text()).toContain('珊瑚红')
    expect(wrapper.text()).toContain('完成')
    expect(wrapper.text()).not.toContain('刷新')
    expect(wrapper.text()).not.toContain('打开主窗口')
    expect(wrapper.text()).not.toContain('退出')
    expect(mocks.attachUser).toHaveBeenCalledWith(user)
    expect(mocks.loadSubscriptions).toHaveBeenCalledOnce()
  })

  it('selects a fixed subscription before publishing the enabled source', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.get('[data-testid="usage-source-subscription"]').trigger('click')

    expect(mocks.updateConfig).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="usage-subscription-select"]').setValue('9')
    await flushPromises()

    expect(mocks.updateConfig).toHaveBeenCalledWith({
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'menu-bar',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
    expect(mocks.notifyConfigChanged).toHaveBeenCalledWith(42)
  })

  it('publishes complete surface and appearance configurations', async () => {
    const surfaceWrapper = mountDialog()
    await flushPromises()
    await surfaceWrapper.get('[data-testid="usage-surface-floating-window"]').trigger('click')

    expect(mocks.updateConfig).toHaveBeenLastCalledWith({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: 'sky',
      floatingStyle: 'orb',
    })

    mocks.updateConfig.mockClear()
    const appearanceWrapper = mountDialog()
    await flushPromises()
    await appearanceWrapper.get('[data-testid="usage-appearance-sunset"]').trigger('click')

    expect(mocks.updateConfig).toHaveBeenLastCalledWith({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'sunset',
      floatingStyle: 'orb',
    })
  })

  it('selects a floating form and updates the matching preview', async () => {
    mocks.state.config.surface = 'floating-window'
    mocks.state.config.floatingStyle = 'bar'
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.text()).toContain('悬浮形态')
    expect(wrapper.get('[data-testid="usage-floating-style-bar"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="usage-floating-bar-preview"]').exists()).toBe(true)

    await wrapper.get('[data-testid="usage-floating-style-orb"]').trigger('click')

    expect(mocks.updateConfig).toHaveBeenLastCalledWith({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
  })

  it('renders the native capsule as an internal settings preview', async () => {
    mocks.state.config.surface = 'floating-window'
    mocks.state.config.floatingStyle = 'bar'
    mocks.state.config.appearance = 'native'
    const wrapper = mountDialog()
    await flushPromises()

    const preview = wrapper.get('[data-testid="usage-floating-bar-preview"]')
    expect(preview.attributes('data-appearance')).toBe('native')
    expect(preview.text()).toContain('可用余额')
  })

  it('labels the subscription floating preview as used', async () => {
    mocks.state.config.source = 'subscription'
    mocks.state.config.subscriptionId = 9
    mocks.state.config.surface = 'floating-window'
    mocks.state.config.floatingStyle = 'bar'
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-floating-bar-preview"]').text()).toContain('已使用')
  })

  it('closes from the title action and completion action', async () => {
    const titleClose = mountDialog()
    await titleClose.get('[data-testid="close-usage-display-dialog"]').trigger('click')
    expect(titleClose.emitted('update:modelValue')).toEqual([[false]])

    const completionClose = mountDialog()
    await completionClose.get('[data-testid="complete-usage-display-settings"]').trigger('click')
    expect(completionClose.emitted('update:modelValue')).toEqual([[false]])
  })
})
