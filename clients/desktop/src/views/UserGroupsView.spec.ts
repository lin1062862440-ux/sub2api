import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(),
  members: vi.fn(), viewers: vi.fn(), replaceMembers: vi.fn(), replaceViewers: vi.fn(),
  users: vi.fn(),
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_access: true, can_manage: true, group_count: 1 } },
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
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'user-groups', query: {} }) }))

import UserGroupsView from './UserGroupsView.vue'

const group = { id: 3, name: '研发团队', description: '核心研发成员', status: 'active', member_count: 2, viewer_count: 1, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' }

function mountView() {
  return mount(UserGroupsView, {
    global: {
      stubs: {
        Teleport: true,
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
      },
    },
  })
}

describe('UserGroupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.user.role = 'admin'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: true, group_count: 1 }
    mocks.list.mockResolvedValue([group])
    mocks.create.mockResolvedValue(group)
    mocks.update.mockResolvedValue(group)
    mocks.archive.mockResolvedValue(undefined)
    mocks.members.mockResolvedValue([{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 20, joined_at: '' }])
    mocks.viewers.mockResolvedValue([])
    mocks.replaceMembers.mockResolvedValue(undefined)
    mocks.replaceViewers.mockResolvedValue(undefined)
    mocks.users.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 })
  })

  it('renders organizational fields without billing-group fields', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('研发团队')
    expect(wrapper.text()).toContain('成员')
    expect(wrapper.text()).toContain('查看者')
    expect(wrapper.text()).not.toContain('计费倍率')
    expect(wrapper.text()).not.toContain('平台类型')
  })

  it('creates a group and opens member management in centered dialogs', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="create-user-group"]').trigger('click')
    await wrapper.get('[data-testid="user-group-name"]').setValue('运营团队')
    await wrapper.get('[data-testid="user-group-description"]').setValue('运营成员')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({ name: '运营团队', description: '运营成员' })

    await wrapper.get('[data-testid="group-members-3"]').trigger('click')
    await flushPromises()
    expect(mocks.members).toHaveBeenCalledWith(3)
    expect(wrapper.get('[data-testid="user-group-people-dialog"]').text()).toContain('管理成员')
  })

  it('removes all mutation controls for a delegated read-only user', async () => {
    mocks.session.user.role = 'user'
    mocks.session.userGroupCapabilities = { can_access: true, can_manage: false, group_count: 1 }
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('只读访问')
    expect(wrapper.find('[data-testid="create-user-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-user-group-3"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="group-members-3"]').exists()).toBe(false)
  })
})
