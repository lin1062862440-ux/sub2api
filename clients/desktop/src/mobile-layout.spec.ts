import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appLayout = readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8')
const desktopAppLayout = readFileSync(resolve(process.cwd(), 'src/layouts/DesktopAppLayout.vue'), 'utf8')
const mobileAppLayout = readFileSync(resolve(process.cwd(), 'src/layouts/MobileAppLayout.vue'), 'utf8')

describe('Android mobile layout contract', () => {
  it('uses separate desktop and mobile shells', () => {
    expect(appLayout).toContain('<MobileAppLayout v-if="appCapabilities.mobile" />')
    expect(appLayout).toContain('<DesktopAppLayout v-else />')
    expect(desktopAppLayout).toContain('class="app-rail"')
    expect(desktopAppLayout).toContain('container-name: app-content')
  })

  it('keeps fixed mobile chrome clear of Android safe areas', () => {
    expect(mobileAppLayout).toContain('env(safe-area-inset-top)')
    expect(mobileAppLayout).toContain('env(safe-area-inset-bottom)')
    expect(mobileAppLayout).toContain('min-height: 44px')
    expect(mobileAppLayout).toContain('position: fixed')
    expect(mobileAppLayout).toContain('data-testid="mobile-bottom-nav"')
    expect(mobileAppLayout).toContain('data-testid="mobile-more-sheet"')
    expect(mobileAppLayout).toContain('grid-template-columns: 22px minmax(0, 1fr) 44px')
    expect(mobileAppLayout).toContain('min-width: 44px')
  })

  it('never synthesizes browser history for mobile layers', () => {
    expect(mobileAppLayout).not.toContain('history.pushState')
    expect(mobileAppLayout).not.toContain('history.back')
    expect(mobileAppLayout).not.toContain('location.reload')
  })
})
