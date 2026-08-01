export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
  surface: 'menu-bar' | 'floating-window'
  appearance: 'default' | 'dark' | 'blur'
}

let config: UsageDisplayConfig = defaultUsageDisplayConfig()

export function defaultUsageDisplayConfig(): UsageDisplayConfig {
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const source = params?.get('source') === 'subscription' ? 'subscription' : 'balance'
  const surface = params?.get('surface') === 'floating-window' ? 'floating-window' : 'menu-bar'
  const appearanceValue = params?.get('appearance')
  const appearance = appearanceValue === 'dark' || appearanceValue === 'blur' ? appearanceValue : 'default'
  return {
    enabled: true,
    source,
    subscriptionId: source === 'subscription' ? 11 : null,
    surface,
    appearance,
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
