import type { UsageFilters } from '@/api'
import { resolveUsageRange } from '@/lib/usage-range'

export type UsageQuotaKey = 'daily' | 'weekly' | 'monthly'

export interface UsageQuotaInput {
  key: UsageQuotaKey
  label: string
  used: number
  limit: number
  windowStart: string | null
  windowHours: 24 | 168 | 720
}

export interface ResolvedUsageQuota extends UsageQuotaInput {
  remainingPercent: number
  resetAt: Date | null
}

export interface UsageQuotaSummary {
  quotas: readonly ResolvedUsageQuota[]
  remainingPercent: number | null
  constrainedKey: UsageQuotaKey | null
  unlimited: boolean
}

export type UsageTrayTitleInput =
  | { kind: 'balance'; balance: number }
  | { kind: 'subscription'; name: string; remainingPercent: number | null }
  | { kind: 'unavailable' }

export type UsageOrbValueInput =
  | { kind: 'balance'; balance: number | null }
  | { kind: 'subscription'; remainingPercent: number | null; unlimited: boolean }
  | { kind: 'unavailable' }

export interface BalanceUsageRanges {
  today: UsageFilters
  last7Days: UsageFilters
  thisMonth: UsageFilters
}

const shortestQuotaOrder: readonly UsageQuotaKey[] = ['daily', 'weekly', 'monthly']

export function orderUsageQuotasShortestFirst(
  quotas: readonly ResolvedUsageQuota[],
): ResolvedUsageQuota[] {
  const byKey = new Map(quotas.map((quota) => [quota.key, quota]))
  return shortestQuotaOrder.flatMap((key) => {
    const quota = byKey.get(key)
    return quota ? [quota] : []
  })
}

export function resolveShortestUsageQuota(
  quotas: readonly ResolvedUsageQuota[],
): ResolvedUsageQuota | null {
  return orderUsageQuotasShortestFirst(quotas)[0] ?? null
}

export function remainingPercent(used: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('额度上限必须大于 0')
  const value = Math.round((1 - Math.max(0, used) / limit) * 100)
  return Math.min(100, Math.max(0, value))
}

export function quotaResetAt(windowStart: string | null, windowHours: number): Date | null {
  if (!windowStart) return null
  const start = new Date(windowStart)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + windowHours * 3_600_000)
}

export function resolveQuotaSummary(inputs: UsageQuotaInput[]): UsageQuotaSummary {
  const quotas = inputs
    .filter((item) => Number.isFinite(item.limit) && item.limit > 0)
    .map((item) => ({
      ...item,
      remainingPercent: remainingPercent(item.used, item.limit),
      resetAt: quotaResetAt(item.windowStart, item.windowHours),
    }))

  if (!quotas.length) {
    return { quotas: [], remainingPercent: null, constrainedKey: null, unlimited: true }
  }

  const constrained = quotas.reduce((lowest, item) => (
    item.remainingPercent < lowest.remainingPercent ? item : lowest
  ))

  return {
    quotas,
    remainingPercent: constrained.remainingPercent,
    constrainedKey: constrained.key,
    unlimited: false,
  }
}

function displayWidth(character: string): number {
  return /^[\x00-\x7F]$/.test(character) ? 1 : 2
}

export function truncateTraySource(value: string, maxWidth = 11): string {
  const characters = Array.from(value.trim())
  const totalWidth = characters.reduce((sum, character) => sum + displayWidth(character), 0)
  if (totalWidth <= maxWidth) return characters.join('')

  let width = 0
  const visible: string[] = []
  for (const character of characters) {
    const nextWidth = width + displayWidth(character)
    if (nextWidth > maxWidth) break
    visible.push(character)
    width = nextWidth
  }
  return `${visible.join('').trimEnd()}…`
}

export function formatUsageTrayTitle(input: UsageTrayTitleInput): string {
  if (input.kind === 'unavailable') return '--'
  if (input.kind === 'balance') return `$${input.balance.toFixed(2)}`
  return input.remainingPercent === null ? '∞' : `${Math.min(100, Math.max(0, input.remainingPercent))}%`
}

export function formatUsageOrbValue(input: UsageOrbValueInput): string {
  if (input.kind === 'unavailable') return '--'
  if (input.kind === 'subscription') {
    if (input.unlimited) return '∞'
    if (input.remainingPercent === null) return '--'
    return `${Math.min(100, Math.max(0, Math.round(input.remainingPercent)))}%`
  }
  if (input.balance === null || !Number.isFinite(input.balance)) return '--'
  const value = Math.max(0, input.balance)
  if (value >= 999_500) return `$${Math.round(value / 1_000_000)}M`
  if (value >= 1_000) {
    const compact = value >= 9_950 ? Math.round(value / 1_000).toString() : (value / 1_000).toFixed(1)
    return `$${compact}K`
  }
  return `$${Math.round(value)}`
}

function usageFilter(range: ReturnType<typeof resolveUsageRange>): UsageFilters {
  return { start_date: range.startDate, end_date: range.endDate, billing_type: 0 }
}

export function resolveBalanceRanges(now = new Date()): BalanceUsageRanges {
  return {
    today: usageFilter(resolveUsageRange('today', now)),
    last7Days: usageFilter(resolveUsageRange('last7d', now)),
    thisMonth: usageFilter(resolveUsageRange('thisMonth', now)),
  }
}
