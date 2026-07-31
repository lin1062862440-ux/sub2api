import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { FALLBACK_BRAND } from '@/lib/brand'
import BrandLogo from './BrandLogo.vue'

describe('BrandLogo', () => {
  it('renders the bundled LinAI logo for an unsafe source', () => {
    const wrapper = mount(BrandLogo, {
      props: { src: 'javascript:alert(1)', alt: 'LinAI' },
    })

    expect(wrapper.get('img').attributes('src')).toBe(FALLBACK_BRAND.logo)
    expect(wrapper.get('img').attributes('alt')).toBe('LinAI')
  })

  it('falls back when the configured logo fails to load', async () => {
    const wrapper = mount(BrandLogo, {
      props: { src: 'https://lynn.lat/missing-logo.png', alt: 'LinAI' },
    })

    expect(wrapper.get('img').attributes('src')).toBe('https://lynn.lat/missing-logo.png')
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(FALLBACK_BRAND.logo)
  })
})
