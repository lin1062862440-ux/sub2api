import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/api'

const mocks = vi.hoisted(() => ({
  detectLocalClient: vi.fn(),
  previewLocalClientConfig: vi.fn(),
  applyLocalClientConfig: vi.fn(),
  readLocalClientFiles: vi.fn(),
  cancelLocalClientPreview: vi.fn(),
}))

vi.mock('@/lib/client-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client-config')>()
  return { ...actual, ...mocks }
})

import UseApiKeyDialog from './UseApiKeyDialog.vue'

function apiKey(platform: string): ApiKey {
  return {
    id: 12,
    user_id: 2,
    key: 'sk-lin-secret',
    name: '开发密钥',
    group_id: 3,
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
    group: {
      id: 3,
      name: platform === 'openai' ? 'OpenAI' : 'Anthropic',
      description: null,
      platform,
      rate_multiplier: 1,
    },
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

describe('UseApiKeyDialog', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.detectLocalClient.mockResolvedValue({
      target: 'claude_code',
      supported: true,
      status: 'not_configured',
      paths: ['/tmp/.claude/settings.json'],
      restartRequired: false,
    })
    mocks.previewLocalClientConfig.mockResolvedValue({
      previewId: 'preview-1',
      target: 'claude_code',
      mode: 'quick',
      restartRequired: false,
      files: [
        {
          path: '/tmp/.claude/settings.json',
          format: 'json',
          changed: true,
          redactedBefore: '{}',
          redactedAfter: '{\n  "ANTHROPIC_AUTH_TOKEN": "••••••••"\n}',
        },
      ],
    })
    mocks.applyLocalClientConfig.mockResolvedValue({
      target: 'claude_code',
      changedPaths: ['/tmp/.claude/settings.json'],
      backupPath: '/tmp/backups/one',
      restartRequired: false,
    })
    mocks.cancelLocalClientPreview.mockResolvedValue(undefined)
  })

  it('lets an Anthropic key choose Claude and previews before applying', async () => {
    const wrapper = mount(UseApiKeyDialog, {
      props: { apiKey: apiKey('anthropic'), baseUrl: 'https://lynn.lat/v1' },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    await wrapper.get('[data-testid="target-claude-code"]').trigger('click')
    await flushPromises()
    expect(mocks.detectLocalClient).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'claude_code' }),
    )

    await wrapper.get('[data-testid="quick-preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="config-diff"]').text()).toContain('settings.json')
    expect(mocks.applyLocalClientConfig).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(mocks.applyLocalClientConfig).toHaveBeenCalledWith('preview-1')
    expect(wrapper.text()).toContain('新会话生效')
  })

  it('opens an OpenAI key directly on Codex', async () => {
    mocks.detectLocalClient.mockResolvedValue({
      target: 'codex',
      supported: true,
      status: 'other_config',
      paths: ['/tmp/.codex/config.toml', '/tmp/.codex/auth.json'],
      restartRequired: false,
    })
    const wrapper = mount(UseApiKeyDialog, {
      props: { apiKey: apiKey('openai'), baseUrl: 'https://lynn.lat/v1' },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="claude-targets"]').exists()).toBe(false)
    expect(mocks.detectLocalClient).toHaveBeenCalledWith(expect.objectContaining({ target: 'codex' }))
    expect(wrapper.text()).toContain('Codex')
  })

  it('cancels a pending preview when closing', async () => {
    const wrapper = mount(UseApiKeyDialog, {
      props: { apiKey: apiKey('anthropic'), baseUrl: 'https://lynn.lat/v1' },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    await wrapper.get('[data-testid="quick-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="关闭本地客户端配置"]').trigger('click')
    await flushPromises()
    expect(mocks.cancelLocalClientPreview).toHaveBeenCalledWith('preview-1')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
