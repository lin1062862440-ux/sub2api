import { describe, expect, it, vi } from 'vitest'

import {
  createAndroidUpdater,
  type AndroidUpdaterDependencies,
  type AndroidUpdaterProgress,
} from './android-updater'

const validManifest = {
  version: '0.1.5',
  version_code: 1_005,
  notes: '安全更新',
  pub_date: '2026-08-03T00:00:00.000Z',
  platforms: {
    'android-aarch64': {
      url: 'https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk',
      bytes: 1_024,
      sha256: 'a'.repeat(64),
      signature: 'untrusted comment: signature\nRWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
  },
}

function dependencies(
  overrides: Partial<AndroidUpdaterDependencies> = {},
): AndroidUpdaterDependencies {
  return {
    now: () => 100_000_000,
    readCadence: vi.fn().mockResolvedValue({}),
    writeCadence: vi.fn().mockResolvedValue(undefined),
    installed: vi.fn().mockResolvedValue({ version: '0.1.4', versionCode: 1_004 }),
    fetchManifest: vi.fn().mockResolvedValue(validManifest),
    download: vi.fn().mockResolvedValue({ path: '/private/cache/linai-update-0.1.5.apk' }),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(undefined),
    validateArchive: vi.fn().mockResolvedValue({ status: 'ready' }),
    requestInstallPermission: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Android update coordinator', () => {
  it('suppresses a successful automatic check for 24 hours', async () => {
    const deps = dependencies({
      now: () => 86_399_000,
      readCadence: vi.fn().mockResolvedValue({ lastSuccessMs: 0 }),
    })
    const updater = createAndroidUpdater(deps)

    expect(await updater.check({ manual: false })).toBe(false)
    expect(deps.fetchManifest).not.toHaveBeenCalled()
    expect(updater.state.value.phase).toBe('idle')
  })

  it('suppresses an automatic retry for one hour after failure', async () => {
    const deps = dependencies({
      now: () => 3_599_000,
      readCadence: vi.fn().mockResolvedValue({ lastFailureMs: 0 }),
    })
    const updater = createAndroidUpdater(deps)

    expect(await updater.check({ manual: false })).toBe(false)
    expect(deps.fetchManifest).not.toHaveBeenCalled()
  })

  it('lets a manual check bypass both cadence windows', async () => {
    const deps = dependencies({
      readCadence: vi.fn().mockResolvedValue({
        lastSuccessMs: 99_999_999,
        lastFailureMs: 99_999_999,
      }),
    })
    const updater = createAndroidUpdater(deps)

    expect(await updater.check({ manual: true })).toBe(true)
    expect(deps.fetchManifest).toHaveBeenCalledOnce()
    expect(updater.state.value.phase).toBe('available')
  })

  it('records a valid no-update response as success', async () => {
    const currentManifest = structuredClone(validManifest)
    currentManifest.version = '0.1.4'
    currentManifest.version_code = 1_004
    currentManifest.platforms['android-aarch64'].url = currentManifest.platforms['android-aarch64'].url
      .replaceAll('0.1.5', '0.1.4')
    const deps = dependencies({ fetchManifest: vi.fn().mockResolvedValue(currentManifest) })
    const updater = createAndroidUpdater(deps)

    await updater.check({ manual: true })

    expect(updater.state.value.phase).toBe('up-to-date')
    expect(deps.writeCadence).toHaveBeenCalledWith({ lastSuccessMs: 100_000_000 })
  })

  it('keeps automatic failures silent and writes the retry time', async () => {
    const deps = dependencies({ fetchManifest: vi.fn().mockRejectedValue(new Error('secret body')) })
    const updater = createAndroidUpdater(deps)

    await updater.check({ manual: false })

    expect(updater.state.value).toMatchObject({ phase: 'idle', error: null })
    expect(deps.writeCadence).toHaveBeenCalledWith({ lastFailureMs: 100_000_000 })
  })

  it('redacts raw errors from a manual failure', async () => {
    const deps = dependencies({ fetchManifest: vi.fn().mockRejectedValue(new Error('token=secret')) })
    const updater = createAndroidUpdater(deps)

    await updater.check({ manual: true })

    expect(updater.state.value).toMatchObject({
      phase: 'error',
      error: '暂时无法检查更新，请稍后重试。',
    })
    expect(JSON.stringify(updater.state.value)).not.toContain('secret')
  })

  it('clamps progress and verifies the exact validated expectations', async () => {
    const progress: AndroidUpdaterProgress[] = []
    const deps = dependencies({
      download: vi.fn().mockImplementation(async (_release, onProgress) => {
        const event = { downloaded: 2_048, total: 1_024 }
        progress.push(event)
        onProgress(event)
        return { path: '/private/cache/linai-update-0.1.5.apk' }
      }),
    })
    const updater = createAndroidUpdater(deps)
    await updater.check({ manual: true })

    await updater.download()

    expect(progress).toHaveLength(1)
    expect(deps.verify).toHaveBeenCalledWith({
      path: '/private/cache/linai-update-0.1.5.apk',
      bytes: 1_024,
      sha256: 'a'.repeat(64),
      signature: validManifest.platforms['android-aarch64'].signature,
    })
    expect(updater.state.value).toMatchObject({
      phase: 'ready-to-install',
      downloadedBytes: 1_024,
      totalBytes: 1_024,
    })
  })

  it('returns to available without an error after cancellation', async () => {
    const deps = dependencies({ download: vi.fn().mockRejectedValue({ code: 'cancelled' }) })
    const updater = createAndroidUpdater(deps)
    await updater.check({ manual: true })

    await updater.download()

    expect(updater.state.value).toMatchObject({
      phase: 'available',
      downloadedBytes: 0,
      totalBytes: 1_024,
      error: null,
    })
  })

  it('preserves a verified path while install permission is required', async () => {
    const deps = dependencies({
      validateArchive: vi.fn().mockResolvedValue({ status: 'permission-required' }),
    })
    const updater = createAndroidUpdater(deps)
    await updater.check({ manual: true })
    await updater.download()

    expect(updater.state.value.phase).toBe('permission-required')
    await updater.requestInstallPermission()
    await updater.install()

    expect(deps.requestInstallPermission).toHaveBeenCalledOnce()
    expect(deps.install).toHaveBeenCalledWith('/private/cache/linai-update-0.1.5.apk')
  })
})
