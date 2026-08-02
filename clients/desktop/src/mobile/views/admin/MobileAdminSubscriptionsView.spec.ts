import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminSubscription, AdminSubscriptionProgress } from '@/api/admin/types'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  progress: vi.fn(),
  assign: vi.fn(),
  bulkAssign: vi.fn(),
  extend: vi.fn(),
  reset: vi.fn(),
  revoke: vi.fn(),
  restore: vi.fn(),
  groups: vi.fn(),
}))

vi.mock('@/api/admin/subscriptions', () => ({
  listAdminSubscriptions: mocks.list,
  getAdminSubscriptionProgress: mocks.progress,
  assignAdminSubscription: mocks.assign,
  bulkAssignAdminSubscriptions: mocks.bulkAssign,
  extendAdminSubscription: mocks.extend,
  resetAdminSubscriptionQuota: mocks.reset,
  revokeAdminSubscription: mocks.revoke,
  restoreAdminSubscription: mocks.restore,
}))
vi.mock('@/api/admin/users', () => ({ getAdminGroups: mocks.groups }))

import MobileAdminSubscriptionsView from './MobileAdminSubscriptionsView.vue'

function subscription(overrides: Partial<AdminSubscription> = {}): AdminSubscription {
  return {
    id: 3,
    user_id: 7,
    group_id: 2,
    status: 'active',
    starts_at: '2026-08-01T00:00:00Z',
    expires_at: '2026-09-01T00:00:00Z',
    daily_usage_usd: 4,
    weekly_usage_usd: 12,
    monthly_usage_usd: 20,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    user: { id: 7, email: 'lin@example.com', username: 'Lin' },
    group: { id: 2, name: 'Claude Code' },
    ...overrides,
  }
}

function progress(overrides: Partial<AdminSubscriptionProgress> = {}): AdminSubscriptionProgress {
  return {
    id: 3,
    group_name: 'Claude Code',
    daily: {
      used_usd: 32.05,
      limit_usd: 400,
      remaining_usd: 367.95,
      percentage: 8.009257707,
      window_start: '2026-08-01T00:00:00Z',
      resets_at: '2026-08-02T00:00:00Z',
      resets_in_seconds: 21_600,
    },
    weekly: {
      used_usd: 500,
      limit_usd: 500,
      remaining_usd: 0,
      percentage: 100,
      window_start: '2026-07-28T00:00:00Z',
      resets_at: '2026-08-04T00:00:00Z',
      resets_in_seconds: 360_000,
    },
    monthly: null,
    expires_at: '2026-09-01T00:00:00Z',
    expires_in_days: 30,
    ...overrides,
  }
}

