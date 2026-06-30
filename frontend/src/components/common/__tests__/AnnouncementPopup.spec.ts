import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AnnouncementPopup from '../AnnouncementPopup.vue'
import { useAnnouncementStore } from '@/stores/announcements'
import i18n from '@/i18n'

describe('AnnouncementPopup', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('renders the refreshed product-style announcement dialog', async () => {
    const store = useAnnouncementStore()
    store.currentPopup = {
      id: 101,
      title: '系统维护通知',
      content: '请在维护窗口前保存 API Key 配置。\n\n- 维护期间请求可能延迟',
      status: 'active',
      notify_mode: 'popup',
      created_at: '2026-06-09T08:00:00Z',
      updated_at: '2026-06-09T08:00:00Z',
      read_at: null,
    } as any

    mount(AnnouncementPopup, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
    })

    await Promise.resolve()

    expect(document.body.textContent).toContain('系统维护通知')
    expect(document.body.textContent).toContain('请在维护窗口前保存 API Key 配置。')
    expect(document.body.textContent).toContain('announcements.unread')
    expect(document.body.textContent).toContain('announcements.markRead')
    expect(document.body.querySelector('.rounded-2xl.border.border-gray-200')).not.toBeNull()
    expect(document.body.querySelector('.bg-primary-50.text-primary-700')).not.toBeNull()
  })
})
