import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), read: vi.fn(),
}))
vi.mock('@/api/admin/announcements', () => ({
  listAdminAnnouncements: mocks.list,
  createAdminAnnouncement: mocks.create,
  updateAdminAnnouncement: mocks.update,
  deleteAdminAnnouncement: mocks.remove,
  getAdminAnnouncementReadStatus: mocks.read,
}))

import View from './AdminAnnouncementsView.vue'

const notice = {
  id: 8,
  title: '系统通知',
  content: '今晚维护',
  status: 'draft',
  notify_mode: 'silent',
  targeting: {},
  created_at: '2026-08-02T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

describe('AdminAnnouncementsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
    mocks.list.mockResolvedValue({ items: [notice], total: 1, page: 1, page_size: 20 })
    mocks.create.mockResolvedValue(notice)
    mocks.update.mockResolvedValue({ ...notice, status: 'active' })
    mocks.remove.mockResolvedValue({ message: 'ok' })
    mocks.read.mockResolvedValue({
      items: [{ user_id: 7, email: 'lin@example.com', username: 'Lin', balance: 20, eligible: true, read_at: '2026-08-02' }],
      total: 1,
      page: 1,
      page_size: 20,
    })
  })

  it('creates and publishes an announcement', async () => {
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('公告管理')
    await wrapper.get('[data-testid="create-announcement"]').trigger('click')
    await wrapper.get('[data-testid="announcement-title"]').setValue('New notice')
    await wrapper.get('[data-testid="announcement-content"]').setValue('Hello')
    await wrapper.get('[data-testid="announcement-editor"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New notice', content: 'Hello', status: 'draft', notify_mode: 'silent', targeting: {},
    }))
    await wrapper.get('[data-testid="publish-announcement-8"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(8, { status: 'active' })
  })

  it('opens read status for an announcement', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="read-announcement-8"]').trigger('click')
    await flushPromises()
    expect(mocks.read).toHaveBeenCalledWith(8, { page: 1, page_size: 20 })
    expect(wrapper.get('[data-testid="announcement-read-status"]').text()).toContain('lin@example.com')
  })

  it('shows an empty state when there are no announcements', async () => {
    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('[data-testid="announcement-empty"]').text()).toContain('暂无公告')
  })

  it('shows a retryable error when announcements cannot load', async () => {
    mocks.list.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('[data-testid="announcement-error"]').text()).toContain('network down')
    await wrapper.get('[data-testid="retry-announcements"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('requires confirmation before deleting an announcement', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="delete-announcement-8"]').trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="delete-announcement-8"]').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith(8)
  })
})
