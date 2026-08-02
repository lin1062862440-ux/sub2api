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
      resets_in_seconds: 21_600,
    },
    weekly: {
      used_usd: 500,
      limit_usd: 500,
      remaining_usd: 0,
      percentage: 100,
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
  return { items, total: items.length, page: 1, page_size: 20, ...overrides }
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
      { id: 2, name: 'Claude Code', platform: 'anthropic', is_exclusive: true },
      { id: 5, name: 'Codex Pro', platform: 'openai', is_exclusive: true },
    ])
    mocks.assign.mockResolvedValue(subscription())
    mocks.bulkAssign.mockResolvedValue({
      success_count: 3,
      created_count: 2,
      reused_count: 1,
      failed_count: 0,
      subscriptions: [subscription()],
      errors: [],
    })
    mocks.extend.mockResolvedValue(subscription())
    mocks.reset.mockResolvedValue(subscription())
    mocks.revoke.mockResolvedValue({ message: 'ok' })
    mocks.restore.mockResolvedValue(subscription({ id: 4, status: 'active' }))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads the fixed list contract and renders safe cards with per-window progress', async () => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked', user: { id: 8, email: '', username: '' }, expires_at: '999999999999999999999' })
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
      { id: 2, name: 'Claude Code', platform: 'anthropic', is_exclusive: true },
      { id: 2, name: 'Duplicate', platform: 'anthropic', is_exclusive: true },
      { id: Number.NaN, name: 'Bad', platform: 'openai', is_exclusive: true },
    ])
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="subscription-search"]').setValue('  lin@example.com  ')
    await wrapper.get('[data-testid="subscription-filter-trigger"]').trigger('click')
    expect(document.body.querySelectorAll('[data-testid="subscription-group-filter"] option[value="2"]')).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Duplicate')
    expect(document.body.textContent).not.toContain('Bad')
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

  it('submits exact single and deduplicated bulk assignment payloads', async () => {
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
    await setBodyValue('subscription-user-ids', '7, 8\n7; 9')
    await setBodyValue('subscription-assignment-group-id', '5')
    await clickBody('confirm-subscription-assignment')
    expect(mocks.bulkAssign).toHaveBeenCalledWith({ user_ids: [7, 8, 9], group_id: 5, validity_days: 30 })
    expect(wrapper.get('[data-testid="subscription-action-message"]').text()).toContain('成功 3 个')
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

  it('supports assignment cancellation and keeps the returned subscription when refresh fails', async () => {
    const assigned = subscription({
      id: 10,
      user_id: 10,
      user: { id: 10, email: 'assigned@example.com', username: 'Assigned' },
    })
    mocks.assign.mockResolvedValueOnce(assigned)
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('token=assignment-refresh-secret'))
    const wrapper = mount(MobileAdminSubscriptionsView)
    await flushPromises()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await clickBody('mobile-bottom-sheet-close')
    expect(document.body.querySelector('[data-testid="subscription-assignment-sheet"]')).toBeNull()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await setBodyValue('subscription-user-id', '10')
    await setBodyValue('subscription-assignment-group-id', '2')
    await clickBody('confirm-subscription-assignment')

    expect(wrapper.text()).toContain('assigned@example.com')
    expect(wrapper.get('[data-testid="subscription-sync-warning"]').text()).toContain('同步失败')
    expect(wrapper.text()).not.toContain('assignment-refresh-secret')
  })

  it('uses exact ids and payloads for extend, quota reset, revoke, and restore', async () => {
    const revoked = subscription({ id: 4, user_id: 8, status: 'revoked' })
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
    const items = Array.from({ length: 6 }, (_, index) => subscription({ id: index + 1, user_id: index + 11 }))
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
