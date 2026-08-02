import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminGroupOption, AdminUser, AdminUserListResponse } from '@/api/admin/types'
import UserBalanceDialog from '@/components/admin/UserBalanceDialog.vue'
import UserDeleteDialog from '@/components/admin/UserDeleteDialog.vue'
import UserDetailDrawer from '@/components/admin/UserDetailDrawer.vue'
import UserEditorDialog from '@/components/admin/UserEditorDialog.vue'
import UserGroupsDialog from '@/components/admin/UserGroupsDialog.vue'
import userBalanceSource from '@/components/admin/UserBalanceDialog.vue?raw'
import userDeleteSource from '@/components/admin/UserDeleteDialog.vue?raw'
import userDetailSource from '@/components/admin/UserDetailDrawer.vue?raw'
import userEditorSource from '@/components/admin/UserEditorDialog.vue?raw'
import userGroupsSource from '@/components/admin/UserGroupsDialog.vue?raw'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  groups: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  balance: vi.fn(),
  bindIdentity: vi.fn(),
  keys: vi.fn(),
  usage: vi.fn(),
  history: vi.fn(),
  quotas: vi.fn(),
  updateQuotas: vi.fn(),
  resetQuota: vi.fn(),
}))

vi.mock('@/api/admin/users', () => ({
  listAdminUsers: mocks.list,
  getAdminUser: mocks.get,
  getAdminGroups: mocks.groups,
  createAdminUser: mocks.create,
  updateAdminUser: mocks.update,
  deleteAdminUser: mocks.remove,
  updateAdminUserBalance: mocks.balance,
  bindAdminUserIdentity: mocks.bindIdentity,
  getAdminUserApiKeys: mocks.keys,
  getAdminUserUsage: mocks.usage,
  getAdminUserBalanceHistory: mocks.history,
  getAdminUserPlatformQuotas: mocks.quotas,
  updateAdminUserPlatformQuotas: mocks.updateQuotas,
  resetAdminUserPlatformQuota: mocks.resetQuota,
}))

import MobileAdminUsersView from './MobileAdminUsersView.vue'

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 7,
    username: 'Lin',
    email: 'lin@example.com',
    avatar_url: null,
    role: 'user',
    balance: 32.5,
    frozen_balance: 2,
    concurrency: 8,
    current_concurrency: 2,
    rpm_limit: 60,
    status: 'active',
    allowed_groups: [1],
    group_rates: {},
    notes: 'primary user',
    last_active_at: '2026-08-02T08:00:00Z',
    last_used_at: '2026-08-02T08:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-02T08:00:00Z',
    subscriptions: [{ id: 3, status: 'active', group_id: 1, expires_at: null }],
    ...overrides,
  }
}

const activeUser = adminUser()
const disabledUser = adminUser({
  id: 8,
  username: 'Disabled User With A Deliberately Long Name',
  email: 'disabled-user-with-a-deliberately-long-address@example.com',
  role: 'admin',
  status: 'disabled',
  balance: 0,
  frozen_balance: 0,
  current_concurrency: 0,
  allowed_groups: [1, 2],
  subscriptions: [],
})

function response(
  items: AdminUser[] = [activeUser, disabledUser],
  overrides: Partial<AdminUserListResponse> = {},
): AdminUserListResponse {
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
  await wrapper.get(`[data-testid="user-menu-trigger-${id}"]`).trigger('click')
}

