import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLaunchAtStartup: vi.fn(),
  setLaunchAtStartup: vi.fn(),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('LinAI'),
  getVersion: vi.fn().mockResolvedValue('0.1.4'),
}))

vi.mock('@/lib/startup', () => ({
  getLaunchAtStartup: mocks.getLaunchAtStartup,
  setLaunchAtStartup: mocks.setLaunchAtStartup,
  startupSettingsErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}))

vi.mock('@/features/usage-display/core/store', () => ({
  createUsageDisplayStore: () => ({
    state: {
      platform: 'windows',
      config: {
        enabled: false,
        source: 'balance',
        subscriptionId: null,
        surface: 'floating-window',
        appearance: 'sky',
        floatingStyle: 'orb',
      },
      subscriptions: [],
      trayTitle: '',
      error: '',
      balance: null,
      quotaSummary: null,
    },
    attachUser: vi.fn(),
    loadSubscriptions: vi.fn(),
    updateConfig: vi.fn(),
    stop: vi.fn(),
  }),
}))

vi.mock('@/features/usage-display/core/host', () => ({
  notifyUsageConfigChanged: vi.fn(),
}))

import SettingsDialog from './SettingsDialog.vue'

const baseProps = {
  modelValue: true,
  user: null,
  productName: 'LinAI',
  canUseUsageDisplay: false,
  canUseUpdater: false,
  canManageLaunchAtStartup: true,
  updateChecking: false,
  updateInstalling: false,
  updateProgress: null,
  updateMessage: '',
  hasAvailableUpdate: false,
  availableUpdateInfo: null,
  autoCheckUpdates: false,
}

describe('SettingsDialog launch at startup', () => {
  beforeEach(() => {
    mocks.getLaunchAtStartup.mockReset().mockResolvedValue(true)
    mocks.setLaunchAtStartup.mockReset()
  })

  it('loads the native state and lets the user disable startup', async () => {
    mocks.setLaunchAtStartup.mockResolvedValue(false)
    const wrapper = mount(SettingsDialog, {
      props: baseProps,
      global: { stubs: { Teleport: true, UsageDisplaySettingsForm: true } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="settings-tab-general"]').text()).toContain('常规设置')
    const checkbox = wrapper.get<HTMLInputElement>('[data-testid="launch-at-startup"]')
    expect(checkbox.element.checked).toBe(true)

    await checkbox.setValue(false)
    await flushPromises()

    expect(mocks.setLaunchAtStartup).toHaveBeenCalledWith(false)
    expect(checkbox.element.checked).toBe(false)
    expect(wrapper.text()).toContain('已关闭')
  })

  it('restores the previous state when Windows rejects the change', async () => {
    mocks.setLaunchAtStartup.mockRejectedValue(new Error('无法关闭开机启动'))
    const wrapper = mount(SettingsDialog, {
      props: baseProps,
      global: { stubs: { Teleport: true, UsageDisplaySettingsForm: true } },
    })
    await flushPromises()

    const checkbox = wrapper.get<HTMLInputElement>('[data-testid="launch-at-startup"]')
    await checkbox.setValue(false)
    await flushPromises()

    expect(checkbox.element.checked).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toBe('无法关闭开机启动')
  })

  it('does not show the Windows-only setting on unsupported platforms', async () => {
    const wrapper = mount(SettingsDialog, {
      props: { ...baseProps, canManageLaunchAtStartup: false },
      global: { stubs: { Teleport: true, UsageDisplaySettingsForm: true } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-tab-general"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="launch-at-startup"]').exists()).toBe(false)
    expect(mocks.getLaunchAtStartup).not.toHaveBeenCalled()
  })
})
