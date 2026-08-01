import type {
  ResolvedUsageQuota,
  UsageQuotaKey,
  UsageQuotaSummary,
} from '@/features/usage-display/core/format'

const quotaOrder: readonly UsageQuotaKey[] = ['monthly', 'weekly', 'daily']

export interface FloatingQuotaPresentation {
  primary: ResolvedUsageQuota | null
  secondary: readonly ResolvedUsageQuota[]
}

export function resolveFloatingQuotaPresentation(
  summary: UsageQuotaSummary | null,
): FloatingQuotaPresentation {
  const byKey = new Map(summary?.quotas.map((quota) => [quota.key, quota]) ?? [])
  const ordered = quotaOrder.flatMap((key) => {
    const quota = byKey.get(key)
    return quota ? [quota] : []
  })

  return {
    primary: ordered[0] ?? null,
    secondary: ordered.slice(1),
  }
}
