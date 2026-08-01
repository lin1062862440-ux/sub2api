export type UsageRangePreset =
  | 'today'
  | 'yesterday'
  | 'last24h'
  | 'last7d'
  | 'last14d'
  | 'last30d'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom'

export interface UsageDateRange {
  preset: UsageRangePreset
  label: string
  startDate: string
  endDate: string
  granularity: 'hour' | 'day'
}

export const usageRangePresets: Array<{ value: Exclude<UsageRangePreset, 'custom'>; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'last24h', label: '近 24 小时' },
  { value: 'last7d', label: '近 7 天' },
  { value: 'last14d', label: '近 14 天' },
  { value: 'last30d', label: '近 30 天' },
  { value: 'thisMonth', label: '本月' },
  { value: 'lastMonth', label: '上月' },
]

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

function range(preset: UsageDateRange['preset'], label: string, start: Date, end: Date, granularity: UsageDateRange['granularity']): UsageDateRange {
  return { preset, label, startDate: formatLocalDate(start), endDate: formatLocalDate(end), granularity }
}

export function resolveUsageRange(preset: Exclude<UsageRangePreset, 'custom'>, now = new Date()): UsageDateRange {
  switch (preset) {
    case 'today':
      return range(preset, '今天', now, now, 'hour')
    case 'yesterday': {
      const yesterday = addDays(now, -1)
      return range(preset, '昨天', yesterday, yesterday, 'hour')
    }
    case 'last24h':
      return range(preset, '近 24 小时', addDays(now, -1), now, 'hour')
    case 'last7d':
      return range(preset, '近 7 天', addDays(now, -6), now, 'day')
    case 'last14d':
      return range(preset, '近 14 天', addDays(now, -13), now, 'day')
    case 'last30d':
      return range(preset, '近 30 天', addDays(now, -29), now, 'day')
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return range(preset, '本月', start, now, start.getDate() === now.getDate() ? 'hour' : 'day')
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return range(preset, '上月', start, end, 'day')
    }
  }
}

export function resolveCustomUsageRange(startDate: string, endDate: string): UsageDateRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('请选择完整的日期范围')
  }
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (start.getTime() > end.getTime()) throw new Error('开始日期不能晚于结束日期')
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  const short = (value: string) => `${value.slice(5, 7)}/${value.slice(8, 10)}`
  return {
    preset: 'custom',
    label: `${short(startDate)} - ${short(endDate)}`,
    startDate,
    endDate,
    granularity: days <= 1 ? 'hour' : 'day',
  }
}
