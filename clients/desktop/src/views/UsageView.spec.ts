import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUsageStats: vi.fn(),
  getUsageSnapshot: vi.fn(),
  getUsageModels: vi.fn(),
  getUsageRecords: vi.fn(),
  getUsageErrors: vi.fn(),
  getUsageApiKeys: vi.fn(),
  getUsageGroups: vi.fn(),
  session: {
    runMode: 'standard' as 'standard' | 'simple',
    settings: { allow_user_view_error_requests: true },
  },
}))

vi.mock('@/api', () => ({
  getUsageStats: mocks.getUsageStats,
  getUsageSnapshot: mocks.getUsageSnapshot,
  getUsageModels: mocks.getUsageModels,
  getUsageRecords: mocks.getUsageRecords,
  getUsageErrors: mocks.getUsageErrors,
  getUsageApiKeys: mocks.getUsageApiKeys,
  getUsageGroups: mocks.getUsageGroups,
}))

vi.mock('@/stores/session', () => ({ session: mocks.session }))

import UsageView from './UsageView.vue'

const stats = {
  total_requests: 24,
  total_input_tokens: 1800,
  total_output_tokens: 600,
  total_cache_tokens: 0,
  total_cache_read_tokens: 0,
  total_cache_creation_tokens: 0,
  total_tokens: 2400,
  total_cost: 0.12,
  total_actual_cost: 0.08,
  average_duration_ms: 720,
}

const record = {
  id: 1,
  api_key_id: 2,
  model: 'claude-sonnet-4',
  inbound_endpoint: '/v1/messages',
  input_tokens: 180,
  output_tokens: 60,
  cache_creation_tokens: 0,
  cache_read_tokens: 0,
  total_tokens: 240,
  actual_cost: 0.008,
  request_type: 'stream' as const,
  stream: true,
  duration_ms: 820,
  first_token_ms: 210,
  billing_type: 0,
  created_at: '2026-08-01T08:30:00Z',
  api_key: { id: 2, name: 'production-key' },
}

function setSuccessfulResponses() {
  mocks.getUsageStats.mockResolvedValue(stats)
  mocks.getUsageSnapshot.mockResolvedValue({
    generated_at: '2026-08-01T08:31:00Z',
    start_date: '2026-07-31',
    end_date: '2026-08-01',
    granularity: 'hour',
    trend: [],
    groups: [],
  })
  mocks.getUsageModels.mockResolvedValue({ models: [] })
  mocks.getUsageRecords.mockResolvedValue({ items: [record], total: 1, page: 1, page_size: 20 })
  mocks.getUsageErrors.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
  mocks.getUsageApiKeys.mockResolvedValue({
    items: [{ id: 2, name: 'production-key' }],
    total: 1,
    page: 1,
    page_size: 100,
  })
  mocks.getUsageGroups.mockResolvedValue([{ id: 3, name: '默认分组' }])
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('UsageView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T14:00:00+08:00'))
    mocks.session.runMode = 'standard'
    mocks.session.settings.allow_user_view_error_requests = true
    setSuccessfulResponses()
  })

  afterEach(() => vi.useRealTimers())

  it('loads the analysis and records with one default range', async () => {
    const wrapper = mount(UsageView)
    await flushPromises()

    expect(mocks.getUsageStats).toHaveBeenCalledWith(expect.objectContaining({
      start_date: '2026-07-31',
      end_date: '2026-08-01',
      timezone: expect.any(String),
    }))
    expect(mocks.getUsageSnapshot).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'hour' }))
    expect(mocks.getUsageModels).toHaveBeenCalledOnce()
    expect(mocks.getUsageRecords).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }))
    expect(wrapper.text()).toContain('production-key')
  })

  it('applies a common filter and resets the records to page one', async () => {
    const wrapper = mount(UsageView)
    await flushPromises()
    mocks.getUsageStats.mockClear()
    mocks.getUsageRecords.mockClear()

    await wrapper.get('[data-testid="api-key-filter"]').setValue('2')
    await flushPromises()

    expect(mocks.getUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({ api_key_id: 2 }))
    expect(mocks.getUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ api_key_id: 2, page: 1 }))
  })

  it('keeps successful records visible when one analysis endpoint fails', async () => {
    mocks.getUsageStats.mockRejectedValueOnce(new Error('unavailable'))
    const wrapper = mount(UsageView)
    await flushPromises()

    expect(wrapper.get('[data-testid="usage-refresh-notice"]').text()).toContain('汇总指标')
    expect(wrapper.text()).toContain('production-key')
  })

  it('only exposes error requests when public settings allow it', async () => {
    mocks.session.settings.allow_user_view_error_requests = false
    const hidden = mount(UsageView)
    await flushPromises()
    expect(hidden.find('[data-testid="usage-errors-tab"]').exists()).toBe(false)
    hidden.unmount()

    mocks.session.settings.allow_user_view_error_requests = true
    const visible = mount(UsageView)
    await flushPromises()
    await visible.get('[data-testid="usage-errors-tab"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsageErrors).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }))
  })

  it('closes advanced filters when clicking outside', async () => {
    const wrapper = mount(UsageView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.filter-command').trigger('click')
    expect(wrapper.find('.advanced-filters').exists()).toBe(true)

    await wrapper.get('.advanced-filters').trigger('pointerdown')
    expect(wrapper.find('.advanced-filters').exists()).toBe(true)

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.advanced-filters').exists()).toBe(false)
  })

  it('exposes loading and refreshing states while preserving successful rows', async () => {
    const initialStats = deferred<typeof stats>()
    mocks.getUsageStats.mockReturnValueOnce(initialStats.promise)
    const wrapper = mount(UsageView)

    expect(wrapper.get('.usage-page').classes()).toContain('is-loading')

    initialStats.resolve(stats)
    await flushPromises()
    expect(wrapper.get('.usage-page').classes()).toContain('is-loaded')
    expect(wrapper.text()).toContain('production-key')

    const refreshedStats = deferred<typeof stats>()
    mocks.getUsageStats.mockReturnValueOnce(refreshedStats.promise)
    await wrapper.get('.icon-button').trigger('click')

    expect(wrapper.get('.usage-page').classes()).toContain('is-refreshing')
    expect(wrapper.text()).toContain('production-key')

    refreshedStats.resolve(stats)
    await flushPromises()
    expect(wrapper.get('.usage-page').classes()).not.toContain('is-refreshing')
  })
})
