import { Channel, invoke } from '@tauri-apps/api/core'
import { fetch } from '@tauri-apps/plugin-http'
import { LazyStore } from '@tauri-apps/plugin-store'

import {
  createAndroidUpdater,
  type AndroidArchiveValidation,
  type AndroidDownloadResult,
  type AndroidInstalledVersion,
  type AndroidUpdaterCadence,
  type AndroidUpdaterDependencies,
  type AndroidUpdaterProgress,
  type AndroidVerifyRequest,
} from './android-updater'

export const ANDROID_UPDATE_MANIFEST_URL =
  'https://gitee.com/linsource/linai-desktop-release/releases/download/android-latest/android-latest.json'

const cadenceKey = 'android_updater:cadence'
const store = new LazyStore('linai.json', { autoSave: 100 })

function normalizedTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function normalizeCadence(value: unknown): AndroidUpdaterCadence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const candidate = value as Record<string, unknown>
  const lastSuccessMs = normalizedTimestamp(candidate.lastSuccessMs)
  const lastFailureMs = normalizedTimestamp(candidate.lastFailureMs)
  return {
    ...(lastSuccessMs === undefined ? {} : { lastSuccessMs }),
    ...(lastFailureMs === undefined ? {} : { lastFailureMs }),
  }
}

export function createAndroidUpdaterHostDependencies(): AndroidUpdaterDependencies {
  return {
    now: Date.now,
    async readCadence() {
      return normalizeCadence(await store.get<unknown>(cadenceKey))
    },
    async writeCadence(cadence) {
      await store.set(cadenceKey, normalizeCadence(cadence))
      await store.save()
    },
    installed() {
      return invoke<AndroidInstalledVersion>('plugin:android-updater|installed_version')
    },
    async fetchManifest() {
      const response = await fetch(ANDROID_UPDATE_MANIFEST_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw { code: 'manifest_unavailable' }
      return response.json()
    },
    download(release, onProgress) {
      const channel = new Channel<AndroidUpdaterProgress>()
      channel.onmessage = onProgress
      return invoke<AndroidDownloadResult>('plugin:android-updater|download', {
        version: release.version,
        url: release.url,
        bytes: release.bytes,
        onProgress: channel,
      })
    },
    cancelDownload() {
      return invoke('plugin:android-updater|cancel_download')
    },
    verify(request: AndroidVerifyRequest) {
      return invoke('verify_android_update', { ...request })
    },
    validateArchive(path: string) {
      return invoke<AndroidArchiveValidation>('plugin:android-updater|validate_archive', { path })
    },
    requestInstallPermission() {
      return invoke('plugin:android-updater|request_install_permission')
    },
    install(path: string) {
      return invoke('plugin:android-updater|install', { path })
    },
    cleanup(retainedVersion?: string) {
      return invoke('plugin:android-updater|cleanup', { retainedVersion })
    },
  }
}

export const androidUpdater = createAndroidUpdater(createAndroidUpdaterHostDependencies())
