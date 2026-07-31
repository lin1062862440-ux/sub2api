/**
 * Runtime platform detection.
 *
 * One codebase ships to every target; where behaviour must differ (window chrome
 * insets, modifier key labels) we branch here rather than forking the source.
 */
import { type } from '@tauri-apps/plugin-os'

export type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

let cached: Platform | null = null

export function platform(): Platform {
  if (cached) return cached
  try {
    const value = type()
    cached = value === 'macos' || value === 'windows' || value === 'linux' ? value : 'unknown'
  } catch {
    // Running in a plain browser (vite dev without Tauri).
    cached = 'unknown'
  }
  return cached
}

export const isMacOS = () => platform() === 'macos'
export const isWindows = () => platform() === 'windows'

/** Label for the primary modifier key, for keyboard hints in the UI. */
export const modifierLabel = () => (isMacOS() ? '⌘' : 'Ctrl')
