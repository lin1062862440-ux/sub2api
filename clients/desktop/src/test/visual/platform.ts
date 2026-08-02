export type Platform = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown'

const requestedPlatform = new URLSearchParams(window.location.search).get('platform')
const visualPlatform: Platform = requestedPlatform === 'android' ? 'android' : 'macos'

export function platform(): Platform {
  return visualPlatform
}

export const isMacOS = () => visualPlatform === 'macos'
export const isWindows = () => false
export const isMobile = () => visualPlatform === 'android'
export const modifierLabel = () => (isMacOS() ? '⌘' : 'Ctrl')
