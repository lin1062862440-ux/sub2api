import type {
  ResolvedUsageQuota,
  UsageQuotaSummary,
} from '@/features/usage-display/core/format'
import { orderUsageQuotasShortestFirst } from '@/features/usage-display/core/format'

export interface ExternalQuotaPresentation {
  primary: ResolvedUsageQuota | null
  secondary: readonly ResolvedUsageQuota[]
}

export function resolveExternalQuotaPresentation(
  summary: UsageQuotaSummary | null,
): ExternalQuotaPresentation {
  const ordered = orderUsageQuotasShortestFirst(summary?.quotas ?? [])
  return { primary: ordered[0] ?? null, secondary: ordered.slice(1) }
}
