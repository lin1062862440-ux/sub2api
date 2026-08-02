/**
 * Runtime platform detection.
 *
 * One codebase ships to every target; where behaviour must differ (window chrome
 * insets, modifier key labels) we branch here rather than forking the source.
 */
import { type } from '@tauri-apps/plugin-os'

export type Platform = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown'

const knownPlatforms: Platform[] = ['macos', 'windows', 'linux', 'android', 'ios']

let cached: Platform | null = null

export function platform(): Platform {
  if (cached) return cached
  try {
    const value = type()
    cached = knownPlatforms.includes(value as Platform) ? (value as Platform) : 'unknown'
  } catch {
    // Running in a plain browser (vite dev without Tauri).
    cached = 'unknown'
  }
  return cached
}

export const isMacOS = () => platform() === 'macos'
export const isWindows = () => platform() === 'windows'
export const isMobile = () => platform() === 'android' || platform() === 'ios'

/** Label for the primary modifier key, for keyboard hints in the UI. */
export const modifierLabel = () => (isMacOS() ? '⌘' : 'Ctrl')
