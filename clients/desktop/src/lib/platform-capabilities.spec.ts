import { describe, expect, it } from 'vitest'
import { capabilitiesFor } from './platform-capabilities'

describe('platform capabilities', () => {
  it('keeps desktop integrations on macOS', () => {
    expect(capabilitiesFor('macos')).toMatchObject({
      mobile: false,
      apiKeys: true,
      localConfig: true,
      externalUsageDisplay: true,
      desktopUpdater: true,
      textExport: true,
      desktopSecondInstance: true,
    })
  })

  it('keeps Android focused on usage and administration', () => {
    expect(capabilitiesFor('android')).toEqual({
      mobile: true,
      apiKeys: false,
      localConfig: false,
      externalUsageDisplay: false,
      desktopUpdater: false,
      textExport: false,
      desktopSecondInstance: false,
    })
  })
})
