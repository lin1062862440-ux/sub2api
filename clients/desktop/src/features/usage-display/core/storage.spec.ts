import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get = mocks.get
    set = mocks.set
    save = mocks.save
  },
}))

import {
  defaultUsageDisplayConfig,
  loadUsageDisplayConfig,
  saveUsageDisplayConfig,
} from './storage'

describe('usage display storage', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.set.mockReset()
    mocks.save.mockReset()
  })

  it('returns a fresh disabled balance config when no value exists', async () => {
    mocks.get.mockResolvedValue(undefined)

    const first = await loadUsageDisplayConfig(42)
    const second = defaultUsageDisplayConfig()

    expect(first).toEqual({
      enabled: false,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'default',
    })
    expect(first).not.toBe(second)
    expect(mocks.get).toHaveBeenCalledWith('usage_display:42')
  })

  it('migrates a valid legacy subscription config to menu bar and default appearance', async () => {
    mocks.get.mockResolvedValue({ enabled: true, source: 'subscription', subscriptionId: 9 })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'menu-bar',
      appearance: 'default',
    })
  })

  it('allows an incomplete subscription draft while display is disabled', async () => {
    mocks.get.mockResolvedValue({ enabled: false, source: 'subscription', subscriptionId: null })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: false,
      source: 'subscription',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'default',
    })
  })

  it('normalizes unknown surface and appearance fields independently', async () => {
    mocks.get.mockResolvedValue({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'desktop-widget',
      appearance: 'neon',
    })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'default',
    })
  })

  it.each([
    null,
    { enabled: 'yes', source: 'balance', subscriptionId: null },
    { enabled: true, source: 'other', subscriptionId: null },
    { enabled: true, source: 'subscription', subscriptionId: 0 },
  ])('falls back when stored data is invalid', async (value) => {
    mocks.get.mockResolvedValue(value)
    await expect(loadUsageDisplayConfig(7)).resolves.toEqual(defaultUsageDisplayConfig())
  })

  it('saves one validated config under the user key', async () => {
    await saveUsageDisplayConfig(42, {
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'floating-window',
      appearance: 'blur',
    })

    expect(mocks.set).toHaveBeenCalledWith('usage_display:42', {
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'floating-window',
      appearance: 'blur',
    })
    expect(mocks.save).toHaveBeenCalledOnce()
  })
})
