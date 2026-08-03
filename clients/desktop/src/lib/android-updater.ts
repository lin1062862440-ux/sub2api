import { readonly, ref, type DeepReadonly, type Ref } from 'vue'

import {
  decodeAndroidUpdateManifest,
  type AndroidUpdateRelease,
} from './android-updater-manifest'

const SUCCESS_INTERVAL_MS = 86_400_000
const FAILURE_BACKOFF_MS = 3_600_000

export type AndroidUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'permission-required'
  | 'ready-to-install'
  | 'error'

export interface AndroidUpdateState {
  phase: AndroidUpdatePhase
  release: AndroidUpdateRelease | null
  installedVersion: string | null
  downloadedBytes: number
  totalBytes: number
  error: string | null
}

export interface AndroidUpdaterCadence {
  lastSuccessMs?: number
  lastFailureMs?: number
}

export interface AndroidInstalledVersion {
  version: string
  versionCode: number
}

export interface AndroidUpdaterProgress {
  downloaded: number
  total: number
}

export interface AndroidDownloadResult {
  path: string
}

export interface AndroidArchiveValidation {
  status: 'ready' | 'permission-required'
}

export interface AndroidVerifyRequest {
  path: string
  bytes: number
  sha256: string
  signature: string
}

export interface AndroidUpdaterDependencies {
  now: () => number
  readCadence: () => Promise<AndroidUpdaterCadence>
  writeCadence: (cadence: AndroidUpdaterCadence) => Promise<void>
  installed: () => Promise<AndroidInstalledVersion>
  fetchManifest: () => Promise<unknown>
  download: (
    release: AndroidUpdateRelease,
    onProgress: (progress: AndroidUpdaterProgress) => void,
  ) => Promise<AndroidDownloadResult>
  cancelDownload: () => Promise<void>
  verify: (request: AndroidVerifyRequest) => Promise<void>
  validateArchive: (path: string) => Promise<AndroidArchiveValidation>
  requestInstallPermission: () => Promise<void>
  install: (path: string) => Promise<void>
  cleanup: (retainedVersion?: string) => Promise<void>
}

export interface AndroidUpdater {
  state: DeepReadonly<Ref<AndroidUpdateState>>
  check(options: { manual: boolean }): Promise<boolean>
  download(): Promise<void>
  cancel(): Promise<void>
  requestInstallPermission(): Promise<void>
  install(): Promise<void>
  dismissError(): void
}

function initialState(): AndroidUpdateState {
  return {
    phase: 'idle',
    release: null,
    installedVersion: null,
    downloadedBytes: 0,
    totalBytes: 0,
    error: null,
  }
}

function isRecent(timestamp: number | undefined, now: number, interval: number): boolean {
  return typeof timestamp === 'number'
    && Number.isFinite(timestamp)
    && timestamp >= 0
    && now >= timestamp
    && now - timestamp < interval
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code : ''
}

function isSecurityError(error: unknown): boolean {
  return [
    'unsafe_path',
    'missing_file',
    'size_mismatch',
    'digest_mismatch',
    'signature_mismatch',
    'package_name_mismatch',
    'version_code_mismatch',
    'certificate_mismatch',
  ].includes(errorCode(error))
}

