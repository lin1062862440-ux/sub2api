import { mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import UserGroupDetailShell from '../UserGroupDetailShell.vue'

const route = reactive({ name: 'UserGroupPlanQuota' })

vi.mock('vue-router', () => ({
  useRoute: () => route,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const group = {
  id: 7,
  name: 'Team A',
  description: 'Product engineering',
  status: 'active' as const,
  member_count: 2,
  viewer_count: 1,
  can_view_prompt: false,
  created_at: '',
  updated_at: '',
}

describe('UserGroupDetailShell', () => {
  it('renders contextual detail tabs for one team', () => {
    const wrapper = mount(UserGroupDetailShell, {
      props: { group },
      global: { stubs: { RouterLink: RouterLinkStub, Icon: true } },
    })

    expect(wrapper.get('[data-test="back-to-group-list"]').exists()).toBe(true)
    expect(wrapper.getComponent('[data-test="group-detail-tab-members"]').props('to')).toEqual({ name: 'UserGroupMembers', params: { id: '7' } })
    expect(wrapper.getComponent('[data-test="group-detail-tab-planQuota"]').props('to')).toEqual({ name: 'UserGroupPlanQuota', params: { id: '7' } })
    expect(wrapper.getComponent('[data-test="group-detail-tab-usage"]').props('to')).toEqual({ name: 'UserGroupUsage', params: { id: '7' } })
    expect(wrapper.get('[data-test="group-detail-tab-planQuota"]').attributes('aria-current')).toBe('page')
  })

  it('shows delegated access without changing the team header', () => {
    const wrapper = mount(UserGroupDetailShell, {
      props: { group, readOnly: true },
      global: { stubs: { RouterLink: RouterLinkStub, Icon: true } },
    })

    expect(wrapper.text()).toContain('Team A')
    expect(wrapper.get('[data-test="detail-read-only"]').exists()).toBe(true)
  })
})
