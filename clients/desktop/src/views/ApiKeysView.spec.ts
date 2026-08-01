import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  getApiKeyGroups: vi.fn(),
  getApiKeyUsage: vi.fn(),
  getDashboardStats: vi.fn(),
  updateApiKey: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  detectLocalClient: vi.fn(),
}))

vi.mock('@/api', () => ({
  getApiKeys: mocks.getApiKeys,
  getApiKeyGroups: mocks.getApiKeyGroups,
  getApiKeyUsage: mocks.getApiKeyUsage,
  getDashboardStats: mocks.getDashboardStats,
  updateApiKey: mocks.updateApiKey,
  createApiKey: mocks.createApiKey,
  deleteApiKey: mocks.deleteApiKey,
}))

vi.mock('@/stores/session', () => ({
  session: { settings: { api_base_url: 'https://lynn.lat/v1' } },
}))

vi.mock('@/lib/client-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client-config')>()
  return { ...actual, detectLocalClient: mocks.detectLocalClient }
})

import UseApiKeyDialog from '@/components/keys/UseApiKeyDialog.vue'
import ApiKeysView from './ApiKeysView.vue'

function key(id: number, platform: string) {
  return {
    id,
    user_id: 1,
    key: `sk-lin-${platform}-secret`,
    name: `${platform} key`,
    group_id: id,
    status: 'active',
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: null,
    last_used_ip: null,
    quota: 0,
    quota_used: 0,
    expires_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    current_concurrency: 0,
    group: { id, name: platform, description: null, platform, rate_multiplier: 1 },
    rate_limit_5h: 0,
    rate_limit_1d: 0,
    rate_limit_7d: 0,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
  }
}

describe('ApiKeysView local client entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const items = [key(1, 'anthropic'), key(2, 'openai'), key(3, 'gemini')]
    mocks.getApiKeys.mockResolvedValue({ items, total: items.length, pages: 1 })
    mocks.getApiKeyGroups.mockResolvedValue(items.map((item) => item.group))
    mocks.getApiKeyUsage.mockResolvedValue({ stats: {} })
    mocks.getDashboardStats.mockResolvedValue({ total_api_keys: 3, active_api_keys: 3 })
    mocks.detectLocalClient.mockResolvedValue({
      target: 'claude_code',
      supported: true,
      status: 'not_configured',
      paths: ['/tmp/settings.json'],
      restartRequired: false,
    })
  })

  it('opens Use for supported groups and explains unsupported groups', async () => {
    const wrapper = mount(ApiKeysView, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    const useButtons = wrapper.findAll('[data-testid="use-api-key"]')
    expect(useButtons).toHaveLength(3)

    await useButtons[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(UseApiKeyDialog).props('apiKey').group?.platform).toBe('anthropic')
    await wrapper.findComponent(UseApiKeyDialog).vm.$emit('close')
    await flushPromises()

    await useButtons[2]!.trigger('click')
    expect(wrapper.text()).toContain('当前分组暂不支持客户端配置')
  })

  it('passes the public API endpoint and never stores the key in the URL', async () => {
    const wrapper = mount(ApiKeysView, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    await wrapper.find('[data-testid="use-api-key"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(UseApiKeyDialog).props('baseUrl')).toBe('https://lynn.lat/v1')
    expect(window.location.href).not.toContain('sk-lin-')
  })
})
