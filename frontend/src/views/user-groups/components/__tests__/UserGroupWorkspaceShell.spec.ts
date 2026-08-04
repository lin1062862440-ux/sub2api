import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import UserGroupWorkspaceShell from '../UserGroupWorkspaceShell.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const auth = { canManageUserGroups: true }
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => auth,
}))

function mountShell() {
  return mount(UserGroupWorkspaceShell, {
    slots: {
      actions: '<button data-test="workspace-action">action</button>',
      default: '<div data-test="workspace-content">content</div>',
    },
  })
}

describe('UserGroupWorkspaceShell', () => {
  it('keeps the team directory focused without detail tabs', () => {
    const wrapper = mountShell()
    expect(wrapper.find('[data-test^="workspace-tab-"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="workspace-content"]').exists()).toBe(true)
  })

  it('keeps page actions and delegated access status in the shared header', () => {
    auth.canManageUserGroups = false
    const wrapper = mountShell()

    expect(wrapper.get('[data-test="workspace-action"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="workspace-content"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="workspace-read-only"]').exists()).toBe(true)
    auth.canManageUserGroups = true
  })
})
