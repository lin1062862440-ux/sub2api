import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

export const usageAppearances: readonly { id: UsageDisplayAppearance; label: string }[] = [
  { id: 'default', label: '默认浅色' },
  { id: 'dark', label: '深色' },
  { id: 'blur', label: 'Blur' },
]
