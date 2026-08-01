export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
  surface: 'menu-bar' | 'floating-window'
  appearance: 'sky' | 'meadow' | 'sunset'
  floatingStyle: 'orb' | 'bar'
}

let config: UsageDisplayConfig = defaultUsageDisplayConfig()

export function defaultUsageDisplayConfig(): UsageDisplayConfig {
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const source = params?.get('source') === 'subscription' ? 'subscription' : 'balance'
  const surface = params?.get('surface') === 'floating-window' ? 'floating-window' : 'menu-bar'
  const appearanceValue = params?.get('appearance')
  const appearance = appearanceValue === 'meadow' || appearanceValue === 'sunset' ? appearanceValue : 'sky'
  const floatingStyle = params?.get('floatingStyle') === 'bar' ? 'bar' : 'orb'
  return {
    enabled: true,
    source,
    subscriptionId: source === 'subscription' ? 11 : null,
    surface,
    appearance,
    floatingStyle,
  }
}

export async function loadUsageDisplayConfig(): Promise<UsageDisplayConfig> {
  return { ...config }
}

export async function saveUsageDisplayConfig(
  _userId: number,
  nextConfig: UsageDisplayConfig,
): Promise<void> {
  config = { ...nextConfig }
}
