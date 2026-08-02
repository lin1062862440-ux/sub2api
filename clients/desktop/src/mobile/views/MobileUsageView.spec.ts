import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUsageStats: vi.fn(),
  getUsageRecords: vi.fn(),
  getUsageErrors: vi.fn(),
  getUsageGroups: vi.fn(),
  getUsageApiKeys: vi.fn(),
  getUsageSnapshot: vi.fn(),
  getUsageModels: vi.fn(),
  resolveUsageRange: vi.fn(),
  session: {
    settings: { allow_user_view_error_requests: true },
  },
}))

vi.mock('@/api', () => ({
  getUsageStats: mocks.getUsageStats,
  getUsageRecords: mocks.getUsageRecords,
  getUsageErrors: mocks.getUsageErrors,
  getUsageGroups: mocks.getUsageGroups,
  getUsageApiKeys: mocks.getUsageApiKeys,
  getUsageSnapshot: mocks.getUsageSnapshot,
  getUsageModels: mocks.getUsageModels,
}))

vi.mock('@/stores/session', () => ({ session: mocks.session }))

vi.mock('@/lib/usage-range', () => ({
  usageRangePresets: [
    { value: 'today', label: '今天' },
    { value: 'yesterday', label: '昨天' },
    { value: 'last24h', label: '近 24 小时' },
    { value: 'last7d', label: '近 7 天' },
    { value: 'last14d', label: '近 14 天' },
    { value: 'last30d', label: '近 30 天' },
    { value: 'thisMonth', label: '本月' },
    { value: 'lastMonth', label: '上月' },
  ],
  resolveUsageRange: mocks.resolveUsageRange,
}))

import MobileUsageView from './MobileUsageView.vue'

const stats = {
  total_requests: 24,
  total_input_tokens: 1800,
  total_output_tokens: 600,
  total_cache_tokens: 40,
  total_cache_read_tokens: 30,
  total_cache_creation_tokens: 10,
  total_tokens: 2440,
  total_cost: 99,
  total_actual_cost: 0.08,
  average_duration_ms: 720,
}

const record = {
  id: 1,
  api_key_id: 2,
  model: 'claude-sonnet-4-with-a-very-long-model-name',
  inbound_endpoint: '/v1/messages',
  input_tokens: 180,
  output_tokens: 60,
  cache_creation_tokens: 10,
  cache_read_tokens: 20,
  total_tokens: 270,
  actual_cost: 0.008,
  request_type: 'stream' as const,
  stream: true,
  duration_ms: 820,
  first_token_ms: 210,
  billing_type: 0,
  billing_mode: 'token',
  created_at: '2026-08-01T08:30:00Z',
  group: { id: 3, name: '默认分组' },
}

const olderRecord = {
  ...record,
  id: 2,
  model: 'gpt-5-mini',
  request_type: 'sync' as const,
  stream: false,
  created_at: '2026-08-01T07:30:00Z',
}

const errorRecord = {
  id: 9,
  created_at: '2026-08-01T09:00:00Z',
  model: 'claude-sonnet-4',
  inbound_endpoint: '/v1/messages',
  status_code: 429,
  category: 'rate_limit',
  platform: 'anthropic',
  message: 'upstream rejected the request',
  key_name: 'credential-name-must-stay-private',
  key_deleted: false,
  client_ip: '192.0.2.12',
  group_name: '默认分组',
  error_body: 'raw prompt and bearer secret must stay private',
}

const deterministicRanges = {
  today: { label: '今天', startDate: '2026-08-01', endDate: '2026-08-01', granularity: 'hour' },
  yesterday: { label: '昨天', startDate: '2026-07-31', endDate: '2026-07-31', granularity: 'hour' },
  last24h: { label: '近 24 小时', startDate: '2026-07-31', endDate: '2026-08-01', granularity: 'hour' },
  last7d: { label: '近 7 天', startDate: '2026-07-26', endDate: '2026-08-01', granularity: 'day' },
  last14d: { label: '近 14 天', startDate: '2026-07-19', endDate: '2026-08-01', granularity: 'day' },
  last30d: { label: '近 30 天', startDate: '2026-07-03', endDate: '2026-08-01', granularity: 'day' },
  thisMonth: { label: '本月', startDate: '2026-08-01', endDate: '2026-08-01', granularity: 'hour' },
  lastMonth: { label: '上月', startDate: '2026-07-01', endDate: '2026-07-31', granularity: 'day' },
} as const

