import type { Router } from 'vue-router'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { capabilitiesFor } from '@/lib/platform-capabilities'
import { resolveRouteAccess, router, shouldExitUserGroupWorkspace, stopUserGroupAccessWatch } from './index'

const mobileRouteModules = {
  dashboard: () => import('@/mobile/views/MobileDashboardView.vue'),
  usage: () => import('@/mobile/views/MobileUsageView.vue'),
  subscriptions: () => import('@/mobile/views/MobileSubscriptionsView.vue'),
  'admin-dashboard': () => import('@/mobile/views/admin/MobileAdminDashboardView.vue'),
  'admin-accounts': () => import('@/mobile/views/admin/MobileAdminAccountsView.vue'),
  'admin-groups': () => import('@/mobile/views/admin/MobileAdminGroupsView.vue'),
  'admin-users': () => import('@/mobile/views/admin/MobileAdminUsersView.vue'),
  'user-groups': () => import('@/mobile/views/admin/MobileUserGroupsView.vue'),
  'user-group-members': () => import('@/mobile/views/admin/MobileTeamWorkspaceView.vue'),
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
  'user-group-members': () => import('@/views/UserGroupMembersView.vue'),
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
  return { router: module.router, stopWatch: module.stopUserGroupAccessWatch }
}

async function lazyRouteComponent(platformRouter: Router, name: string) {
  const record = platformRouter.getRoutes().find((route) => route.name === name)
  const component = record?.components?.default
  expect(typeof component).toBe('function')
  const loaded = await (component as () => Promise<{ default: unknown }>)()
  return loaded.default
}

describe('desktop administrator route guard', () => {
  afterAll(() => stopUserGroupAccessWatch())

  it('evaluates all approved routes to mobile lazy views on Android', async () => {
    const evaluated = await evaluatedRouter(true)

    try {
      for (const [name, loadExpected] of Object.entries(mobileRouteModules)) {
        const expected = await loadExpected()
        expect(await lazyRouteComponent(evaluated.router, name), name).toBe(expected.default)
      }
    } finally {
      evaluated.stopWatch()
    }
  })

  it('retains all original desktop lazy views outside mobile mode', async () => {
    const evaluated = await evaluatedRouter(false)

    try {
      for (const [name, loadExpected] of Object.entries(desktopRouteModules)) {
        const expected = await loadExpected()
        expect(await lazyRouteComponent(evaluated.router, name), name).toBe(expected.default)
      }
    } finally {
      evaluated.stopWatch()
    }
  }, 15_000)

  it('registers the administrator group management route', () => {
    expect(router.hasRoute('admin-groups')).toBe(true)
  })

  it('uses team terminology and redirects legacy quota routes into the combined workspace', () => {
    const directory = router.getRoutes().find((route) => route.name === 'user-groups')
    const members = router.getRoutes().find((route) => route.name === 'user-group-members')
    const quota = router.getRoutes().find((route) => route.name === 'user-group-quota')
    const subscriptions = router.getRoutes().find((route) => route.path === '/user-group-subscriptions')

    expect(directory?.meta.title).toBe('团队管理')
    expect(members?.meta.title).toBe('成员与配额')
    expect(quota?.redirect).toBeTypeOf('function')
    expect((quota?.redirect as Function)({ params: { id: '7' }, query: { from: 'old' } })).toEqual({
      name: 'user-group-members',
      params: { id: '7' },
      query: { from: 'old', openQuota: '1' },
    })
    expect((subscriptions?.redirect as Function)({ query: { group_id: '7' } })).toEqual({
      name: 'user-group-members',
      params: { id: '7' },
      query: { openQuota: '1' },
    })
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
