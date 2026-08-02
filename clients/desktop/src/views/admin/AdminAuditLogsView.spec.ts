import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }))
vi.mock('@/api/admin/audit', () => ({ listAdminAuditLogs: mocks.list, getAdminAuditLog: mocks.get }))
import View from './AdminAuditLogsView.vue'

const log = {
  id: 12, created_at: '2026-08-02T08:00:00Z', actor_email: 'admin@example.com', actor_role: 'admin',
  auth_method: 'bearer', credential_masked: 'Bearer ***', action: 'user.update', method: 'PUT',
  path: '/api/v1/admin/users/7', request_id: 'req-1', client_ip: '127.0.0.1',
  user_agent: 'LinAI Desktop', status_code: 200, latency_ms: 28, request_body: '{"password":"***"}',
}

describe('AdminAuditLogsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [log], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue(log)
  })

  it('filters and renders audit events', async () => {
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.text()).toContain('user.update')
    await wrapper.get('[data-testid="audit-search"]').setValue('users')
    await wrapper.get('[data-testid="audit-filters"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'users' }))
  })

  it('opens a redacted audit detail', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="audit-log-12"]').trigger('click')
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith(12)
    expect(wrapper.get('[data-testid="audit-detail"]').text()).toContain('Bearer ***')
    expect(wrapper.get('[data-testid="audit-detail"]').text()).toContain('"password": "***"')
  })

  it('shows a specific empty state', async () => {
    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-empty"]').text()).toContain('暂无符合条件的审计事件')
  })

  it('shows a retryable error instead of an empty result after load failure', async () => {
    mocks.list.mockRejectedValueOnce(new Error('audit unavailable')).mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-error"]').text()).toContain('audit unavailable')
    expect(wrapper.find('[data-testid="audit-empty"]').exists()).toBe(false)
    await wrapper.get('[data-testid="retry-audit"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
})