export function createAndroidUpdater(dependencies: AndroidUpdaterDependencies): AndroidUpdater {
  const mutableState = ref<AndroidUpdateState>(initialState())
  let checking = false
  let downloading = false
  let pendingPath: string | null = null
  let cleanupAttempted = false

  async function saveCadence(cadence: AndroidUpdaterCadence) {
    try {
      await dependencies.writeCadence(cadence)
    } catch {
      // A store failure must not turn a valid update check into a visible error.
    }
  }

  async function cleanupOnce() {
    if (cleanupAttempted) return
    cleanupAttempted = true
    try {
      await dependencies.cleanup()
    } catch {
      // Native cleanup is best effort and exposes no local path to the UI.
    }
  }

  async function check({ manual }: { manual: boolean }): Promise<boolean> {
    if (checking || downloading) return false
    checking = true
    const previous = { ...mutableState.value }
    const now = dependencies.now()

    try {
      await cleanupOnce()
      let cadence: AndroidUpdaterCadence = {}
      try {
        cadence = await dependencies.readCadence()
      } catch {
        cadence = {}
      }
      if (
        !manual
        && (
          isRecent(cadence.lastSuccessMs, now, SUCCESS_INTERVAL_MS)
          || isRecent(cadence.lastFailureMs, now, FAILURE_BACKOFF_MS)
        )
      ) return false

      mutableState.value = {
        ...previous,
        phase: 'checking',
        error: null,
      }
      const installed = await dependencies.installed()
      const manifest = await dependencies.fetchManifest()
      const release = decodeAndroidUpdateManifest(manifest, 0)

      await saveCadence({ lastSuccessMs: now })
      if (release.versionCode <= installed.versionCode) {
        mutableState.value = {
          ...initialState(),
          phase: manual ? 'up-to-date' : 'idle',
          installedVersion: installed.version,
        }
        return true
      }

      mutableState.value = {
        phase: 'available',
        release,
        installedVersion: installed.version,
        downloadedBytes: 0,
        totalBytes: release.bytes,
        error: null,
      }
      return true
    } catch {
      if (!manual) {
        await saveCadence({ lastFailureMs: now })
        mutableState.value = previous.phase === 'available'
          ? previous
          : initialState()
      } else {
        mutableState.value = {
          ...previous,
          phase: 'error',
          error: '暂时无法检查更新，请稍后重试。',
        }
      }
      return true
    } finally {
      checking = false
    }
  }

  async function download(): Promise<void> {
    const release = mutableState.value.release
    if (!release || downloading) return
    downloading = true
    pendingPath = null
    mutableState.value = {
      ...mutableState.value,
      phase: 'downloading',
      downloadedBytes: 0,
      totalBytes: release.bytes,
      error: null,
    }

    try {
      const result = await dependencies.download(release, (progress) => {
        const reported = Number.isFinite(progress.downloaded) ? progress.downloaded : 0
        mutableState.value.downloadedBytes = Math.min(
          release.bytes,
          Math.max(0, Math.trunc(reported)),
        )
      })
      mutableState.value.downloadedBytes = release.bytes
      mutableState.value.phase = 'verifying'
      await dependencies.verify({
        path: result.path,
        bytes: release.bytes,
        sha256: release.sha256,
        signature: release.signature,
      })
      const validation = await dependencies.validateArchive(result.path)
      pendingPath = result.path
      mutableState.value.phase = validation.status === 'permission-required'
        ? 'permission-required'
        : 'ready-to-install'
    } catch (error) {
      pendingPath = null
      if (errorCode(error) === 'cancelled') {
        mutableState.value = {
          ...mutableState.value,
          phase: 'available',
          downloadedBytes: 0,
          error: null,
        }
      } else {
        if (isSecurityError(error)) {
          try {
            await dependencies.cleanup()
          } catch {
            // Native cleanup errors remain redacted.
          }
        }
        mutableState.value = {
          ...mutableState.value,
          phase: 'error',
          error: isSecurityError(error)
            ? '更新包安全校验失败，请重新下载。'
            : errorCode(error) === 'storage_full'
              ? `存储空间不足，需要至少 ${release.bytes} 字节可用空间。`
              : '更新包下载失败，请检查网络后重试。',
        }
      }
    } finally {
      downloading = false
    }
  }

  async function cancel(): Promise<void> {
    if (!downloading) return
    try {
      await dependencies.cancelDownload()
    } catch {
      // The active download settles the final state and cleans its partial file.
    }
  }

  async function requestInstallPermission(): Promise<void> {
    if (!pendingPath || mutableState.value.phase !== 'permission-required') return
    try {
      await dependencies.requestInstallPermission()
    } catch {
      mutableState.value = {
        ...mutableState.value,
        phase: 'error',
        error: '无法打开安装授权设置，请稍后重试。',
      }
    }
  }

  async function install(): Promise<void> {
    if (!pendingPath) return
    try {
      await dependencies.install(pendingPath)
      mutableState.value.phase = 'ready-to-install'
      mutableState.value.error = null
    } catch (error) {
      mutableState.value = {
        ...mutableState.value,
        phase: errorCode(error) === 'permission_required' ? 'permission-required' : 'error',
        error: errorCode(error) === 'permission_required'
          ? null
          : '无法打开系统安装程序，请稍后重试。',
      }
    }
  }

  function dismissError() {
    mutableState.value = mutableState.value.release
      ? { ...mutableState.value, phase: 'available', error: null }
      : initialState()
  }

  return {
    state: readonly(mutableState),
    check,
    download,
    cancel,
    requestInstallPermission,
    install,
    dismissError,
  }
}
