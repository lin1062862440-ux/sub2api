import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUser } from '@/api/admin/types'
import type { UserGroup, UserGroupMember, UserGroupViewer } from '@/api/user-groups'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  members: vi.fn(),
  viewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  users: vi.fn(),
  refreshUser: vi.fn(),
  pushRoute: vi.fn(),
  toastSuccess: vi.fn(),
  session: {
    user: { role: 'admin' },
    userGroupCapabilities: { can_access: true, can_manage: true, group_count: 1 },
  },
}))

vi.mock('@/api/user-groups', () => ({
  listUserGroups: mocks.list,
  createUserGroup: mocks.create,
  updateUserGroup: mocks.update,
  archiveUserGroup: mocks.archive,
  getUserGroupMembers: mocks.members,
  getUserGroupViewers: mocks.viewers,
  replaceUserGroupMembers: mocks.replaceMembers,
  replaceUserGroupViewers: mocks.replaceViewers,
}))
vi.mock('@/api/admin/users', () => ({ listAdminUsers: mocks.users }))
vi.mock('@/stores/session', () => ({ session: mocks.session, refreshUser: mocks.refreshUser }))
vi.mock('@/stores/toast', () => ({ toast: { success: mocks.toastSuccess } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.pushRoute }) }))

import MobileUserGroupsView from './MobileUserGroupsView.vue'
import mobileUserGroupsSource from './MobileUserGroupsView.vue?raw'

