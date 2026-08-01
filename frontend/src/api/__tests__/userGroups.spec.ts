import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, put, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { get, post, put, delete: remove },
}))

import { userGroupAPI } from '@/api/userGroups'

describe('user group API', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    put.mockReset()
    remove.mockReset()
  })

  it('loads capability and accessible groups', async () => {
    get.mockResolvedValueOnce({ data: { can_access: true, can_manage: false, group_count: 2 } })
    get.mockResolvedValueOnce({ data: [{ id: 3, name: 'Team A' }] })

    await expect(userGroupAPI.getCapabilities()).resolves.toEqual({ can_access: true, can_manage: false, group_count: 2 })
    await expect(userGroupAPI.list()).resolves.toEqual([{ id: 3, name: 'Team A' }])
    expect(get).toHaveBeenNthCalledWith(1, '/user-groups/capabilities')
    expect(get).toHaveBeenNthCalledWith(2, '/user-groups')
  })

  it('uses complete replacement payloads for members and viewers', async () => {
    put.mockResolvedValue({ data: { message: 'ok' } })

    await userGroupAPI.replaceMembers(5, [7, 9])
    await userGroupAPI.replaceViewers(5, [12])

    expect(put).toHaveBeenNthCalledWith(1, '/user-groups/5/members', { user_ids: [7, 9] })
    expect(put).toHaveBeenNthCalledWith(2, '/user-groups/5/viewers', { user_ids: [12] })
  })

  it('serializes subscription and usage filters', async () => {
    get.mockResolvedValue({ data: { items: [] } })

    await userGroupAPI.getSubscriptions(5, { status: 'active', page: 2, page_size: 50 })
    await userGroupAPI.getUsage(5, {
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      user_id: 7,
      model: 'gpt-5',
      billing_type: 1,
      page: 1,
      page_size: 20,
    })

    expect(get).toHaveBeenNthCalledWith(1, '/user-groups/5/subscriptions', {
      params: { status: 'active', page: 2, page_size: 50 },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/user-groups/5/usage', {
      params: expect.objectContaining({ user_id: 7, model: 'gpt-5', billing_type: 1 }),
    })
  })

  it('creates, updates, and archives groups', async () => {
    post.mockResolvedValue({ data: { id: 3 } })
    put.mockResolvedValue({ data: { id: 3 } })
    remove.mockResolvedValue({ data: { message: 'ok' } })

    await userGroupAPI.create({ name: 'Team A', description: '' })
    await userGroupAPI.update(3, { name: 'Team B', description: 'Ops' })
    await userGroupAPI.archive(3)

    expect(post).toHaveBeenCalledWith('/user-groups', { name: 'Team A', description: '' })
    expect(put).toHaveBeenCalledWith('/user-groups/3', { name: 'Team B', description: 'Ops' })
    expect(remove).toHaveBeenCalledWith('/user-groups/3')
  })
})
