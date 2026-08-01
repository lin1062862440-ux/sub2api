import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupPeopleDialog from '../UserGroupPeopleDialog.vue'

const listUsers = vi.hoisted(() => vi.fn())

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/admin/users', () => ({
  usersAPI: { list: listUsers },
}))

describe('UserGroupPeopleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listUsers.mockResolvedValue({
      items: [
        { id: 1, email: 'alice@example.com', username: 'Alice', status: 'active' },
        { id: 2, email: 'bob@example.com', username: 'Bob', status: 'active' },
        { id: 3, email: 'disabled@example.com', username: 'Disabled', status: 'disabled' },
      ],
      total: 3,
    })
  })

  it('loads active users and emits the complete selected ID set', async () => {
    const wrapper = mount(UserGroupPeopleDialog, {
      props: {
        show: true,
        mode: 'members',
        groupName: '研发一组',
        selectedIds: [1, 3],
      },
      global: {
        stubs: { Icon: { template: '<i />' }, Teleport: true },
      },
      attachTo: document.body,
    })
    await flushPromises()

    expect(listUsers).toHaveBeenCalledWith(1, 100, { search: undefined })
    const bob = wrapper.get('[data-test="person-2"]')
    await bob.setValue(true)
    await wrapper.get('[data-test="save-people"]').trigger('click')

    expect(wrapper.emitted('save')?.[0]).toEqual([[1, 2, 3]])
    wrapper.unmount()
  })

  it('searches users by email or username', async () => {
    const wrapper = mount(UserGroupPeopleDialog, {
      props: { show: true, mode: 'viewers', groupName: '研发一组', selectedIds: [] },
      global: { stubs: { Icon: { template: '<i />' }, Teleport: true } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-test="people-search"]').setValue('bob')
    await wrapper.get('[data-test="people-search"]').trigger('keyup.enter')
    await flushPromises()

    expect(listUsers).toHaveBeenLastCalledWith(1, 100, { search: 'bob' })
    wrapper.unmount()
  })
})
