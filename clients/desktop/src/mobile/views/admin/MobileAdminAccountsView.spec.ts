import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminAccount, AdminAccountListResponse } from '@/api/admin/types'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getModels: vi.fn(),
  test: vi.fn(),
  recover: vi.fn(),
  clearError: vi.fn(),
  refreshCredentials: vi.fn(),
  setSchedulable: vi.fn(),
}))

vi.mock('@/api/admin/accounts', () => ({
  listAdminAccounts: mocks.list,
  createAdminAccount: mocks.create,
  updateAdminAccount: mocks.update,
  getAdminAccountModels: mocks.getModels,
  testAdminAccount: mocks.test,
  recoverAdminAccount: mocks.recover,
  clearAdminAccountError: mocks.clearError,
  refreshAdminAccountCredentials: mocks.refreshCredentials,
  setAdminAccountSchedulable: mocks.setSchedulable,
}))

import MobileAdminAccountsView from './MobileAdminAccountsView.vue'

function account(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 17,
    name: 'Claude Primary With A Deliberately Long Account Name',
    notes: 'production pool',
    platform: 'anthropic',
    type: 'apikey',
    proxy_id: null,
    concurrency: 10,
    current_concurrency: 3,
    priority: 10,
    rate_multiplier: 1.2,
    status: 'active',
    error_message: null,
    schedulable: true,
    last_used_at: '2026-08-02T07:50:00Z',
    expires_at: null,
    rate_limited_at: null,
    rate_limit_reset_at: null,
    overload_until: null,
    temp_unschedulable_until: null,
    temp_unschedulable_reason: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-02T07:50:00Z',
    groups: [{ id: 4, name: 'Claude Code' }],
    ...overrides,
  }
}

const healthy = account()
const unhealthy = account({
  id: 29,
  name: 'Codex Backup',
  platform: 'openai',
  status: 'error',
  schedulable: false,
  current_concurrency: Number.NaN,
  concurrency: Number.POSITIVE_INFINITY,
  rate_multiplier: Number.NaN,
  expires_at: Number.POSITIVE_INFINITY,
  error_message: 'refresh token expired with credential=must-not-render',
  groups: [],
})

