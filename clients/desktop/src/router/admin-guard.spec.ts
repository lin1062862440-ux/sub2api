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
      workspace: 'personal',
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
      workspace: 'admin',
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
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('macos'),
      toName: 'admin-dashboard',
      meta: { requiresAdmin: true },
    })).toEqual({ name: 'login' })

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
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
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('macos'),
      toName: 'user-groups',
      meta: { requiresUserGroupAccess: true },
    })).toBe(true)

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'personal',
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
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('android'),
      toName: 'api-keys',
      meta: { requiresCapability: 'apiKeys' },
    })).toEqual({ name: 'dashboard' })
  })

  it('redirects Android personal workspace away from excluded routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('android'),
      toName: 'channels',
      meta: { standardOnly: true },
    })).toEqual({ name: 'dashboard' })
  })

  it('redirects Android admin workspace away from excluded routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('android'),
      toName: 'admin-usage',
      meta: { requiresAdmin: true },
    })).toEqual({ name: 'admin-dashboard' })
  })

  it('prevents ordinary users from selecting admin workspace or routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('android'),
      toName: 'dashboard',
      meta: {},
    })).toEqual({ name: 'dashboard' })

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('android'),
      toName: 'admin-dashboard',
      meta: { requiresAdmin: true },
    })).toEqual({ name: 'dashboard' })
  })

  it('allows approved Android routes for their permitted workspace', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('android'),
      toName: 'subscriptions',
      meta: { standardOnly: true },
    })).toBe(true)

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('android'),
      toName: 'admin-accounts',
      meta: { requiresAdmin: true },
    })).toBe(true)
  })

  it('retains desktop access to routes excluded from the mobile allowlist', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'user',
      workspace: 'personal',
      runMode: 'standard',
      userGroupAccess: false,
      capabilities: capabilitiesFor('macos'),
      toName: 'channels',
      meta: { standardOnly: true },
    })).toBe(true)
  })
})
