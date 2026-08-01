import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  sendVerifyCode: vi.fn(),
  completeLogin: vi.fn(),
  replace: vi.fn(),
  session: {
    offline: false,
    settings: {
      site_name: 'LinAI',
      site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
      site_subtitle: 'LinAI',
      registration_enabled: true,
      password_reset_enabled: true,
      email_verify_enabled: true,
      registration_email_suffix_whitelist: ['@gmail.com'],
      turnstile_enabled: false,
      turnstile_site_key: '',
    },
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/api', () => ({ register: mocks.register, sendVerifyCode: mocks.sendVerifyCode }))
vi.mock('@/stores/session', () => ({ session: mocks.session, completeLogin: mocks.completeLogin, reloadSettings: vi.fn() }))

import RegisterView from './RegisterView.vue'

describe('RegisterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.settings.registration_enabled = true
    mocks.session.settings.email_verify_enabled = true
  })

  it('rejects an email outside the configured suffix whitelist', async () => {
    const wrapper = mount(RegisterView)
    await wrapper.get('[data-testid="register-username"]').setValue('lin')
    await wrapper.get('[data-testid="register-email"]').setValue('lin@outlook.com')
    await wrapper.get('[data-testid="register-password"]').setValue('secret1')
    await wrapper.get('[data-testid="register-password-confirm"]').setValue('secret1')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('仅支持')
    expect(mocks.sendVerifyCode).not.toHaveBeenCalled()
  })

  it('sends a code, registers with it, and enters the dashboard', async () => {
    mocks.sendVerifyCode.mockResolvedValue({ message: 'sent', countdown: 60 })
    mocks.register.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      user: { id: 1, username: 'lin', email: 'lin@gmail.com' },
    })
    const wrapper = mount(RegisterView)
    await wrapper.get('[data-testid="register-username"]').setValue('lin')
    await wrapper.get('[data-testid="register-email"]').setValue('lin@gmail.com')
    await wrapper.get('[data-testid="register-password"]').setValue('secret1')
    await wrapper.get('[data-testid="register-password-confirm"]').setValue('secret1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.sendVerifyCode).toHaveBeenCalledWith({ email: 'lin@gmail.com' })
    await wrapper.get('[data-testid="register-code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.register).toHaveBeenCalledWith({
      username: 'lin',
      email: 'lin@gmail.com',
      password: 'secret1',
      verify_code: '123456',
    })
    expect(mocks.completeLogin).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'dashboard' })
  })
})
