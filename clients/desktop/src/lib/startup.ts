import { invoke } from '@tauri-apps/api/core'

export const getLaunchAtStartup = () => invoke<boolean>('get_launch_at_startup')

export const setLaunchAtStartup = (enabled: boolean) =>
  invoke<boolean>('set_launch_at_startup', { enabled })

export function startupSettingsErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message.trim()) return error.message
  return '开机启动设置未能保存'
}
