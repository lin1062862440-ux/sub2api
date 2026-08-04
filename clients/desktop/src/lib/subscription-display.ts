import type { SubscriptionStatus, UserSubscription } from '@/api'

export interface SubscriptionQuotaWindow {
  key: 'daily' | 'weekly' | 'monthly' | 'team-weekly'
  label: string
  used: number
  limit: number
  resetLabel: string
}

function isFiniteLimit(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function normalizedUsage(value: number | null | undefined, limit: number): number {
  if (value === Number.POSITIVE_INFINITY) return limit
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value ?? 0)
}

function resetTime(start: string | null | undefined, hours: number): string {
  if (!start) return '等待周期开始'
  const startedAt = Date.parse(start)
  if (!Number.isFinite(startedAt)) return '等待周期开始'

  const remaining = startedAt + hours * 60 * 60 * 1000 - Date.now()
  if (remaining <= 0) return '即将重置'

  const totalHours = Math.ceil(remaining / 3_600_000)
  if (totalHours < 24) return `${totalHours} 小时后重置`
  return `${Math.ceil(totalHours / 24)} 天后重置`
}

export function subscriptionProgress(
  used: number | null | undefined,
  limit: number | null | undefined,
): number {
  if (!isFiniteLimit(limit)) return 0
  if (used === Number.POSITIVE_INFINITY) return 100
  if (!Number.isFinite(used)) return 0
  return Math.min(100, Math.max(0, (used ?? 0) / limit * 100))
}

export function subscriptionQuotaWindows(item: UserSubscription): SubscriptionQuotaWindow[] {
  const group = item.group
  if (!group) return []

  if (isTeamSubscription(item)) {
    if (!isFiniteLimit(item.team_weekly_limit_usd)) return []
    return [{
      key: 'team-weekly',
      label: '本周已用 / 成员分配额度',
      used: normalizedUsage(item.team_weekly_usage_usd, item.team_weekly_limit_usd),
      limit: item.team_weekly_limit_usd,
      resetLabel: resetTime(item.team_weekly_window_start, 168),
    }]
  }

  const windows: SubscriptionQuotaWindow[] = []
  if (isFiniteLimit(group.daily_limit_usd)) {
    windows.push({
      key: 'daily',
      label: '日额度',
      used: normalizedUsage(item.daily_usage_usd, group.daily_limit_usd),
      limit: group.daily_limit_usd,
      resetLabel: resetTime(item.daily_window_start, 24),
    })
  }
  if (isFiniteLimit(group.weekly_limit_usd)) {
    windows.push({
      key: 'weekly',
      label: '周额度',
      used: normalizedUsage(item.weekly_usage_usd, group.weekly_limit_usd),
      limit: group.weekly_limit_usd,
      resetLabel: resetTime(item.weekly_window_start, 168),
    })
  }
  if (isFiniteLimit(group.monthly_limit_usd)) {
    windows.push({
      key: 'monthly',
      label: '月额度',
      used: normalizedUsage(item.monthly_usage_usd, group.monthly_limit_usd),
      limit: group.monthly_limit_usd,
      resetLabel: resetTime(item.monthly_window_start, 720),
    })
  }
  return windows
}

export function isTeamSubscription(item: UserSubscription): boolean {
  return item.group?.subscription_type === 'team_subscription'
}

export function isSubscriptionExhausted(item: UserSubscription): boolean {
  return subscriptionQuotaWindows(item).some((window) => subscriptionProgress(window.used, window.limit) >= 100)
}

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    active: '使用中',
    expired: '已过期',
    revoked: '已撤销',
    suspended: '已暂停',
  }
  return labels[status]
}

export function formatSubscriptionDate(value: string | null | undefined): string {
  if (!value) return '长期有效'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1) return '长期有效'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}
