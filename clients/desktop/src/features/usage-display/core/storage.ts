import { LazyStore } from '@tauri-apps/plugin-store'

export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
  surface: UsageDisplaySurface
  appearance: UsageDisplayAppearance
}

export type UsageDisplaySurface = 'menu-bar' | 'floating-window'
export type UsageDisplayAppearance = 'default' | 'dark' | 'blur'

const store = new LazyStore('linai.json', { autoSave: 100 })

export function defaultUsageDisplayConfig(): UsageDisplayConfig {
  return {
    enabled: false,
    source: 'balance',
    subscriptionId: null,
    surface: 'menu-bar',
    appearance: 'default',
  }
}

function hasValidBaseFields(value: unknown): value is Pick<UsageDisplayConfig, 'enabled' | 'source' | 'subscriptionId'> & Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UsageDisplayConfig>
  if (typeof candidate.enabled !== 'boolean') return false
  if (candidate.source !== 'balance' && candidate.source !== 'subscription') return false
  if (candidate.source === 'balance') return candidate.subscriptionId === null
  if (!candidate.enabled && candidate.subscriptionId === null) return true
  return Number.isInteger(candidate.subscriptionId) && (candidate.subscriptionId ?? 0) > 0
}

function normalizeConfig(value: unknown): UsageDisplayConfig {
  const fallback = defaultUsageDisplayConfig()
  if (!hasValidBaseFields(value)) return fallback
  return {
    enabled: value.enabled,
    source: value.source,
    subscriptionId: value.subscriptionId,
    surface: value.surface === 'menu-bar' || value.surface === 'floating-window'
      ? value.surface
      : fallback.surface,
    appearance: value.appearance === 'default' || value.appearance === 'dark' || value.appearance === 'blur'
      ? value.appearance
      : fallback.appearance,
  }
}

function isValidConfig(value: unknown): value is UsageDisplayConfig {
  if (!hasValidBaseFields(value)) return false
  return (value.surface === 'menu-bar' || value.surface === 'floating-window')
    && (value.appearance === 'default' || value.appearance === 'dark' || value.appearance === 'blur')
}

export async function loadUsageDisplayConfig(userId: number): Promise<UsageDisplayConfig> {
  const value = await store.get<unknown>(`usage_display:${userId}`)
  return normalizeConfig(value)
}

export async function saveUsageDisplayConfig(userId: number, config: UsageDisplayConfig): Promise<void> {
  if (!isValidConfig(config)) throw new Error('用量显示配置无效')
  await store.set(`usage_display:${userId}`, { ...config })
  await store.save()
}
