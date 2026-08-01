import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ emit: mocks.emit }))

import * as host from './host'
import {
  configureUsageDisplay,
  hideUsageDisplay,
  notifyUsageConfigChanged,
  notifyUsageSessionChanged,
  openMainWindow,
  quitDesktopApp,
  setFloatingUsageExpanded,
  setUsageDisplayTitle,
  startFloatingUsageDrag,
} from './host'

describe('usage display host bridge', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined)
    mocks.emit.mockReset().mockResolvedValue(undefined)
  })

  it('maps usage display actions to narrow Tauri commands', async () => {
    await configureUsageDisplay({
      enabled: true,
      surface: 'floating-window',
      title: '$12.50',
      appearance: 'sunset',
      floatingStyle: 'bar',
    })
    await setUsageDisplayTitle('Claude Pro 73%')
    await setFloatingUsageExpanded(true)
    await startFloatingUsageDrag()
    await hideUsageDisplay()
    await openMainWindow()
    await quitDesktopApp()

    expect(mocks.invoke.mock.calls).toEqual([
      ['configure_usage_display', {
        enabled: true,
        surface: 'floating-window',
        title: '$12.50',
        appearance: 'sunset',
        floatingStyle: 'bar',
      }],
      ['set_usage_display_title', { title: 'Claude Pro 73%' }],
      ['set_floating_usage_expanded', { expanded: true }],
      ['start_floating_usage_drag'],
      ['hide_usage_display'],
      ['open_usage_main_window'],
      ['quit_usage_display'],
    ])
  })

  it('does not expose an internal-settings action through the external host bridge', () => {
    expect(host).not.toHaveProperty('openUsageDisplaySettings')
  })

  it('broadcasts session changes to the popover', async () => {
    await notifyUsageSessionChanged(42)
    await notifyUsageSessionChanged(null)

    expect(mocks.emit.mock.calls).toEqual([
      ['usage-display://session-changed', 42],
      ['usage-display://session-changed', null],
    ])
  })

  it('broadcasts configuration changes to the external surface', async () => {
    await notifyUsageConfigChanged(42)

    expect(mocks.emit).toHaveBeenCalledWith('usage-display://config-changed', 42)
  })

  it('does not reject when Tauri is unavailable in browser preview', async () => {
    mocks.invoke.mockRejectedValue(new Error('not running in Tauri'))
    mocks.emit.mockRejectedValue(new Error('not running in Tauri'))

    await expect(hideUsageDisplay()).resolves.toBeUndefined()
    await expect(notifyUsageSessionChanged(42)).resolves.toBeUndefined()
  })
})
