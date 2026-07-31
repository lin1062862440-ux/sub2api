import fallbackLogo from '@/assets/linai-logo.png'

export interface BrandSettings {
  site_name?: string
  site_logo?: string
  site_subtitle?: string
}

export interface BrandIdentity {
  name: string
  logo: string
  subtitle: string
}

export const FALLBACK_BRAND: BrandIdentity = Object.freeze({
  name: 'LinAI',
  logo: fallbackLogo,
  subtitle: '让每一位上帝感受 AI 的爱',
})

const SAFE_LOGO_PATTERN = /^(?:data:image\/(?:svg\+xml|png|jpeg|webp);base64,|https:\/\/)/i

export function normalizeBrand(settings?: BrandSettings | null): BrandIdentity {
  const logo = settings?.site_logo?.trim() ?? ''

  return {
    name: settings?.site_name?.trim() || FALLBACK_BRAND.name,
    logo: SAFE_LOGO_PATTERN.test(logo) ? logo : FALLBACK_BRAND.logo,
    subtitle: settings?.site_subtitle?.trim() || FALLBACK_BRAND.subtitle,
  }
}
