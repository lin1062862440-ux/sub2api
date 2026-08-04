import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupMembersView from '../UserGroupMembersView.vue'

const mocks = vi.hoisted(() => ({
  canManage: true,
  list: vi.fn(),
  getMembers: vi.fn(),
  getViewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  getPromptViewers: vi.fn(),
  setPromptCapture: vi.fn(),
  replacePromptViewers: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, name: 'UserGroupMembers' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'en-US' } } }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: {
    list: mocks.list,
    getMembers: mocks.getMembers,
    getViewers: mocks.getViewers,
    replaceMembers: mocks.replaceMembers,
    replaceViewers: mocks.replaceViewers,
    getPromptViewers: mocks.getPromptViewers,
    setPromptCapture: mocks.setPromptCapture,
    replacePromptViewers: mocks.replacePromptViewers,
    update: mocks.update,
    archive: mocks.archive,
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ get canManageUserGroups() { return mocks.canManage } }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showSuccess: mocks.success, showError: mocks.error }),
}))

vi.mock('@/utils/avatar', () => ({ resolveAvatarUrl: () => '/avatar.png' }))

const group = {
  id: 7,
  name: 'Team A',
  description: 'Product engineering',
  status: 'active' as const,
  member_count: 1,
  viewer_count: 2,
  prompt_capture_enabled: true,
  can_view_prompt: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

const member = {
  user_id: 11,
  email: 'alice@example.com',
  username: 'Alice',
  status: 'active',
  joined_at: '2026-08-01T00:00:00Z',
}

function mountView() {
  return mount(UserGroupMembersView, {
    global: {
      stubs: {
        AppLayout: { template: '<main><slot /></main>' },
        UserGroupDetailShell: { template: '<section><slot name="actions" /><slot /></section>' },
        Icon: true,
        UserGroupEditorDialog: true,
        UserGroupPeopleDialog: {
          props: ['show'],
          emits: ['save', 'close'],
          template: '<button v-if="show" data-test="save-people-stub" @click="$emit(\'save\', [11])">save people</button>',
        },
        UserGroupPromptSettingsDialog: true,
        ConfirmDialog: true,
      },
    },
  })
}

describe('UserGroupMembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canManage = true
    mocks.list.mockResolvedValue([group])
    mocks.getMembers.mockResolvedValue([member])
    mocks.getViewers.mockResolvedValue([])
    mocks.getPromptViewers.mockResolvedValue([])
    mocks.replaceMembers.mockResolvedValue(undefined)
  })

  it('loads the selected team and renders its member roster', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getMembers).toHaveBeenCalledWith(7)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.get('[data-test="member-summary"]').text()).toContain('1')
    expect(wrapper.get('[data-test="manage-members"]').exists()).toBe(true)
  })

  it('lets administrators update members from the detail page', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="manage-members"]').trigger('click')
    await wrapper.get('[data-test="save-people-stub"]').trigger('click')
    await flushPromises()

    expect(mocks.replaceMembers).toHaveBeenCalledWith(7, [11])
    expect(mocks.success).toHaveBeenCalledWith('userGroups.groups.peopleSaved')
  })

  it('keeps management controls hidden for delegated viewers', async () => {
    mocks.canManage = false
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="manage-members"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-group"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Alice')
  })
})
