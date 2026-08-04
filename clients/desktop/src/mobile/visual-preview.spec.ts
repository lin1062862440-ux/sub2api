import path from 'node:path'
import { resolveConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { workspaceDestination } from '@/lib/admin-workspace'
import { isMobileRouteAllowed } from '@/mobile/navigation'

function setSearch(search = '') {
  window.history.replaceState({}, '', `/${search ? `?${search}` : ''}`)
}

async function loadVisualSession(search: string) {
  setSearch(search)
  vi.resetModules()
  return import('../test/visual/session')
}

async function loadVisualApi(search = '') {
  setSearch(search)
  vi.resetModules()
  return import('../test/visual/api')
}

async function loadVisualAdminApi(search = '') {
  setSearch(search)
  vi.resetModules()
  return import('../test/visual/admin-api')
}

describe('visual preview contract', () => {
  beforeEach(() => {
    localStorage.clear()
    setSearch()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('sets the requested visual role and workspace before bootstrap', async () => {
    const admin = await loadVisualSession('platform=android&role=admin&workspace=personal')

    expect(admin.session.user?.role).toBe('admin')
    expect(localStorage.getItem('linai.desktop.workspace')).toBe('personal')

    const user = await loadVisualSession('platform=android&role=user&workspace=admin')

    expect(user.session.user?.role).toBe('user')
    expect(localStorage.getItem('linai.desktop.workspace')).toBe('personal')
  })

  it('resolves complete visual aliases while production keeps real modules', async () => {
    vi.stubEnv('LINAI_VISUAL_PREVIEW', '')
    const configFile = path.resolve(process.cwd(), 'vite.config.ts')
    const production = await resolveConfig({ configFile, mode: 'production' }, 'serve')
    const visual = await resolveConfig({ configFile, mode: 'visual' }, 'serve')
    const productionAliases = production.resolve.alias
    const visualAliases = visual.resolve.alias
    const visualReplacements = visualAliases
      .map((alias) => alias.replacement.replaceAll('\\', '/'))
      .filter((replacement) => replacement.includes('/src/test/visual/'))

    expect(productionAliases.some((alias) => alias.replacement.replaceAll('\\', '/').includes('/src/test/visual/'))).toBe(false)
    expect(visualReplacements).toHaveLength(17)
    expect(visualReplacements.some((replacement) => replacement.endsWith('/api.ts'))).toBe(true)
    expect(visualReplacements.some((replacement) => replacement.endsWith('/session.ts'))).toBe(true)
    expect(visualReplacements.some((replacement) => replacement.endsWith('/platform.ts'))).toBe(true)
    expect(visualReplacements.filter((replacement) => replacement.endsWith('/admin-api.ts'))).toHaveLength(10)
  })

  it('degrades invalid role and workspace combinations to user personal', async () => {
    for (const search of [
      'platform=android&role=owner&workspace=admin',
      'platform=android&role=&workspace=admin',
      'platform=android&workspace=admin',
      'platform=beos&role=user&workspace=ops',
    ]) {
      const visual = await loadVisualSession(search)
      expect(visual.session.user?.role).toBe('user')
      expect(localStorage.getItem('linai.desktop.workspace')).toBe('personal')
    }

    const invalidAdminWorkspace = await loadVisualSession('platform=android&role=admin&workspace=ops')
    expect(invalidAdminWorkspace.session.user?.role).toBe('admin')
    expect(localStorage.getItem('linai.desktop.workspace')).toBe('personal')
  })

  it('parses boolean preview flags explicitly, including slow=false', async () => {
    expect((await (await loadVisualApi('empty=')).getUsageRecords()).items).toEqual([])
    expect((await (await loadVisualApi('empty=1')).getUsageRecords()).items).toEqual([])
    expect((await (await loadVisualApi('empty=false')).getUsageRecords()).items.length).toBeGreaterThan(0)

    vi.useFakeTimers()
    const notSlow = await loadVisualApi('slow=false')
    const request = notSlow.getDashboardStats()
    expect(vi.getTimerCount()).toBe(0)
    await request
    vi.useRealTimers()
  })

  it('offers controlled progress delay, selected failures, and redacted call telemetry', async () => {
    const adminApi = await loadVisualAdminApi('progress_delay=5&progress_error=4')

    await expect(adminApi.getAdminSubscriptionProgress(3)).resolves.toMatchObject({ id: 3 })
    await expect(adminApi.getAdminSubscriptionProgress(4)).rejects.toThrow('visual preview progress error')
    expect(adminApi.visualProgressTelemetry.calls).toEqual([3, 4])
    expect(adminApi.visualProgressTelemetry.completed).toEqual([3])
    expect(adminApi.visualProgressTelemetry.failed).toEqual([4])
    expect(adminApi.visualProgressTelemetry.peakActive).toBe(1)
    expect(JSON.stringify(adminApi.visualProgressTelemetry)).not.toContain('token')
  })

  it('provides data for every retained mobile route', async () => {
    const api = await loadVisualApi()
    const adminApi = await loadVisualAdminApi()
    const groupsApi = await import('../test/visual/user-groups')

    const routeFixtures = {
      dashboard: await api.getDashboardStats(),
      usage: await api.getUsageRecords(),
      subscriptions: await api.getSubscriptions(),
      'admin-dashboard': await adminApi.getAdminDashboardSnapshot(),
      'admin-accounts': await adminApi.listAdminAccounts(),
      'admin-groups': await adminApi.listAdminGroups(),
      'admin-users': await adminApi.listAdminUsers(),
      'user-groups': await groupsApi.listUserGroups(),
      'admin-subscriptions': await adminApi.listAdminSubscriptions(),
    }

    expect(Object.keys(routeFixtures)).toHaveLength(9)
    expect(routeFixtures.dashboard.total_requests).toBeGreaterThan(0)
    expect(routeFixtures.usage.items.length).toBeGreaterThan(0)
    expect(routeFixtures.subscriptions.length).toBeGreaterThan(0)
    expect(routeFixtures['admin-dashboard'].stats.total_users).toBeGreaterThan(0)
    expect(routeFixtures['admin-accounts'].items.length).toBeGreaterThan(0)
    expect(routeFixtures['admin-groups'].items.length).toBeGreaterThan(0)
    expect(routeFixtures['admin-users'].items.length).toBeGreaterThan(0)
    expect(routeFixtures['user-groups'].length).toBeGreaterThan(0)
    expect(routeFixtures['admin-subscriptions'].items.length).toBeGreaterThan(0)
  })

  it('implements the complete admin account alias surface used by route chunks', async () => {
    const adminApi = await loadVisualAdminApi()

    expect(typeof adminApi.getAdminAccountModels).toBe('function')
    expect(typeof adminApi.getAdminAccountUsage).toBe('function')
  })

  it('redirects excluded mobile routes to the active workspace home', () => {
    const excluded = ['api-keys', 'channels', 'redeem', 'admin-usage', 'admin-audit-logs']

    for (const routeName of excluded) {
      expect(isMobileRouteAllowed(routeName, 'personal')).toBe(false)
      expect(workspaceDestination('personal')).toBe('dashboard')
      expect(isMobileRouteAllowed(routeName, 'admin')).toBe(false)
      expect(workspaceDestination('admin')).toBe('admin-dashboard')
    }
  })

  it('supports deterministic empty and error states for audited lists', async () => {
    const emptyUsage = await loadVisualApi('empty=usage')
    expect((await emptyUsage.getUsageRecords()).items).toEqual([])

    const emptyUsers = await loadVisualAdminApi('empty=admin-users')
    expect((await emptyUsers.listAdminUsers()).items).toEqual([])

    const emptySubscriptions = await loadVisualAdminApi('empty=admin-subscriptions')
    expect((await emptySubscriptions.listAdminSubscriptions()).items).toEqual([])

    const errorUsage = await loadVisualApi('error=usage')
    await expect(errorUsage.getUsageRecords()).rejects.toThrow('visual preview')

    const errorUsers = await loadVisualAdminApi('error=admin-users')
    await expect(errorUsers.listAdminUsers()).rejects.toThrow('visual preview')

    const errorSubscriptions = await loadVisualAdminApi('error=admin-subscriptions')
    await expect(errorSubscriptions.listAdminSubscriptions()).rejects.toThrow('visual preview')
  })

  it('includes long Chinese labels and two distinct pages of fixture rows', async () => {
    const api = await loadVisualApi()
    const adminApi = await loadVisualAdminApi()
    const groupsApi = await import('../test/visual/user-groups')
    const listUsers = adminApi.listAdminUsers as (params?: { page?: number; page_size?: number }) => Promise<{ items: Array<{ id: number }>; total: number; page: number }>
    const listSubscriptions = adminApi.listAdminSubscriptions as (params?: { page?: number; page_size?: number }) => Promise<{ items: Array<{ id: number }>; total: number; page: number }>

    const usagePage1 = await api.getUsageRecords({ page: 1, page_size: 20 })
    const usagePage2 = await api.getUsageRecords({ page: 2, page_size: 20 })
    const userPage1 = await listUsers({ page: 1, page_size: 20 })
    const userPage2 = await listUsers({ page: 2, page_size: 20 })
    const subscriptionPage1 = await listSubscriptions({ page: 1, page_size: 20 })
    const subscriptionPage2 = await listSubscriptions({ page: 2, page_size: 20 })
    const labels = JSON.stringify([
      usagePage1,
      userPage1,
      subscriptionPage1,
      await groupsApi.listUserGroups(),
    ])

    expect(labels).toContain('跨区域模型推理与超长上下文联合调度')
    expect(usagePage1.total).toBeGreaterThan(20)
    expect(usagePage2.items[0]?.id).not.toBe(usagePage1.items[0]?.id)
    expect(userPage1.total).toBeGreaterThan(20)
    expect(userPage2.items[0]?.id).not.toBe(userPage1.items[0]?.id)
    expect(subscriptionPage1.total).toBeGreaterThan(20)
    expect(subscriptionPage2.items[0]?.id).not.toBe(subscriptionPage1.items[0]?.id)
  })
})
