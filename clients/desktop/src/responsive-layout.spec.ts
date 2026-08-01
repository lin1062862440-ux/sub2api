import { describe, expect, it } from 'vitest'

const sourceModules = import.meta.glob([
  './layouts/AppLayout.vue',
  './views/*.vue',
], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const readSource = (relativePath: string) => sourceModules[relativePath] ?? ''

const responsiveViews = [
  './views/DashboardView.vue',
  './views/ApiKeysView.vue',
  './views/UsageView.vue',
  './views/ChannelStatusView.vue',
  './views/SubscriptionsView.vue',
  './views/RedeemView.vue',
  './views/ProfileView.vue',
]

describe('desktop responsive layout contract', () => {
  it('uses the authenticated content pane as the responsive boundary', () => {
    const layout = readSource('./layouts/AppLayout.vue')

    expect(layout).toContain('container-name: app-content')
    expect(layout).toContain('container-type: inline-size')
    expect(layout).toContain('@media (max-width: 1020px)')
    expect(layout).toContain('grid-template-columns: 76px minmax(0, 1fr)')
  })

  it.each(responsiveViews)('%s responds to available content width', (viewPath) => {
    expect(readSource(viewPath)).toContain('@container app-content')
  })
})
