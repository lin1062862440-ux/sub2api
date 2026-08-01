import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  replace: vi.fn(),
  handoff: { email: 'lin@gmail.com', token: 'abc123' } as { email: string; token: string } | null,
  clearResetHandoff: vi.fn(),
  session: { offline: false, settings: { site_name: 'LinAI', site_logo: '', site_subtitle: 'LinAI' } },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/api', () => ({ resetPassword: mocks.resetPassword }))
vi.mock('@/lib/deep-link', () => ({ consumeResetHandoff: () => mocks.handoff, clearResetHandoff: mocks.clearResetHandoff }))
vi.mock('@/stores/session', () => ({ session: mocks.session, reloadSettings: vi.fn() }))

import ResetPasswordView from './ResetPasswordView.vue'

describe('ResetPasswordView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handoff = { email: 'lin@gmail.com', token: 'abc123' }
  })

  it('resets the password with the in-memory token and returns to login', async () => {
    mocks.resetPassword.mockResolvedValue({ message: 'reset' })
    const wrapper = mount(ResetPasswordView)
    await wrapper.get('[data-testid="reset-password"]').setValue('secret1')
    await wrapper.get('[data-testid="reset-password-confirm"]').setValue('secret1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.resetPassword).toHaveBeenCalledWith({ email: 'lin@gmail.com', token: 'abc123', new_password: 'secret1' })
    expect(mocks.clearResetHandoff).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="reset-success"]').exists()).toBe(true)
  })

  it('shows an invalid-link state when no handoff exists', () => {
    mocks.handoff = null
    const wrapper = mount(ResetPasswordView)
    expect(wrapper.find('[data-testid="reset-invalid-link"]').exists()).toBe(true)
  })
})