describe('MobileAdminUsersView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockResolvedValue(response())
    mocks.get.mockResolvedValue(activeUser)
    mocks.groups.mockResolvedValue([
      { id: 1, name: 'Claude Code', platform: 'anthropic', is_exclusive: true },
      { id: 2, name: 'Codex Pro', platform: 'openai', is_exclusive: true },
    ])
    mocks.create.mockResolvedValue(adminUser({ id: 9, email: 'new@example.com' }))
    mocks.update.mockImplementation((id: number, payload: Partial<AdminUser>) => {
      const source = id === activeUser.id ? activeUser : disabledUser
      return Promise.resolve({ ...source, ...payload })
    })
    mocks.remove.mockResolvedValue({ message: 'deleted' })
    mocks.balance.mockResolvedValue({ ...activeUser, balance: 52.5 })
    mocks.bindIdentity.mockResolvedValue({ provider_type: 'oidc', provider_subject: 'subject-1' })
    mocks.keys.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    mocks.usage.mockResolvedValue({ total_requests: 0, total_tokens: 0, total_cost: 0 })
    mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    mocks.quotas.mockResolvedValue({ platform_quotas: [] })
    mocks.updateQuotas.mockResolvedValue({ platform_quotas: [] })
    mocks.resetQuota.mockResolvedValue({ platform_quotas: [] })
  })

  it('renders safe mobile user cards and requests the exact fixed page contract', async () => {
    const unsafe = adminUser({
      id: 10,
      username: '',
      email: '',
      balance: Number.POSITIVE_INFINITY,
      frozen_balance: Number.NaN,
      concurrency: -1,
      current_concurrency: 1.5,
      allowed_groups: [Number.NaN, 2],
      last_active_at: '999999999999999999999999',
    })
    const nullNumeric = adminUser({
      id: 11,
      username: 'Null Numeric',
      email: 'null@example.com',
      balance: null as unknown as number,
      concurrency: null as unknown as number,
      current_concurrency: null as unknown as number,
    })
    mocks.list.mockResolvedValueOnce(response([activeUser, disabledUser, unsafe, nullNumeric]))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('用户管理')
    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(4)
    expect(wrapper.get('[data-testid="mobile-user-card"]').text()).toContain('Lin')
    expect(wrapper.get('[data-testid="mobile-user-card"]').text()).toContain('lin@example.com')
    expect(wrapper.get('[data-testid="user-balance-7"]').text()).toContain('$32.50')
    expect(wrapper.get('[data-testid="user-concurrency-7"]').text()).toContain('2 / 8')
    expect(wrapper.get('[data-testid="user-group-count-8"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="user-balance-11"]').text()).toBe('—')
    expect(wrapper.get('[data-testid="user-concurrency-11"]').text()).toBe('—')
    expect(wrapper.text()).toContain('管理员')
    expect(wrapper.text()).toContain('已停用')
    expect(wrapper.text()).not.toContain('Infinity')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('Invalid Date')
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })
    expect(mocks.groups).toHaveBeenCalledTimes(1)
  })

  it('keeps only unique positive safe numeric user ids and preserves mutation ownership', async () => {
    const stringId = { ...adminUser({ email: 'string-id@example.com' }), id: '7' } as unknown as AdminUser
    const duplicate = adminUser({ email: 'duplicate-id@example.com' })
    const invalid = [
      adminUser({ id: 0, email: 'zero-id@example.com' }),
      adminUser({ id: Number.NaN, email: 'nan-id@example.com' }),
      adminUser({ id: Number.MAX_SAFE_INTEGER + 1, email: 'unsafe-id@example.com' }),
    ]
    mocks.list.mockResolvedValueOnce(response([
      stringId,
      activeUser,
      duplicate,
      ...invalid,
      disabledUser,
    ]))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="user-menu-trigger-7"]')).toHaveLength(1)
    expect(wrapper.text()).toContain(activeUser.email)
    expect(wrapper.text()).toContain(disabledUser.email)
    expect(wrapper.text()).not.toContain('string-id@example.com')
    expect(wrapper.text()).not.toContain('duplicate-id@example.com')
    expect(wrapper.text()).not.toContain('zero-id@example.com')
    expect(wrapper.text()).not.toContain('nan-id@example.com')
    expect(wrapper.text()).not.toContain('unsafe-id@example.com')

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(7, { status: 'disabled' })
    expect(typeof mocks.update.mock.calls[0]![0]).toBe('number')
  })

  it('submits trimmed search and status-role filters from the bottom sheet', async () => {
    const wrapper = mount(MobileAdminUsersView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-testid="user-search"]').setValue(' lin@example.com ')
    await wrapper.get('[data-testid="user-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, search: 'lin@example.com' })

    await wrapper.get('[data-testid="user-filter-trigger"]').trigger('click')
    const status = document.querySelector<HTMLSelectElement>('[data-testid="user-status-filter"]')
    const role = document.querySelector<HTMLSelectElement>('[data-testid="user-role-filter"]')
    const apply = document.querySelector<HTMLButtonElement>('[data-testid="user-filter-apply"]')
    expect(status).not.toBeNull()
    expect(role).not.toBeNull()
    expect(apply).not.toBeNull()
    status!.value = 'active'
    status!.dispatchEvent(new Event('change', { bubbles: true }))
    role!.value = 'admin'
    role!.dispatchEvent(new Event('change', { bubbles: true }))
    apply!.click()
    await flushPromises()

    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'lin@example.com',
      status: 'active',
      role: 'admin',
    })
    wrapper.unmount()
  })

  it('keeps Edit visible and places secondary actions in the per-card overflow menu', async () => {
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    expect(wrapper.get('[data-testid="edit-user-7"]').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="detail-user-7"]').exists()).toBe(false)
    await openMenu(wrapper, 7)
    expect(wrapper.get('[data-testid="user-menu-7"]').text()).toContain('详情')
    expect(wrapper.get('[data-testid="user-menu-7"]').text()).toContain('余额')
    expect(wrapper.get('[data-testid="user-menu-7"]').text()).toContain('分组')
    expect(wrapper.get('[data-testid="user-menu-7"]').text()).toContain('停用')
    expect(wrapper.get('[data-testid="user-menu-7"]').text()).toContain('删除')
  })

  it('creates and edits users through the existing editor without exposing password text', async () => {
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="create-user"]').trigger('click')
    expect(wrapper.get('.editor').classes()).toContain('mobile')
    const password = wrapper.get('[data-testid="user-editor-password"]')
    expect(password.attributes('type')).toBe('password')
    await wrapper.get('[data-testid="user-editor-email"]').setValue('new@example.com')
    await password.setValue('test-password-secret')
    expect(wrapper.text()).not.toContain('test-password-secret')
    expect(wrapper.html()).not.toContain('test-password-secret')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      password: 'test-password-secret',
      concurrency: 5,
      rpm_limit: 0,
    }))

    await wrapper.get('[data-testid="edit-user-8"]').trigger('click')
    expect(wrapper.get('[data-testid="user-editor-email"]').element).toHaveProperty('value', disabledUser.email)
    await wrapper.get('[data-testid="user-editor-email"]').setValue('updated@example.com')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenLastCalledWith(8, expect.objectContaining({ email: 'updated@example.com' }))
  })

  it('guards editor validation and a duplicate pending submit without leaking rejection details', async () => {
    const pending = deferred<AdminUser>()
    mocks.create.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="create-user"]').trigger('click')
    await wrapper.get('[data-testid="user-editor-email"]').setValue('new@example.com')
    await wrapper.get('[data-testid="user-editor-password"]').setValue('secret-value')
    const concurrency = wrapper.get('[data-testid="user-editor-concurrency"]')
    await concurrency.setValue('1.5')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('并发上限必须是非负整数。')

    await concurrency.setValue('5')
    const form = wrapper.get('[data-testid="user-editor-submit"]')
    await form.trigger('submit')
    await form.trigger('submit')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.get('.backdrop.mobile').trigger('mousedown')
    expect(wrapper.find('.editor.mobile').exists()).toBe(true)
    pending.reject(new Error('token=editor-secret credential=raw-password'))
    await flushPromises()
    expect(wrapper.get('.editor [role="alert"]').text()).toBe('用户保存失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('editor-secret')
    expect(wrapper.text()).not.toContain('raw-password')
    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(2)
  })

  it('opens detail, balance and groups from menu actions with each exact user id', async () => {
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="detail-user-7"]').trigger('click')
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith(7)
    expect(wrapper.get('[data-testid="user-detail"]').classes()).toContain('mobile')
    expect(mocks.keys).toHaveBeenCalledWith(7)
    await wrapper.get('[data-testid="user-detail"] [aria-label="关闭"]').trigger('click')

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="balance-user-7"]').trigger('click')
    await wrapper.get('[data-testid="balance-amount"]').setValue('20')
    await wrapper.get('[data-testid="balance-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.balance).toHaveBeenCalledWith(7, { balance: 20, operation: 'add', notes: '' })

    await openMenu(wrapper, 8)
    await wrapper.get('[data-testid="groups-user-8"]').trigger('click')
    await wrapper.get('[data-testid="user-group-1"]').trigger('click')
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenLastCalledWith(8, { allowed_groups: [2] })
  })

  it('keeps cards and redacts balance and groups mutation failures', async () => {
    mocks.balance.mockRejectedValueOnce(new Error('api_key=balance-secret raw backend'))
    mocks.update.mockRejectedValueOnce(new Error('credential=groups-secret raw backend'))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="balance-user-7"]').trigger('click')
    await wrapper.get('[data-testid="balance-amount"]').setValue('20')
    await wrapper.get('[data-testid="balance-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.balance-dialog [role="alert"]').text()).toBe('余额更新失败，请稍后重试。')

    await wrapper.get('.balance-dialog [aria-label="关闭"]').trigger('click')
    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="groups-user-7"]').trigger('click')
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.groups-dialog [role="alert"]').text()).toBe('分组权限保存失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('balance-secret')
    expect(wrapper.text()).not.toContain('groups-secret')
    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(2)
  })

  it('requires explicit enable-disable confirmation, supports cancellation and uses the exact id', async () => {
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    expect(wrapper.get('[data-testid="user-status-dialog"]').text()).toContain('停用用户')
    await wrapper.get('[data-testid="cancel-user-status"]').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(7, { status: 'disabled' })
  })

  it('traps status focus, blocks pending dismissal and restores the menu trigger', async () => {
    const pending = deferred<AdminUser>()
    mocks.update.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminUsersView, { attachTo: document.body })
    await flushPromises()

    const trigger = wrapper.get('[data-testid="user-menu-trigger-7"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await flushPromises()
    const cancel = wrapper.get('[data-testid="cancel-user-status"]')
    const confirm = wrapper.get('[data-testid="confirm-user-status"]')
    expect(document.activeElement).toBe(cancel.element)
    ;(confirm.element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(cancel.element)
    await confirm.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.get('.confirm-backdrop').trigger('mousedown')
    expect(wrapper.find('[data-testid="user-status-dialog"]').exists()).toBe(true)
    pending.resolve({ ...activeUser, status: 'disabled' })
    await flushPromises()
    expect(wrapper.find('[data-testid="user-status-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('keeps latest mutation feedback when user operations finish out of order', async () => {
    const secondUser = adminUser({ id: 9, username: 'Second User', email: 'second@example.com', status: 'disabled' })
    const older = deferred<AdminUser>()
    const newer = deferred<AdminUser>()
    mocks.list.mockResolvedValueOnce(response([activeUser, secondUser]))
    mocks.update.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    await openMenu(wrapper, 9)
    await wrapper.get('[data-testid="toggle-user-9"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    newer.resolve({ ...secondUser, status: 'active' })
    await flushPromises()
    older.reject(new Error('token=older-operation-secret'))
    await flushPromises()

    expect(wrapper.get('[data-testid="user-action-message"]').text()).toContain('已启用')
    expect(wrapper.find('[data-testid="user-action-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('older-operation-secret')
  })

  it('keeps the old cards on refresh rejection and redacts the backend error', async () => {
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('token=list-secret upstream raw'))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="refresh-users"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="user-action-error"]').text()).toContain('已保留当前数据')
    expect(wrapper.text()).not.toContain('list-secret')
  })

  it('keeps tools and dialogs accessible through initial loading, error and empty states', async () => {
    const first = deferred<AdminUserListResponse>()
    mocks.list.mockReturnValueOnce(first.promise)
    const wrapper = mount(MobileAdminUsersView)
    expect(wrapper.get('[data-testid="user-list-loading"]').text()).toContain('正在加载用户')
    expect(wrapper.find('[data-testid="user-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="create-user"]').exists()).toBe(true)

    first.reject(new Error('credential=fatal-secret'))
    await flushPromises()
    expect(wrapper.get('[data-testid="user-list-error"]').text()).toContain('用户列表加载失败')
    await wrapper.get('[data-testid="create-user"]').trigger('click')
    expect(wrapper.find('.editor.mobile').exists()).toBe(true)
    await wrapper.get('[data-testid="user-editor-close"]').trigger('click')
    expect(wrapper.text()).not.toContain('fatal-secret')

    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="user-list-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="user-list-empty"]').text()).toContain('暂无用户')
    expect(wrapper.find('[data-testid="user-filter-trigger"]').exists()).toBe(true)

    await wrapper.get('[data-testid="create-user"]').trigger('click')
    await wrapper.get('[data-testid="user-editor-email"]').setValue('first@example.com')
    await wrapper.get('[data-testid="user-editor-password"]').setValue('first-password')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'first@example.com' }))
  })

  it('keeps filters available in a filtered empty state and resets them', async () => {
    const wrapper = mount(MobileAdminUsersView, { attachTo: document.body })
    await flushPromises()
    mocks.list.mockResolvedValueOnce(response([]))

    await wrapper.get('[data-testid="user-filter-trigger"]').trigger('click')
    const status = document.querySelector<HTMLSelectElement>('[data-testid="user-status-filter"]')!
    status.value = 'disabled'
    status.dispatchEvent(new Event('change', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-testid="user-filter-apply"]')!.click()
    await flushPromises()

    expect(wrapper.get('[data-testid="user-list-empty"]').text()).toContain('当前筛选范围内没有用户')
    expect(wrapper.find('[data-testid="user-filter-trigger"]').exists()).toBe(true)
    mocks.list.mockResolvedValueOnce(response())
    await wrapper.get('[data-testid="user-empty-reset"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    wrapper.unmount()
  })

  it('uses compact previous-next pagination with a fixed page size', async () => {
    mocks.list.mockResolvedValue(response([activeUser], { total: 41, page: 1 }))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toContain('1 / 3')
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
  })

  it('shrinks from an empty last page after deletion and never calls delete on cancellation', async () => {
    const lastUser = adminUser({ id: 21, username: 'Last User', email: 'last@example.com' })
    mocks.list
      .mockResolvedValueOnce(response([activeUser], { total: 21, page: 1 }))
      .mockResolvedValueOnce(response([lastUser], { total: 21, page: 2 }))
      .mockResolvedValueOnce(response([activeUser], { total: 20, page: 1 }))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()

    await openMenu(wrapper, 21)
    await wrapper.get('[data-testid="delete-user-21"]').trigger('click')
    await wrapper.get('[data-testid="cancel-delete-user"]').trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()

    await openMenu(wrapper, 21)
    await wrapper.get('[data-testid="delete-user-21"]').trigger('click')
    await wrapper.get('[data-testid="delete-user-identity"]').setValue('Last User')
    await wrapper.get('[data-testid="confirm-delete-user"]').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith(21)
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(activeUser.email)
  })

  it('decrements delete totals locally, shrinks the page and preserves success on sync failure', async () => {
    const lastUser = adminUser({ id: 21, username: 'Last User', email: 'last@example.com' })
    mocks.list
      .mockResolvedValueOnce(response([activeUser], { total: 21, page: 1 }))
      .mockResolvedValueOnce(response([lastUser], { total: 21, page: 2 }))
      .mockRejectedValueOnce(new Error('token=delete-sync-secret'))
      .mockResolvedValueOnce(response([activeUser], { total: 20, page: 1 }))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()

    await openMenu(wrapper, 21)
    await wrapper.get('[data-testid="delete-user-21"]').trigger('click')
    await wrapper.get('[data-testid="delete-user-identity"]').setValue('Last User')
    await wrapper.get('[data-testid="confirm-delete-user"]').trigger('click')
    await flushPromises()

    expect(mocks.remove).toHaveBeenCalledWith(21)
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    expect(wrapper.get('[data-testid="user-action-message"]').text()).toContain('用户已删除')
    expect(wrapper.get('[data-testid="user-action-error"]').text()).toContain('列表同步失败')
    expect(wrapper.find('[data-testid="mobile-pagination-label"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('delete-sync-secret')

    await wrapper.get('[data-testid="user-sync-retry"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    expect(wrapper.text()).toContain(activeUser.email)
  })

  it('invalidates a same-user detail request when the drawer closes and reopens', async () => {
    const stale = deferred<AdminUser>()
    const fresh = deferred<AdminUser>()
    mocks.get.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="detail-user-7"]').trigger('click')
    await wrapper.get('[data-testid="user-detail"] [aria-label="关闭"]').trigger('click')
    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="detail-user-7"]').trigger('click')
    fresh.resolve(adminUser({ username: 'Fresh Detail' }))
    await flushPromises()
    expect(wrapper.get('#user-detail-title').text()).toBe('Fresh Detail')

    stale.resolve(adminUser({ username: 'Stale Detail' }))
    await flushPromises()
    expect(wrapper.get('#user-detail-title').text()).toBe('Fresh Detail')
  })

  it('blocks disabling and deletion for an active admin user', async () => {
    const activeAdmin = adminUser({ id: 8, role: 'admin', status: 'active' })
    mocks.list.mockResolvedValueOnce(response([activeAdmin]))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await openMenu(wrapper, 8)

    const toggle = wrapper.get('[data-testid="toggle-user-8"]')
    const remove = wrapper.get('[data-testid="delete-user-8"]')
    expect(toggle.attributes('disabled')).toBeDefined()
    expect(remove.attributes('disabled')).toBeDefined()
    expect(toggle.attributes('title')).toContain('不能停用')
    expect(remove.attributes('title')).toContain('管理员')
    await toggle.trigger('click')
    await remove.trigger('click')
    expect(wrapper.find('[data-testid="user-status-dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="confirm-delete-user"]').exists()).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('allows enabling but never deleting a disabled admin user', async () => {
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await openMenu(wrapper, 8)

    const toggle = wrapper.get('[data-testid="toggle-user-8"]')
    const remove = wrapper.get('[data-testid="delete-user-8"]')
    expect(toggle.text()).toContain('启用用户')
    expect(toggle.attributes('disabled')).toBeUndefined()
    expect(toggle.attributes('title')).toBeUndefined()
    expect(remove.attributes('disabled')).toBeDefined()
    await toggle.trigger('click')
    expect(wrapper.get('[data-testid="user-status-dialog"]').text()).toContain('启用用户')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(8, { status: 'active' })
    expect(typeof mocks.update.mock.calls[0]![0]).toBe('number')
    expect(mocks.remove).not.toHaveBeenCalled()

    const direct = mount(UserDeleteDialog, { props: { user: disabledUser, mobile: true } })
    await direct.get('[data-testid="delete-user-identity"]').setValue(disabledUser.username)
    expect(direct.text()).toContain('管理员用户不能删除')
    expect(direct.get('[data-testid="confirm-delete-user"]').attributes('disabled')).toBeDefined()
    await direct.get('[data-testid="confirm-delete-user"]').trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('rejects mismatched editor results but accepts a valid create id', async () => {
    mocks.update.mockResolvedValueOnce(adminUser({ id: 999 }))
    const edit = mount(UserEditorDialog, { props: { modelValue: true, user: activeUser, mobile: true } })
    await edit.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(edit.emitted('saved')).toBeUndefined()
    expect(edit.emitted('update:modelValue')).toBeUndefined()
    expect(edit.get('[role="alert"]').text()).toBe('用户保存失败，请稍后重试。')

    mocks.create.mockResolvedValueOnce(adminUser({ id: 99, email: 'created@example.com' }))
    const create = mount(UserEditorDialog, { props: { modelValue: true, mobile: true } })
    await create.get('[data-testid="user-editor-email"]').setValue('created@example.com')
    await create.get('[data-testid="user-editor-password"]').setValue('created-password')
    await create.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(create.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 99 })
    expect(create.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('keeps the create editor open when the API returns an invalid id', async () => {
    mocks.create.mockResolvedValueOnce({ ...activeUser, id: Number.NaN })
    const wrapper = mount(UserEditorDialog, { props: { modelValue: true, mobile: true } })
    await wrapper.get('[data-testid="user-editor-email"]').setValue('created@example.com')
    await wrapper.get('[data-testid="user-editor-password"]').setValue('created-password')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toBe('用户保存失败，请稍后重试。')
  })

  it('keeps balance and groups dialogs open for mismatched mutation ids', async () => {
    mocks.balance.mockResolvedValueOnce(adminUser({ id: 999 }))
    const balance = mount(UserBalanceDialog, { props: { user: activeUser, mobile: true } })
    await balance.get('[data-testid="balance-amount"]').setValue('5')
    await balance.get('[data-testid="balance-form"]').trigger('submit')
    await flushPromises()
    expect(balance.emitted('updated')).toBeUndefined()
    expect(balance.emitted('close')).toBeUndefined()
    expect(balance.get('[role="alert"]').text()).toBe('余额更新失败，请稍后重试。')

    mocks.update.mockResolvedValueOnce(adminUser({ id: 999 }))
    const groups = mount(UserGroupsDialog, {
      props: { user: activeUser, groups: [{ id: 1, name: 'Exclusive', is_exclusive: true }], mobile: true },
    })
    await groups.get('[data-testid="user-groups-submit"]').trigger('click')
    await flushPromises()
    expect(groups.emitted('updated')).toBeUndefined()
    expect(groups.emitted('close')).toBeUndefined()
    expect(groups.get('[role="alert"]').text()).toBe('分组权限保存失败，请稍后重试。')
  })

  it('submits only deduplicated exclusive ids from successfully loaded groups', async () => {
    const user = adminUser({ allowed_groups: [1, 1, 2, 999] })
    const groups = [
      { id: 1, name: 'Exclusive', is_exclusive: true },
      { id: 1, name: 'Duplicate', is_exclusive: true },
      { id: 2, name: 'Public', is_exclusive: false },
      { id: Number.NaN, name: 'Malformed', is_exclusive: true },
      null,
    ] as unknown as AdminGroupOption[]
    mocks.update.mockResolvedValueOnce(user)
    const wrapper = mount(UserGroupsDialog, { props: { user, groups, mobile: true } })
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(7, { allowed_groups: [1] })
  })

  it('shows an explicit retryable group load error and disables saving', async () => {
    mocks.groups.mockReset().mockRejectedValueOnce(new Error('token=groups-load-secret'))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="groups-user-7"]').trigger('click')

    expect(wrapper.get('[data-testid="user-groups-load-error"]').text()).toContain('分组列表加载失败')
    expect(wrapper.text()).not.toContain('暂无可分配的专属分组')
    expect(wrapper.text()).not.toContain('groups-load-secret')
    expect(wrapper.get('[data-testid="user-groups-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()

    mocks.groups.mockResolvedValueOnce([{ id: 1, name: 'Exclusive', is_exclusive: true }])
    await wrapper.get('[data-testid="user-groups-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-1"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="user-groups-submit"]').attributes('disabled')).toBeUndefined()
  })

  it.each([
    ['object response', { items: [] }],
    ['null response', null],
    ['malformed item', [{ id: 1, name: 'Valid', is_exclusive: true }, { id: '2', name: 'String ID', is_exclusive: true }]],
  ])('rejects a fulfilled malformed group %s and recovers through retry', async (_label, malformed) => {
    mocks.groups.mockReset()
      .mockResolvedValueOnce(malformed)
      .mockResolvedValueOnce([{ id: 1, name: 'Exclusive', platform: 'anthropic', is_exclusive: true }])
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()
    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="groups-user-7"]').trigger('click')

    expect(wrapper.get('[data-testid="user-groups-load-error"]').text()).toContain('分组列表加载失败')
    expect(wrapper.get('[data-testid="user-groups-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="user-groups-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-1"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="user-groups-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('clears all detail state before loading another user and disables unavailable quotas', async () => {
    const userB = adminUser({ id: 12, username: 'User B', email: 'b@example.com', balance: 5 })
    mocks.keys.mockReset()
      .mockResolvedValueOnce({ items: [{ id: 1, name: 'A Key', status: 'active', quota_used: 1 }], total: 1, page: 1, page_size: 20 })
      .mockRejectedValueOnce(new Error('B keys failed'))
    mocks.usage.mockReset()
      .mockResolvedValueOnce({ total_requests: 1, total_tokens: 2, total_cost: 3 })
      .mockResolvedValueOnce({ total_requests: 4, total_tokens: 5, total_cost: 6 })
    mocks.history.mockReset()
      .mockResolvedValueOnce({ items: [{ id: 1, type: 'credit', value: 9, status: 'done', created_at: '2026-08-01T00:00:00Z', notes: 'A history' }], total: 1, page: 1, page_size: 20 })
      .mockRejectedValueOnce(new Error('B history failed'))
    mocks.quotas.mockReset()
      .mockResolvedValueOnce({ platform_quotas: [{ platform: 'anthropic', daily_limit_usd: 123, weekly_limit_usd: 456, monthly_limit_usd: 789, daily_usage_usd: 1, weekly_usage_usd: 2, monthly_usage_usd: 3 }] })
      .mockRejectedValueOnce(new Error('B quotas failed'))
    const wrapper = mount(UserDetailDrawer, { props: { user: activeUser, mobile: true } })
    await flushPromises()
    expect(wrapper.text()).toContain('A Key')
    expect(wrapper.text()).toContain('A history')
    expect((wrapper.get('.quota-row input').element as HTMLInputElement).value).toBe('123')
    await wrapper.findAll('.identity-form input')[1]!.setValue('A subject')

    await wrapper.setProps({ user: userB })
    await flushPromises()
    expect(wrapper.text()).not.toContain('A Key')
    expect(wrapper.text()).not.toContain('A history')
    expect(wrapper.get('.warning').text()).toContain('API Key')
    expect(wrapper.get('.warning').text()).toContain('余额记录')
    expect(wrapper.get('.warning').text()).toContain('平台额度')
    expect((wrapper.get('.quota-row input').element as HTMLInputElement).value).toBe('')
    expect((wrapper.findAll('.identity-form input')[1]!.element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[data-testid="user-quota-save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="reset-quota-anthropic-daily"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="user-quota-save"]').trigger('click')
    await wrapper.get('[data-testid="reset-quota-anthropic-daily"]').trigger('click')
    expect(mocks.updateQuotas).not.toHaveBeenCalled()
    expect(mocks.resetQuota).not.toHaveBeenCalled()
  })

  it('sanitizes malformed detail collections and display values', async () => {
    mocks.keys.mockResolvedValueOnce({
      items: [null, {}, { id: Number.NaN }, { id: 1, name: 'Safe Key', status: null, quota_used: Number.POSITIVE_INFINITY }],
      total: 4,
      page: 1,
      page_size: 20,
    })
    mocks.usage.mockResolvedValueOnce({ total_requests: Number.NaN, total_tokens: Number.POSITIVE_INFINITY, total_cost: 'bad' })
    mocks.history.mockResolvedValueOnce({
      items: [null, {}, { id: Number.POSITIVE_INFINITY }, { id: 1, type: null, value: Number.POSITIVE_INFINITY, status: null, created_at: Number.MAX_VALUE, notes: null }],
      total: 4,
      page: 1,
      page_size: 20,
    })
    mocks.quotas.mockResolvedValueOnce({
      platform_quotas: [null, {}, { platform: 'anthropic', daily_limit_usd: Number.POSITIVE_INFINITY, weekly_limit_usd: -1, monthly_limit_usd: null, daily_usage_usd: Number.NaN, weekly_usage_usd: 2, monthly_usage_usd: 3 }],
    })
    const wrapper = mount(UserDetailDrawer, { props: { user: activeUser, mobile: true } })
    await flushPromises()

    expect(wrapper.findAll('.key-row')).toHaveLength(1)
    expect(wrapper.findAll('.history-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('Safe Key')
    expect(wrapper.text()).toContain('—')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('Infinity')
    expect(wrapper.text()).not.toContain('Invalid Date')
  })

  it('blocks pending delete dismissal, traps focus and restores the menu trigger', async () => {
    const pending = deferred<{ message: string }>()
    mocks.remove.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminUsersView, { attachTo: document.body })
    await flushPromises()

    const trigger = wrapper.get('[data-testid="user-menu-trigger-7"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await wrapper.get('[data-testid="delete-user-7"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="delete-user-identity"]').element)
    await wrapper.get('[data-testid="delete-user-identity"]').setValue('Lin')
    const confirm = wrapper.get('[data-testid="confirm-delete-user"]')
    await confirm.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.get('.backdrop.mobile').trigger('mousedown')
    expect(wrapper.find('.dialog.mobile').exists()).toBe(true)
    pending.resolve({ message: 'deleted' })
    await flushPromises()
    expect(wrapper.find('.dialog.mobile').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="user-menu-trigger-8"]').element)
    wrapper.unmount()
  })

  it('keeps the user card and redacts a delete rejection', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('token=delete-secret credential=raw-backend'))
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="delete-user-7"]').trigger('click')
    await wrapper.get('[data-testid="delete-user-identity"]').setValue('Lin')
    await wrapper.get('[data-testid="confirm-delete-user"]').trigger('click')
    await flushPromises()

    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.dialog.mobile [role="alert"]').text()).toBe('用户删除失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('delete-secret')
    expect(wrapper.text()).not.toContain('raw-backend')
    expect(wrapper.findAll('[data-testid="mobile-user-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="confirm-delete-user"]').attributes('disabled')).toBeUndefined()
  })

  it('scopes 44px dialog controls and mobile layout to explicit mobile mode', () => {
    const desktopEditor = mount(UserEditorDialog, { props: { modelValue: true, user: activeUser } })
    const desktopBalance = mount(UserBalanceDialog, { props: { user: activeUser } })
    const desktopGroups = mount(UserGroupsDialog, { props: { user: activeUser, groups: [] } })
    const desktopDelete = mount(UserDeleteDialog, { props: { user: activeUser } })
    expect(desktopEditor.get('.editor').classes()).not.toContain('mobile')
    expect(desktopBalance.get('.balance-dialog').classes()).not.toContain('mobile')
    expect(desktopGroups.get('.groups-dialog').classes()).not.toContain('mobile')
    expect(desktopDelete.get('.dialog').classes()).not.toContain('mobile')

    for (const source of [userEditorSource, userBalanceSource, userGroupsSource, userDeleteSource, userDetailSource]) {
      expect(source).toMatch(/\.mobile[^{}]*\{[^}]*44px/)
    }
  })

  it('preserves desktop editor minimum and submit normalization while mobile accepts zero', async () => {
    const desktop = mount(UserEditorDialog, { props: { modelValue: true, user: activeUser } })
    const desktopConcurrency = desktop.get('[data-testid="user-editor-concurrency"]')
    expect(desktopConcurrency.attributes('min')).toBe('1')
    await desktopConcurrency.setValue('0')
    await desktop.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ concurrency: 1 }))
    desktop.unmount()

    mocks.update.mockClear()
    const mobile = mount(UserEditorDialog, { props: { modelValue: true, user: activeUser, mobile: true } })
    const mobileConcurrency = mobile.get('[data-testid="user-editor-concurrency"]')
    expect(mobileConcurrency.attributes('min')).toBe('0')
    await mobileConcurrency.setValue('0')
    await mobile.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ concurrency: 0 }))
    mobile.unmount()
  })

  it('keeps desktop balance dismissal available during submit and blocks only mobile dismissal', async () => {
    const desktopPending = deferred<AdminUser>()
    mocks.balance.mockReturnValueOnce(desktopPending.promise)
    const desktop = mount(UserBalanceDialog, { props: { user: activeUser } })
    await desktop.get('[data-testid="balance-amount"]').setValue('5')
    await desktop.get('[data-testid="balance-form"]').trigger('submit')
    expect(desktop.get('.balance-dialog header button').attributes('disabled')).toBeUndefined()
    expect(desktop.get('.balance-dialog footer button[type="button"]').attributes('disabled')).toBeUndefined()
    await desktop.get('.dialog-backdrop').trigger('mousedown')
    expect(desktop.emitted('close')).toHaveLength(1)
    desktop.unmount()

    const mobilePending = deferred<AdminUser>()
    mocks.balance.mockReturnValueOnce(mobilePending.promise)
    const mobile = mount(UserBalanceDialog, { props: { user: activeUser, mobile: true } })
    await mobile.get('[data-testid="balance-amount"]').setValue('5')
    await mobile.get('[data-testid="balance-form"]').trigger('submit')
    expect(mobile.get('.balance-dialog header button').attributes('disabled')).toBeDefined()
    expect(mobile.get('.balance-dialog footer button[type="button"]').attributes('disabled')).toBeDefined()
    await mobile.get('.dialog-backdrop').trigger('mousedown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(mobile.emitted('close')).toBeUndefined()
    mobile.unmount()
  })

  it('keeps desktop groups dismissal available during submit and blocks only mobile dismissal', async () => {
    const desktopPending = deferred<AdminUser>()
    mocks.update.mockReturnValueOnce(desktopPending.promise)
    const desktop = mount(UserGroupsDialog, { props: { user: activeUser, groups: [] } })
    await desktop.get('[data-testid="user-groups-submit"]').trigger('click')
    expect(desktop.get('.groups-dialog header button').attributes('disabled')).toBeUndefined()
    expect(desktop.get('.groups-dialog footer button[type="button"]').attributes('disabled')).toBeUndefined()
    await desktop.get('.dialog-backdrop').trigger('mousedown')
    expect(desktop.emitted('close')).toHaveLength(1)
    desktop.unmount()

    const mobilePending = deferred<AdminUser>()
    mocks.update.mockReturnValueOnce(mobilePending.promise)
    const mobile = mount(UserGroupsDialog, { props: { user: activeUser, groups: [], mobile: true } })
    await mobile.get('[data-testid="user-groups-submit"]').trigger('click')
    expect(mobile.get('.groups-dialog header button').attributes('disabled')).toBeDefined()
    expect(mobile.get('.groups-dialog footer button[type="button"]').attributes('disabled')).toBeDefined()
    await mobile.get('.dialog-backdrop').trigger('mousedown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(mobile.emitted('close')).toBeUndefined()
    mobile.unmount()
  })

  it('keeps desktop delete dismissal available during submit and blocks only mobile dismissal', async () => {
    const desktopPending = deferred<{ message: string }>()
    mocks.remove.mockReturnValueOnce(desktopPending.promise)
    const desktop = mount(UserDeleteDialog, { props: { user: activeUser } })
    await desktop.get('[data-testid="delete-user-identity"]').setValue('Lin')
    await desktop.get('[data-testid="confirm-delete-user"]').trigger('click')
    expect(desktop.get('.dialog header button').attributes('disabled')).toBeUndefined()
    expect(desktop.get('[data-testid="cancel-delete-user"]').attributes('disabled')).toBeUndefined()
    await desktop.get('.backdrop').trigger('mousedown')
    expect(desktop.emitted('close')).toHaveLength(1)
    desktop.unmount()

    const mobilePending = deferred<{ message: string }>()
    mocks.remove.mockReturnValueOnce(mobilePending.promise)
    const mobile = mount(UserDeleteDialog, { props: { user: activeUser, mobile: true } })
    await mobile.get('[data-testid="delete-user-identity"]').setValue('Lin')
    await mobile.get('[data-testid="confirm-delete-user"]').trigger('click')
    expect(mobile.get('.dialog header button').attributes('disabled')).toBeDefined()
    expect(mobile.get('[data-testid="cancel-delete-user"]').attributes('disabled')).toBeDefined()
    await mobile.get('.backdrop').trigger('mousedown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(mobile.emitted('close')).toBeUndefined()
    mobile.unmount()
  })

  it('keeps desktop detail dismissal available during mutation and blocks only mobile dismissal', async () => {
    const desktopPending = deferred<{ provider_type: string; provider_subject: string }>()
    mocks.bindIdentity.mockReturnValueOnce(desktopPending.promise)
    const desktop = mount(UserDetailDrawer, { props: { user: activeUser } })
    await flushPromises()
    await desktop.findAll('.identity-form input')[1]!.setValue('subject-desktop')
    await desktop.get('.identity-form').trigger('submit')
    expect(desktop.get('.detail header button').attributes('disabled')).toBeUndefined()
    await desktop.get('.backdrop').trigger('mousedown')
    expect(desktop.emitted('close')).toHaveLength(1)
    desktop.unmount()

    const mobilePending = deferred<{ provider_type: string; provider_subject: string }>()
    mocks.bindIdentity.mockReturnValueOnce(mobilePending.promise)
    const mobile = mount(UserDetailDrawer, { props: { user: activeUser, mobile: true } })
    await flushPromises()
    await mobile.findAll('.identity-form input')[1]!.setValue('subject-mobile')
    await mobile.get('.identity-form').trigger('submit')
    expect(mobile.get('.detail header button').attributes('disabled')).toBeDefined()
    await mobile.get('.backdrop').trigger('mousedown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(mobile.emitted('close')).toBeUndefined()
    mobile.unmount()
  })

  it('traps editor, balance, groups and detail focus and restores each trigger', async () => {
    const wrapper = mount(MobileAdminUsersView, { attachTo: document.body })
    await flushPromises()

    const edit = wrapper.get('[data-testid="edit-user-7"]')
    ;(edit.element as HTMLElement).focus()
    await edit.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="user-editor-email"]').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(edit.element)

    const menu = wrapper.get('[data-testid="user-menu-trigger-7"]')
    ;(menu.element as HTMLElement).focus()
    await menu.trigger('click')
    await wrapper.get('[data-testid="balance-user-7"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="balance-amount"]').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(menu.element)

    await menu.trigger('click')
    await wrapper.get('[data-testid="groups-user-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="user-groups-dialog"]').element.contains(document.activeElement)).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(menu.element)

    await menu.trigger('click')
    await wrapper.get('[data-testid="detail-user-7"]').trigger('click')
    await flushPromises()
    const detailClose = wrapper.get('[data-testid="user-detail"] [aria-label="关闭"]')
    expect(document.activeElement).toBe(detailClose.element)
    ;(detailClose.element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(wrapper.get('[data-testid="user-detail"]').element.contains(document.activeElement)).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(menu.element)
    wrapper.unmount()
  })

  it('ignores stale list completions and pending component completions after unmount', async () => {
    const stale = deferred<AdminUserListResponse>()
    const fresh = deferred<AdminUserListResponse>()
    mocks.list.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const wrapper = mount(MobileAdminUsersView)
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="refresh-users"]').trigger('click')
    fresh.resolve(response([disabledUser]))
    await flushPromises()
    stale.resolve(response([activeUser]))
    await flushPromises()
    expect(wrapper.text()).toContain(disabledUser.email)
    expect(wrapper.text()).not.toContain(activeUser.email)

    const save = deferred<AdminUser>()
    mocks.update.mockReturnValueOnce(save.promise)
    await wrapper.get('[data-testid="edit-user-8"]').trigger('click')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    const editor = wrapper.findComponent(UserEditorDialog)
    const state = editor.vm as unknown as { saving: boolean }
    expect(state.saving).toBe(true)
    wrapper.unmount()
    save.resolve(disabledUser)
    await flushPromises()
    expect(state.saving).toBe(true)
  })
})
