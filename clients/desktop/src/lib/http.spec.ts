import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: mocks.fetch }))
vi.mock('./storage', () => ({
  getSession: mocks.getSession,
  saveSession: mocks.saveSession,
  clearSession: mocks.clearSession,
}))

import { http, onAdminAccessDenied, onUserGroupAccessDenied } from './http'

function forbiddenResponse() {
  return {
    ok: false,
    status: 403,
    json: vi.fn().mockResolvedValue({ code: 40301, message: 'administrator required', data: null }),
  }
}

describe('admin authorization failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh' })
    mocks.fetch.mockResolvedValue(forbiddenResponse())
  })

  it('notifies the shell when an administrator request is forbidden', async () => {
    const listener = vi.fn()
    const unsubscribe = onAdminAccessDenied(listener)

    await expect(http.get('/admin/users')).rejects.toMatchObject({ status: 403 })

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('does not treat an ordinary forbidden request as an administrator role loss', async () => {
    const listener = vi.fn()
    const unsubscribe = onAdminAccessDenied(listener)

    await expect(http.get('/profile')).rejects.toMatchObject({ status: 403 })

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('user group authorization failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh' })
    mocks.fetch.mockResolvedValue(forbiddenResponse())
  })

  it('notifies the shell when a user group request is forbidden', async () => {
    const listener = vi.fn()
    const unsubscribe = onUserGroupAccessDenied(listener)

    await expect(http.get('/user-groups/7/usage')).rejects.toMatchObject({ status: 403 })

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('does not treat an unrelated forbidden request as user group access loss', async () => {
    const listener = vi.fn()
    const unsubscribe = onUserGroupAccessDenied(listener)

    await expect(http.get('/profile')).rejects.toMatchObject({ status: 403 })

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('text responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh' })
  })

  it('returns authenticated CSV text without expecting an API envelope', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('id,code\n1,LINAI-TEST\n'),
    })

    await expect(http.getText('/admin/redeem-codes/export', {
      query: { status: 'unused' },
    })).resolves.toBe('id,code\n1,LINAI-TEST\n')

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/redeem-codes/export?status=unused'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
  })

  it('posts a JSON request and returns an authenticated text stream', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('data: {"type":"test_complete","success":true}\n\n'),
    })

    await expect(http.postText('/admin/accounts/8/test', { mode: 'default' })).resolves.toContain(
      'test_complete',
    )

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/accounts/8/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mode: 'default' }),
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
  })

  it('refreshes an expired session before retrying a text export', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          code: 0,
          message: 'ok',
          data: { access_token: 'fresh-token', refresh_token: 'fresh-refresh' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('id,code\n'),
      })
    mocks.getSession
      .mockResolvedValueOnce({ accessToken: 'expired-token', refreshToken: 'refresh' })
      .mockResolvedValueOnce({ accessToken: 'expired-token', refreshToken: 'refresh' })
      .mockResolvedValueOnce({ accessToken: 'fresh-token', refreshToken: 'fresh-refresh' })

    await expect(http.getText('/admin/redeem-codes/export')).resolves.toBe('id,code\n')
    expect(mocks.saveSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'fresh-token' }))
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
  })
})
