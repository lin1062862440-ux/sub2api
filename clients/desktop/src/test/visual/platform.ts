export type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

export function platform(): Platform {
  return 'macos'
}

export const isMacOS = () => true
export const isWindows = () => false
export const modifierLabel = () => '⌘'
