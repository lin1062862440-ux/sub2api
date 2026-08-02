import type { Router } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { capabilitiesFor } from '@/lib/platform-capabilities'
import { resolveRouteAccess, router, shouldExitUserGroupWorkspace } from './index'

const mobileRouteModules = {
  dashboard: () => import('@/mobile/views/MobileDashboardView.vue'),
  usage: () => import('@/mobile/views/MobileUsageView.vue'),
  subscriptions: () => import('@/mobile/views/MobileSubscriptionsView.vue'),
  'admin-dashboard': () => import('@/mobile/views/admin/MobileAdminDashboardView.vue'),
  'admin-accounts': () => import('@/mobile/views/admin/MobileAdminAccountsView.vue'),
  'admin-groups': () => import('@/mobile/views/admin/MobileAdminGroupsView.vue'),
  'admin-users': () => import('@/mobile/views/admin/MobileAdminUsersView.vue'),
  'user-groups': () => import('@/mobile/views/admin/MobileUserGroupsView.vue'),
  'admin-subscriptions': () => import('@/mobile/views/admin/MobileAdminSubscriptionsView.vue'),
}

const desktopRouteModules = {
  dashboard: () => import('@/views/DashboardView.vue'),
  usage: () => import('@/views/UsageView.vue'),
  subscriptions: () => import('@/views/SubscriptionsView.vue'),
  'admin-dashboard': () => import('@/views/admin/AdminDashboardView.vue'),
  'admin-accounts': () => import('@/views/admin/AdminAccountsView.vue'),
  'admin-groups': () => import('@/views/admin/AdminGroupsView.vue'),
  'admin-users': () => import('@/views/admin/AdminUsersView.vue'),
  'user-groups': () => import('@/views/UserGroupsView.vue'),
  'admin-subscriptions': () => import('@/views/admin/AdminSubscriptionsView.vue'),
}

async function evaluatedRouter(mobile: boolean) {
  vi.resetModules()
  vi.doMock('@/lib/platform-capabilities', () => ({
    appCapabilities: {
      mobile,
      apiKeys: !mobile,
      localConfig: !mobile,
      externalUsageDisplay: !mobile,
      textExport: !mobile,
      desktopSecondInstance: !mobile,
    },
    capabilitiesFor: (target: string) => ({
      mobile: target === 'android' || target === 'ios',
      apiKeys: target !== 'android' && target !== 'ios',
      localConfig: target !== 'android' && target !== 'ios',
      externalUsageDisplay: target !== 'android' && target !== 'ios',
      textExport: target !== 'android' && target !== 'ios',
      desktopSecondInstance: target !== 'android' && target !== 'ios',
    }),
  }))
  const module = await import('./index')
  vi.doUnmock('@/lib/platform-capabilities')
  return module.router
}

async function lazyRouteComponent(platformRouter: Router, name: string) {
  const record = platformRouter.getRoutes().find((route) => route.name === name)
  const component = record?.components?.default
  expect(typeof component).toBe('function')
  const loaded = await (component as () => Promise<{ default: unknown }>)()
  return loaded.default
}

describe('desktop administrator route guard', () => {
  it('evaluates all nine approved routes to mobile lazy views on Android', async () => {
    const androidRouter = await evaluatedRouter(true)

    for (const [name, loadExpected] of Object.entries(mobileRouteModules)) {
      const expected = await loadExpected()
      expect(await lazyRouteComponent(androidRouter, name), name).toBe(expected.default)
    }
  })

  it('retains all nine original desktop lazy views outside mobile mode', async () => {
    const desktopRouter = await evaluatedRouter(false)

    for (const [name, loadExpected] of Object.entries(desktopRouteModules)) {
      const expected = await loadExpected()
      expect(await lazyRouteComponent(desktopRouter, name), name).toBe(expected.default)
    }
  })

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
    })).toEqual({ name: 'admin-dashboard' })
  })

  it('redirects Android simple mode away from admin standard-only routes', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
      runMode: 'simple',
      userGroupAccess: true,
      capabilities: capabilitiesFor('android'),
      toName: 'admin-users',
      meta: { requiresAdmin: true, standardOnly: true },
    })).toEqual({ name: 'admin-dashboard' })
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

  it('retains dashboard redirects for desktop capability failures', () => {
    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: capabilitiesFor('macos'),
      toName: 'api-keys',
      meta: { requiresCapability: 'apiKeys' },
    })).toBe(true)

    expect(resolveRouteAccess({
      authenticated: true,
      role: 'admin',
      workspace: 'admin',
      runMode: 'standard',
      userGroupAccess: true,
      capabilities: { ...capabilitiesFor('macos'), apiKeys: false },
      toName: 'api-keys',
      meta: { requiresCapability: 'apiKeys' },
    })).toEqual({ name: 'dashboard' })
  })
})
