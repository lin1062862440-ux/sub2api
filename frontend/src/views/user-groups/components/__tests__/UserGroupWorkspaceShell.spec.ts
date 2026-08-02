import { mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupWorkspaceShell from '../UserGroupWorkspaceShell.vue'

const route = reactive({
  name: 'UserGroupSubscriptions',
  query: { group_id: '7' } as Record<string, string>,
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const auth = reactive({ canManageUserGroups: true })
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => auth,
}))

function mountShell() {
  return mount(UserGroupWorkspaceShell, {
    slots: {
      actions: '<button data-test="workspace-action">action</button>',
      default: '<div data-test="workspace-content">content</div>',
    },
    global: {
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('UserGroupWorkspaceShell', () => {
  beforeEach(() => {
    route.name = 'UserGroupSubscriptions'
    route.query = { group_id: '7' }
    auth.canManageUserGroups = true
  })

  it('renders route tabs that preserve the selected group', () => {
    const wrapper = mountShell()
    const links = wrapper.findAllComponents(RouterLinkStub)
    const groupsLink = links.find(link => link.attributes('data-test') === 'workspace-tab-groups')!
    const subscriptionsLink = links.find(link => link.attributes('data-test') === 'workspace-tab-subscriptions')!
    const usageLink = links.find(link => link.attributes('data-test') === 'workspace-tab-usage')!

    expect(groupsLink.props('to')).toEqual({
      name: 'UserGroups',
      query: { group_id: '7' },
    })
    expect(subscriptionsLink.props('to')).toEqual({
      name: 'UserGroupSubscriptions',
      query: { group_id: '7' },
    })
    expect(usageLink.props('to')).toEqual({
      name: 'UserGroupUsage',
      query: { group_id: '7' },
    })
    expect(subscriptionsLink.attributes('aria-current')).toBe('page')
  })

  it('keeps page actions and delegated access status in the shared header', () => {
    auth.canManageUserGroups = false
    const wrapper = mountShell()

    expect(wrapper.get('[data-test="workspace-action"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="workspace-content"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="workspace-read-only"]').exists()).toBe(true)
  })
})
