import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import {
  getLaunchAtStartup,
  setLaunchAtStartup,
  startupSettingsErrorMessage,
} from './startup'

describe('startup settings host', () => {
  beforeEach(() => invokeMock.mockReset())

  it('reads and updates the native launch-at-startup state', async () => {
    invokeMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(getLaunchAtStartup()).resolves.toBe(true)
    await expect(setLaunchAtStartup(false)).resolves.toBe(false)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_launch_at_startup')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_launch_at_startup', { enabled: false })
  })

  it('preserves a native error message for the settings UI', () => {
    expect(startupSettingsErrorMessage('无法关闭开机启动')).toBe('无法关闭开机启动')
    expect(startupSettingsErrorMessage(new Error('注册表访问失败'))).toBe('注册表访问失败')
    expect(startupSettingsErrorMessage(null)).toBe('开机启动设置未能保存')
  })
})
