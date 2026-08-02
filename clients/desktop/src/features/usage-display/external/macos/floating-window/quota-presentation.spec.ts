import { describe, expect, it } from 'vitest'

import type {
  ResolvedUsageQuota,
  UsageQuotaKey,
  UsageQuotaSummary,
} from '@/features/usage-display/core/format'
import { resolveFloatingQuotaPresentation } from './quota-presentation'

const quotaHours: Record<UsageQuotaKey, 24 | 168 | 720> = {
  daily: 24,
  weekly: 168,
  monthly: 720,
}

function quota(key: UsageQuotaKey, remainingPercent: number): ResolvedUsageQuota {
  return {
    key,
    label: `${key} quota`,
    used: 100 - remainingPercent,
    limit: 100,
    windowStart: null,
    windowHours: quotaHours[key],
    remainingPercent,
    resetAt: null,
  }
}

function summary(quotas: ResolvedUsageQuota[]): UsageQuotaSummary {
  const constrained = quotas.reduce<ResolvedUsageQuota | null>((lowest, item) => (
    !lowest || item.remainingPercent < lowest.remainingPercent ? item : lowest
  ), null)
  return {
    quotas,
    remainingPercent: constrained?.remainingPercent ?? null,
    constrainedKey: constrained?.key ?? null,
    unlimited: quotas.length === 0,
  }
}

describe('resolveFloatingQuotaPresentation', () => {
  it('promotes daily and orders remaining periods from shortest to longest', () => {
    const result = resolveFloatingQuotaPresentation(summary([
      quota('daily', 80),
      quota('weekly', 42),
      quota('monthly', 76),
    ]))

    expect(result.primary?.key).toBe('daily')
    expect(result.secondary.map((item) => item.key)).toEqual(['weekly', 'monthly'])
  })

  it('falls back to weekly when daily is not configured', () => {
    const result = resolveFloatingQuotaPresentation(summary([
      quota('monthly', 76),
      quota('weekly', 42),
    ]))

    expect(result.primary?.key).toBe('weekly')
    expect(result.secondary.map((item) => item.key)).toEqual(['monthly'])
  })

  it('returns no quota presentation for unlimited subscriptions', () => {
    expect(resolveFloatingQuotaPresentation(summary([]))).toEqual({
      primary: null,
      secondary: [],
    })
  })
})
