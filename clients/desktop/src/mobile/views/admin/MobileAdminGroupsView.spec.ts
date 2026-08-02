import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminGroup, AdminGroupListResponse } from '@/api/admin/types'
import GroupEditorDialog from '@/components/admin/GroupEditorDialog.vue'
import groupEditorSource from '@/components/admin/GroupEditorDialog.vue?raw'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  status: vi.fn(),
}))

vi.mock('@/api/admin/groups', () => ({
  listAdminGroups: mocks.list,
  createAdminGroup: mocks.create,
  updateAdminGroup: mocks.update,
  updateAdminGroupStatus: mocks.status,
}))

import MobileAdminGroupsView from './MobileAdminGroupsView.vue'

function group(overrides: Partial<AdminGroup> = {}): AdminGroup {
  return {
    id: 8,
    name: 'Codex Team With A Deliberately Long Group Name',
    description: 'OpenAI team subscription',
    platform: 'openai',
    rate_multiplier: 1.2,
    rpm_limit: 120,
    is_exclusive: true,
    status: 'active',
    subscription_type: 'subscription',
    daily_limit_usd: 10,
    weekly_limit_usd: 50,
    monthly_limit_usd: 200,
    account_count: 4,
    active_account_count: 3,
    rate_limited_account_count: 1,
    sort_order: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
    ...overrides,
  }
}

const activeGroup = group()
const inactiveGroup = group({
  id: 14,
  name: 'Fallback Pool',
  platform: 'anthropic',
  status: 'inactive',
  rate_multiplier: Number.NaN,
  rpm_limit: Number.POSITIVE_INFINITY,
  daily_limit_usd: null,
  weekly_limit_usd: Number.NaN,
  monthly_limit_usd: Number.POSITIVE_INFINITY,
  account_count: 0,
  active_account_count: 0,
  rate_limited_account_count: 0,
})

