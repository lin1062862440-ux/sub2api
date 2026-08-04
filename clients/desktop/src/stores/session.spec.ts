import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  logout: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
  unauthorized: null as null | (() => void),
  userGroupDenied: null as null | (() => void),
}))

vi.mock('@/api', () => ({
  getPublicSettings: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: mocks.logout,
}))
vi.mock('@/api/user-groups', () => ({
  getUserGroupCapabilities: mocks.capabilities,
}))
vi.mock('@/lib/storage', () => ({
  getSession: vi.fn().mockResolvedValue(null),
  saveSession: mocks.saveSession,
  clearSession: mocks.clearSession,
}))
vi.mock('@/lib/http', () => ({
  onUnauthorized: (listener: () => void) => {
    mocks.unauthorized = listener
    return () => { mocks.unauthorized = null }
  },
  onUserGroupAccessDenied: (listener: () => void) => {
    mocks.userGroupDenied = listener
    return () => { mocks.userGroupDenied = null }
  },
}))

import {
  completeLogin,
  hasUserGroupAccess,
  canManageUserGroups,
  session,
  signOut,
} from './session'

const user = {
  id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  avatar_url: null,
  role: 'user' as const,
  balance: 20,
  frozen_balance: 0,
  concurrency: 5,
  status: 'active' as const,
  created_at: '',
  updated_at: '',
}

describe('desktop user group capability state', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.logout.mockResolvedValue(undefined)
    await signOut()
  })

  it('grants administrators without requesting capabilities', async () => {
    await completeLogin({ access_token: 'token', user: { ...user, role: 'admin' } })

    expect(hasUserGroupAccess()).toBe(true)
    expect(canManageUserGroups()).toBe(true)
    expect(mocks.capabilities).not.toHaveBeenCalled()
  })

  it('uses delegated ordinary-user capabilities and fails closed', async () => {
    mocks.capabilities.mockResolvedValueOnce({ can_access: true, can_manage: false, group_count: 2 })
    await completeLogin({ access_token: 'token', user })

    expect(hasUserGroupAccess()).toBe(true)
    expect(canManageUserGroups()).toBe(false)
    expect(session.userGroupCapabilities?.group_count).toBe(2)

    mocks.capabilities.mockRejectedValueOnce(new Error('offline'))
    await completeLogin({ access_token: 'token-2', user })

    expect(hasUserGroupAccess()).toBe(false)
    expect(canManageUserGroups()).toBe(false)
  })

  it('revokes live access on a forbidden request and clears it on sign-out', async () => {
    mocks.capabilities.mockResolvedValueOnce({ can_access: true, can_manage: false, group_count: 1 })
    await completeLogin({ access_token: 'token', user })

    mocks.userGroupDenied?.()
    expect(hasUserGroupAccess()).toBe(false)
    expect(session.userGroupCapabilities).toEqual({ can_access: false, can_manage: false, can_manage_quota: false, group_count: 0 })

    await signOut()
    expect(session.userGroupCapabilities).toBeNull()
    expect(session.user).toBeNull()
  })
})
