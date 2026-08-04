export type Platform = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown'

const requestedPlatform = new URLSearchParams(window.location.search).get('platform')
const visualPlatform: Platform = requestedPlatform === 'android'
  ? 'android'
  : requestedPlatform === 'windows'
    ? 'windows'
    : 'macos'

export function platform(): Platform {
  return visualPlatform
}

export const isMacOS = () => visualPlatform === 'macos'
export const isWindows = () => visualPlatform === 'windows'
export const isMobile = () => visualPlatform === 'android'
export const modifierLabel = () => (isMacOS() ? '⌘' : 'Ctrl')
