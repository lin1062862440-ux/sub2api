import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/http', () => ({
  http: mocks,
}))

import {
  archiveUserGroup,
  createUserGroup,
  getUserGroupCapabilities,
  getUserGroupMembers,
  getUserGroupQuotaOverview,
  getUserGroupSubscriptions,
  getUserGroupUsage,
  getUserGroupViewers,
  listUserGroups,
  replaceUserGroupMembers,
  replaceUserGroupQuotaManagers,
  replaceUserGroupTeamSubscriptions,
  replaceUserGroupViewers,
  resetUserGroupQuotaUsage,
  setUserGroupQuotaPolicy,
  updateUserGroupMemberQuotas,
  updateUserGroup,
} from './user-groups'

describe('desktop user groups API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds capability, directory and mutation endpoints', async () => {
    mocks.get.mockResolvedValue([])
    mocks.post.mockResolvedValue({ id: 7 })
    mocks.put.mockResolvedValue({ id: 7 })
    mocks.delete.mockResolvedValue(undefined)

    await getUserGroupCapabilities()
    await listUserGroups()
    await createUserGroup({ name: '研发团队', description: '研发成员' })
    await updateUserGroup(7, { name: '核心研发', description: '核心成员' })
    await archiveUserGroup(7)

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/user-groups/capabilities')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user-groups')
    expect(mocks.post).toHaveBeenCalledWith('/user-groups', { name: '研发团队', description: '研发成员' })
    expect(mocks.put).toHaveBeenNthCalledWith(1, '/user-groups/7', { name: '核心研发', description: '核心成员' })
    expect(mocks.delete).toHaveBeenCalledWith('/user-groups/7')
  })

  it('binds member and viewer complete-set replacement', async () => {
    mocks.get.mockResolvedValue([])
    mocks.put.mockResolvedValue(undefined)

    await getUserGroupMembers(7)
    await replaceUserGroupMembers(7, [3, 5])
    await getUserGroupViewers(7)
    await replaceUserGroupViewers(7, [9])

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/user-groups/7/members')
    expect(mocks.put).toHaveBeenNthCalledWith(1, '/user-groups/7/members', { user_ids: [3, 5] })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user-groups/7/viewers')
    expect(mocks.put).toHaveBeenNthCalledWith(2, '/user-groups/7/viewers', { user_ids: [9] })
  })

  it('serializes subscription and usage filters', async () => {
    mocks.get.mockResolvedValue({ items: [] })

    await getUserGroupSubscriptions(7, { status: 'active', page: 2, page_size: 10 })
    await getUserGroupUsage(7, {
      start_date: '2026-07-27',
      end_date: '2026-08-02',
      timezone: 'Asia/Shanghai',
      user_id: 3,
      model: 'claude-sonnet-4',
      page: 3,
      page_size: 20,
    })

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/user-groups/7/subscriptions', {
      query: { status: 'active', page: 2, page_size: 10 },
    })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/user-groups/7/usage', {
      query: {
        start_date: '2026-07-27',
        end_date: '2026-08-02',
        timezone: 'Asia/Shanghai',
        user_id: 3,
        model: 'claude-sonnet-4',
        page: 3,
        page_size: 20,
      },
    })
  })

  it('binds team quota policy, allocation and reset endpoints', async () => {
    mocks.get.mockResolvedValue({ members: [] })
    mocks.put.mockResolvedValue(undefined)
    mocks.post.mockResolvedValue(undefined)

    await getUserGroupQuotaOverview(7)
    await setUserGroupQuotaPolicy(7, { enabled: true, weekly_limit_usd: 100 })
    await replaceUserGroupQuotaManagers(7, [3])
    await updateUserGroupMemberQuotas(7, [{ user_id: 9, weekly_limit_usd: 40 }])
    await replaceUserGroupTeamSubscriptions(7, [12, 13])
    await resetUserGroupQuotaUsage(7)

    expect(mocks.get).toHaveBeenCalledWith('/user-groups/7/quota')
    expect(mocks.put).toHaveBeenCalledWith('/user-groups/7/quota-policy', { enabled: true, weekly_limit_usd: 100 })
    expect(mocks.put).toHaveBeenCalledWith('/user-groups/7/quota-managers', { user_ids: [3] })
    expect(mocks.put).toHaveBeenCalledWith('/user-groups/7/member-quotas', { members: [{ user_id: 9, weekly_limit_usd: 40 }] })
    expect(mocks.put).toHaveBeenCalledWith('/user-groups/7/team-subscription-groups', { billing_group_ids: [12, 13] })
    expect(mocks.post).toHaveBeenCalledWith('/user-groups/7/quota-reset')
  })
})
