import type {
  FloatingUsageStyle,
  UsageDisplayAppearance,
  UsageDisplaySurface,
} from '@/features/usage-display/core/storage'

export interface UsageDisplayHostConfig {
  enabled: boolean
  surface: UsageDisplaySurface
  title: string
  appearance: UsageDisplayAppearance
  floatingStyle: FloatingUsageStyle
}

export async function configureUsageDisplay(_config: UsageDisplayHostConfig): Promise<void> {}

export async function setUsageDisplayTitle(_title: string): Promise<void> {}

export async function setFloatingUsageExpanded(_expanded: boolean): Promise<void> {}

export async function startFloatingUsageDrag(): Promise<void> {}

export async function hideUsageDisplay(): Promise<void> {}

export async function openMainWindow(): Promise<void> {}

export async function quitDesktopApp(): Promise<void> {}

export async function notifyUsageSessionChanged(_userId: number | null): Promise<void> {}

export async function notifyUsageConfigChanged(_userId: number): Promise<void> {}
