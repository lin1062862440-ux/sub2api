import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/api/admin/users', () => ({ listAdminUsers: mocks.list }))

import UserGroupPeopleDialog from './UserGroupPeopleDialog.vue'

const selectedPeople = [{
  user_id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  status: 'active',
  balance: 32,
  joined_at: '2026-08-01T00:00:00Z',
}]

describe('UserGroupPeopleDialog', () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue({
      items: [
        { id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 32, role: 'user', concurrency: 5, allowed_groups: [], notes: '', created_at: '', updated_at: '' },
        { id: 9, username: 'Chen', email: 'chen@example.com', status: 'active', balance: 10, role: 'user', concurrency: 5, allowed_groups: [], notes: '', created_at: '', updated_at: '' },
      ],
      total: 2,
      page: 1,
      page_size: 100,
    })
  })

  it('searches, toggles and saves a complete member set', async () => {
    const wrapper = mount(UserGroupPeopleDialog, {
      props: { modelValue: true, mode: 'members', groupName: '研发团队', selectedPeople },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('研发团队')
    expect(wrapper.text()).toContain('成员会进入该团队的配额与用量统计')
    const people = wrapper.findAll('.ug-person')
    expect(people).toHaveLength(2)
    await people[1]!.trigger('click')
    await wrapper.get('[data-testid="save-people"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual([[7, 9]])

    await wrapper.get('[data-testid="people-search"]').setValue('chen')
    await wrapper.get('.ug-people-search').trigger('submit')
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'chen' }))
  })

  it('uses read-only viewer copy', async () => {
    const wrapper = mount(UserGroupPeopleDialog, {
      props: { modelValue: true, mode: 'viewers', groupName: '研发团队', selectedPeople: [] },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('查看者仅获得只读访问权限')
  })

  it('closes from the backdrop and Escape but stays open while saving', async () => {
    const wrapper = mount(UserGroupPeopleDialog, {
      props: { modelValue: true, mode: 'members', groupName: '研发团队', selectedPeople },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="user-group-people-dialog"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])

    await document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)

    await wrapper.setProps({ saving: true })
    await document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
  })
})
