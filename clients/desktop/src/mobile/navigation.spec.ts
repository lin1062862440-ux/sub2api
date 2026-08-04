import { describe, expect, it } from 'vitest'

import {
  isMobileOverflowActive,
  isMobileRouteAllowed,
  mobileNavigation,
  mobileRouteTitle,
} from './navigation'

const expectedDestinations = [
  { workspace: 'personal', section: 'direct', routeName: 'dashboard', title: '概览', iconKey: 'layout-dashboard' },
  { workspace: 'personal', section: 'direct', routeName: 'usage', title: '用量', iconKey: 'chart-no-axes-combined' },
  { workspace: 'personal', section: 'direct', routeName: 'subscriptions', title: '订阅', iconKey: 'receipt-text' },
  { workspace: 'admin', section: 'direct', routeName: 'admin-dashboard', title: '管理概览', iconKey: 'layout-dashboard' },
  { workspace: 'admin', section: 'direct', routeName: 'admin-accounts', title: '账号管理', iconKey: 'users-round' },
  { workspace: 'admin', section: 'direct', routeName: 'admin-groups', title: '分组管理', iconKey: 'layers-3' },
  { workspace: 'admin', section: 'direct', routeName: 'admin-users', title: '用户管理', iconKey: 'user-round-cog' },
  { workspace: 'admin', section: 'overflow', routeName: 'user-groups', title: '团队管理', iconKey: 'building-2' },
  { workspace: 'admin', section: 'overflow', routeName: 'admin-subscriptions', title: '订阅管理', iconKey: 'receipt-text' },
] as const

describe('mobile navigation model', () => {
  it('defines the exact personal bottom-navigation destinations', () => {
    expect(mobileNavigation('personal').direct.map((item) => item.routeName))
      .toEqual(['dashboard', 'usage', 'subscriptions'])
  })

  it('defines administrator direct and overflow destinations', () => {
    expect(mobileNavigation('admin').direct.map((item) => item.routeName))
      .toEqual(['admin-dashboard', 'admin-accounts', 'admin-groups', 'admin-users'])
    expect(mobileNavigation('admin').overflow.map((item) => item.routeName))
      .toEqual(['user-groups', 'admin-subscriptions'])
  })

  it.each(expectedDestinations)('defines $routeName destination metadata', ({
    workspace,
    section,
    routeName,
    title,
    iconKey,
  }) => {
    expect(mobileNavigation(workspace)[section]).toContainEqual({ routeName, title, iconKey })
    expect(mobileRouteTitle(routeName)).toBe(title)
  })

  it('identifies active administrator overflow destinations', () => {
    expect(isMobileOverflowActive('user-groups', 'admin')).toBe(true)
    expect(isMobileOverflowActive('admin-users', 'admin')).toBe(false)
  })

  it('denies excluded mobile routes', () => {
    expect(isMobileRouteAllowed('channels', 'personal')).toBe(false)
    expect(isMobileRouteAllowed('admin-usage', 'admin')).toBe(false)
  })

  it('allows profile as an account route without adding it to bottom navigation', () => {
    expect(isMobileRouteAllowed('profile', 'personal')).toBe(true)
    expect(mobileNavigation('personal').direct.map((item) => item.routeName)).not.toContain('profile')
    expect(mobileRouteTitle('profile')).toBe('个人资料')
  })

  it('allows team detail routes contextually without adding them to bottom navigation', () => {
    expect(isMobileRouteAllowed('user-group-members', 'admin')).toBe(true)
    expect(isMobileRouteAllowed('user-group-usage', 'admin')).toBe(true)
    expect(isMobileOverflowActive('user-group-members', 'admin')).toBe(true)
    expect(mobileNavigation('admin').overflow.map((item) => item.routeName)).not.toContain('user-group-members')
    expect(mobileRouteTitle('user-group-members')).toBe('成员与配额')
  })

  it('uses an empty title fallback for unknown routes', () => {
    expect(mobileRouteTitle('missing-route')).toBe('')
  })
})