function response(items = [activeGroup, inactiveGroup], overrides: Partial<AdminGroupListResponse> = {}): AdminGroupListResponse {
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

describe('MobileAdminGroupsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockResolvedValue(response())
    mocks.create.mockResolvedValue(activeGroup)
    mocks.update.mockResolvedValue(activeGroup)
    mocks.status.mockResolvedValue({ ...activeGroup, status: 'inactive' })
  })

  it('renders safe group cards with billing, quota and account-health summaries', async () => {
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('分组管理')
    expect(wrapper.findAll('[data-testid="mobile-group-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain(activeGroup.name)
    expect(wrapper.text()).toContain('OpenAI')
    expect(wrapper.text()).toContain('运行中')
    expect(wrapper.get('[data-testid="mobile-group-card"]').text()).toContain('1.2x')
    expect(wrapper.get('[data-testid="mobile-group-card"]').text()).toContain('120')
    expect(wrapper.get('[data-testid="group-quota-8"]').text()).toContain('$10.00 / $50.00 / $200.00')
    expect(wrapper.get('[data-testid="group-health-8"]').text()).toContain('3 / 4')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('Infinity')
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })
  })

  it('submits search and bottom-sheet status/platform filters', async () => {
    const wrapper = mount(MobileAdminGroupsView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-testid="group-search"]').setValue(' codex ')
    await wrapper.get('[data-testid="group-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, search: 'codex' })

    await wrapper.get('[data-testid="group-filter-trigger"]').trigger('click')
    const platform = document.querySelector<HTMLSelectElement>('[data-testid="group-platform-filter"]')
    const status = document.querySelector<HTMLSelectElement>('[data-testid="group-status-filter"]')
    const apply = document.querySelector<HTMLButtonElement>('[data-testid="group-filter-apply"]')
    expect(platform).not.toBeNull()
    expect(status).not.toBeNull()
    expect(apply).not.toBeNull()
    platform!.value = 'openai'
    platform!.dispatchEvent(new Event('change', { bubbles: true }))
    status!.value = 'active'
    status!.dispatchEvent(new Event('change', { bubbles: true }))
    apply!.click()
    await flushPromises()

    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'codex',
      platform: 'openai',
      status: 'active',
    })
    wrapper.unmount()
  })

  it('creates a group through the existing editor and refreshes once', async () => {
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="create-group"]').trigger('click')
    expect(wrapper.get('.dialog-backdrop').classes()).toContain('mobile')
    expect(wrapper.get('.group-editor').classes()).toContain('mobile')
    expect(wrapper.get('[data-testid="group-editor-close"]').attributes('data-testid')).toBe('group-editor-close')
    await wrapper.get('[data-testid="group-name"]').setValue('Gemini Monthly')
    await wrapper.get('[data-testid="group-description"]').setValue('Gemini subscription')
    await wrapper.get('[data-testid="group-platform"]').setValue('gemini')
    await wrapper.get('[data-testid="group-rate-multiplier"]').setValue('1.5')
    await wrapper.get('[data-testid="group-rpm-limit"]').setValue('90')
    await wrapper.get('[data-testid="group-subscription-type"]').setValue('subscription')
    await wrapper.get('[data-testid="group-exclusive"]').setValue(true)
    await wrapper.get('[data-testid="group-daily-limit"]').setValue('12')
    await wrapper.get('[data-testid="group-weekly-limit"]').setValue('60')
    await wrapper.get('[data-testid="group-monthly-limit"]').setValue('240')
    await wrapper.get('[data-testid="group-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Gemini Monthly',
      description: 'Gemini subscription',
      platform: 'gemini',
      rate_multiplier: 1.5,
      rpm_limit: 90,
      is_exclusive: true,
      subscription_type: 'subscription',
      daily_limit_usd: 12,
      weekly_limit_usd: 60,
      monthly_limit_usd: 240,
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the mobile editor open and redacts a group create rejection', async () => {
    mocks.create.mockRejectedValueOnce(new Error('token=group-editor-secret raw upstream failure'))
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="create-group"]').trigger('click')
    await wrapper.get('[data-testid="group-name"]').setValue('Rejected Group')
    await wrapper.get('[data-testid="group-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.group-editor').exists()).toBe(true)
    expect(wrapper.get('.group-editor [role="alert"]').text()).toBe('分组保存失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('group-editor-secret')
    expect(wrapper.findAll('[data-testid="mobile-group-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="group-editor-save"]').attributes('disabled')).toBeUndefined()
  })

  it('scopes 44px group editor controls to explicit mobile mode', () => {
    const desktop = mount(GroupEditorDialog, { props: { modelValue: true, group: activeGroup } })
    expect(desktop.get('.dialog-backdrop').classes()).not.toContain('mobile')
    expect(desktop.get('.group-editor').classes()).not.toContain('mobile')

    expect(groupEditorSource).toMatch(/\.group-editor\.mobile header button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/)
    expect(groupEditorSource).toMatch(/\.group-editor\.mobile \.form-grid (?:input|input,select,textarea)[^{]*\{[^}]*min-height:\s*44px/)
    expect(groupEditorSource).toMatch(/\.group-editor\.mobile footer button\s*\{[^}]*min-height:\s*44px/)
  })

  it('edits the exact group through its primary card action', async () => {
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="edit-group-8"]').trigger('click')
    expect(wrapper.get('[data-testid="group-name"]').element).toHaveProperty('value', activeGroup.name)
    await wrapper.get('[data-testid="group-name"]').setValue('Codex Pro')
    await wrapper.get('[data-testid="group-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(8, expect.objectContaining({
      name: 'Codex Pro',
      platform: 'openai',
      rate_multiplier: 1.2,
      monthly_limit_usd: 200,
    }))
  })

  it('cancels then confirms enable-disable with the exact id and next status', async () => {
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="toggle-group-8"]').trigger('click')
    expect(wrapper.get('[data-testid="group-status-dialog"]').text()).toContain('停用分组')
    await wrapper.get('[data-testid="cancel-group-status"]').trigger('click')
    expect(mocks.status).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="toggle-group-8"]').trigger('click')
    await wrapper.get('[data-testid="confirm-group-status"]').trigger('click')
    await flushPromises()
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(mocks.status).toHaveBeenCalledWith(8, 'inactive')
  })

  it('keeps the list, redacts mutation failures and releases only the failed group', async () => {
    mocks.status.mockRejectedValueOnce(new Error('token=private api_key=hidden'))
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="toggle-group-8"]').trigger('click')
    await wrapper.get('[data-testid="confirm-group-status"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-group-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="group-action-error"]').text()).toContain('操作失败')
    expect(wrapper.text()).not.toContain('private')
    expect(wrapper.get('[data-testid="toggle-group-8"]').attributes('disabled')).toBeUndefined()
  })

  it('shows loading, retryable private errors and empty results', async () => {
    const pending = deferred<AdminGroupListResponse>()
    mocks.list.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminGroupsView)
    expect(wrapper.get('[data-testid="mobile-page-loading"]').attributes('aria-label')).toContain('正在加载分组')
    pending.reject(new Error('credential=private-value offline'))
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('分组列表加载失败')
    expect(wrapper.text()).not.toContain('private-value')
    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-empty"]').text()).toContain('暂无分组')
  })

  it('ignores stale search responses and always releases the busy state', async () => {
    const older = deferred<AdminGroupListResponse>()
    const newer = deferred<AdminGroupListResponse>()
    mocks.list.mockResolvedValueOnce(response()).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    await wrapper.get('[data-testid="group-search"]').setValue('older')
    await wrapper.get('[data-testid="group-search-form"]').trigger('submit')
    await wrapper.get('[data-testid="group-search"]').setValue('newer')
    await wrapper.get('[data-testid="group-search-form"]').trigger('submit')
    newer.resolve(response([group({ id: 42, name: 'Newest Group' })]))
    await flushPromises()
    older.resolve(response([group({ id: 41, name: 'Stale Group' })]))
    await flushPromises()

    expect(wrapper.text()).toContain('Newest Group')
    expect(wrapper.text()).not.toContain('Stale Group')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('loads exact previous and next pages and enforces boundary disabled states', async () => {
    mocks.list
      .mockResolvedValueOnce(response([activeGroup], { total: 41, page: 1 }))
      .mockResolvedValueOnce(response([activeGroup], { total: 41, page: 2 }))
      .mockResolvedValueOnce(response([activeGroup], { total: 41, page: 3 }))
    const wrapper = mount(MobileAdminGroupsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-pagination-previous"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 3, page_size: 20 })
    expect(wrapper.get('[data-testid="mobile-pagination-next"]').attributes('disabled')).toBeDefined()
  })
})
