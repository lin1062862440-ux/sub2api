import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appLayout = readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.vue'), 'utf8')
const desktopAppLayout = readFileSync(resolve(process.cwd(), 'src/layouts/DesktopAppLayout.vue'), 'utf8')
const mobileAppLayout = readFileSync(resolve(process.cwd(), 'src/layouts/MobileAppLayout.vue'), 'utf8')
const mobileCss = readFileSync(resolve(process.cwd(), 'src/mobile/mobile.css'), 'utf8')
const mobileBottomSheet = readFileSync(resolve(process.cwd(), 'src/mobile/components/MobileBottomSheet.vue'), 'utf8')

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

  it('keeps shared Android base, dialog, and page rules in the committed mobile stylesheet', () => {
    expect(mobileCss).toContain("html[data-mobile='true'] {")
    expect(mobileCss).toContain('--mobile-app-bar: 56px')
    expect(mobileCss).toContain('--mobile-bottom-nav: 64px')
    expect(mobileCss).toContain('--mobile-gutter: 16px')
    expect(mobileCss).toContain('font-size: 16px')
    expect(mobileCss).toContain('.auth-window')
    expect(mobileCss).toContain('.auth-shell__brand')
    expect(mobileCss).toContain('.mobile-page-scroll')
    expect(mobileCss).toContain('var(--mobile-app-bar) + env(safe-area-inset-top)')
    expect(mobileCss).toContain('var(--mobile-bottom-nav) + env(safe-area-inset-bottom)')
    expect(mobileCss).toContain(':is(.dialog-backdrop, .backdrop, .drawer-backdrop)')
    expect(mobileCss).toContain(':is(.dialog, [class$=\'-dialog\'], .drawer-backdrop > aside)')
    expect(mobileCss).toContain('max-height: calc(100dvh - env(safe-area-inset-top))')
    expect(mobileCss).toContain('padding-bottom: env(safe-area-inset-bottom)')
    expect(mobileCss).toContain('border-radius: 8px 8px 0 0')
    expect(mobileCss).not.toContain(":is(.page, [class$='-page'])")
    expect(mobileCss).not.toContain(':is(.filters, .filter-bar, .toolbar, .filter-console)')
    expect(mobileCss).not.toContain(':is(.table-wrap, .details)')
  })

  it('gives slotted bottom-sheet controls a mobile touch-target contract', () => {
    expect(mobileBottomSheet).toContain('.mobile-bottom-sheet-content :deep(button)')
    expect(mobileBottomSheet).toContain('.mobile-bottom-sheet-footer :deep(button)')
    expect(mobileBottomSheet).toContain('.mobile-bottom-sheet-content :deep(input)')
    expect(mobileBottomSheet).toContain('.mobile-bottom-sheet-footer :deep(textarea)')
    expect(mobileBottomSheet).toContain('min-height: 44px')
  })
})
