import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(),
  members: vi.fn(),
  viewers: vi.fn(),
  promptViewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  setPromptCapture: vi.fn(),
  replacePromptViewers: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  users: vi.fn(),
  replaceRoute: vi.fn(),
  route: { params: { id: '3' } },
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_manage: true } },
}))

vi.mock('@/api/user-groups', () => ({
  listUserGroups: mocks.groups,
  getUserGroupMembers: mocks.members,
  getUserGroupViewers: mocks.viewers,
  getUserGroupPromptViewers: mocks.promptViewers,
  replaceUserGroupMembers: mocks.replaceMembers,
  replaceUserGroupViewers: mocks.replaceViewers,
  setUserGroupPromptCapture: mocks.setPromptCapture,
  replaceUserGroupPromptViewers: mocks.replacePromptViewers,
  updateUserGroup: mocks.update,
  archiveUserGroup: mocks.archive,
}))
vi.mock('@/api/admin/users', () => ({ listAdminUsers: mocks.users }))
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replaceRoute }),
}))

import UserGroupMembersView from './UserGroupMembersView.vue'

describe('UserGroupMembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.user = { role: 'admin' }
    mocks.session.userGroupCapabilities = { can_manage: true }
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, prompt_capture_enabled: true, created_at: '', updated_at: '' }])
    mocks.members.mockResolvedValue([{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', joined_at: '' }])
    mocks.promptViewers.mockResolvedValue([{ user_id: 9, username: 'Reviewer', email: 'reviewer@example.com', status: 'active', granted_at: '' }])
    mocks.users.mockResolvedValue({ items: [{ id: 9, username: 'Reviewer', email: 'reviewer@example.com', role: 'user', balance: 0, concurrency: 1, status: 'active', allowed_groups: [], notes: '', created_at: '', updated_at: '' }] })
    mocks.setPromptCapture.mockResolvedValue(undefined)
    mocks.replacePromptViewers.mockResolvedValue(undefined)
  })

  afterEach(() => { document.body.innerHTML = '' })

  it('lets an administrator configure capture and explicit Prompt viewers', async () => {
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    await wrapper.get('[data-testid="manage-team-prompts"]').trigger('click')
    await flushPromises()
    expect(mocks.promptViewers).toHaveBeenCalledWith(3)
    expect(document.body.textContent).toContain('管理员不会自动获得查看权限')

    const save = document.body.querySelector<HTMLButtonElement>('[data-testid="save-prompt-settings"]')
    expect(save).not.toBeNull()
    save!.click()
    await flushPromises()

    expect(mocks.setPromptCapture).toHaveBeenCalledWith(3, true)
    expect(mocks.replacePromptViewers).toHaveBeenCalledWith(3, [9])
    expect(wrapper.text()).toContain('Prompt 设置已更新')
  })

  it('keeps Prompt configuration hidden from team managers', async () => {
    mocks.session.user = { role: 'user' }
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="manage-team-members"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="manage-team-prompts"]').exists()).toBe(false)
  })
})
