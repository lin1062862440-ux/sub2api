import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), run: vi.fn(), history: vi.fn(),
}))
vi.mock('@/api/admin/channel-monitors', () => ({
  listAdminChannelMonitors: mocks.list,
  getAdminChannelMonitor: mocks.get,
  createAdminChannelMonitor: mocks.create,
  updateAdminChannelMonitor: mocks.update,
  deleteAdminChannelMonitor: mocks.remove,
  runAdminChannelMonitor: mocks.run,
  getAdminChannelMonitorHistory: mocks.history,
}))
import View from './AdminChannelMonitorsView.vue'

const monitor = {
  id: 4, name: 'Claude Monitor', provider: 'anthropic', api_mode: 'chat_completions',
  endpoint: 'https://api.example.com', api_key_masked: 'sk-***', primary_model: 'claude-sonnet-4',
  extra_models: [], group_name: 'Claude Code', enabled: true, interval_seconds: 300, jitter_seconds: 0,
  last_checked_at: '2026-08-02T08:00:00Z', created_at: '', updated_at: '', primary_status: 'operational',
  primary_latency_ms: 420, availability_7d: 99.9,
}

describe('AdminChannelMonitorsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
    mocks.list.mockResolvedValue({ items: [monitor], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue(monitor)
    mocks.create.mockResolvedValue(monitor)
    mocks.update.mockResolvedValue({ ...monitor, enabled: false })
    mocks.remove.mockResolvedValue(undefined)
    mocks.run.mockResolvedValue({ results: [{ id: 1, model: 'claude-sonnet-4', status: 'operational', latency_ms: 390, ping_latency_ms: 40, message: 'ok', checked_at: '2026-08-02T08:01:00Z' }] })
    mocks.history.mockResolvedValue({ items: [{ id: 1, model: 'claude-sonnet-4', status: 'operational', latency_ms: 390, ping_latency_ms: 40, message: 'ok', checked_at: '2026-08-02T08:01:00Z' }] })
  })

  it('renders monitor health and runs a check with history', async () => {
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.text()).toContain('99.90%')
    await wrapper.get('[data-testid="run-monitor-4"]').trigger('click')
    await flushPromises()
    expect(mocks.run).toHaveBeenCalledWith(4)
    expect(wrapper.get('[data-testid="monitor-history"]').text()).toContain('390ms')
  })

  it('creates a common monitor configuration', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="create-monitor"]').trigger('click')
    await wrapper.get('[data-testid="monitor-name"]').setValue('New monitor')
    await wrapper.get('[data-testid="monitor-endpoint"]').setValue('https://api.example.com')
    await wrapper.get('[data-testid="monitor-api-key"]').setValue('secret')
    await wrapper.get('[data-testid="monitor-model"]').setValue('claude-sonnet-4')
    await wrapper.get('[data-testid="monitor-editor"]').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New monitor', provider: 'anthropic', interval_seconds: 300 }))
  })

  it('shows empty and retryable error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('monitor unavailable')).mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.get('[data-testid="monitor-error"]').text()).toContain('monitor unavailable')
    await wrapper.get('[data-testid="retry-monitors"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="monitor-empty"]').text()).toContain('暂无渠道监控')
  })

  it('requires confirmation before deleting a monitor', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="delete-monitor-4"]').trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="delete-monitor-4"]').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith(4)
  })
})
