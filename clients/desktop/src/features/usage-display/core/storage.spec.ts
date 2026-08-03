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
      appearance: 'sky',
      floatingStyle: 'orb',
    })
    expect(first).not.toBe(second)
    expect(mocks.get).toHaveBeenCalledWith('usage_display:42')
    expect(mocks.get).toHaveBeenCalledWith('usage_display:installer-default')
  })

  it('uses the installer floating-window preference until the user has their own config', async () => {
    mocks.get
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        enabled: true,
        source: 'balance',
        subscriptionId: null,
        surface: 'floating-window',
        appearance: 'sky',
        floatingStyle: 'orb',
      })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
    expect(mocks.get).toHaveBeenNthCalledWith(1, 'usage_display:42')
    expect(mocks.get).toHaveBeenNthCalledWith(2, 'usage_display:installer-default')
  })

  it('keeps a user-specific config ahead of the installer default', async () => {
    mocks.get.mockResolvedValueOnce({
      enabled: false,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'meadow',
      floatingStyle: 'bar',
    })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: false,
      source: 'balance',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'meadow',
      floatingStyle: 'bar',
    })
    expect(mocks.get).toHaveBeenCalledOnce()
  })

  it('migrates a valid legacy subscription config to menu bar, sky, and orb', async () => {
    mocks.get.mockResolvedValue({ enabled: true, source: 'subscription', subscriptionId: 9 })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'menu-bar',
      appearance: 'sky',
      floatingStyle: 'orb',
    })
  })

  it('allows an incomplete subscription draft while display is disabled', async () => {
    mocks.get.mockResolvedValue({ enabled: false, source: 'subscription', subscriptionId: null })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: false,
      source: 'subscription',
      subscriptionId: null,
      surface: 'menu-bar',
      appearance: 'sky',
      floatingStyle: 'orb',
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
      appearance: 'sky',
      floatingStyle: 'orb',
    })
  })

  it.each([
    ['default', 'sky'],
    ['dark', 'meadow'],
    ['blur', 'sunset'],
  ])('migrates legacy %s appearance to %s', async (legacy, appearance) => {
    mocks.get.mockResolvedValue({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: legacy,
    })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance,
      floatingStyle: 'orb',
    })
  })

  it('normalizes an invalid floating style without discarding a valid appearance', async () => {
    mocks.get.mockResolvedValue({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: 'sunset',
      floatingStyle: 'pill',
    })

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual({
      enabled: true,
      source: 'balance',
      subscriptionId: null,
      surface: 'floating-window',
      appearance: 'sunset',
      floatingStyle: 'orb',
    })
  })

  it('preserves and saves the macOS native appearance', async () => {
    const config = {
      enabled: true,
      source: 'balance' as const,
      subscriptionId: null,
      surface: 'floating-window' as const,
      appearance: 'native' as const,
      floatingStyle: 'bar' as const,
    }
    mocks.get.mockResolvedValue(config)

    await expect(loadUsageDisplayConfig(42)).resolves.toEqual(config)
    await saveUsageDisplayConfig(42, config)

    expect(mocks.set).toHaveBeenCalledWith('usage_display:42', config)
    expect(mocks.save).toHaveBeenCalledOnce()
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
      appearance: 'sunset',
      floatingStyle: 'bar',
    })

    expect(mocks.set).toHaveBeenCalledWith('usage_display:42', {
      enabled: true,
      source: 'subscription',
      subscriptionId: 9,
      surface: 'floating-window',
      appearance: 'sunset',
      floatingStyle: 'bar',
    })
    expect(mocks.save).toHaveBeenCalledOnce()
  })
})
