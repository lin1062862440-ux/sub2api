import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

export const usageAppearances: readonly { id: UsageDisplayAppearance; label: string }[] = [
  { id: 'sky', label: '清透蓝' },
  { id: 'meadow', label: '青柠黄' },
  { id: 'sunset', label: '珊瑚红' },
]