function arrangeSuccess() {
  mocks.getUsageStats.mockResolvedValue(stats)
  mocks.getUsageRecords.mockResolvedValue({ items: [record, olderRecord], total: 2, page: 1, page_size: 20 })
  mocks.getUsageErrors.mockResolvedValue({ items: [errorRecord], total: 1, page: 1, page_size: 20 })
  mocks.getUsageGroups.mockResolvedValue([{ id: 3, name: '默认分组' }])
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const wrappers: Array<{ unmount: () => void }> = []

function mountView() {
  const wrapper = mount(MobileUsageView, {
    global: { stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('MobileUsageView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.settings.allow_user_view_error_requests = true
    mocks.resolveUsageRange.mockImplementation((preset: keyof typeof deterministicRanges) => ({
      preset,
      ...deterministicRanges[preset],
    }))
    arrangeSuccess()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('keeps the MobilePage shell stable while the initial usage load is pending', () => {
    mocks.getUsageStats.mockReturnValue(new Promise(() => {}))
    mocks.getUsageRecords.mockReturnValue(new Promise(() => {}))

    const wrapper = mountView()

    expect(wrapper.find('.mobile-page-scroll').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('使用记录')
    expect(wrapper.find('[data-testid="mobile-page-loading"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="usage-refresh"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
  })

  it('loads stats and newest-first records with the existing last24h range semantics', async () => {
    const wrapper = mountView()
    await flushPromises()

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
    expect(mocks.resolveUsageRange).toHaveBeenCalledWith('last24h')
    expect(mocks.getUsageStats).toHaveBeenCalledWith({
      start_date: '2026-07-31',
      end_date: '2026-08-01',
      timezone,
    })
    expect(mocks.getUsageRecords).toHaveBeenCalledWith({
      start_date: '2026-07-31',
      end_date: '2026-08-01',
      timezone,
      page: 1,
      page_size: 20,
    })
    const cards = wrapper.findAll('[data-testid="usage-record-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain(record.model)
    expect(cards[1].text()).toContain(olderRecord.model)
    expect(mocks.getUsageApiKeys).not.toHaveBeenCalled()
    expect(mocks.getUsageSnapshot).not.toHaveBeenCalled()
    expect(mocks.getUsageModels).not.toHaveBeenCalled()
  })

  it('offers supported range presets and reloads the summary and first record page', async () => {
    const wrapper = mountView()
    await flushPromises()

    const range = wrapper.get('[data-testid="usage-range-filter"]')
    expect(range.findAll('option').map((option) => option.attributes('value'))).toEqual(expect.arrayContaining([
      'today',
      'last24h',
      'last7d',
      'last30d',
    ]))

    await range.setValue('last7d')
    await flushPromises()

    expect(mocks.resolveUsageRange).toHaveBeenCalledWith('last7d')
    expect(mocks.getUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({
      start_date: '2026-07-26',
      end_date: '2026-08-01',
    }))
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, page_size: 20 }))
  })

  it('renders summary totals from the real UsageStats fields', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="summary-requests"]').text()).toContain('24')
    expect(wrapper.get('[data-testid="summary-tokens"]').text()).toContain('2,440')
    expect(wrapper.get('[data-testid="summary-cost"]').text()).toContain('$0.08')
    expect(wrapper.get('[data-testid="summary-cost"]').text()).not.toContain('$99.00')
    expect(wrapper.get('[data-testid="summary-duration"]').text()).toContain('720ms')
  })

  it('renders readable record cards using only UsageLog fields', async () => {
    const wrapper = mountView()
    await flushPromises()

    const card = wrapper.get('[data-testid="usage-record-card"]')
    const text = card.text()
    expect(text).toContain('claude-sonnet-4-with-a-very-long-model-name')
    expect(text).toContain('流式请求')
    expect(text).toContain('流式')
    expect(text).toContain('输入 180')
    expect(text).toContain('输出 60')
    expect(text).toContain('缓存创建 10')
    expect(text).toContain('缓存读取 20')
    expect(text).toContain('合计 270')
    expect(text).toContain('$0.0080')
    expect(text).toContain('820ms')
    expect(text).toContain('默认分组')
    expect(text).toContain('余额')
    expect(text).not.toContain('Invalid Date')
  })

  it('keeps only essential filters visible and applies advanced draft filters at page one', async () => {
    mocks.getUsageRecords.mockResolvedValue({ items: [record], total: 45, page: 1, page_size: 20 })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="usage-range-filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usage-model-filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usage-request-type-filter"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('API Key')

    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))

    await wrapper.get('[data-testid="usage-model-filter"]').setValue('claude-sonnet-4')
    await wrapper.get('[data-testid="usage-request-type-filter"]').setValue('stream')
    await flushPromises()
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4',
      request_type: 'stream',
      page: 1,
    }))

    await wrapper.get('[data-testid="usage-advanced-trigger"]').trigger('click')
    await wrapper.get('[data-testid="usage-group-filter"]').setValue('3')
    await wrapper.get('[data-testid="usage-billing-type-filter"]').setValue('1')
    await wrapper.get('[data-testid="usage-billing-mode-filter"]').setValue('token')
    await wrapper.get('[data-testid="usage-filter-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-bottom-sheet"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="usage-filter-count"]').text()).toBe('5')
    expect(mocks.getUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4',
      request_type: 'stream',
      group_id: 3,
      billing_type: 1,
      billing_mode: 'token',
    }))
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('resets all filters, closes the sheet, and reloads the default first page', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="usage-model-filter"]').setValue('gpt-5')
    await flushPromises()
    await wrapper.get('[data-testid="usage-advanced-trigger"]').trigger('click')
    await wrapper.get('[data-testid="usage-group-filter"]').setValue('3')
    await wrapper.get('[data-testid="usage-filter-apply"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="usage-advanced-trigger"]').trigger('click')
    await wrapper.get('[data-testid="usage-filter-reset"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-bottom-sheet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-filter-count"]').exists()).toBe(false)
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.not.objectContaining({
      model: expect.anything(),
      group_id: expect.anything(),
    }))
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({
      start_date: '2026-07-31',
      end_date: '2026-08-01',
      page: 1,
    }))
  })

  it('shows the error tab only when enabled and renders compact private error cards', async () => {
    mocks.session.settings.allow_user_view_error_requests = false
    const hidden = mountView()
    await flushPromises()
    expect(hidden.find('[data-testid="usage-errors-tab"]').exists()).toBe(false)
    expect(mocks.getUsageErrors).not.toHaveBeenCalled()
    hidden.unmount()

    mocks.session.settings.allow_user_view_error_requests = true
    const visible = mountView()
    await flushPromises()
    await visible.get('[data-testid="usage-errors-tab"]').trigger('click')
    await flushPromises()

    expect(mocks.getUsageErrors).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }))
    const card = visible.get('[data-testid="usage-error-card"]')
    expect(card.text()).toContain('claude-sonnet-4')
    expect(card.text()).toContain('429')
    expect(card.text()).toContain('rate_limit')
    expect(card.text()).toContain('默认分组')
    expect(card.text()).not.toContain('raw prompt')
    expect(card.text()).not.toContain('bearer secret')
    expect(card.text()).not.toContain('credential-name-must-stay-private')
    expect(card.text()).not.toContain('192.0.2.12')
  })

  it('covers error loading, empty, failure, and pagination without dropping old cards', async () => {
    const initialErrors = deferred<{ items: typeof errorRecord[]; total: number; page: number; page_size: number }>()
    mocks.getUsageErrors.mockReturnValueOnce(initialErrors.promise)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="usage-errors-tab"]').trigger('click')
    expect(wrapper.find('[data-testid="usage-list-loading"]').exists()).toBe(true)
    initialErrors.resolve({ items: [errorRecord], total: 21, page: 1, page_size: 20 })
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-error-card"]').text()).toContain('429')
    mocks.getUsageErrors.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-error-card"]').text()).toContain('429')
    expect(wrapper.get('[data-testid="usage-inline-error"]').text()).toContain('错误记录')
    expect(wrapper.find('[data-testid="usage-inline-retry"]').exists()).toBe(true)

    mocks.getUsageErrors.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('[data-testid="usage-inline-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="usage-list-empty"]').text()).toContain('暂无错误记录')
  })

  it('keeps existing data through a failed busy refresh and exposes an inline retry', async () => {
    const wrapper = mountView()
    await flushPromises()

    const pendingStats = deferred<typeof stats>()
    const pendingRecords = deferred<{ items: typeof record[]; total: number; page: number; page_size: number }>()
    mocks.getUsageStats.mockReturnValueOnce(pendingStats.promise)
    mocks.getUsageRecords.mockReturnValueOnce(pendingRecords.promise)
    await wrapper.get('[data-testid="usage-refresh"]').trigger('click')

    expect(wrapper.get('[data-testid="usage-refresh"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="usage-record-card"]').text()).toContain(record.model)

    pendingStats.reject(new Error('offline'))
    pendingRecords.reject(new Error('offline'))
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-record-card"]').text()).toContain(record.model)
    expect(wrapper.get('[data-testid="usage-inline-error"]').text()).toContain('刷新失败')
    expect(wrapper.find('[data-testid="usage-inline-retry"]').exists()).toBe(true)
  })

  it('shows retry after a total initial failure and a clear state after a successful empty load', async () => {
    mocks.getUsageStats.mockRejectedValueOnce(new Error('offline'))
    mocks.getUsageRecords.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('暂时无法加载使用记录')

    mocks.getUsageStats.mockResolvedValueOnce(stats)
    mocks.getUsageRecords.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="usage-list-empty"]').text()).toContain('暂无使用记录')
  })

  it('emits valid previous and next record pages from total and page size', async () => {
    mocks.getUsageRecords.mockResolvedValue({ items: [record], total: 45, page: 1, page_size: 20 })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toContain('1 / 3')
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toContain('2 / 3')

    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('ignores stale out-of-order usage responses', async () => {
    const firstStats = deferred<typeof stats>()
    const firstRecords = deferred<{ items: typeof record[]; total: number; page: number; page_size: number }>()
    mocks.getUsageStats.mockReturnValueOnce(firstStats.promise)
    mocks.getUsageRecords.mockReturnValueOnce(firstRecords.promise)
    const wrapper = mountView()

    mocks.getUsageStats.mockResolvedValueOnce({ ...stats, total_requests: 99 })
    mocks.getUsageRecords.mockResolvedValueOnce({ items: [{ ...record, model: 'newest-result' }], total: 1, page: 1, page_size: 20 })
    const setupState = (wrapper.vm.$ as unknown as { setupState: { loadUsage: () => Promise<void> } }).setupState
    await setupState.loadUsage()
    await flushPromises()
    expect(wrapper.get('[data-testid="summary-requests"]').text()).toContain('99')
    expect(wrapper.get('[data-testid="usage-record-card"]').text()).toContain('newest-result')

    firstStats.resolve({ ...stats, total_requests: 1 })
    firstRecords.resolve({ items: [{ ...record, model: 'stale-result' }], total: 1, page: 1, page_size: 20 })
    await flushPromises()

    expect(wrapper.get('[data-testid="summary-requests"]').text()).toContain('99')
    expect(wrapper.text()).not.toContain('stale-result')
  })

  it('ignores pending request completion after unmount', async () => {
    const pendingStats = deferred<typeof stats>()
    const pendingRecords = deferred<{ items: typeof record[]; total: number; page: number; page_size: number }>()
    mocks.getUsageStats.mockReturnValueOnce(pendingStats.promise)
    mocks.getUsageRecords.mockReturnValueOnce(pendingRecords.promise)
    const wrapper = mountView()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setupState = (wrapper.vm.$ as unknown as { setupState: { stats: typeof stats | null } }).setupState

    wrapper.unmount()
    pendingStats.resolve(stats)
    pendingRecords.resolve({ items: [record], total: 1, page: 1, page_size: 20 })
    await flushPromises()

    expect(setupState.stats).toBeNull()
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('uses a phone-safe records-first layout without tables, gradients, or API key controls', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/mobile/views/MobileUsageView.vue'), 'utf8')

    expect(source).not.toMatch(/<table\b/i)
    expect(source).not.toMatch(/gradient\s*\(/i)
    expect(source).not.toContain('getUsageApiKeys')
    expect(source).not.toContain('getUsageSnapshot')
    expect(source).not.toContain('getUsageModels')
    expect(source).toMatch(/min-height:\s*44px/)
    expect(source).toMatch(/overflow-wrap:\s*anywhere|text-overflow:\s*ellipsis/)
  })
})
