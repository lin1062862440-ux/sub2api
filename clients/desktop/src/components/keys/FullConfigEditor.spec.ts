import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  validateLocalClientFile: vi.fn(),
  previewExpertLocalClientConfig: vi.fn(),
  applyLocalClientConfig: vi.fn(),
}))

vi.mock('@/lib/client-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client-config')>()
  return { ...actual, ...mocks }
})

import FullConfigEditor from './FullConfigEditor.vue'

const editableCodexFiles = [
  {
    path: '/tmp/.codex/config.toml',
    format: 'toml' as const,
    exists: true,
    fingerprint: 'config-fingerprint',
    content: 'model_provider = "linai"\n',
  },
  {
    path: '/tmp/.codex/auth.json',
    format: 'json' as const,
    exists: true,
    fingerprint: 'auth-fingerprint',
    content: '{}\n',
  },
]

describe('FullConfigEditor', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.validateLocalClientFile.mockResolvedValue({ valid: true })
    mocks.previewExpertLocalClientConfig.mockResolvedValue({
      previewId: 'expert-1',
      target: 'codex',
      mode: 'expert',
      restartRequired: false,
      files: [],
    })
    mocks.applyLocalClientConfig.mockResolvedValue({
      target: 'codex',
      changedPaths: ['/tmp/.codex/config.toml'],
      backupPath: '/tmp/backups/expert',
      restartRequired: false,
    })
  })

  it('edits complete files, validates, resets, and blocks an invalid preview', async () => {
    mocks.validateLocalClientFile.mockResolvedValueOnce({
      valid: false,
      message: 'TOML 格式错误',
      line: 1,
      column: 12,
    })
    const wrapper = mount(FullConfigEditor, {
      props: {
        files: editableCodexFiles,
        target: 'codex',
        apiKeyId: 12,
        groupPlatform: 'openai',
      },
    })
    expect(wrapper.text()).toContain('config.toml')
    expect(wrapper.text()).toContain('auth.json')
    await wrapper.get('[data-testid="expert-content"]').setValue('invalid = [')
    await wrapper.get('[data-testid="expert-preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="validation-error"]').text()).toContain('第 1 行')
    expect(mocks.previewExpertLocalClientConfig).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="expert-reset"]').trigger('click')
    expect((wrapper.get('[data-testid="expert-content"]').element as HTMLTextAreaElement).value)
      .toContain('model_provider')
  })

  it('requires the full-file risk confirmation before applying', async () => {
    const wrapper = mount(FullConfigEditor, {
      props: {
        files: editableCodexFiles,
        target: 'codex',
        apiKeyId: 12,
        groupPlatform: 'openai',
      },
    })
    await wrapper.get('[data-testid="expert-preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="expert-risk"]').text()).toContain('完整覆盖')
    expect(wrapper.get('[data-testid="expert-confirm"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="expert-risk-check"]').setValue(true)
    expect(wrapper.get('[data-testid="expert-confirm"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="expert-confirm"]').trigger('click')
    await flushPromises()
    expect(mocks.applyLocalClientConfig).toHaveBeenCalledWith('expert-1')
    expect(wrapper.emitted('applied')).toBeTruthy()
  })
})
