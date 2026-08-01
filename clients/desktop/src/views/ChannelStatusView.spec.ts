import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getChannelMonitors: vi.fn(),
  getChannelMonitorDetail: vi.fn(),
}))

vi.mock('@/api', () => ({
  getChannelMonitors: mocks.getChannelMonitors,
  getChannelMonitorDetail: mocks.getChannelMonitorDetail,
}))

import ChannelStatusView from './ChannelStatusView.vue'

const monitors = {
  items: [
    {
      id: 1,
      name: 'Claude 主线路',
      provider: 'anthropic',
      group_name: 'Claude 通用',
      primary_model: 'claude-sonnet-4',
      primary_status: 'operational',
      primary_latency_ms: 682,
      primary_ping_latency_ms: 86,
      availability_7d: 99.96,
      extra_models: [{ model: 'claude-opus-4', status: 'operational', latency_ms: 924 }],
      timeline: [
        { status: 'operational', latency_ms: 682, ping_latency_ms: 86, checked_at: '2026-08-01T06:00:00Z' },
      ],
    },
    {
      id: 2,
      name: 'OpenAI 高速线路',
      provider: 'openai',
      group_name: 'OpenAI 高速',
      primary_model: 'gpt-5.2-codex',
      primary_status: 'degraded',
      primary_latency_ms: 1840,
      primary_ping_latency_ms: 122,
      availability_7d: 97.42,
      extra_models: [],
      timeline: [],
    },
  ],
}

describe('ChannelStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getChannelMonitors.mockResolvedValue(monitors)
    mocks.getChannelMonitorDetail.mockResolvedValue({
      id: 1,
      name: 'Claude 主线路',
      provider: 'anthropic',
      group_name: 'Claude 通用',
      models: [
        {
          model: 'claude-sonnet-4',
          latest_status: 'operational',
          latest_latency_ms: 682,
          availability_7d: 99.96,
          availability_15d: 99.9,
          availability_30d: 99.82,
          avg_latency_7d_ms: 714,
        },
      ],
    })
  })

  it('summarizes overall availability and exposes degraded channels', async () => {
    const wrapper = mount(ChannelStatusView)
    await flushPromises()

    expect(mocks.getChannelMonitors).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="channel-summary"]').text()).toContain('1 个需要关注')
    expect(wrapper.text()).toContain('Claude 主线路')
    expect(wrapper.text()).toContain('99.96%')
    expect(wrapper.text()).toContain('响应偏慢')
  })

  it('loads multi-window model details when a channel is opened', async () => {
    const wrapper = mount(ChannelStatusView)
    await flushPromises()

    await wrapper.get('[data-testid="channel-card-1"]').trigger('click')
    await flushPromises()

    expect(mocks.getChannelMonitorDetail).toHaveBeenCalledWith(1)
    expect(wrapper.get('[data-testid="channel-detail"]').text()).toContain('30 天')
    expect(wrapper.get('[data-testid="channel-detail"]').text()).toContain('99.82%')
  })
})
