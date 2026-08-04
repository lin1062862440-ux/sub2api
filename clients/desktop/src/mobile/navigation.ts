export type MobileWorkspace = 'personal' | 'admin'

export type MobileRouteName =
  | 'dashboard'
  | 'usage'
  | 'subscriptions'
  | 'profile'
  | 'admin-dashboard'
  | 'admin-accounts'
  | 'admin-groups'
  | 'admin-users'
  | 'user-groups'
  | 'user-group-members'
  | 'user-group-usage'
  | 'admin-subscriptions'

export type MobileIconKey =
  | 'layout-dashboard'
  | 'chart-no-axes-combined'
  | 'receipt-text'
  | 'circle-user-round'
  | 'users-round'
  | 'layers-3'
  | 'user-round-cog'
  | 'building-2'

export interface MobileNavigationItem {
  routeName: MobileRouteName
  title: string
  iconKey: MobileIconKey
}

export interface MobileNavigation {
  direct: readonly MobileNavigationItem[]
  overflow: readonly MobileNavigationItem[]
}

const personalNavigation: MobileNavigation = {
  direct: [
    { routeName: 'dashboard', title: '概览', iconKey: 'layout-dashboard' },
    { routeName: 'usage', title: '用量', iconKey: 'chart-no-axes-combined' },
    { routeName: 'subscriptions', title: '订阅', iconKey: 'receipt-text' },
  ],
  overflow: [],
}

const adminNavigation: MobileNavigation = {
  direct: [
    { routeName: 'admin-dashboard', title: '管理概览', iconKey: 'layout-dashboard' },
    { routeName: 'admin-accounts', title: '账号管理', iconKey: 'users-round' },
    { routeName: 'admin-groups', title: '分组管理', iconKey: 'layers-3' },
    { routeName: 'admin-users', title: '用户管理', iconKey: 'user-round-cog' },
  ],
  overflow: [
    { routeName: 'user-groups', title: '团队管理', iconKey: 'building-2' },
    { routeName: 'admin-subscriptions', title: '订阅管理', iconKey: 'receipt-text' },
  ],
}

const profileItem: MobileNavigationItem = {
  routeName: 'profile',
  title: '个人资料',
  iconKey: 'circle-user-round',
}

const contextualTeamRoutes: Partial<Record<MobileRouteName, string>> = {
  'user-group-members': '成员与配额',
  'user-group-usage': '用量分析',
}

export function mobileNavigation(workspace: MobileWorkspace): MobileNavigation {
  return workspace === 'admin' ? adminNavigation : personalNavigation
}

export function isMobileRouteAllowed(routeName: unknown, workspace: MobileWorkspace): boolean {
  if (routeName === profileItem.routeName) return true
  if (workspace === 'admin' && typeof routeName === 'string' && routeName in contextualTeamRoutes) return true
  const navigation = mobileNavigation(workspace)
  return [...navigation.direct, ...navigation.overflow].some((item) => item.routeName === routeName)
}

export function isMobileOverflowActive(routeName: unknown, workspace: MobileWorkspace): boolean {
  if (workspace === 'admin' && typeof routeName === 'string' && routeName in contextualTeamRoutes) return true
  return mobileNavigation(workspace).overflow.some((item) => item.routeName === routeName)
}

export function mobileRouteTitle(routeName: unknown): string {
  if (routeName === profileItem.routeName) return profileItem.title
  if (typeof routeName === 'string' && routeName in contextualTeamRoutes) return contextualTeamRoutes[routeName as MobileRouteName] ?? ''
  for (const navigation of [personalNavigation, adminNavigation]) {
    const item = [...navigation.direct, ...navigation.overflow].find((candidate) => candidate.routeName === routeName)
    if (item) return item.title
  }
  return ''
}
