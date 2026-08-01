import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import {
  applyLocalClientConfig,
  clearEditableFiles,
  detectLocalClient,
  routeApiKeyClient,
  validateLocalClientFile,
} from './client-config'

describe('client config routing', () => {
  beforeEach(() => {
    invoke.mockReset()
    localStorage.clear()
  })

  it('routes OpenAI directly to Codex and Anthropic to Claude selection', () => {
    expect(routeApiKeyClient('openai')).toEqual({ kind: 'target', target: 'codex' })
    expect(routeApiKeyClient('anthropic')).toEqual({ kind: 'choose_claude' })
  })

  it.each(['gemini', 'antigravity', 'grok', 'composite', '', 'unknown', undefined])(
    'rejects %s',
    (platform) => {
      expect(routeApiKeyClient(platform)).toEqual({
        kind: 'unsupported',
        message: '当前分组暂不支持客户端配置',
      })
    },
  )

  it('clears secret-bearing editor buffers in place', () => {
    const files = [
      {
        path: '/x/auth.json',
        format: 'json' as const,
        content: 'secret',
        fingerprint: 'a',
        exists: true,
      },
    ]
    clearEditableFiles(files)
    expect(files[0].content).toBe('')
  })

  it('wraps Tauri command arguments without changing their shape', async () => {
    invoke.mockResolvedValue(undefined)
    const input = {
      target: 'codex' as const,
      apiKeyId: 7,
      groupPlatform: 'openai',
    }
    await detectLocalClient(input)
    await validateLocalClientFile({ path: '/x/config.toml', format: 'toml', content: '' })
    await applyLocalClientConfig('preview-1')

    expect(invoke).toHaveBeenNthCalledWith(1, 'detect_local_client', { input })
    expect(invoke).toHaveBeenNthCalledWith(2, 'validate_local_client_file', {
      input: { path: '/x/config.toml', format: 'toml', content: '' },
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'apply_local_client_config', {
      previewId: 'preview-1',
    })
  })
})
