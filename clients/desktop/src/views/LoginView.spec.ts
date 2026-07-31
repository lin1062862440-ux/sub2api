import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWith2FA: vi.fn(),
  completeLogin: vi.fn(),
  reloadSettings: vi.fn(),
  replace: vi.fn(),
  openUrl: vi.fn(),
  session: {
    ready: true,
    user: null,
    runMode: 'standard',
    offline: false,
    settings: null as Record<string, unknown> | null,
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }))

vi.mock('@/api', () => ({
  login: mocks.login,
  loginWith2FA: mocks.loginWith2FA,
  isTotpRequired: (value: { requires_2fa?: boolean }) => value.requires_2fa === true,
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  completeLogin: mocks.completeLogin,
  reloadSettings: mocks.reloadSettings,
}))

vi.mock('@/lib/http', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
}))

import LoginView from './LoginView.vue'

const settings = {
  site_name: 'LinAI',
  site_logo: 'data:image/svg+xml;base64,PHN2Zy8+',
  site_subtitle: '让每一位上帝感受 AI 的爱',
  registration_enabled: true,
  password_reset_enabled: true,
  linuxdo_oauth_enabled: false,
  oidc_oauth_enabled: false,
  oidc_oauth_provider_name: '',
  github_oauth_enabled: false,
  google_oauth_enabled: false,
  wechat_oauth_enabled: false,
}

function mountLogin() {
  return mount(LoginView)
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.offline = false
    mocks.session.settings = { ...settings }
  })

  it('renders LinAI branding and platform-controlled account links', () => {
    const wrapper = mountLogin()

    expect(wrapper.get('[data-testid="brand-name"]').text()).toBe('LinAI')
    expect(wrapper.get('[data-testid="registration-link"]').text()).toContain('创建账号')
    expect(wrapper.get('[data-testid="password-reset-link"]').text()).toContain('找回密码')
  })

  it('keeps login disabled until both credentials are present', async () => {
    const wrapper = mountLogin()
    const submit = wrapper.get('[data-testid="login-submit"]')

    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="email-input"]').setValue('user@example.com')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="password-input"]').setValue('secret')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('submits trimmed credentials and opens the dashboard', async () => {
    const auth = {
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      user: { id: 1, username: 'lin', email: 'lin@example.com' },
    }
    mocks.login.mockResolvedValue(auth)
    const wrapper = mountLogin()

    await wrapper.get('[data-testid="email-input"]').setValue('  lin@example.com  ')
    await wrapper.get('[data-testid="password-input"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.login).toHaveBeenCalledWith({ email: 'lin@example.com', password: 'secret' })
    expect(mocks.completeLogin).toHaveBeenCalledWith(auth)
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'dashboard' })
  })

  it('moves to the TOTP stage when the backend requires it', async () => {
    mocks.login.mockResolvedValue({
      requires_2fa: true,
      temp_token: 'temp-token',
      user_email_masked: 'l***@example.com',
    })
    const wrapper = mountLogin()

    await wrapper.get('[data-testid="email-input"]').setValue('lin@example.com')
    await wrapper.get('[data-testid="password-input"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="totp-input"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('l***@example.com')
  })

  it('shows a retryable offline status', async () => {
    mocks.session.offline = true
    const wrapper = mountLogin()

    await wrapper.get('[data-testid="offline-retry"]').trigger('click')

    expect(wrapper.get('[data-testid="offline-status"]').text()).toContain('暂时无法连接')
    expect(mocks.reloadSettings).toHaveBeenCalledOnce()
  })
})
