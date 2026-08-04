import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  setCurrentUser: vi.fn(),
  toastSuccess: vi.fn(),
  session: {
    runMode: 'standard',
    user: {
      id: 7,
      username: 'Lin',
      email: 'lin@example.com',
      avatar_url: 'https://cdn.example.com/lin.png',
      role: 'user',
      balance: 12.5,
      concurrency: 10,
      rpm_limit: 60,
      status: 'active',
      created_at: '2026-01-02T03:04:05Z',
      updated_at: '2026-01-02T03:04:05Z',
    },
  },
}))

vi.mock('@/api', () => ({
  getProfile: mocks.getProfile,
  updateProfile: mocks.updateProfile,
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  setCurrentUser: mocks.setCurrentUser,
}))

vi.mock('@/stores/toast', () => ({
  toast: { success: mocks.toastSuccess },
}))

import ProfileView from './ProfileView.vue'

describe('ProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProfile.mockResolvedValue(mocks.session.user)
    mocks.updateProfile.mockImplementation(async (payload: { username: string }) => ({
      ...mocks.session.user,
      ...payload,
    }))
  })

  it('loads the real profile and updates the username in the shared session', async () => {
    const wrapper = mount(ProfileView)
    await flushPromises()

    expect(wrapper.text()).toContain('lin@example.com')
    expect(wrapper.get('[data-testid="identity-console"]').attributes('aria-label')).toBe(
      'LinAI 身份控制台',
    )
    expect(wrapper.findAll('[data-testid="profile-avatar"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="profile-metrics"]').text()).toContain('每分钟请求')
    expect(wrapper.text()).toContain('账户档案')
    expect(wrapper.get('[data-testid="profile-avatar"] img').attributes('src')).toBe(
      'https://cdn.example.com/lin.png',
    )

    await wrapper.get('[data-testid="username-input"]').setValue('LinAI User')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateProfile).toHaveBeenCalledWith({ username: 'LinAI User' })
    expect(mocks.setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'LinAI User' }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('资料已保存')
  })

  it('removes an existing avatar through the profile endpoint', async () => {
    const wrapper = mount(ProfileView)
    await flushPromises()

    await wrapper.get('[data-testid="remove-avatar"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateProfile).toHaveBeenCalledWith({
      username: 'Lin',
      avatar_url: '',
    })
  })
})
