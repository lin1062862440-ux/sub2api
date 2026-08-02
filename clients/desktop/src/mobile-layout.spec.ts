import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mobileCss = readFileSync(resolve(process.cwd(), 'src/mobile.css'), 'utf8')
const appLayout = readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8')
const mobileAppLayout = readFileSync(resolve(process.cwd(), 'src/layouts/MobileAppLayout.vue'), 'utf8')

describe('Android mobile layout contract', () => {
  it('accounts for Android safe areas and touch targets', () => {
    expect(mobileCss).toContain('env(safe-area-inset-top)')
    expect(mobileCss).toContain('env(safe-area-inset-bottom)')
    expect(mobileCss).toContain('min-height: 44px')
  })

  it('converts page tools, tables, drawers, and dialogs at phone width', () => {
    expect(mobileCss).toContain("html[data-mobile='true']")
    expect(mobileCss).toContain('@media (max-width: 520px)')
    expect(mobileCss).toContain('.table-wrap')
    expect(mobileCss).toContain('.dialog-backdrop')
    expect(mobileCss).toContain('.drawer-backdrop')
  })

  it('uses separate desktop and mobile shells', () => {
    expect(appLayout).toContain('<MobileAppLayout v-if="appCapabilities.mobile" />')
    expect(appLayout).toContain('<DesktopAppLayout v-else />')
  })

  it('keeps fixed mobile chrome clear of Android safe areas', () => {
    expect(mobileAppLayout).toContain('env(safe-area-inset-top)')
    expect(mobileAppLayout).toContain('env(safe-area-inset-bottom)')
    expect(mobileAppLayout).toContain('min-height: 44px')
    expect(mobileAppLayout).toContain('position: fixed')
    expect(mobileAppLayout).toContain('data-testid="mobile-bottom-nav"')
    expect(mobileAppLayout).toContain('data-testid="mobile-more-sheet"')
  })

  it('never synthesizes browser history for mobile layers', () => {
    expect(mobileAppLayout).not.toContain('history.pushState')
    expect(mobileAppLayout).not.toContain('history.back')
    expect(mobileAppLayout).not.toContain('location.reload')
  })
})
