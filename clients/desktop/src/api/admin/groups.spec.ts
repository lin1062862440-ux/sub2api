import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/lib/http', () => ({
  http: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
  },
}))

import {
  createAdminGroup,
  listAdminGroups,
  updateAdminGroup,
  updateAdminGroupStatus,
} from './groups'

describe('admin groups API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists groups with server-side filters and pagination', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 2, page_size: 50 })

    await listAdminGroups({
      page: 2,
      page_size: 50,
      search: 'codex',
      platform: 'openai',
      status: 'active',
    })

    expect(mocks.get).toHaveBeenCalledWith('/admin/groups', {
      query: {
        page: 2,
        page_size: 50,
        search: 'codex',
        platform: 'openai',
        status: 'active',
      },
    })
  })

  it('creates, updates, and toggles groups through the real admin endpoints', async () => {
    const payload = {
      name: 'Codex Team',
      description: '团队订阅',
      platform: 'openai' as const,
      rate_multiplier: 1.2,
      rpm_limit: 120,
      is_exclusive: true,
      subscription_type: 'subscription' as const,
      daily_limit_usd: 10,
      weekly_limit_usd: 50,
      monthly_limit_usd: 200,
    }
    mocks.post.mockResolvedValue({ id: 8, ...payload, status: 'active' })
    mocks.put.mockResolvedValue({ id: 8, ...payload, status: 'inactive' })

    await createAdminGroup(payload)
    await updateAdminGroup(8, { ...payload, name: 'Codex Pro' })
    await updateAdminGroupStatus(8, 'inactive')

    expect(mocks.post).toHaveBeenCalledWith('/admin/groups', payload)
    expect(mocks.put).toHaveBeenNthCalledWith(1, '/admin/groups/8', {
      ...payload,
      name: 'Codex Pro',
    })
    expect(mocks.put).toHaveBeenNthCalledWith(2, '/admin/groups/8', { status: 'inactive' })
  })
})