function response(
  items: AdminSubscription[] = [subscription()],
  overrides: Record<string, unknown> = {},
) {
  const total = typeof overrides.total === 'number' ? overrides.total : items.length
  const pageSize = typeof overrides.page_size === 'number' ? overrides.page_size : 20
  return {
    items,
    total,
    page: 1,
    page_size: pageSize,
    pages: Math.ceil(total / pageSize),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function bodyElement<T extends HTMLElement>(testId: string): T {
  const element = document.body.querySelector<T>(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing body element: ${testId}`)
  return element
}

async function clickBody(testId: string) {
  bodyElement<HTMLButtonElement>(testId).click()
  await flushPromises()
}

async function setBodyValue(testId: string, value: string) {
  const element = bodyElement<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(testId)
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  await flushPromises()
}

async function openMenu(wrapper: ReturnType<typeof mount>, id: number) {
  await wrapper.get(`[data-testid="subscription-menu-trigger-${id}"]`).trigger('click')
}

describe('MobileAdminSubscriptionsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockResolvedValue(response())
    mocks.progress.mockResolvedValue(progress())
    mocks.groups.mockResolvedValue([
      { id: 2, name: 'Claude Code', platform: 'anthropic', is_exclusive: true, status: 'active', subscription_type: 'subscription' },
      { id: 5, name: 'Codex Pro', platform: 'openai', is_exclusive: true, status: 'active', subscription_type: 'subscription' },
    ])
    mocks.assign.mockResolvedValue(subscription())
    mocks.bulkAssign.mockResolvedValue({
      success_count: 3,
      created_count: 2,
      reused_count: 1,
      failed_count: 0,
      subscriptions: [
        subscription({ id: 30, group_id: 5, user: { id: 7, email: 'seven@example.com', username: 'Seven' }, group: { id: 5, name: 'Codex Pro' } }),
        subscription({ id: 31, user_id: 8, group_id: 5, user: { id: 8, email: 'eight@example.com', username: 'Eight' }, group: { id: 5, name: 'Codex Pro' } }),
        subscription({ id: 32, user_id: 9, group_id: 5, user: { id: 9, email: 'nine@example.com', username: 'Nine' }, group: { id: 5, name: 'Codex Pro' } }),
      ],
      errors: [],
      statuses: { 7: 'created', 8: 'created', 9: 'reused' },
    })
    mocks.extend.mockResolvedValue(subscription())
    mocks.reset.mockResolvedValue(subscription({ daily_usage_usd: 0, monthly_usage_usd: 0 }))
    mocks.revoke.mockResolvedValue({ message: 'ok' })
    mocks.restore.mockResolvedValue(subscription({ id: 4, user_id: 8, status: 'active', user: { id: 8, email: 'restored@example.com', username: 'Restored' } }))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads the fixed list contract and renders safe cards with per-window progress', async () => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked', user: { id: 8, email: '', username: '' } })
    mocks.list.mockResolvedValueOnce(response([subscription(), revoked]))
    mocks.progress.mockImplementation((id: number) => id === 3
      ? Promise.resolve(progress())
      : Promise.reject(new Error('token=progress-secret')))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3, 4])
    expect(wrapper.findAll('[data-testid="mobile-subscription-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$32.05 / $400.00')
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('8%')
    expect(wrapper.get('[data-testid="subscription-quota-weekly-3"]').text()).toContain('100%')
    expect(wrapper.find('[data-testid="subscription-quota-monthly-3"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="subscription-progress-error-4"]').text()).toContain('额度暂时无法加载')
    expect(wrapper.text()).toContain('用户 #8')
    expect(wrapper.text()).not.toContain('Invalid')
    expect(wrapper.text()).not.toContain('progress-secret')
  })

  it('accepts the real empty pagination envelope and renders the empty state', async () => {
    mocks.list.mockResolvedValueOnce(response([]))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })
    expect(wrapper.get('[data-testid="subscription-list-empty"]').text()).toContain('暂无订阅')
    expect(wrapper.find('[data-testid="subscription-list-error"]').exists()).toBe(false)
    expect(mocks.progress).not.toHaveBeenCalled()
  })

  it('renders a completed progress response without quota windows instead of loading forever', async () => {
    mocks.progress.mockResolvedValueOnce(progress({ daily: null, weekly: null, monthly: null }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-progress-empty-3"]').text()).toContain('未设置周期额度')
    expect(wrapper.find('[data-testid="subscription-progress-error-3"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('正在加载额度')
  })

  it.each([
    ['wrong id type', { id: '3' }],
    ['invalid expiry', { expires_at: 'not-a-date' }],
    ['invalid expiry days', { expires_in_days: Number.NaN }],
    ['invalid quota amount', { daily: { ...progress().daily!, limit_usd: Number.POSITIVE_INFINITY } }],
    ['missing quota date', { daily: { ...progress().daily!, resets_at: undefined } }],
    ['invalid reset seconds', { daily: { ...progress().daily!, resets_in_seconds: -1 } }],
  ])('rejects malformed progress with %s and retries safely', async (_caseName, overrides) => {
    mocks.progress.mockResolvedValueOnce(progress(overrides as Partial<AdminSubscriptionProgress>))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-progress-error-3"]').text()).toContain('额度暂时无法加载')
    expect(wrapper.get('[data-testid="retry-subscription-progress-3"]')).toBeTruthy()
    mocks.progress.mockResolvedValueOnce(progress())
    await wrapper.get('[data-testid="retry-subscription-progress-3"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$32.05')
  })

  it.each([
    ['missing envelope fields', {}],
    ['empty result with one page', response([], { pages: 1 })],
    ['empty result with a non-empty item', response([subscription()], { total: 0, pages: 0 })],
    ['non-empty result with zero pages', response([subscription()], { pages: 0 })],
    ['wrong response page', response([subscription()], { page: 2 })],
    ['wrong response page size', response([subscription()], { page_size: 50, pages: 1 })],
    ['string subscription ids', response([{ ...subscription(), id: '3', user_id: '7', group_id: '2' } as unknown as AdminSubscription])],
    ['duplicate subscription ids', response([subscription(), subscription()])],
    ['invalid required subscription data', response([{ ...subscription(), status: 'unknown' } as unknown as AdminSubscription])],
  ])('rejects %s as a failed initial list instead of an empty result', async (_caseName, malformed) => {
    mocks.list.mockResolvedValueOnce(malformed)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-list-error"]').text()).toContain('订阅列表加载失败')
    expect(wrapper.find('[data-testid="subscription-list-empty"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-subscription-card"]')).toHaveLength(0)
  })

  it('preserves trusted list data when a fulfilled refresh response is malformed', async () => {
    mocks.list.mockResolvedValueOnce(response()).mockResolvedValueOnce(response([], { page: 2 }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="subscription-search"]').setValue('new')
    await wrapper.get('[data-testid="subscription-search-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('lin@example.com')
    expect(wrapper.get('[data-testid="subscription-action-error"]').text()).toContain('刷新失败')
    expect(wrapper.find('[data-testid="subscription-list-empty"]').exists()).toBe(false)
  })

  it('keeps search, filters, and assignment available while loading, empty, and failed', async () => {
    const pending = deferred<ReturnType<typeof response>>()
    mocks.list.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    expect(wrapper.get('[data-testid="subscription-search"]')).toBeTruthy()
    expect(wrapper.get('[data-testid="assign-subscription"]')).toBeTruthy()
    expect(wrapper.get('[data-testid="subscription-list-loading"]').text()).toContain('正在加载')

    pending.reject(new Error('api_key=list-secret offline'))
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-list-error"]').text()).toContain('订阅列表加载失败')
    expect(wrapper.text()).not.toContain('list-secret')
    await wrapper.get('[data-testid="subscription-list-retry"]').trigger('click')
    await flushPromises()

    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="subscription-search-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-list-empty"]').text()).toContain('暂无订阅')
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    expect(bodyElement('subscription-assignment-sheet')).toBeTruthy()
  })

  it('applies trimmed search, status, and validated group filters with exact page size', async () => {
    mocks.groups.mockResolvedValueOnce([
      { id: 2, name: 'Claude Code', platform: 'anthropic', is_exclusive: true, status: 'active', subscription_type: 'subscription' },
    ])
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="subscription-search"]').setValue('  lin@example.com  ')
    await wrapper.get('[data-testid="subscription-filter-trigger"]').trigger('click')
    expect(document.body.querySelectorAll('[data-testid="subscription-group-filter"] option[value="2"]')).toHaveLength(1)
    await setBodyValue('subscription-status-filter', 'active')
    await setBodyValue('subscription-group-filter', '2')
    await clickBody('subscription-filter-apply')

    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'lin@example.com',
      status: 'active',
      group_id: 2,
    })
  })

  it('separates filter groups from active subscription assignment candidates', async () => {
    mocks.groups.mockResolvedValueOnce([
      { id: 2, name: 'Active Subscription', platform: 'anthropic', is_exclusive: true, status: 'active', subscription_type: 'subscription' },
      { id: 5, name: 'Standard Billing', platform: 'openai', is_exclusive: false, status: 'active', subscription_type: 'standard' },
      { id: 6, name: 'Inactive Subscription', platform: 'openai', is_exclusive: true, status: 'inactive', subscription_type: 'subscription' },
    ])
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="subscription-filter-trigger"]').trigger('click')
    expect(bodyElement<HTMLSelectElement>('subscription-group-filter').querySelectorAll('option')).toHaveLength(4)
    await clickBody('mobile-bottom-sheet-close')
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    const assignmentGroups = bodyElement<HTMLSelectElement>('subscription-assignment-group-id')
    expect([...assignmentGroups.options].map((option) => option.textContent)).toEqual(['请选择', 'Active Subscription'])
    expect(document.body.textContent).not.toContain('Standard Billing')
    expect(document.body.textContent).not.toContain('Inactive Subscription')
  })

  it('disables assignment for a malformed group response and retries candidates safely', async () => {
    mocks.groups
      .mockResolvedValueOnce([{ id: 2, name: 'Missing Contract Fields' }])
      .mockResolvedValueOnce([{ id: 2, name: 'Recovered', platform: 'anthropic', is_exclusive: true, status: 'active', subscription_type: 'subscription' }])
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')

    expect(bodyElement<HTMLButtonElement>('confirm-subscription-assignment').disabled).toBe(true)
    expect(bodyElement('subscription-groups-error').textContent).toContain('分组')
    await clickBody('retry-subscription-groups')
    expect(bodyElement<HTMLSelectElement>('subscription-assignment-group-id').querySelector('option[value="2"]')?.textContent).toBe('Recovered')
    expect(bodyElement<HTMLButtonElement>('confirm-subscription-assignment').disabled).toBe(false)
  })

  it('submits exact single and bulk assignment payloads', async () => {
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '7')
    await setBodyValue('subscription-assignment-group-id', '2')
    await setBodyValue('subscription-validity-days', '45')
    await clickBody('confirm-subscription-assignment')
    expect(mocks.assign).toHaveBeenCalledWith({ user_id: 7, group_id: 2, validity_days: 45 })

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '7, 8\n9')
    await setBodyValue('subscription-assignment-group-id', '5')
    await clickBody('confirm-subscription-assignment')
    expect(mocks.bulkAssign).toHaveBeenCalledWith({ user_ids: [7, 8, 9], group_id: 5, validity_days: 30 })
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('成功 3 个')
  })

  it.each([
    ['blank token', '7,,8'],
    ['trailing delimiter', '7,'],
    ['non-numeric token', '7,8O'],
    ['negative id', '7,-8'],
    ['unsafe id', '7,9007199254740992'],
    ['duplicate id', '7,7'],
  ])('rejects an entire bulk assignment containing a %s', async (_caseName, input) => {
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', input)
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(mocks.bulkAssign).not.toHaveBeenCalled()
    expect(bodyElement('subscription-assignment-error').textContent).toContain('用户 ID 列表')
  })

  it.each([
    ['inconsistent counts', {
      success_count: 2, created_count: 1, reused_count: 0, failed_count: 0,
      subscriptions: [subscription({ id: 40 }), subscription({ id: 41, user_id: 8, user: { id: 8, email: 'eight@example.com', username: 'Eight' } })],
      errors: [], statuses: { 7: 'created', 8: 'created' },
    }],
    ['foreign subscription user', {
      success_count: 2, created_count: 2, reused_count: 0, failed_count: 0,
      subscriptions: [subscription({ id: 40 }), subscription({ id: 41, user_id: 99, user: { id: 99, email: 'foreign@example.com', username: 'Foreign' } })],
      errors: [], statuses: { 7: 'created', 8: 'created' },
    }],
    ['wrong subscription group', {
      success_count: 2, created_count: 2, reused_count: 0, failed_count: 0,
      subscriptions: [subscription({ id: 40 }), subscription({ id: 41, user_id: 8, group_id: 5, user: { id: 8, email: 'eight@example.com', username: 'Eight' }, group: { id: 5, name: 'Codex Pro' } })],
      errors: [], statuses: { 7: 'created', 8: 'created' },
    }],
    ['invalid statuses', {
      success_count: 2, created_count: 2, reused_count: 0, failed_count: 0,
      subscriptions: [subscription({ id: 40 }), subscription({ id: 41, user_id: 8, user: { id: 8, email: 'eight@example.com', username: 'Eight' } })],
      errors: [], statuses: { 7: 'created', 8: 'mystery' },
    }],
  ])('keeps the bulk sheet open for a %s response and does not refresh', async (_caseName, malformed) => {
    mocks.bulkAssign.mockResolvedValueOnce(malformed)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '7,8')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(mocks.bulkAssign).toHaveBeenCalledTimes(1)
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(bodyElement('subscription-assignment-sheet')).toBeTruthy()
    expect(bodyElement('subscription-assignment-error').textContent).toContain('批量分配结果无法确认')
  })

  it.each([
    ['partial', {
      success_count: 1,
      created_count: 1,
      reused_count: 0,
      failed_count: 1,
      subscriptions: [subscription({ id: 40 })],
      errors: ['user 8: token=partial-secret'],
      statuses: { 7: 'created', 8: 'failed' },
    }, '部分用户分配失败'],
    ['all', {
      success_count: 0,
      created_count: 0,
      reused_count: 0,
      failed_count: 2,
      subscriptions: [],
      errors: ['user 7: token=all-secret', 'user 8: raw failure'],
      statuses: { 7: 'failed', 8: 'failed' },
    }, '批量分配失败'],
  ])('shows fixed failed user ids for a %s failure without raw errors', async (_caseName, bulkResponse, expected) => {
    mocks.bulkAssign.mockResolvedValueOnce(bulkResponse)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '7,8')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.find('[data-testid="subscription-action-message"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="subscription-bulk-warning"]').text()).toContain(expected)
    expect(wrapper.get('[data-testid="subscription-bulk-warning"]').text()).toContain('#8')
    if (_caseName === 'all') expect(wrapper.get('[data-testid="subscription-bulk-warning"]').text()).toContain('#7')
    expect(wrapper.text()).not.toContain('partial-secret')
    expect(wrapper.text()).not.toContain('all-secret')
    expect(wrapper.text()).not.toContain('raw failure')
  })

  it('merges only created bulk subscriptions, preserves total for reused off-page items, and loads new progress', async () => {
    const reused = subscription({ id: 44, user_id: 9, user: { id: 9, email: 'reused@example.com', username: 'Reused' } })
    const created = subscription({ id: 45, user_id: 8, user: { id: 8, email: 'created@example.com', username: 'Created' } })
    mocks.list
      .mockResolvedValueOnce(response([subscription()], { total: 19 }))
      .mockResolvedValueOnce(response([created, subscription()], { total: 20 }))
    mocks.bulkAssign.mockResolvedValueOnce({
      success_count: 2,
      created_count: 1,
      reused_count: 1,
      failed_count: 0,
      subscriptions: [reused, created],
      errors: [],
      statuses: { 9: 'reused', 8: 'created' },
    })
    mocks.progress.mockImplementation((id: number) => Promise.resolve(progress({ id })))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '9,8')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.text()).toContain('created@example.com')
    expect(wrapper.text()).not.toContain('reused@example.com')
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3, 45])
    expect(wrapper.get('[data-testid="subscription-quota-daily-45"]').text()).toContain('$32.05')
    expect(wrapper.find('[data-testid="subscription-sync-warning"]').exists()).toBe(false)
  })

  it('reloads progress once for visible reused and newly visible bulk successes after authoritative sync', async () => {
    const visible = subscription({ status: 'expired', expires_at: '2026-07-01T00:00:00Z' })
    const renewedVisible = subscription({ status: 'active' })
    const newlyVisible = subscription({ id: 44, user_id: 9, user: { id: 9, email: 'renewed@example.com', username: 'Renewed' } })
    const renewedProgress = progress({
      daily: { ...progress().daily!, used_usd: 0, remaining_usd: 400, percentage: 0 },
    })
    mocks.list
      .mockResolvedValueOnce(response([visible]))
      .mockResolvedValueOnce(response([renewedVisible, newlyVisible]))
    mocks.bulkAssign.mockResolvedValueOnce({
      success_count: 2,
      created_count: 0,
      reused_count: 2,
      failed_count: 0,
      subscriptions: [renewedVisible, newlyVisible],
      errors: [],
      statuses: { 7: 'reused', 9: 'reused' },
    })
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    mocks.progress.mockClear()
    mocks.progress.mockImplementation((id: number) => Promise.resolve(id === 3 ? renewedProgress : progress({ id })))

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '7,9')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(mocks.progress.mock.calls.map(([id]) => id).sort((left, right) => left - right)).toEqual([3, 44])
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$0.00 / $400.00')
    expect(wrapper.get('[data-testid="subscription-quota-daily-44"]').text()).toContain('$32.05')
  })

  it('reloads progress only for successful bulk users and not failed visible users', async () => {
    const failedVisible = subscription({ id: 4, user_id: 8, user: { id: 8, email: 'failed@example.com', username: 'Failed' } })
    mocks.list
      .mockResolvedValueOnce(response([subscription(), failedVisible]))
      .mockResolvedValueOnce(response([subscription(), failedVisible]))
    mocks.bulkAssign.mockResolvedValueOnce({
      success_count: 1,
      created_count: 0,
      reused_count: 1,
      failed_count: 1,
      subscriptions: [subscription()],
      errors: ['user 8 failed'],
      statuses: { 7: 'reused', 8: 'failed' },
    })
    mocks.progress.mockImplementation((id: number) => Promise.resolve(progress({ id })))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    mocks.progress.mockClear()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '7,8')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3])
    expect(wrapper.get('[data-testid="subscription-bulk-warning"]').text()).toContain('#8')
  })

  it('shows a fixed retryable progress failure for a newly created subscription', async () => {
    const created = subscription({ id: 45, user_id: 8, user: { id: 8, email: 'created@example.com', username: 'Created' } })
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('offline'))
    mocks.bulkAssign.mockResolvedValueOnce({
      success_count: 1, created_count: 1, reused_count: 0, failed_count: 0,
      subscriptions: [created], errors: [], statuses: { 8: 'created' },
    })
    mocks.progress.mockImplementation((id: number) => id === 45
      ? Promise.reject(new Error('credential=new-progress-secret'))
      : Promise.resolve(progress({ id })))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('subscription-mode-bulk')
    await setBodyValue('subscription-user-ids', '8')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.get('[data-testid="subscription-progress-error-45"]').text()).toContain('额度暂时无法加载')
    expect(wrapper.get('[data-testid="retry-subscription-progress-45"]')).toBeTruthy()
    expect(wrapper.text()).not.toContain('new-progress-secret')
    mocks.progress.mockResolvedValueOnce(progress({ id: 45 }))
    await wrapper.get('[data-testid="retry-subscription-progress-45"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-quota-daily-45"]').text()).toContain('$32.05')
  })

  it('rejects malformed assignment ids and preserves the sheet on API rejection', async () => {
    mocks.assign.mockRejectedValueOnce(new Error('credential=assign-secret'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')

    await setBodyValue('subscription-user-id', '1.5')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')
    expect(mocks.assign).not.toHaveBeenCalled()
    expect(bodyElement('subscription-assignment-error').textContent).toContain('有效的用户 ID')

    await setBodyValue('subscription-user-id', '7')
    await clickBody('confirm-subscription-assignment')
    expect(mocks.assign).toHaveBeenCalledTimes(1)
    expect(bodyElement('subscription-assignment-sheet')).toBeTruthy()
    expect(bodyElement('subscription-assignment-error').textContent).toContain('分配失败')
    expect(document.body.textContent).not.toContain('assign-secret')
  })

  it.each([
    ['off-page reused', subscription({ id: 10, user_id: 10, user: { id: 10, email: 'reused-off-page@example.com', username: 'Reused' } })],
    ['new ambiguous', subscription({ id: 11, user_id: 10, user: { id: 10, email: 'ambiguous-new@example.com', username: 'Ambiguous' } })],
  ])('keeps a single assignment result conservative for %s when refresh fails', async (_caseName, assigned) => {
    mocks.assign.mockResolvedValueOnce(assigned)
    mocks.list
      .mockResolvedValueOnce(response([subscription()], { total: 19 }))
      .mockRejectedValueOnce(new Error('token=assignment-refresh-secret'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '10')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.text()).not.toContain(assigned.user!.email)
    expect(wrapper.findAll('[data-testid="mobile-subscription-card"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3])
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('已为用户 #10 分配订阅')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('同步失败')
    expect(wrapper.text()).not.toContain('assignment-refresh-secret')
  })

  it('updates an existing visible subscription after single assignment without changing total', async () => {
    const updated = subscription({ user: { id: 7, email: 'updated@example.com', username: 'Updated' } })
    const renewedProgress = progress({
      daily: { ...progress().daily!, used_usd: 0, remaining_usd: 400, percentage: 0 },
    })
    mocks.assign.mockResolvedValueOnce(updated)
    mocks.list.mockResolvedValueOnce(response([subscription()], { total: 19 })).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    mocks.progress.mockClear()
    mocks.progress.mockResolvedValueOnce(renewedProgress)
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '7')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.text()).toContain('updated@example.com')
    expect(wrapper.findAll('[data-testid="mobile-subscription-card"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3])
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$0.00 / $400.00')
  })

  it('reloads one visible reused single subscription and replaces stale progress', async () => {
    const expired = subscription({ status: 'expired', expires_at: '2026-07-01T00:00:00Z' })
    const renewed = subscription({ status: 'active' })
    const renewedProgress = progress({
      daily: { ...progress().daily!, used_usd: 0, remaining_usd: 400, percentage: 0 },
    })
    mocks.list.mockResolvedValueOnce(response([expired])).mockResolvedValueOnce(response([renewed]))
    mocks.assign.mockResolvedValueOnce(renewed)
    mocks.progress.mockResolvedValueOnce(progress()).mockResolvedValueOnce(renewedProgress)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    mocks.progress.mockClear()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '7')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3])
    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toBe('有效')
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$0.00 / $400.00')
  })

  it('loads progress for an unseen single assignment only after refresh includes it', async () => {
    const assigned = subscription({
      id: 10,
      user_id: 10,
      user: { id: 10, email: 'confirmed@example.com', username: 'Confirmed' },
    })
    mocks.assign.mockResolvedValueOnce(assigned)
    mocks.list
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([assigned, subscription()]))
    mocks.progress.mockImplementation((id: number) => Promise.resolve(progress({ id })))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '10')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.text()).toContain('confirmed@example.com')
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3, 10])
    expect(wrapper.get('[data-testid="subscription-quota-daily-10"]').text()).toContain('$32.05')
  })

  it('keeps assignment cancellation available', async () => {
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('mobile-bottom-sheet-close')

    expect(document.body.querySelector('[data-testid="subscription-assignment-sheet"]')).toBeNull()
  })

  it('uses exact ids and payloads for extend, quota reset, revoke, and restore', async () => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked', user: { id: 8, email: 'revoked@example.com', username: 'Revoked' } })
    mocks.list.mockResolvedValue(response([subscription(), revoked]))
    mocks.progress.mockImplementation((id: number) => Promise.resolve(progress({ id })))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    await setBodyValue('subscription-extend-days', '60')
    await clickBody('confirm-subscription-action')
    expect(mocks.extend).toHaveBeenCalledWith(3, 60)

    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    bodyElement<HTMLInputElement>('subscription-reset-weekly').click()
    await clickBody('confirm-subscription-action')
    expect(mocks.reset).toHaveBeenCalledWith(3, { daily: true, weekly: false, monthly: true })

    await openMenu(wrapper, 3)
    expect(wrapper.find('[data-testid="restore-subscription-3"]').exists()).toBe(false)
    await wrapper.get('[data-testid="revoke-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')
    expect(mocks.revoke).toHaveBeenCalledWith(3)

    await openMenu(wrapper, 4)
    expect(wrapper.find('[data-testid="revoke-subscription-4"]').exists()).toBe(false)
    await wrapper.get('[data-testid="restore-subscription-4"]').trigger('click')
    await clickBody('confirm-subscription-action')
    expect(mocks.restore).toHaveBeenCalledWith(4)
  })

  it('guards duplicate lifecycle submission, pending dismissal, and releases after rejection', async () => {
    const pending = deferred<AdminSubscription>()
    mocks.extend.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    const confirm = bodyElement<HTMLButtonElement>('confirm-subscription-action')
    confirm.click()
    confirm.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(mocks.extend).toHaveBeenCalledTimes(1)
    expect(bodyElement('subscription-action-sheet')).toBeTruthy()
    pending.resolve(subscription())
    await flushPromises()
    expect(document.body.querySelector('[data-testid="subscription-action-sheet"]')).toBeNull()

    mocks.reset.mockRejectedValueOnce(new Error('token=reset-secret'))
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')
    expect(bodyElement('subscription-action-error').textContent).toContain('操作失败')
    expect(document.body.textContent).not.toContain('reset-secret')
    expect(bodyElement<HTMLButtonElement>('confirm-subscription-action').disabled).toBe(false)
  })

  it('keeps the successful local lifecycle result and shows a sync warning when refresh fails', async () => {
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('api_key=refresh-secret'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="revoke-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toContain('已撤销')
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('已撤销')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('同步失败')
    expect(wrapper.text()).not.toContain('refresh-secret')
  })

  it('accepts an expired subscription becoming active after extension and preserves local success on sync failure', async () => {
    const expired = subscription({ status: 'expired', expires_at: '2026-07-01T00:00:00Z' })
    const extended = subscription({ status: 'active', expires_at: '2026-09-02T00:00:00Z' })
    mocks.list.mockResolvedValueOnce(response([expired])).mockRejectedValueOnce(new Error('token=expired-sync-secret'))
    mocks.extend.mockResolvedValueOnce(extended)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    await setBodyValue('subscription-extend-days', '30')
    await clickBody('confirm-subscription-action')

    expect(document.body.querySelector('[data-testid="subscription-action-sheet"]')).toBeNull()
    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toBe('有效')
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('已延长 30 天')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('同步失败')
    expect(wrapper.text()).not.toContain('expired-sync-secret')
  })

  it('does not persist a malformed lifecycle response when synchronization fails', async () => {
    mocks.extend.mockResolvedValueOnce({ ...subscription(), status: 'corrupt-status' })
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toBe('有效')
    expect(wrapper.text()).not.toContain('未知状态')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('同步失败')
  })

  it.each([
    ['wrong id', { id: 99 }],
    ['wrong user', { user_id: 99, user: { id: 99, email: 'foreign@example.com', username: 'Foreign' } }],
    ['wrong group', { group_id: 5, group: { id: 5, name: 'Codex Pro' } }],
    ['changed status', { status: 'expired' as const }],
  ])('rejects an extend response with %s and preserves the target', async (_caseName, overrides) => {
    mocks.extend.mockResolvedValueOnce(subscription(overrides))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(bodyElement('subscription-action-sheet')).toBeTruthy()
    expect(bodyElement('subscription-action-error').textContent).toContain('结果无法确认')
    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toBe('有效')
  })

  it('rejects a reset response whose selected usage was not reset to zero', async () => {
    mocks.reset.mockResolvedValueOnce(subscription({ daily_usage_usd: 4, weekly_usage_usd: 12, monthly_usage_usd: 0 }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    bodyElement<HTMLInputElement>('subscription-reset-weekly').click()
    await clickBody('confirm-subscription-action')

    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(bodyElement('subscription-action-error').textContent).toContain('结果无法确认')
  })

  it('refreshes only reset target progress and exposes a fixed retry on progress failure', async () => {
    const other = subscription({ id: 4, user_id: 8, user: { id: 8, email: 'other@example.com', username: 'Other' } })
    mocks.list.mockResolvedValueOnce(response([subscription(), other])).mockRejectedValueOnce(new Error('offline'))
    mocks.progress.mockImplementation((id: number) => Promise.resolve(progress({ id })))
    mocks.reset.mockResolvedValueOnce(subscription({ daily_usage_usd: 0, monthly_usage_usd: 0 }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    mocks.progress.mockClear()
    mocks.progress.mockRejectedValueOnce(new Error('credential=reset-progress-secret'))

    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    bodyElement<HTMLInputElement>('subscription-reset-weekly').click()
    await clickBody('confirm-subscription-action')

    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([3])
    expect(wrapper.get('[data-testid="subscription-progress-error-3"]').text()).toContain('额度暂时无法加载')
    expect(wrapper.text()).not.toContain('reset-progress-secret')
    mocks.progress.mockResolvedValueOnce(progress({ id: 3 }))
    await wrapper.get('[data-testid="retry-subscription-progress-3"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$32.05')
  })

  it('does not let an older initial progress response overwrite a newer reset response for the same id', async () => {
    const oldProgress = deferred<AdminSubscriptionProgress>()
    const resetProgress = deferred<AdminSubscriptionProgress>()
    const renewedProgress = progress({
      daily: { ...progress().daily!, used_usd: 0, remaining_usd: 400, percentage: 0 },
    })
    mocks.progress.mockReturnValueOnce(oldProgress.promise).mockReturnValueOnce(resetProgress.promise)
    mocks.reset.mockResolvedValueOnce(subscription({ daily_usage_usd: 0, monthly_usage_usd: 0 }))
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    bodyElement<HTMLInputElement>('subscription-reset-weekly').click()
    await clickBody('confirm-subscription-action')
    expect(mocks.progress).toHaveBeenCalledTimes(2)

    resetProgress.resolve(renewedProgress)
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$0.00 / $400.00')
    oldProgress.resolve(progress())
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).toContain('$0.00 / $400.00')
    expect(wrapper.get('[data-testid="subscription-quota-daily-3"]').text()).not.toContain('$32.05')
  })

  it('removes a revoked card from the active filter and decrements the trusted total', async () => {
    mocks.list
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([subscription()], { total: 21 }))
      .mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="subscription-filter-trigger"]').trigger('click')
    await setBodyValue('subscription-status-filter', 'active')
    await clickBody('subscription-filter-apply')
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="revoke-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(wrapper.find('[data-testid="subscription-status-3"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('已撤销')
  })

  it.each(['active', 'expired'] as const)('removes a restored %s card from the revoked filter and decrements total', async (restoredStatus) => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked', user: { id: 8, email: 'revoked@example.com', username: 'Revoked' } })
    mocks.list
      .mockResolvedValueOnce(response([revoked]))
      .mockResolvedValueOnce(response([revoked], { total: 21 }))
      .mockRejectedValueOnce(new Error('offline'))
    mocks.restore.mockResolvedValueOnce(subscription({ ...revoked, status: restoredStatus }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await wrapper.get('[data-testid="subscription-filter-trigger"]').trigger('click')
    await setBodyValue('subscription-status-filter', 'revoked')
    await clickBody('subscription-filter-apply')
    await openMenu(wrapper, 4)
    await wrapper.get('[data-testid="restore-subscription-4"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(wrapper.find('[data-testid="subscription-status-4"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('已恢复')
  })

  it.each([
    ['void', undefined],
    ['wrong id', subscription({ id: 99, status: 'active' })],
    ['wrong user', subscription({ id: 4, user_id: 99, status: 'active', user: { id: 99, email: 'foreign@example.com', username: 'Foreign' } })],
    ['wrong group', subscription({ id: 4, user_id: 8, group_id: 5, status: 'active', user: { id: 8, email: 'revoked@example.com', username: 'Revoked' }, group: { id: 5, name: 'Codex Pro' } })],
    ['wrong status', subscription({ id: 4, user_id: 8, status: 'suspended', user: { id: 8, email: 'revoked@example.com', username: 'Revoked' } })],
  ])('never guesses active for a %s restore response', async (_caseName, restoreResponse) => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked', user: { id: 8, email: 'revoked@example.com', username: 'Revoked' } })
    mocks.list.mockResolvedValueOnce(response([revoked]))
    mocks.restore.mockResolvedValueOnce(restoreResponse)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 4)
    await wrapper.get('[data-testid="restore-subscription-4"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="subscription-status-4"]').text()).toBe('已撤销')
    expect(wrapper.find('[data-testid="subscription-action-message"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('结果无法确认')
  })

  it('validates the revoke message contract before reducing from the known target', async () => {
    mocks.revoke.mockResolvedValueOnce({})
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="revoke-subscription-3"]').trigger('click')
    await clickBody('confirm-subscription-action')

    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="subscription-status-3"]').text()).toBe('有效')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('结果无法确认')
  })

  it('ignores stale searches and stale progress when a newer result owns the page', async () => {
    const oldList = deferred<ReturnType<typeof response>>()
    const newList = deferred<ReturnType<typeof response>>()
    mocks.list.mockResolvedValueOnce(response()).mockReturnValueOnce(oldList.promise).mockReturnValueOnce(newList.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="subscription-search"]').setValue('old')
    await wrapper.get('[data-testid="subscription-search-form"]').trigger('submit')
    await wrapper.get('[data-testid="subscription-search"]').setValue('new')
    await wrapper.get('[data-testid="subscription-search-form"]').trigger('submit')
    newList.resolve(response([subscription({ id: 9, user_id: 9, user: { id: 9, email: 'new@example.com', username: 'New' } })]))
    await flushPromises()
    oldList.resolve(response([subscription({ id: 8, user_id: 8, user: { id: 8, email: 'old@example.com', username: 'Old' } })]))
    await flushPromises()

    expect(wrapper.text()).toContain('new@example.com')
    expect(wrapper.text()).not.toContain('old@example.com')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('bounds progress fan-out and marks only the failed card', async () => {
    const items = Array.from({ length: 6 }, (_, index) => subscription({
      id: index + 1,
      user_id: index + 11,
      user: { id: index + 11, email: `user-${index + 11}@example.com`, username: `User ${index + 11}` },
    }))
    const requests = items.map(() => deferred<AdminSubscriptionProgress>())
    mocks.list.mockResolvedValueOnce(response(items))
    mocks.progress.mockImplementation((id: number) => requests[id - 1]!.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    expect(mocks.progress).toHaveBeenCalledTimes(4)

    requests[0]!.resolve(progress({ id: 1 }))
    requests[1]!.reject(new Error('credential=one-card-secret'))
    await flushPromises()
    expect(mocks.progress).toHaveBeenCalledTimes(6)
    for (let index = 2; index < requests.length; index += 1) requests[index]!.resolve(progress({ id: index + 1 }))
    await flushPromises()
    expect(wrapper.get('[data-testid="subscription-progress-error-2"]').text()).toContain('额度暂时无法加载')
    expect(wrapper.find('[data-testid="subscription-progress-error-1"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('one-card-secret')
  })

  it('does not let stale progress workers claim queued items after a newer list owns the page', async () => {
    const oldItems = Array.from({ length: 6 }, (_, index) => subscription({
      id: index + 1,
      user_id: index + 11,
      user: { id: index + 11, email: `old-${index + 1}@example.com`, username: `Old ${index + 1}` },
    }))
    const oldRequests = oldItems.map(() => deferred<AdminSubscriptionProgress>())
    mocks.list
      .mockResolvedValueOnce(response(oldItems))
      .mockResolvedValueOnce(response([subscription({ id: 9, user_id: 19, user: { id: 19, email: 'new@example.com', username: 'New' } })]))
    mocks.progress.mockImplementation((id: number) => id === 9
      ? Promise.resolve(progress({ id }))
      : oldRequests[id - 1]!.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4])

    await wrapper.get('[data-testid="subscription-search"]').setValue('new')
    await wrapper.get('[data-testid="subscription-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4, 9])
    oldRequests[0]!.resolve(progress({ id: 1 }))
    await flushPromises()

    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4, 9])
  })

  it('does not let progress workers claim queued items after unmount', async () => {
    const items = Array.from({ length: 6 }, (_, index) => subscription({
      id: index + 1,
      user_id: index + 11,
      user: { id: index + 11, email: `user-${index + 1}@example.com`, username: `User ${index + 1}` },
    }))
    const requests = items.map(() => deferred<AdminSubscriptionProgress>())
    mocks.list.mockResolvedValueOnce(response(items))
    mocks.progress.mockImplementation((id: number) => requests[id - 1]!.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    expect(mocks.progress).toHaveBeenCalledTimes(4)

    wrapper.unmount()
    requests[0]!.resolve(progress({ id: 1 }))
    await flushPromises()

    expect(mocks.progress.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4])
  })

  it('loads exact previous and next pages and recovers when the current page shrinks', async () => {
    mocks.list
      .mockResolvedValueOnce(response([subscription()], { total: 41 }))
      .mockResolvedValueOnce(response([subscription({ id: 21 })], { total: 41, page: 2 }))
      .mockResolvedValueOnce(response([subscription()], { total: 41, page: 1 }))
      .mockResolvedValueOnce(response([], { total: 20, page: 2 }))
      .mockResolvedValueOnce(response([subscription()], { total: 20, page: 1 }))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })

    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list.mock.calls.slice(-2)).toEqual([
      [{ page: 2, page_size: 20 }],
      [{ page: 1, page_size: 20 }],
    ])
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
  })

  it('restores keyboard focus after sheets and closes the overflow menu with Escape', async () => {
    const wrapper = mount(MobileAdminSubscriptionsView, { attachTo: document.body })
    await flushPromises()
    const assign = wrapper.get('[data-testid="assign-subscription"]')
    ;(assign.element as HTMLElement).focus()
    await assign.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(bodyElement('mobile-bottom-sheet-close'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(assign.element)

    const trigger = wrapper.get('[data-testid="subscription-menu-trigger-3"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    expect(wrapper.find('[data-testid="subscription-menu-3"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="subscription-menu-3"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('does not refresh or publish mutation feedback after unmount', async () => {
    const pending = deferred<AdminSubscription>()
    mocks.extend.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()
    await openMenu(wrapper, 3)
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    bodyElement<HTMLButtonElement>('confirm-subscription-action').click()
    const callsBeforeUnmount = mocks.list.mock.calls.length
    wrapper.unmount()
    pending.resolve(subscription())
    await flushPromises()

    expect(mocks.list).toHaveBeenCalledTimes(callsBeforeUnmount)
  })
})
