import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  invoke: vi.fn(),
  values: new Map<string, unknown>(),
  save: vi.fn(),
  channel: null as null | { onmessage: (value: unknown) => void },
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel {
    onmessage = (_value: unknown) => undefined
    constructor() {
      mocks.channel = this
    }
  },
  invoke: mocks.invoke,
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: mocks.fetch }))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class LazyStore {
    async get<T>(key: string): Promise<T | undefined> {
      return mocks.values.get(key) as T | undefined
    }
    async set(key: string, value: unknown) {
      mocks.values.set(key, value)
    }
    save = mocks.save
  },
}))

import {
  ANDROID_UPDATE_MANIFEST_URL,
  createAndroidUpdaterHostDependencies,
} from './android-updater-host'

describe('Android updater host dependencies', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.invoke.mockReset()
    mocks.values.clear()
    mocks.save.mockReset()
    mocks.channel = null
  })

  it('fetches only the fixed public Android manifest', async () => {
    const manifest = { version: '0.1.5' }
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => manifest })
    const dependencies = createAndroidUpdaterHostDependencies()

    await expect(dependencies.fetchManifest()).resolves.toBe(manifest)
    expect(ANDROID_UPDATE_MANIFEST_URL).toBe(
      'https://gitee.com/linsource/linai-desktop-release/releases/download/android-latest/android-latest.json',
    )
    expect(mocks.fetch).toHaveBeenCalledWith(
      ANDROID_UPDATE_MANIFEST_URL,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('uses the native plugin for installed version and download progress', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ version: '0.1.4', versionCode: 1_004 })
      .mockImplementationOnce(async (_command, args) => {
        args.onProgress.onmessage({ downloaded: 512, total: 1_024 })
        return { path: '/private/cache/linai-update-0.1.5.apk' }
      })
    const dependencies = createAndroidUpdaterHostDependencies()

    await expect(dependencies.installed()).resolves.toEqual({ version: '0.1.4', versionCode: 1_004 })
    const onProgress = vi.fn()
    await dependencies.download({
      version: '0.1.5', versionCode: 1_005, notes: '', publishedAt: '', url: 'https://gitee.com/a.apk', bytes: 1_024, sha256: 'a'.repeat(64), signature: 'signature',
    }, onProgress)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'plugin:android-updater|installed_version')
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'plugin:android-updater|download', {
      version: '0.1.5',
      url: 'https://gitee.com/a.apk',
      bytes: 1_024,
      onProgress: expect.anything(),
    })
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 512, total: 1_024 })
  })

  it('routes cryptographic verification through the contained Rust command', async () => {
    mocks.invoke.mockResolvedValue(undefined)
    const dependencies = createAndroidUpdaterHostDependencies()
    const request = { path: '/private/cache/a.apk', bytes: 12, sha256: 'b'.repeat(64), signature: 'signed' }

    await dependencies.verify(request)

    expect(mocks.invoke).toHaveBeenCalledWith('verify_android_update', request)
  })

  it('persists only finite non-negative cadence timestamps', async () => {
    mocks.values.set('android_updater:cadence', {
      lastSuccessMs: 123,
      lastFailureMs: Number.POSITIVE_INFINITY,
      extra: 'discarded',
    })
    const dependencies = createAndroidUpdaterHostDependencies()

    await expect(dependencies.readCadence()).resolves.toEqual({ lastSuccessMs: 123 })
    await dependencies.writeCadence({ lastFailureMs: 456 })

    expect(mocks.values.get('android_updater:cadence')).toEqual({ lastFailureMs: 456 })
    expect(mocks.save).toHaveBeenCalledOnce()
  })
})
