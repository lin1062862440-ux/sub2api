import { platform, type Platform } from '@/lib/platform'

export interface PlatformCapabilities {
  mobile: boolean
  apiKeys: boolean
  localConfig: boolean
  externalUsageDisplay: boolean
  desktopUpdater: boolean
  androidUpdater: boolean
  textExport: boolean
  desktopSecondInstance: boolean
  launchAtStartup: boolean
}

const desktop: PlatformCapabilities = {
  mobile: false,
  apiKeys: true,
  localConfig: true,
  externalUsageDisplay: true,
  desktopUpdater: true,
  androidUpdater: false,
  textExport: true,
  desktopSecondInstance: true,
  launchAtStartup: false,
}

const mobile: PlatformCapabilities = {
  mobile: true,
  apiKeys: false,
  localConfig: false,
  externalUsageDisplay: false,
  desktopUpdater: false,
  androidUpdater: false,
  textExport: false,
  desktopSecondInstance: false,
  launchAtStartup: false,
}

export const capabilitiesFor = (target: Platform): PlatformCapabilities =>
  target === 'android' || target === 'ios'
    ? { ...mobile, androidUpdater: target === 'android' }
    : { ...desktop, launchAtStartup: target === 'windows' }

export const appCapabilities = capabilitiesFor(platform())