function group(overrides: Partial<UserGroup> = {}): UserGroup {
  return {
    id: 3,
    name: '研发团队',
    description: '核心研发成员',
    status: 'active',
    member_count: 2,
    viewer_count: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 7,
    username: 'Lin',
    email: 'lin@example.com',
    role: 'user',
    balance: 20,
    concurrency: 5,
    status: 'active',
    allowed_groups: [],
    notes: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const member: UserGroupMember = {
  user_id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  status: 'active',
  balance: 20,
  joined_at: '',
}

const viewer: UserGroupViewer = {
  user_id: 9,
  username: 'Chen',
  email: 'chen@example.com',
  status: 'active',
  granted_at: '',
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

function mountView(attachTo?: HTMLElement) {
  return mount(MobileUserGroupsView, {
    attachTo,
    global: { stubs: { Teleport: true } },
  })
}

describe('MobileUserGroupsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.user.role = 'admin'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: true, group_count: 1 }
    mocks.list.mockResolvedValue([group(), group({ id: 4, name: '运营团队', description: '', status: 'archived', member_count: 0, viewer_count: 0 })])
    mocks.create.mockResolvedValue(group({ id: 20 }))
    mocks.update.mockImplementation((id: number) => Promise.resolve(group({ id })))
    mocks.archive.mockResolvedValue(undefined)
    mocks.members.mockResolvedValue([member])
    mocks.viewers.mockResolvedValue([viewer])
    mocks.replaceMembers.mockResolvedValue(undefined)
    mocks.replaceViewers.mockResolvedValue(undefined)
    mocks.users.mockResolvedValue({
      items: [user(), user({ id: 9, username: 'Chen', email: 'chen@example.com' })],
      total: 2,
      page: 1,
      page_size: 100,
    })
    mocks.refreshUser.mockResolvedValue(undefined)
  })

  it('keeps controls available while loading and renders safe directory cards without billing tabs', async () => {
    const pending = deferred<UserGroup[]>()
    mocks.list.mockReturnValueOnce(pending.promise)
    const wrapper = mountView()

    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="user-group-search"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mobile-page-loading"]').text()).toContain('正在加载团队')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')

    pending.resolve([
      group({ name: 'A'.repeat(180), description: '', member_count: Number.NaN, viewer_count: Number.POSITIVE_INFINITY }),
      group({ id: 4, name: '', description: '归档目录', status: 'archived' }),
    ])
    await flushPromises()

    expect(mocks.list).toHaveBeenCalledWith()
    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('暂无说明')
    expect(wrapper.text()).toContain('未命名团队')
    expect(wrapper.text()).toContain('已归档')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('Infinity')
    expect(wrapper.text()).not.toContain('订阅')
    expect(wrapper.text()).not.toContain('用量')
  })

  it('renders member counts as a compact unframed summary', () => {
    expect(mobileUserGroupsSource).toContain('class="group-summary"')
    expect(mobileUserGroupsSource).not.toMatch(/<dl>[\s\S]*?<\/dl>/)
    expect(mobileUserGroupsSource).toMatch(/\.group-summary\{[^}]*border:\s*0/)
  })

  it('opens the combined member and quota workspace from each team card', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="open-team-workspace-3"]').trigger('click')
    expect(mocks.pushRoute).toHaveBeenCalledWith({ name: 'user-group-members', params: { id: 3 } })
  })

  it('normalizes list records to unique positive IDs and canonical statuses', async () => {
    mocks.list.mockResolvedValueOnce([
      null,
      [],
      group({ id: 0 }),
      group({ id: '3' as unknown as number }),
      group({ id: 3, name: 'Canonical' }),
      group({ id: 3, name: 'Duplicate' }),
      group({ id: 4, status: 'unknown' as UserGroup['status'] }),
      group({ id: 5, status: 'archived', name: 'Archived' }),
    ] as unknown as UserGroup[])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Canonical')
    expect(wrapper.text()).toContain('Archived')
    expect(wrapper.text()).not.toContain('Duplicate')
    expect(wrapper.find('[data-testid="edit-user-group-0"]').exists()).toBe(false)
  })

  it('rejects a non-array list response and preserves the last valid directory', async () => {
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockResolvedValueOnce({ items: [group({ id: 99 })] })

    await wrapper.get('[data-testid="refresh-user-groups"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('研发团队')
    expect(wrapper.get('[data-testid="user-group-sync-warning"]').text()).toContain('刷新失败')
  })

  it('searches locally, paginates, refreshes, and falls back when the current page shrinks', async () => {
    const groups = Array.from({ length: 11 }, (_, index) => group({ id: index + 1, name: `团队 ${index + 1}` }))
    mocks.list.mockResolvedValueOnce(groups)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toContain('2 / 2')
    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(1)

    await wrapper.get('[data-testid="user-group-search"]').setValue(' 团队 1 ')
    await wrapper.get('[data-testid="user-group-search-form"]').trigger('submit')
    expect(wrapper.get('[data-testid="mobile-pagination-label"]').text()).toContain('1 / 1')
    expect(wrapper.text()).toContain('共 3 个团队')

    mocks.list.mockResolvedValueOnce(groups.slice(0, 5))
    await wrapper.get('[data-testid="user-group-search"]').setValue('')
    await wrapper.get('[data-testid="user-group-search-form"]').trigger('submit')
    await wrapper.get('[data-testid="refresh-user-groups"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(5)
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('creates and edits the exact group with trimmed organizational fields', async () => {
    const wrapper = mountView(document.body)
    await flushPromises()

    await wrapper.get('[data-testid="create-user-group"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="user-group-name"]').element)
    await wrapper.get('[data-testid="user-group-name"]').setValue('  产品团队  ')
    await wrapper.get('[data-testid="user-group-description"]').setValue('  产品成员  ')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({ name: '产品团队', description: '产品成员' })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('团队已创建')

    await wrapper.get('[data-testid="edit-user-group-3"]').trigger('click')
    await wrapper.get('[data-testid="user-group-name"]').setValue('研发二组')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(3, { name: '研发二组', description: '核心研发成员' })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('团队已更新')
    wrapper.unmount()
  })

  it.each([
    ['create', '[data-testid="create-user-group"]'],
    ['edit', '[data-testid="edit-user-group-3"]'],
  ])('reopens the editor after a successful %s while its directory refresh is pending', async (_, opener) => {
    const refresh = deferred<UserGroup[]>()
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockReturnValueOnce(refresh.promise)

    await wrapper.get(opener).trigger('click')
    if (opener.includes('create')) await wrapper.get('[data-testid="user-group-name"]').setValue('New Group')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-editor-sheet"]').exists()).toBe(false)

    await wrapper.get('[data-testid="create-user-group"]').trigger('click')
    expect(wrapper.get('[data-testid="user-group-name"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.sheet-primary').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="user-group-name"]').setValue('Reopened')
    expect(wrapper.get('.sheet-primary').attributes('disabled')).toBeUndefined()
    refresh.resolve([group()])
    await flushPromises()
  })

  it('redacts save failures and rejects a mismatched update response', async () => {
    mocks.update.mockResolvedValueOnce(group({ id: 999 }))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="edit-user-group-3"]').trigger('click')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="user-group-editor-error"]').text()).toBe('团队保存失败，请稍后重试。')
    expect(wrapper.find('[data-testid="mobile-bottom-sheet"]').exists()).toBe(true)

    mocks.update.mockRejectedValueOnce(new Error('token=secret raw upstream failure'))
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).not.toContain('token=secret')
  })

  it('requires archive confirmation, supports cancel, blocks pending dismissal, and archives the exact ID', async () => {
    const pending = deferred<void>()
    mocks.archive.mockReturnValueOnce(pending.promise)
    const wrapper = mountView(document.body)
    await flushPromises()

    const trigger = wrapper.get('[data-testid="archive-user-group-3"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="archive-user-group-dialog"]').text()).toContain('研发团队')
    await wrapper.get('[data-testid="cancel-archive-user-group"]').trigger('click')
    expect(mocks.archive).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await wrapper.get('[data-testid="confirm-archive-user-group"]').trigger('click')
    expect(mocks.archive).toHaveBeenCalledWith(3)
    expect(wrapper.get('[data-testid="confirm-archive-user-group"]').attributes('disabled')).toBeDefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.find('[data-testid="archive-user-group-dialog"]').exists()).toBe(true)
    pending.resolve()
    await flushPromises()
    expect(wrapper.find('[data-testid="archive-user-group-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens another archive confirmation while the previous success refresh is pending', async () => {
    mocks.list.mockResolvedValueOnce([group(), group({ id: 4, name: '运营团队', status: 'active' })])
    const refresh = deferred<UserGroup[]>()
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockReturnValueOnce(refresh.promise)

    await wrapper.get('[data-testid="archive-user-group-3"]').trigger('click')
    await wrapper.get('[data-testid="confirm-archive-user-group"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="archive-user-group-dialog"]').exists()).toBe(false)
    await wrapper.get('[data-testid="archive-user-group-4"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm-archive-user-group"]').attributes('disabled')).toBeUndefined()
    refresh.resolve([group({ id: 4, name: '运营团队', status: 'active' })])
    await flushPromises()
  })

  it('keeps cards after an archive rejection and redacts the raw failure', async () => {
    mocks.archive.mockRejectedValueOnce(new Error('credential=archive-secret'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="archive-user-group-3"]').trigger('click')
    await wrapper.get('[data-testid="confirm-archive-user-group"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="archive-user-group-error"]').text()).toBe('团队归档失败，请稍后重试。')
    expect(wrapper.findAll('[data-testid="mobile-user-group-card"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('archive-secret')
  })

  it('keeps a created group and reports stale directory data when post-create sync fails', async () => {
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('sync token=create-secret'))
    await wrapper.get('[data-testid="create-user-group"]').trigger('click')
    await wrapper.get('[data-testid="user-group-name"]').setValue('本地新组')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.toastSuccess).toHaveBeenCalledWith('团队已创建')
    expect(wrapper.find('[data-testid="edit-user-group-20"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="user-group-sync-warning"]').text()).toBe('团队列表同步失败，请手动刷新。')
    expect(wrapper.text()).not.toContain('create-secret')
  })

  it('keeps an archived group removed and reports stale directory data when post-archive sync fails', async () => {
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('sync token=archive-secret'))
    await wrapper.get('[data-testid="archive-user-group-3"]').trigger('click')
    await wrapper.get('[data-testid="confirm-archive-user-group"]').trigger('click')
    await flushPromises()

    expect(mocks.toastSuccess).toHaveBeenCalledWith('团队已归档')
    expect(wrapper.find('[data-testid="edit-user-group-3"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="user-group-sync-warning"]').text()).toBe('团队列表同步失败，请手动刷新。')
  })

  it('loads and replaces exact member and viewer selections with real APIs', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    expect(mocks.members).toHaveBeenCalledWith(3)
    expect(mocks.users).toHaveBeenCalledWith({ page: 1, page_size: 100 })
    expect(wrapper.get('[data-testid="people-search"]').attributes('placeholder')).toBe('搜索名称或邮箱')
    await wrapper.get('[data-testid="people-option-9"]').trigger('click')
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [7, 9])

    await wrapper.get('[data-testid="group-viewers-3"]').trigger('click')
    await flushPromises()
    expect(mocks.viewers).toHaveBeenCalledWith(3)
    await wrapper.get('[data-testid="people-option-7"]').trigger('click')
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceViewers).toHaveBeenCalledWith(3, [9, 7])
  })

  it('reopens people management while the previous successful save refresh is pending', async () => {
    const refresh = deferred<UserGroup[]>()
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    mocks.list.mockReturnValueOnce(refresh.promise)

    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-people-sheet"]').exists()).toBe(false)
    await wrapper.get('[data-testid="group-viewers-3"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="save-user-group-people"]').attributes('disabled')).toBeUndefined()
    refresh.resolve([group()])
    await flushPromises()
  })

  it('clears people loading ownership when closing a deferred initial load', async () => {
    const pending = deferred<UserGroupMember[]>()
    mocks.list.mockResolvedValueOnce(Array.from({ length: 11 }, (_, index) => group({ id: index + 1 })))
    mocks.members.mockReturnValueOnce(pending.promise)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="group-members-1"]').trigger('click')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    await wrapper.get('[data-testid="close-user-group-people"]').trigger('click')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
    expect(wrapper.get('[data-testid="mobile-pagination-next"]').attributes('disabled')).toBeUndefined()

    pending.resolve([member])
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-people-sheet"]').exists()).toBe(false)
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('keeps an existing member outside the first candidate page visible and submits it unchanged', async () => {
    mocks.members.mockResolvedValueOnce([{
      ...member,
      user_id: 501,
      username: 'Outside Member',
      email: 'outside-member@example.com',
    }])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="selected-person-501"]').text()).toContain('Outside Member')
    expect(wrapper.find('[data-testid="people-option-501"]').exists()).toBe(false)
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()

    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [501])
  })

  it('keeps an existing viewer outside the first candidate page visible and submits it unchanged', async () => {
    mocks.viewers.mockResolvedValueOnce([{
      ...viewer,
      user_id: 777,
      username: 'Outside Viewer',
      email: 'outside-viewer@example.com',
    }])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="group-viewers-3"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="selected-person-777"]').text()).toContain('Outside Viewer')
    expect(wrapper.find('[data-testid="people-option-777"]').exists()).toBe(false)
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()

    expect(mocks.replaceViewers).toHaveBeenCalledWith(3, [777])
  })

  it('preserves unsaved selections across people searches without showing non-matches as results', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="people-option-9"]').trigger('click')
    mocks.users.mockResolvedValueOnce({
      items: [user({ id: 9, username: 'Chen', email: 'chen@example.com' })],
      total: 1,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="people-search"]').setValue(' chen ')
    await wrapper.get('[data-testid="people-search-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.members).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="people-option-7"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="people-option-9"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="selected-person-7"]').text()).toContain('Lin')

    mocks.users.mockResolvedValueOnce({
      items: [user(), user({ id: 9, username: 'Chen', email: 'chen@example.com' })],
      total: 2,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="people-search"]').setValue('')
    await wrapper.get('[data-testid="people-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.members).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="people-option-7"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="people-option-9"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [7, 9])
  })

  it('retries a malformed candidate search without reloading or overwriting local selections', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="people-option-9"]').trigger('click')

    mocks.users.mockResolvedValueOnce({
      items: [{ ...user(), id: 'bad-id' }],
      total: 1,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="people-search"]').setValue('chen')
    await wrapper.get('[data-testid="people-search-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="people-data-error"]').text()).toContain('候选用户数据格式异常')

    mocks.users.mockResolvedValueOnce({
      items: [user({ id: 9, username: 'Chen', email: 'chen@example.com' })],
      total: 1,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="retry-user-group-people"]').trigger('click')
    await flushPromises()

    expect(mocks.members).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="selected-person-7"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="people-option-9"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [7, 9])
  })

  it('sanitizes replacement IDs and disables save for malformed people data until retry succeeds', async () => {
    mocks.members.mockResolvedValueOnce([
      member,
      { ...member },
      { ...member, user_id: '9' },
    ] as unknown as UserGroupMember[])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="people-data-error"]').text()).toBe('成员数据格式异常，请重试。')
    expect(wrapper.get('[data-testid="save-user-group-people"]').attributes('disabled')).toBeDefined()
    mocks.members.mockResolvedValueOnce([member, { ...member }])
    mocks.users.mockResolvedValueOnce({
      items: [user(), user({ id: 9, username: 'Chen', email: 'chen@example.com' }), { ...user({ id: 9 }) }],
      total: 3,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="retry-user-group-people"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="people-option-9"]').trigger('click')
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [7, 9])
  })

  it('ignores stale A loads after switching to B and fresh data after close and reopen', async () => {
    const a = deferred<UserGroupMember[]>()
    const reopened = deferred<UserGroupMember[]>()
    mocks.members.mockReturnValueOnce(a.promise)
    mocks.viewers.mockResolvedValueOnce([viewer])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await wrapper.get('[data-testid="close-user-group-people"]').trigger('click')
    await wrapper.get('[data-testid="group-viewers-4"]').trigger('click')
    await flushPromises()
    a.resolve([member])
    await flushPromises()
    expect(wrapper.get('[data-testid="user-group-people-title"]').text()).toContain('运营团队')
    expect(wrapper.get('[data-testid="people-option-9"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-testid="close-user-group-people"]').trigger('click')
    mocks.members.mockReturnValueOnce(reopened.promise)
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    expect(wrapper.get('[data-testid="save-user-group-people"]').attributes('disabled')).toBeDefined()
    reopened.resolve([])
    await flushPromises()
    expect(wrapper.get('[data-testid="people-option-7"]').attributes('aria-pressed')).toBe('false')
  })

  it('searches people, redacts replacement failures, and keeps the target sheet open', async () => {
    mocks.replaceMembers.mockRejectedValueOnce(new Error('api_key=people-secret'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    mocks.users.mockResolvedValueOnce({
      items: [user({ id: 9, username: 'Chen', email: 'chen@example.com' })],
      total: 1,
      page: 1,
      page_size: 100,
    })
    await wrapper.get('[data-testid="people-search"]').setValue(' chen ')
    await wrapper.get('[data-testid="people-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.users).toHaveBeenLastCalledWith({ page: 1, page_size: 100, search: 'chen' })
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()
    expect(mocks.replaceMembers).toHaveBeenCalledWith(3, [7])
    expect(wrapper.get('[data-testid="user-group-people-error"]').text()).toBe('成员保存失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('people-secret')
    expect(wrapper.find('[data-testid="user-group-people-sheet"]').exists()).toBe(true)
  })

  it('keeps people success feedback and reports stale counts when post-save sync fails', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('sync token=people-secret'))
    await wrapper.get('[data-testid="save-user-group-people"]').trigger('click')
    await flushPromises()

    expect(mocks.toastSuccess).toHaveBeenCalledWith('成员已更新')
    expect(wrapper.get('[data-testid="user-group-sync-warning"]').text()).toBe('团队列表同步失败，请手动刷新。')
    expect(wrapper.text()).not.toContain('people-secret')
  })

  it('revokes mutation access on 403 and recovers only after an authoritative session refresh', async () => {
    mocks.members.mockRejectedValueOnce({ status: 403, code: 40301, message: 'permission token=secret' })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="user-group-permission-error"]').text()).toBe('团队管理权限已失效，请刷新后重试。')
    expect(wrapper.find('[data-testid="user-group-people-sheet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('permission token')

    await wrapper.get('[data-testid="refresh-user-groups"]').trigger('click')
    await flushPromises()
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(true)
  })

  it('invalidates an older list request when a mutation revokes permission', async () => {
    const staleList = deferred<UserGroup[]>()
    const wrapper = mountView()
    await flushPromises()
    mocks.list.mockReturnValueOnce(staleList.promise)
    await wrapper.get('[data-testid="refresh-user-groups"]').trigger('click')
    mocks.members.mockRejectedValueOnce({ status: 403, code: 40301 })
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    staleList.resolve([group()])
    await flushPromises()
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('does not restore management controls when authoritative refresh remains read-only', async () => {
    mocks.members.mockRejectedValueOnce({ status: 403, code: 40301 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 1 }
    mocks.list.mockResolvedValueOnce([group()])

    await wrapper.get('[data-testid="refresh-user-groups"]').trigger('click')
    await flushPromises()
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-user-group-3"]').exists()).toBe(false)
  })

  it('coalesces deferred permission recovery and only applies the latest trusted session', async () => {
    mocks.members.mockRejectedValueOnce({ status: 403, code: 40301 })
    const recovery = deferred<void>()
    mocks.refreshUser.mockReturnValueOnce(recovery.promise)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    const refresh = wrapper.get('[data-testid="refresh-user-groups"]')
    await refresh.trigger('click')
    await refresh.trigger('click')
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1)
    expect(refresh.attributes('disabled')).toBeDefined()
    expect(refresh.attributes('aria-busy')).toBe('true')

    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 1 }
    recovery.resolve()
    await flushPromises()
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(refresh.attributes('disabled')).toBeUndefined()
    expect(refresh.attributes('aria-busy')).toBe('false')
  })

  it('releases rejected permission recovery so refresh can retry', async () => {
    mocks.members.mockRejectedValueOnce({ status: 403, code: 40301 })
    mocks.refreshUser.mockRejectedValueOnce(new Error('refresh failed'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()

    const refresh = wrapper.get('[data-testid="refresh-user-groups"]')
    await refresh.trigger('click')
    await flushPromises()
    expect(refresh.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)

    mocks.refreshUser.mockResolvedValueOnce(undefined)
    await refresh.trigger('click')
    await flushPromises()
    expect(mocks.refreshUser).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(true)
  })

  it('keeps search, refresh and create in empty/error states and hides mutations for read-only users', async () => {
    mocks.list.mockRejectedValueOnce(new Error('token=list-secret'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('团队列表加载失败，请检查网络后重试。')
    expect(wrapper.find('[data-testid="user-group-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="refresh-user-groups"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('list-secret')

    mocks.list.mockResolvedValueOnce([])
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-empty"]').text()).toContain('暂无可访问的团队')

    wrapper.unmount()
    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 1 }
    mocks.list.mockResolvedValueOnce([group()])
    const readOnly = mountView()
    await flushPromises()
    expect(readOnly.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(readOnly.find('[data-testid="edit-user-group-3"]').exists()).toBe(false)
    expect(readOnly.find('[data-testid="group-members-3"]').exists()).toBe(false)
    expect(readOnly.text()).toContain('只读')
  })

  it('traps sheet focus, closes with Escape when idle, and restores the trigger', async () => {
    const wrapper = mountView(document.body)
    await flushPromises()
    const trigger = wrapper.get('[data-testid="create-user-group"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="user-group-name"]').element)

    const cancel = wrapper.get('[data-testid="cancel-user-group-editor"]')
    ;(cancel.element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(wrapper.get('[data-testid="mobile-bottom-sheet-close"]').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="user-group-editor-sheet"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })
})
