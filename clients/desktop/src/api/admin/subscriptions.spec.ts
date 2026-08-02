import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/http', () => ({ http: { get: mocks.get, post: mocks.post } }))

import { bulkAssignAdminSubscriptions, listAdminSubscriptions } from './subscriptions'

describe('admin subscription bulk assignment API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts all selected users to the backend bulk endpoint', async () => {
    mocks.post.mockResolvedValue({ success_count: 2 })
    const payload = { user_ids: [7, 8], group_id: 2, validity_days: 30, notes: 'desktop' }

    await bulkAssignAdminSubscriptions(payload)

    expect(mocks.post).toHaveBeenCalledWith('/admin/subscriptions/bulk-assign', payload)
  })

  it('forwards cross-page search to the backend list endpoint', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 2, page_size: 50 })

    await listAdminSubscriptions({ page: 2, page_size: 50, status: 'active', group_id: 3, search: 'lin' })

    expect(mocks.get).toHaveBeenCalledWith('/admin/subscriptions', {
      query: { page: 2, page_size: 50, status: 'active', group_id: 3, search: 'lin' },
    })
  })
})
