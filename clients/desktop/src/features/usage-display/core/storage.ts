import { LazyStore } from '@tauri-apps/plugin-store'

export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
  surface: UsageDisplaySurface
  appearance: UsageDisplayAppearance
  floatingStyle: FloatingUsageStyle
}

export type UsageDisplaySurface = 'menu-bar' | 'floating-window'
export type UsageDisplayAppearance = 'sky' | 'meadow' | 'sunset' | 'native'
export type FloatingUsageStyle = 'orb' | 'bar'

const store = new LazyStore('linai.json', { autoSave: 100 })
const installerDefaultKey = 'usage_display:installer-default'

export function defaultUsageDisplayConfig(): UsageDisplayConfig {
  return {
    enabled: false,
    source: 'balance',
    subscriptionId: null,
    surface: 'menu-bar',
    appearance: 'sky',
    floatingStyle: 'orb',
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
    appearance: normalizeAppearance(value.appearance),
    floatingStyle: value.floatingStyle === 'orb' || value.floatingStyle === 'bar'
      ? value.floatingStyle
      : fallback.floatingStyle,
  }
}

function normalizeAppearance(value: unknown): UsageDisplayAppearance {
  if (value === 'sky' || value === 'default') return 'sky'
  if (value === 'meadow' || value === 'dark') return 'meadow'
  if (value === 'sunset' || value === 'blur') return 'sunset'
  if (value === 'native') return 'native'
  return 'sky'
}

function isValidConfig(value: unknown): value is UsageDisplayConfig {
  if (!hasValidBaseFields(value)) return false
  return (value.surface === 'menu-bar' || value.surface === 'floating-window')
    && (value.appearance === 'sky'
      || value.appearance === 'meadow'
      || value.appearance === 'sunset'
      || value.appearance === 'native')
    && (value.floatingStyle === 'orb' || value.floatingStyle === 'bar')
}

export async function loadUsageDisplayConfig(userId: number): Promise<UsageDisplayConfig> {
  const value = await store.get<unknown>(`usage_display:${userId}`)
  if (value === undefined || value === null) {
    const installerDefault = await store.get<unknown>(installerDefaultKey)
    return normalizeConfig(installerDefault)
  }
  return normalizeConfig(value)
}

export async function saveUsageDisplayConfig(userId: number, config: UsageDisplayConfig): Promise<void> {
  if (!isValidConfig(config)) throw new Error('用量显示配置无效')
  await store.set(`usage_display:${userId}`, { ...config })
  await store.save()
}
