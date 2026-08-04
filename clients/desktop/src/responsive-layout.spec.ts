import { describe, expect, it } from 'vitest'

const sourceModules = import.meta.glob([
  './layouts/DesktopAppLayout.vue',
  './views/*.vue',
  './views/admin/*.vue',
], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const readSource = (relativePath: string) => sourceModules[relativePath] ?? ''

const readStyleRule = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const responsiveViews = [
  './views/DashboardView.vue',
  './views/ApiKeysView.vue',
  './views/UsageView.vue',
  './views/ChannelStatusView.vue',
  './views/SubscriptionsView.vue',
  './views/RedeemView.vue',
  './views/ProfileView.vue',
  './views/UserGroupsView.vue',
  './views/UserGroupMembersView.vue',
  './views/UserGroupUsageView.vue',
  './views/admin/AdminDashboardView.vue',
  './views/admin/AdminAccountsView.vue',
  './views/admin/AdminUsersView.vue',
  './views/admin/AdminGroupsView.vue',
  './views/admin/AdminUsageView.vue',
  './views/admin/AdminChannelMonitorsView.vue',
  './views/admin/AdminAuditLogsView.vue',
  './views/admin/AdminSubscriptionsView.vue',
  './views/admin/AdminRedeemCodesView.vue',
  './views/admin/AdminAnnouncementsView.vue',
]

describe('desktop responsive layout contract', () => {
  it('uses the authenticated content pane as the responsive boundary', () => {
    const layout = readSource('./layouts/DesktopAppLayout.vue')

    expect(layout).toContain('container-name: app-content')
    expect(layout).toContain('container-type: inline-size')
    expect(layout).toContain('@media (max-width: 1020px)')
    expect(layout).toContain('grid-template-columns: 76px minmax(0, 1fr)')
  })

  it('keeps the account area visible and scrolls navigation in short windows', () => {
    const layout = readSource('./layouts/DesktopAppLayout.vue')
    const rail = readStyleRule(layout, '.app-rail')
    const navigation = readStyleRule(layout, '.rail-nav')

    expect(rail).toContain('min-height: 0')
    expect(rail).toContain('overflow: hidden')
    expect(navigation).toContain('flex: 1 1 auto')
    expect(navigation).toContain('min-height: 0')
    expect(navigation).toContain('overflow-y: auto')
    expect(readStyleRule(layout, '.rail-brand')).toContain('flex: 0 0 auto')
    expect(readStyleRule(layout, '.workspace-switch')).toContain('flex: 0 0 auto')
    expect(readStyleRule(layout, '.rail-account')).toContain('flex: 0 0 auto')
  })

  it.each(responsiveViews)('%s responds to available content width', (viewPath) => {
    expect(readSource(viewPath)).toContain('@container app-content')
  })

  it.each(responsiveViews)('%s uses valid named container query syntax', (viewPath) => {
    expect(readSource(viewPath)).not.toMatch(/@container\s+app-content\(/)
  })
})
