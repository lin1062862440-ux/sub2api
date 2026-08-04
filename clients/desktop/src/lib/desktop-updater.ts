import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { isWindows } from '@/lib/platform'

export interface AvailableDesktopUpdate {
  version: string
  currentVersion: string
  date?: string
  notes?: string
}

export interface DesktopUpdateCheck {
  available: boolean
  update?: Update
  info?: AvailableDesktopUpdate
}

export interface DesktopUpdateProgress {
  downloaded: number
  total?: number
  percent?: number
}

export function updateInfo(update: Update): AvailableDesktopUpdate {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    notes: update.body,
  }
}

export async function checkDesktopUpdate(): Promise<DesktopUpdateCheck> {
  const update = await check({ timeout: 15000 })
  if (!update) return { available: false }
  return { available: true, update, info: updateInfo(update) }
}

export async function installDesktopUpdate(
  update: Update,
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<void> {
  if (isWindows()) {
    await invoke('validate_windows_update_install_dir')
  }

  let downloaded = 0
  let total: number | undefined

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloaded = 0
      total = event.data.contentLength
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
    } else if (event.event === 'Finished') {
      downloaded = total ?? downloaded
    }

    onProgress?.({
      downloaded,
      total,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined,
    })
  })

  await relaunch()
}

export function desktopUpdateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/not allowed|permission/i.test(message)) return '更新权限未启用，请重新打包客户端'
  if (/decod|json|body|expected value/i.test(message)) return '更新源返回的内容不是有效 JSON'
  if (/endpoint|404|not found/i.test(message)) return '更新源暂不可用'
  if (/network|request|timed out|fetch/i.test(message)) return '网络连接失败，请稍后重试'
  if (/signature/i.test(message)) return '更新包签名校验失败'
  return message || '检查更新失败'
}
