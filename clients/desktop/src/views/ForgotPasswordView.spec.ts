import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  replace: vi.fn(),
  session: {
    offline: false,
    settings: {
      site_name: 'LinAI',
      site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
      site_subtitle: 'LinAI',
      registration_enabled: true,
      password_reset_enabled: true,
      turnstile_enabled: false,
      turnstile_site_key: '',
    },
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/api', () => ({ forgotPassword: mocks.forgotPassword }))
vi.mock('@/stores/session', () => ({ session: mocks.session, reloadSettings: vi.fn() }))

import ForgotPasswordView from './ForgotPasswordView.vue'

describe('ForgotPasswordView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests a desktop reset link and shows a neutral success state', async () => {
    mocks.forgotPassword.mockResolvedValue({ message: 'sent' })
    const wrapper = mount(ForgotPasswordView)
    await wrapper.get('[data-testid="forgot-email"]').setValue('lin@gmail.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.forgotPassword).toHaveBeenCalledWith({ email: 'lin@gmail.com', reset_target: 'desktop' })
    expect(wrapper.get('[data-testid="forgot-success"]').text()).toContain('如果邮箱已注册')
  })
})
