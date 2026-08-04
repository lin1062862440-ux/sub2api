import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ store: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }))
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: mocks.store }))

import { clearSession, getSession, saveSession, StorageKey } from './storage'

describe('browser preview session storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('uses tab-scoped storage without constructing the Tauri store', async () => {
    await saveSession({ accessToken: 'preview-token', refreshToken: 'refresh-token', expiresIn: 60 })

    expect(mocks.store).not.toHaveBeenCalled()
    expect(await getSession()).toEqual({
      accessToken: 'preview-token',
      refreshToken: 'refresh-token',
      expiresAt: expect.any(Number),
    })
    expect(sessionStorage.getItem(StorageKey.accessToken)).toBe('"preview-token"')

    await clearSession()
    expect(await getSession()).toBeNull()
  })
})
