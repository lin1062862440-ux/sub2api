import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'

import type { UsageDisplayAppearance, UsageDisplaySurface } from './storage'

async function safeInvoke(command: string, args?: Record<string, unknown>): Promise<void> {
  try {
    if (args) await invoke(command, args)
    else await invoke(command)
  } catch {
    // The host bridge is intentionally inert in Vite/browser preview mode.
  }
}

async function safeEmit(event: string, payload: unknown): Promise<void> {
  try {
    await emit(event, payload)
  } catch {
    // Tauri events are unavailable in Vite/browser preview mode.
  }
}

export interface UsageDisplayHostConfig {
  enabled: boolean
  surface: UsageDisplaySurface
  title: string
  appearance: UsageDisplayAppearance
}

export function configureUsageDisplay(config: UsageDisplayHostConfig): Promise<void> {
  return safeInvoke('configure_usage_display', { ...config })
}

export function setUsageDisplayTitle(title: string): Promise<void> {
  return safeInvoke('set_usage_display_title', { title })
}

export function setFloatingUsageExpanded(expanded: boolean): Promise<void> {
  return invoke('set_floating_usage_expanded', { expanded })
}

export function startFloatingUsageDrag(): Promise<void> {
  return safeInvoke('start_floating_usage_drag')
}

export function hideUsageDisplay(): Promise<void> {
  return safeInvoke('hide_usage_display')
}

export function openMainWindow(): Promise<void> {
  return safeInvoke('open_usage_main_window')
}

export function quitDesktopApp(): Promise<void> {
  return safeInvoke('quit_usage_display')
}

export function notifyUsageSessionChanged(userId: number | null): Promise<void> {
  return safeEmit('usage-display://session-changed', userId)
}

export function notifyUsageConfigChanged(userId: number): Promise<void> {
  return safeEmit('usage-display://config-changed', userId)
}
