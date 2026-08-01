import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: {
    offline: false,
    settings: {
      site_name: 'LinAI',
      site_logo: 'data:image/png;base64,brand',
      site_subtitle: '让每一位上帝感受 AI 的爱',
    },
  },
}))

vi.mock('@/stores/session', () => ({ session: mocks.session }))

import AuthShell from './AuthShell.vue'

const brandMotionStub = {
  props: ['logo'],
  template: '<div data-testid="brand-motion" :data-logo="logo" />',
}

function mountAuthShell() {
  return mount(AuthShell, {
    props: {
      title: '创建账号',
      subtitle: '填写账户信息。',
    },
    slots: {
      default: '<form data-testid="auth-content" />',
    },
    global: {
      stubs: {
        BrandMotion: brandMotionStub,
      },
    },
  })
}

describe('AuthShell', () => {
  beforeEach(() => {
    mocks.session.offline = false
  })

  it('uses shared brand motion without the old slogan or connection status', () => {
    const wrapper = mountAuthShell()

    expect(wrapper.get('[data-testid="brand-name"]').text()).toBe('LinAI')
    expect(wrapper.get('[data-testid="brand-motion"]').attributes('data-logo')).toBe(
      mocks.session.settings.site_logo,
    )
    expect(wrapper.text()).not.toContain(mocks.session.settings.site_subtitle)
    expect(wrapper.text()).not.toContain('安全连接已就绪')
    expect(wrapper.text()).not.toContain('lynn.lat')
  })

  it('preserves the draggable shell and interactive form surface', () => {
    const wrapper = mountAuthShell()

    expect(wrapper.get('.auth-shell').classes()).toContain('drag-region')
    expect(wrapper.get('.auth-shell__form-wrap').classes()).toContain('no-drag')
    expect(wrapper.find('[data-testid="auth-content"]').exists()).toBe(true)
  })

  it('does not restore the removed status block when offline', () => {
    mocks.session.offline = true
    const wrapper = mountAuthShell()

    expect(wrapper.find('.auth-shell__status').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('暂时无法连接')
  })
})
