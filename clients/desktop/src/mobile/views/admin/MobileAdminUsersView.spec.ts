import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUser, AdminUserListResponse } from '@/api/admin/types'
import UserBalanceDialog from '@/components/admin/UserBalanceDialog.vue'
import UserDeleteDialog from '@/components/admin/UserDeleteDialog.vue'
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
    const older = deferred<AdminUser>()
    const newer = deferred<AdminUser>()
    mocks.update.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mount(MobileAdminUsersView)
    await flushPromises()

    await openMenu(wrapper, 7)
    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    await openMenu(wrapper, 8)
    await wrapper.get('[data-testid="toggle-user-8"]').trigger('click')
    await wrapper.get('[data-testid="confirm-user-status"]').trigger('click')
    newer.resolve({ ...disabledUser, status: 'active' })
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

  it('shows initial loading, retryable fatal error and empty state', async () => {
    const first = deferred<AdminUserListResponse>()
    mocks.list.mockReturnValueOnce(first.promise)
    const wrapper = mount(MobileAdminUsersView)
    expect(wrapper.find('[data-testid="mobile-page-loading"]').exists()).toBe(true)

    first.reject(new Error('credential=fatal-secret'))
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('用户列表加载失败')
    expect(wrapper.text()).not.toContain('fatal-secret')

    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-empty"]').text()).toContain('暂无用户')
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
      .mockResolvedValueOnce(response([], { total: 20, page: 2 }))
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
