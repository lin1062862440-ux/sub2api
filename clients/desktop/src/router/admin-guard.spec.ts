import { describe, expect, it } from 'vitest'

import { capabilitiesFor } from '@/lib/platform-capabilities'
import { resolveRouteAccess, router, shouldExitUserGroupWorkspace } from './index'

describe('desktop administrator route guard', () => {
  it('registers the administrator group management route', () => {
    expect(router.hasRoute('admin-groups')).toBe(true)
  })

  it('redirects an ordinary user away from administrator routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('macos'),
      toName: 'admin-dashboard',
      meta: { requiresAdmin: true },
    })).toEqual({ name: 'dashboard' })
  })

  it('allows an administrator into administrator routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('macos'),
      toName: 'admin-dashboard',
      meta: { requiresAdmin: true },
    })).toBe(true)
  })

  it('retains existing authentication and simple-mode rules', () => {
    expect(resolveRouteAccess({
      authenticated: false,
      role: null,
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('macos'),
      toName: 'admin-dashboard',
      meta: { requiresAdmin: true },
    })).toEqual({ name: 'login' })

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      runMode: 'simple',
      userGroupAccess: true,
      capabilities: capabilitiesFor('macos'),
      toName: 'usage',
      meta: { standardOnly: true },
    })).toEqual({ name: 'dashboard' })
  })

  it('allows only users with organizational group access into shared group routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('macos'),
      toName: 'user-groups',
      meta: { requiresUserGroupAccess: true },
    })).toBe(true)

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('macos'),
      toName: 'user-groups',
      meta: { requiresUserGroupAccess: true },
    })).toEqual({ name: 'dashboard' })
  })

  it('exits the user group workspace after access is revoked', () => {
    expect(shouldExitUserGroupWorkspace(false, { userGroupWorkspace: true })).toBe(true)
    expect(shouldExitUserGroupWorkspace(true, { userGroupWorkspace: true })).toBe(false)
    expect(shouldExitUserGroupWorkspace(false, { userGroupWorkspace: false })).toBe(false)
  })

  it('redirects Android away from desktop-only routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('android'),
      toName: 'api-keys',
      meta: { requiresCapability: 'apiKeys' },
    })).toEqual({ name: 'dashboard' })
  })
})
