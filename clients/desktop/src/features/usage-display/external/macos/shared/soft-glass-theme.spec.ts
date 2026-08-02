/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailThemeCss = readFileSync(
  'src/features/usage-display/external/macos/shared/quota-float-themes.css',
  'utf8',
)
const floatingWindowCss = readFileSync(
  'src/features/usage-display/external/macos/floating-window/macos-floating-window.css',
  'utf8',
)
const legacyDetailThemeCss = detailThemeCss.split(".external-usage-detail-card[data-appearance='native']")[0]
const legacyFloatingWindowCss = floatingWindowCss.split(".floating-usage-orb[data-appearance='native']")[0]

function backgroundAlphas(css: string, variable: '--external-bg' | '--pearl-bg') {
  return [...css.matchAll(new RegExp(`${variable}: [^;]+`, 'g'))]
    .flatMap((match) => [...match[0].matchAll(/rgba\([^,]+,[^,]+,[^,]+, ([\d.]+)\)/g)])
    .map((match) => Number(match[1]))
}

describe('macOS external soft glass themes', () => {
  it('keeps the original appearances free of compositor blur', () => {
    expect(detailThemeCss).not.toContain('backdrop-filter')
    expect(floatingWindowCss).not.toContain('backdrop-filter')
  })

  it('keeps the original inset card and shadow gutters', () => {
    expect(detailThemeCss).toContain('width: calc(100% - 16px)')
    expect(detailThemeCss).toContain('height: calc(100% - 16px)')
  })

  it.each(['meadow', 'sunset'])('keeps %s as a translucent theme variant', (appearance) => {
    expect(detailThemeCss).toMatch(new RegExp(`data-appearance='${appearance}'[\\s\\S]*?rgba\\(`))
    expect(floatingWindowCss).toMatch(new RegExp(`data-appearance='${appearance}'[\\s\\S]*?rgba\\(`))
  })

  it('keeps the restored tint opaque enough to remain visually stable', () => {
    const detailAlphas = backgroundAlphas(legacyDetailThemeCss, '--external-bg')
    const floatingAlphas = backgroundAlphas(legacyFloatingWindowCss, '--pearl-bg')

    expect(detailAlphas).toHaveLength(9)
    expect(floatingAlphas).toHaveLength(9)
    expect(Math.min(...detailAlphas)).toBeGreaterThanOrEqual(0.62)
    expect(Math.max(...detailAlphas)).toBeLessThanOrEqual(0.68)
    expect(Math.min(...floatingAlphas)).toBeGreaterThanOrEqual(0.66)
    expect(Math.max(...floatingAlphas)).toBeLessThanOrEqual(0.72)
  })

  it('keeps small muted labels at a readable opacity', () => {
    const detailOpacities = [...legacyDetailThemeCss.matchAll(/--external-muted: rgba\([^;]+, ([\d.]+)\);/g)]
      .map((match) => Number(match[1]))
    const floatingOpacities = [...legacyFloatingWindowCss.matchAll(/--pearl-muted: rgba\([^;]+, ([\d.]+)\);/g)]
      .map((match) => Number(match[1]))

    expect(detailOpacities).toHaveLength(3)
    expect(floatingOpacities).toHaveLength(3)
    expect(Math.min(...detailOpacities, ...floatingOpacities)).toBeGreaterThanOrEqual(0.74)
  })

  it('defines exact native orb and capsule geometry without a simulated glass filter', () => {
    expect(floatingWindowCss).toMatch(/floating-usage-orb\[data-appearance='native'\][\s\S]*?width: 68px;[\s\S]*?height: 68px;/)
    expect(floatingWindowCss).toMatch(/floating-usage-bar\[data-appearance='native'\][\s\S]*?width: 196px;[\s\S]*?height: 44px;[\s\S]*?border-radius: 22px;/)
    expect(detailThemeCss).toContain('.external-usage-detail-card.native-landscape')
    expect(detailThemeCss).not.toContain('backdrop-filter')
  })
})