function response(items = [healthy, unhealthy], overrides: Partial<AdminAccountListResponse> = {}): AdminAccountListResponse {
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

async function openMenu(wrapper: ReturnType<typeof mount>, id: number) {
  await wrapper.get(`[data-testid="account-menu-trigger-${id}"]`).trigger('click')
}

describe('MobileAdminAccountsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockResolvedValue(response())
    mocks.create.mockResolvedValue(healthy)
    mocks.update.mockResolvedValue(healthy)
    mocks.getModels.mockResolvedValue([{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }])
    mocks.test.mockResolvedValue({ success: true, message: '连接正常', latency_ms: 320 })
    mocks.recover.mockResolvedValue({ ...unhealthy, status: 'active', schedulable: true, error_message: null })
    mocks.clearError.mockResolvedValue({ ...unhealthy, error_message: null })
    mocks.refreshCredentials.mockResolvedValue(unhealthy)
    mocks.setSchedulable.mockImplementation((id: number, schedulable: boolean) =>
      Promise.resolve({ ...(id === healthy.id ? healthy : unhealthy), schedulable }),
    )
  })

  it('renders safe account cards and submits search plus bottom-sheet filters', async () => {
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('账号管理')
    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain(healthy.name)
    expect(wrapper.text()).toContain('Claude Code')
    expect(wrapper.text()).toContain('3 / 10')
    expect(wrapper.text()).not.toContain('must-not-render')
    expect(wrapper.get('[data-testid="mobile-account-card"]').text()).toContain('1.2x')
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })

    await wrapper.get('[data-testid="account-search"]').setValue(' Claude ')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, search: 'Claude' })

    await wrapper.get('[data-testid="account-filter-trigger"]').trigger('click')
    const platformFilter = document.querySelector<HTMLSelectElement>('[data-testid="account-platform-filter"]')
    const statusFilter = document.querySelector<HTMLSelectElement>('[data-testid="account-status-filter"]')
    const applyButton = document.querySelector<HTMLButtonElement>('[data-testid="account-filter-apply"]')
    expect(platformFilter).not.toBeNull()
    expect(statusFilter).not.toBeNull()
    expect(applyButton).not.toBeNull()
    platformFilter!.value = 'openai'
    platformFilter!.dispatchEvent(new Event('change', { bubbles: true }))
    statusFilter!.value = 'error'
    statusFilter!.dispatchEvent(new Event('change', { bubbles: true }))
    applyButton!.click()
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'Claude',
      platform: 'openai',
      status: 'error',
    })
    wrapper.unmount()
  })

  it('confirms a schedulable change, supports cancellation, and calls the exact account id once', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    expect(wrapper.get('[data-testid="account-schedulable-dialog"]').text()).toContain('暂停调度')
    await wrapper.get('[data-testid="cancel-account-schedulable"]').trigger('click')
    expect(mocks.setSchedulable).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    await wrapper.get('[data-testid="confirm-account-schedulable"]').trigger('click')
    await flushPromises()
    expect(mocks.setSchedulable).toHaveBeenCalledTimes(1)
    expect(mocks.setSchedulable).toHaveBeenCalledWith(17, false)
  })

  it('tests, recovers, clears errors and refreshes credentials with each exact account id', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="test-account-17"]').trigger('click')
    await flushPromises()
    expect(mocks.getModels).toHaveBeenCalledWith(17)
    await wrapper.get('[data-testid="account-test-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.test).toHaveBeenCalledWith(17, { model_id: 'claude-sonnet-4-5', prompt: '' })

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="recover-account-29"]').trigger('click')
    await flushPromises()
    expect(mocks.recover).toHaveBeenCalledWith(29)

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="clear-account-error-29"]').trigger('click')
    await flushPromises()
    expect(mocks.clearError).toHaveBeenCalledWith(29)

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="refresh-account-credentials-29"]').trigger('click')
    await flushPromises()
    expect(mocks.refreshCredentials).toHaveBeenCalledWith(29)
  })

  it('opens the existing mobile detail and editor surfaces from real card controls', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-detail-trigger-17"]').trigger('click')
    expect(wrapper.get('[data-testid="account-detail"]').classes()).toContain('mobile')
    expect(wrapper.get('[data-testid="account-detail"]').text()).toContain(healthy.name)
    await wrapper.get('[data-testid="account-detail"]').get('[aria-label="关闭"]').trigger('click')

    await wrapper.get('[data-testid="account-detail-trigger-29"]').trigger('click')
    expect(wrapper.get('[data-testid="account-detail"]').text()).toContain('账号存在错误')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('must-not-render')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('NaN')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('Infinity')
    await wrapper.get('[data-testid="account-detail"]').get('[aria-label="关闭"]').trigger('click')

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    expect(wrapper.get('[data-testid="account-editor-name"]').element).toHaveProperty('value', healthy.name)
  })

  it('closes the per-card menu with Escape and an outside click', async () => {
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    await openMenu(wrapper, 17)
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(false)

    await openMenu(wrapper, 17)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps cards on mutation failure, redacts the raw error and releases the action busy state', async () => {
    mocks.setSchedulable.mockRejectedValueOnce(new Error('api_key=super-secret token=also-secret'))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    await wrapper.get('[data-testid="confirm-account-schedulable"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="account-action-error"]').text()).toContain('操作失败')
    expect(wrapper.text()).not.toContain('super-secret')
    expect(wrapper.get('[data-testid="account-schedulable-17"]').attributes('disabled')).toBeUndefined()
  })

  it('shows loading, retryable private errors and empty results', async () => {
    const pending = deferred<AdminAccountListResponse>()
    mocks.list.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminAccountsView)
    expect(wrapper.get('[data-testid="mobile-page-loading"]').attributes('aria-label')).toContain('正在加载账号')
    pending.reject(new Error('credential=private-value offline'))
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('账号列表加载失败')
    expect(wrapper.text()).not.toContain('private-value')
    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-empty"]').text()).toContain('暂无账号')
  })

  it('ignores stale filter responses and does not leave the page busy', async () => {
    const older = deferred<AdminAccountListResponse>()
    const newer = deferred<AdminAccountListResponse>()
    mocks.list.mockResolvedValueOnce(response()).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-search"]').setValue('older')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    await wrapper.get('[data-testid="account-search"]').setValue('newer')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    newer.resolve(response([account({ id: 42, name: 'Newest Account' })]))
    await flushPromises()
    older.resolve(response([account({ id: 41, name: 'Stale Account' })]))
    await flushPromises()

    expect(wrapper.text()).toContain('Newest Account')
    expect(wrapper.text()).not.toContain('Stale Account')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('loads exact previous and next pages while enforcing pagination boundaries', async () => {
    mocks.list
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 1 }))
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 2 }))
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 1 }))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-pagination-previous"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
  })
})
