import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  windows: true,
  calls: [] as string[],
}))

vi.mock('@/lib/platform', () => ({
  isWindows: () => mocks.windows,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {
    mocks.calls.push('validate')
  }),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(async () => {
    mocks.calls.push('relaunch')
  }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

import { installDesktopUpdate } from './desktop-updater'

describe('installDesktopUpdate', () => {
  beforeEach(() => {
    mocks.windows = true
    mocks.calls = []
  })

  it('validates the current Windows install directory before installing', async () => {
    const update = {
      downloadAndInstall: vi.fn(async () => {
        mocks.calls.push('install')
      }),
    }

    await installDesktopUpdate(update as never)

    expect(mocks.calls).toEqual(['validate', 'install', 'relaunch'])
  })

  it('does not run the Windows directory check on other desktop platforms', async () => {
    mocks.windows = false
    const update = {
      downloadAndInstall: vi.fn(async () => {
        mocks.calls.push('install')
      }),
    }

    await installDesktopUpdate(update as never)

    expect(mocks.calls).toEqual(['install', 'relaunch'])
  })
})
