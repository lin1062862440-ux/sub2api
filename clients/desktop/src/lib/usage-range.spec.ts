import { describe, expect, it } from 'vitest'

import { resolveCustomUsageRange, resolveUsageRange } from './usage-range'

const now = new Date('2026-08-01T14:00:00+08:00')

describe('usage range helpers', () => {
  it.each([
    ['today', '今天', '2026-08-01', '2026-08-01', 'hour'],
    ['yesterday', '昨天', '2026-07-31', '2026-07-31', 'hour'],
    ['last24h', '近 24 小时', '2026-07-31', '2026-08-01', 'hour'],
    ['last7d', '近 7 天', '2026-07-26', '2026-08-01', 'day'],
    ['last14d', '近 14 天', '2026-07-19', '2026-08-01', 'day'],
    ['last30d', '近 30 天', '2026-07-03', '2026-08-01', 'day'],
    ['thisMonth', '本月', '2026-08-01', '2026-08-01', 'hour'],
    ['lastMonth', '上月', '2026-07-01', '2026-07-31', 'day'],
  ] as const)('resolves %s', (preset, label, startDate, endDate, granularity) => {
    expect(resolveUsageRange(preset, now)).toEqual({ preset, label, startDate, endDate, granularity })
  })

  it('validates and resolves custom ranges', () => {
    expect(resolveCustomUsageRange('2026-07-28', '2026-08-01')).toEqual({
      preset: 'custom',
      label: '07/28 - 08/01',
      startDate: '2026-07-28',
      endDate: '2026-08-01',
      granularity: 'day',
    })
    expect(() => resolveCustomUsageRange('2026-08-02', '2026-08-01')).toThrow('开始日期不能晚于结束日期')
  })
})
