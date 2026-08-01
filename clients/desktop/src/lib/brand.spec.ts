import { describe, expect, it } from 'vitest'

import { FALLBACK_BRAND, normalizeBrand } from './brand'

describe('normalizeBrand', () => {
  it('uses valid platform branding', () => {
    expect(
      normalizeBrand({
        site_name: 'LinAI Cloud',
        site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
        site_subtitle: 'AI for everyone',
      }),
    ).toEqual({
      name: 'LinAI Cloud',
      logo: 'data:image/svg+xml;base64,PHN2Zy8+',
      subtitle: 'AI for everyone',
    })
  })

  it.each([
    '',
    'javascript:alert(1)',
    'data:text/html;base64,PGgxPmJhZDwvaDE+',
    'http://example.com/logo.png',
  ])('falls back from an unsafe logo value: %s', (siteLogo) => {
    expect(normalizeBrand({ site_logo: siteLogo }).logo).toBe(FALLBACK_BRAND.logo)
  })

  it('uses bundled LinAI copy when settings are missing', () => {
    expect(normalizeBrand(null)).toEqual(FALLBACK_BRAND)
  })
})
