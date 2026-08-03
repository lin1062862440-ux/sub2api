import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupsView from '../UserGroupsView.vue'

const mocks = vi.hoisted(() => ({
  canManage: false,
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  getMembers: vi.fn(),
  getViewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  getPromptViewers: vi.fn(),
  setPromptCapture: vi.fn(),
  replacePromptViewers: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  route: { name: 'UserGroups', query: {} as Record<string, string> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  RouterLink: {
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'zh-CN' } } }),
}))

vi.mock('@/api/admin/users', () => {
  const usersAPI = { list: vi.fn() }
  return { usersAPI, default: usersAPI }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get canManageUserGroups() { return mocks.canManage },
  }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showSuccess: mocks.success, showError: mocks.error }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    archive: mocks.archive,
    getMembers: mocks.getMembers,
    getViewers: mocks.getViewers,
    replaceMembers: mocks.replaceMembers,
    replaceViewers: mocks.replaceViewers,
    getPromptViewers: mocks.getPromptViewers,
    setPromptCapture: mocks.setPromptCapture,
    replacePromptViewers: mocks.replacePromptViewers,
  },
}))

const group = {
  id: 7,
  name: '研发一组',
  description: '核心产品线',
  status: 'active' as const,
  member_count: 1,
  viewer_count: 2,
  prompt_capture_enabled: false,
  can_view_prompt: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

const member = {
  user_id: 11,
  email: 'alice@example.com',
  username: 'Alice',
  status: 'active',
  balance: 18.5,
  joined_at: '2026-08-01T00:00:00Z',
}

function mountView() {
  return mount(UserGroupsView, {
    global: {
      stubs: {
        AppLayout: { template: '<main><slot /></main>' },
        Icon: { template: '<i />' },
        RouterLink: {
          props: ['to'],
          template: '<a><slot /></a>',
        },
        UserGroupPeopleDialog: true,
        Teleport: true,
        ConfirmDialog: {
          props: ['show'],
          emits: ['confirm', 'cancel'],
          template: '<button v-if="show" data-test="confirm-archive" @click="$emit(\'confirm\')">confirm</button>',
        },
      },
    },
  })
}

describe('UserGroupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canManage = false
    mocks.list.mockResolvedValue([group])
    mocks.getMembers.mockResolvedValue([member])
    mocks.getViewers.mockResolvedValue([])
    mocks.getPromptViewers.mockResolvedValue([])
    mocks.create.mockResolvedValue(group)
    mocks.update.mockResolvedValue(group)
    mocks.archive.mockResolvedValue(undefined)
    mocks.setPromptCapture.mockResolvedValue(undefined)
    mocks.replacePromptViewers.mockResolvedValue(undefined)
  })

  it('renders granted groups as a full-width read-only directory with report links', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-test="workspace-read-only"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="group-directory"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="group-roster-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('研发一组')
    expect(wrapper.get('[data-test="open-subscriptions-7"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="open-usage-7"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="manage-members-7"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="archive-group"]').exists()).toBe(false)
    expect(mocks.getMembers).not.toHaveBeenCalled()
    expect(mocks.getViewers).not.toHaveBeenCalled()
  })

  it('loads group people only when an administrator opens a management action', async () => {
    mocks.canManage = true
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getMembers).not.toHaveBeenCalled()
    expect(mocks.getViewers).not.toHaveBeenCalled()

    await wrapper.get('[data-test="manage-members-7"]').trigger('click')
    await flushPromises()

    expect(mocks.getMembers).toHaveBeenCalledWith(7)
    expect(mocks.getViewers).not.toHaveBeenCalled()
  })

  it('lets administrators create, edit, and archive groups', async () => {
    mocks.canManage = true
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="create-group"]').trigger('click')
    await wrapper.get('[data-test="group-name-input"]').setValue('运营组')
    await wrapper.get('[data-test="group-description-input"]').setValue('客户运营')
    await wrapper.get('[data-test="save-group"]').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({ name: '运营组', description: '客户运营' })

    await wrapper.get('[data-test="edit-group"]').trigger('click')
    await wrapper.get('[data-test="group-description-input"]').setValue('核心研发')
    await wrapper.get('[data-test="save-group"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(7, { name: '研发一组', description: '核心研发' })

    await wrapper.get('[data-test="archive-group"]').trigger('click')
    await wrapper.get('[data-test="confirm-archive"]').trigger('click')
    await flushPromises()
    expect(mocks.archive).toHaveBeenCalledWith(7)
  })

  it('shows prompt security settings only to administrators and saves independent viewers', async () => {
    const ordinary = mountView()
    await flushPromises()
    expect(ordinary.find('[data-test="manage-prompt-7"]').exists()).toBe(false)
    ordinary.unmount()

    mocks.canManage = true
    mocks.getPromptViewers.mockResolvedValue([{ ...member, granted_at: member.joined_at }])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="manage-prompt-7"]').trigger('click')
    await flushPromises()
    expect(mocks.getPromptViewers).toHaveBeenCalledWith(7)
    expect(wrapper.get('[data-test="prompt-capture-toggle"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('userGroups.promptSettings.retention')

    await wrapper.get('[data-test="prompt-capture-toggle"]').trigger('click')
    await wrapper.get('[data-test="save-prompt-settings"]').trigger('click')
    await flushPromises()

    expect(mocks.setPromptCapture).toHaveBeenCalledWith(7, true)
    expect(mocks.replacePromptViewers).toHaveBeenCalledWith(7, [11])
    expect(mocks.replaceViewers).not.toHaveBeenCalled()
  })

  it('shows a focused error and retry action when groups cannot load', async () => {
    mocks.list.mockRejectedValueOnce(new Error('network down'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-test="load-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="retry-groups"]').exists()).toBe(true)
  })
})
