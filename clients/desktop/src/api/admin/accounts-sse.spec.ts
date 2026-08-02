import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postText: vi.fn() }))
vi.mock('@/lib/http', () => ({ http: { postText: mocks.postText } }))

import { testAdminAccount } from './accounts'

describe('administrator account connectivity test stream', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognizes a successful backend SSE test', async () => {
    mocks.postText.mockResolvedValue([
      'data: {"type":"test_start","model":"claude-sonnet-4"}',
      '',
      'data: {"type":"status","text":"正在验证连接"}',
      '',
      'data: {"type":"test_complete","success":true}',
      '',
    ].join('\n'))

    await expect(testAdminAccount(8, {
      model_id: 'claude-sonnet-4',
      prompt: 'ping',
    })).resolves.toMatchObject({
      success: true,
      message: '连接测试通过',
    })
    expect(mocks.postText).toHaveBeenCalledWith('/admin/accounts/8/test', {
      model_id: 'claude-sonnet-4',
      prompt: 'ping',
    })
  })

  it('surfaces the backend SSE error message', async () => {
    mocks.postText.mockResolvedValue([
      'data: {"type":"test_start","model":"claude-sonnet-4"}',
      '',
      'data: {"type":"error","error":"refresh token expired"}',
      '',
    ].join('\n'))

    await expect(testAdminAccount(8)).rejects.toThrow('refresh token expired')
  })

  it('rejects an incomplete stream instead of reporting a false success', async () => {
    mocks.postText.mockResolvedValue('data: {"type":"status","text":"testing"}\n\n')

    await expect(testAdminAccount(8)).rejects.toThrow('测试未返回完成状态')
  })
})
