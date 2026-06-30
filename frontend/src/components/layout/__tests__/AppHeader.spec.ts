import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AppHeader from '../AppHeader.vue'
import { useAuthStore } from '@/stores/auth'
import i18n from '@/i18n'

const routeState = reactive({
  name: 'Dashboard',
  params: {},
  meta: {
    title: '仪表盘',
    description: '欢迎回来！这是您账户的概览。',
  },
})

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

describe('AppHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'zh'
    const authStore = useAuthStore()
    authStore.user = {
      id: 1,
      username: 'tester',
      email: 'tester@example.com',
      role: 'user',
      balance: 8,
      created_at: '2026-06-09T08:00:00Z',
      updated_at: '2026-06-09T08:00:00Z',
    } as any
  })

  it('shows only the page title in the topbar, not the route description', () => {
    const wrapper = mount(AppHeader, {
      global: {
        plugins: [i18n],
        stubs: {
          AnnouncementBell: true,
          LocaleSwitcher: true,
          SubscriptionProgressMini: true,
          ProductIcon: true,
          Icon: true,
          'router-link': true,
        },
      },
    })

    const header = wrapper.get('header')
    expect(header.text()).toContain('仪表盘')
    expect(header.text()).not.toContain('欢迎回来！这是您账户的概览。')
    expect(header.find('p').exists()).toBe(false)
  })
})
