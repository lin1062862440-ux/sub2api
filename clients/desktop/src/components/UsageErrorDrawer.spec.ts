import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUsageErrorDetail = vi.hoisted(() => vi.fn())
vi.mock('@/api', () => ({ getUsageErrorDetail }))

import UsageErrorDrawer from './UsageErrorDrawer.vue'

const detail = {
  id: 7, created_at: '2026-08-01T08:30:00Z', model: 'claude-sonnet-4', inbound_endpoint: '/v1/messages',
  status_code: 429, upstream_status_code: 529, category: 'rate_limit', platform: 'anthropic',
  message: '上游请求受限', key_name: 'production-key', key_deleted: false, error_body: '{"error":"overloaded"}',
}

describe('UsageErrorDrawer', () => {
  beforeEach(() => getUsageErrorDetail.mockResolvedValue(detail))

  it('loads user-safe detail and closes on Escape', async () => {
    const wrapper = mount(UsageErrorDrawer, {
      props: { openId: 7 },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(getUsageErrorDetail).toHaveBeenCalledWith(7)
    expect(wrapper.text()).toContain('529')
    expect(wrapper.text()).toContain('overloaded')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('offers retry after a failed detail request', async () => {
    getUsageErrorDetail.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(detail)
    const wrapper = mount(UsageErrorDrawer, {
      props: { openId: 7 },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('错误详情加载失败')
    await wrapper.get('[data-testid="retry-error-detail"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('overloaded')
  })
})
