import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  postText: vi.fn(),
}))

vi.mock('@/lib/http', () => ({
  http: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    delete: mocks.delete,
    postText: mocks.postText,
  },
}))

import {
  clearAdminAccountError,
  createAdminAccount,
  getAdminAccount,
  listAdminAccounts,
  recoverAdminAccount,
  refreshAdminAccountCredentials,
  setAdminAccountSchedulable,
  testAdminAccount,
  getAdminAccountModels,
  getAdminAccountUsage,
  updateAdminAccount,
} from './accounts'
import { getAdminDashboardRealtime, getAdminDashboardSnapshot } from './dashboard'
import {
  bindAdminUserIdentity,
  createAdminUser,
  deleteAdminUser,
  getAdminGroups,
  getAdminUser,
  getAdminUserApiKeys,
  getAdminUserBalanceHistory,
  getAdminUserPlatformQuotas,
  getAdminUserUsage,
  listAdminUsers,
  replaceAdminUserGroup,
  resetAdminUserPlatformQuota,
  updateAdminUser,
  updateAdminUserBalance,
  updateAdminUserPlatformQuotas,
} from './users'
import {
  getAdminUsageError,
  getAdminUsageStats,
  listAdminUsage,
  listAdminUsageErrors,
} from './usage'
import {
  createAdminChannelMonitor,
  deleteAdminChannelMonitor,
  getAdminChannelMonitor,
  getAdminChannelMonitorHistory,
  listAdminChannelMonitors,
  runAdminChannelMonitor,
  updateAdminChannelMonitor,
} from './channel-monitors'
import { getAdminAuditLog, listAdminAuditLogs } from './audit'
import { assignAdminSubscription,extendAdminSubscription,getAdminSubscriptionProgress,listAdminSubscriptions,resetAdminSubscriptionQuota,restoreAdminSubscription,revokeAdminSubscription } from './subscriptions'
import { batchUpdateAdminRedeemCodes,deleteAdminRedeemCode,expireAdminRedeemCode,generateAdminRedeemCodes,getAdminRedeemStats,listAdminRedeemCodes } from './redeem'
import { createAdminAnnouncement,deleteAdminAnnouncement,getAdminAnnouncementReadStatus,listAdminAnnouncements,updateAdminAnnouncement } from './announcements'

describe('admin dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the management snapshot with all overview datasets', async () => {
    const response = { generated_at: '2026-08-02T08:00:00Z' }
    mocks.get.mockResolvedValue(response)

    await expect(getAdminDashboardSnapshot({
      start_date: '2026-07-27',
      end_date: '2026-08-02',
      granularity: 'day',
    })).resolves.toBe(response)

    expect(mocks.get).toHaveBeenCalledWith('/admin/dashboard/snapshot-v2', {
      query: {
        start_date: '2026-07-27',
        end_date: '2026-08-02',
        granularity: 'day',
        include_stats: true,
        include_trend: true,
        include_model_stats: true,
        include_group_stats: true,
      },
    })
  })

  it('loads realtime health independently from the cached snapshot', async () => {
    const response = {
      active_requests: 3,
      requests_per_minute: 42,
      average_response_time: 680,
      error_rate: 0.8,
    }
    mocks.get.mockResolvedValue(response)

    await expect(getAdminDashboardRealtime()).resolves.toBe(response)
    expect(mocks.get).toHaveBeenCalledWith('/admin/dashboard/realtime')
  })
})

describe('admin accounts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists and filters accounts with a lightweight response', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0, page: 2, page_size: 20 })

    await listAdminAccounts({
      page: 2,
      page_size: 20,
      search: 'prod',
      platform: 'anthropic',
      status: 'error',
    })

    expect(mocks.get).toHaveBeenCalledWith('/admin/accounts', {
      query: {
        page: 2,
        page_size: 20,
        search: 'prod',
        platform: 'anthropic',
        status: 'error',
        lite: '1',
        include_scheduler_score: '0',
      },
    })
  })

  it('binds account detail and common create or edit fields', async () => {
    mocks.get.mockResolvedValue({ id: 8 })
    mocks.post.mockResolvedValue({ id: 9 })
    mocks.put.mockResolvedValue({ id: 8, name: 'Primary' })

    await getAdminAccount(8)
    await createAdminAccount({
      name: 'Primary',
      platform: 'anthropic',
      type: 'apikey',
      credentials: { api_key: 'secret' },
      concurrency: 5,
    })
    await updateAdminAccount(8, { name: 'Primary', concurrency: 8, status: 'active' })

    expect(mocks.get).toHaveBeenCalledWith('/admin/accounts/8')
    expect(mocks.post).toHaveBeenCalledWith('/admin/accounts', expect.objectContaining({ name: 'Primary' }))
    expect(mocks.put).toHaveBeenCalledWith('/admin/accounts/8', {
      name: 'Primary',
      concurrency: 8,
      status: 'active',
    })
  })

  it('binds the operational account actions without advanced authorization flows', async () => {
    mocks.post.mockResolvedValue({ id: 8 })
    mocks.postText.mockResolvedValue('data: {"type":"test_complete","success":true}\n\n')

    await getAdminAccountModels(8)
    await getAdminAccountUsage(8, { force: true })
    await testAdminAccount(8, { model_id: 'claude-sonnet-4', prompt: '' })
    await refreshAdminAccountCredentials(8)
    await clearAdminAccountError(8)
    await recoverAdminAccount(8)
    await setAdminAccountSchedulable(8, false)

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/accounts/8/models')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/accounts/8/usage', {
      query: { force: 'true' },
    })
    expect(mocks.postText).toHaveBeenCalledWith('/admin/accounts/8/test', {
      model_id: 'claude-sonnet-4',
      prompt: '',
    })
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/admin/accounts/8/refresh')
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/admin/accounts/8/clear-error')
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/admin/accounts/8/recover-state')
    expect(mocks.post).toHaveBeenNthCalledWith(4, '/admin/accounts/8/schedulable', { schedulable: false })
  })
})

describe('admin users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('binds user listing, detail and full CRUD paths', async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0 })
    mocks.post.mockResolvedValue({ id: 7 })
    mocks.put.mockResolvedValue({ id: 7 })
    mocks.delete.mockResolvedValue({ message: 'deleted' })

    await listAdminUsers({ page: 2, page_size: 20, search: 'lin', status: 'active' })
    await getAdminUser(7)
    await getAdminGroups()
    await createAdminUser({ email: 'lin@example.com', password: 'password', concurrency: 5 })
    await updateAdminUser(7, { username: 'Lin', rpm_limit: 60 })
    await deleteAdminUser(7)

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/users', {
      query: { page: 2, page_size: 20, search: 'lin', status: 'active', include_subscriptions: true },
    })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/users/7')
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/admin/groups/all')
    expect(mocks.post).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ email: 'lin@example.com' }))
    expect(mocks.put).toHaveBeenCalledWith('/admin/users/7', { username: 'Lin', rpm_limit: 60 })
    expect(mocks.delete).toHaveBeenCalledWith('/admin/users/7')
  })

  it('binds balance, group and identity operations', async () => {
    mocks.post.mockResolvedValue({ id: 7 })

    await updateAdminUserBalance(7, { balance: 20, operation: 'add', notes: 'manual credit' })
    await replaceAdminUserGroup(7, 2, 3)
    await bindAdminUserIdentity(7, {
      provider_type: 'oidc',
      provider_key: 'main',
      provider_subject: 'subject-1',
    })

    expect(mocks.post).toHaveBeenNthCalledWith(1, '/admin/users/7/balance', {
      balance: 20,
      operation: 'add',
      notes: 'manual credit',
    })
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/admin/users/7/replace-group', {
      old_group_id: 2,
      new_group_id: 3,
    })
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/admin/users/7/auth-identities', {
      provider_type: 'oidc',
      provider_key: 'main',
      provider_subject: 'subject-1',
    })
  })

  it('binds user drilldown and platform quota operations', async () => {
    mocks.get.mockResolvedValue({ items: [] })
    mocks.put.mockResolvedValue({ platform_quotas: [] })
    mocks.post.mockResolvedValue({ platform_quotas: [] })

    await getAdminUserApiKeys(7)
    await getAdminUserUsage(7, 'month')
    await getAdminUserBalanceHistory(7, { page: 1, page_size: 20 })
    await getAdminUserPlatformQuotas(7)
    await updateAdminUserPlatformQuotas(7, [{ platform: 'anthropic', daily_limit_usd: 10, weekly_limit_usd: null, monthly_limit_usd: null }])
    await resetAdminUserPlatformQuota(7, 'anthropic', 'daily')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/users/7/api-keys')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/users/7/usage', { query: { period: 'month' } })
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/admin/users/7/balance-history', { query: { page: 1, page_size: 20 } })
    expect(mocks.get).toHaveBeenNthCalledWith(4, '/admin/users/7/platform-quotas')
    expect(mocks.put).toHaveBeenCalledWith('/admin/users/7/platform-quotas', {
      quotas: [{ platform: 'anthropic', daily_limit_usd: 10, weekly_limit_usd: null, monthly_limit_usd: null }],
    })
    expect(mocks.post).toHaveBeenCalledWith('/admin/users/7/platform-quotas/reset', {
      platform: 'anthropic',
      window: 'daily',
    })
  })
})

describe('admin observation APIs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('binds global usage, statistics and error drilldown', async () => {
    mocks.get.mockResolvedValue({ items: [] })
    await listAdminUsage({ page: 1, page_size: 20, user_id: 7, start_date: '2026-08-01', end_date: '2026-08-02' })
    await getAdminUsageStats({ user_id: 7, start_date: '2026-08-01', end_date: '2026-08-02' })
    await listAdminUsageErrors({ page: 1, page_size: 20, view: 'all', user_id: 7 })
    await getAdminUsageError(3)
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/usage', { query: { page: 1, page_size: 20, user_id: 7, start_date: '2026-08-01', end_date: '2026-08-02', sort_by: 'created_at', sort_order: 'desc' } })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/usage/stats', { query: { user_id: 7, start_date: '2026-08-01', end_date: '2026-08-02' } })
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/admin/ops/errors', { query: { page: 1, page_size: 20, view: 'all', user_id: 7, sort_by: 'created_at', sort_order: 'desc' } })
    expect(mocks.get).toHaveBeenNthCalledWith(4, '/admin/ops/errors/3')
  })

  it('binds channel monitor lifecycle, run and history', async () => {
    mocks.get.mockResolvedValue({ items: [] });mocks.post.mockResolvedValue({ id: 4 });mocks.put.mockResolvedValue({ id: 4 });mocks.delete.mockResolvedValue(undefined)
    const payload = { name: 'Claude', provider: 'anthropic' as const, endpoint: 'https://api.example.com', api_key: 'key', primary_model: 'claude-sonnet-4', interval_seconds: 300 }
    await listAdminChannelMonitors({ page: 1, page_size: 20, enabled: true })
    await getAdminChannelMonitor(4)
    await createAdminChannelMonitor(payload)
    await updateAdminChannelMonitor(4, { interval_seconds: 600 })
    await runAdminChannelMonitor(4)
    await getAdminChannelMonitorHistory(4, { limit: 50 })
    await deleteAdminChannelMonitor(4)
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/channel-monitors', { query: { page: 1, page_size: 20, enabled: true } })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/channel-monitors/4')
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/admin/channel-monitors', payload)
    expect(mocks.put).toHaveBeenCalledWith('/admin/channel-monitors/4', { interval_seconds: 600 })
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/admin/channel-monitors/4/run')
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/admin/channel-monitors/4/history', { query: { limit: 50 } })
    expect(mocks.delete).toHaveBeenCalledWith('/admin/channel-monitors/4')
  })

  it('binds read-only audit list and detail', async () => {
    mocks.get.mockResolvedValue({ items: [] })
    await listAdminAuditLogs({ page: 1, page_size: 20, q: 'users', success: 'true' })
    await getAdminAuditLog(12)
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/admin/audit-logs', { query: { page: 1, page_size: 20, q: 'users', success: 'true' } })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/admin/audit-logs/12')
  })
})

describe('admin operation APIs',()=>{beforeEach(()=>vi.clearAllMocks());it('binds subscription lifecycle operations',async()=>{mocks.get.mockResolvedValue({items:[]});mocks.post.mockResolvedValue({id:3});await listAdminSubscriptions({page:1,page_size:20,status:'active'});await getAdminSubscriptionProgress(3);await assignAdminSubscription({user_id:7,group_id:2,validity_days:30});await extendAdminSubscription(3,15);await resetAdminSubscriptionQuota(3,{daily:true,weekly:true,monthly:false});await revokeAdminSubscription(3);await restoreAdminSubscription(3);expect(mocks.get).toHaveBeenNthCalledWith(1,'/admin/subscriptions',{query:{page:1,page_size:20,status:'active'}});expect(mocks.get).toHaveBeenNthCalledWith(2,'/admin/subscriptions/3/progress');expect(mocks.post).toHaveBeenNthCalledWith(1,'/admin/subscriptions/assign',{user_id:7,group_id:2,validity_days:30});expect(mocks.post).toHaveBeenNthCalledWith(2,'/admin/subscriptions/3/extend',{days:15});expect(mocks.post).toHaveBeenNthCalledWith(3,'/admin/subscriptions/3/reset-quota',{daily:true,weekly:true,monthly:false});expect(mocks.post).toHaveBeenNthCalledWith(4,'/admin/subscriptions/3/revoke');expect(mocks.post).toHaveBeenNthCalledWith(5,'/admin/subscriptions/3/restore')});it('binds redeem generation, statistics and lifecycle',async()=>{mocks.get.mockResolvedValue({items:[]});mocks.post.mockResolvedValue([]);mocks.delete.mockResolvedValue({message:'deleted'});await listAdminRedeemCodes({page:1,page_size:20,type:'subscription'});await getAdminRedeemStats();await generateAdminRedeemCodes({count:5,type:'subscription',value:0,group_id:2,validity_days:30,expires_in_days:7});await batchUpdateAdminRedeemCodes([1,2],{status:'disabled'});await expireAdminRedeemCode(1);await deleteAdminRedeemCode(1);expect(mocks.get).toHaveBeenNthCalledWith(1,'/admin/redeem-codes',{query:{page:1,page_size:20,type:'subscription'}});expect(mocks.get).toHaveBeenNthCalledWith(2,'/admin/redeem-codes/stats');expect(mocks.post).toHaveBeenNthCalledWith(1,'/admin/redeem-codes/generate',expect.objectContaining({count:5,group_id:2}));expect(mocks.post).toHaveBeenNthCalledWith(2,'/admin/redeem-codes/batch-update',{ids:[1,2],fields:{status:'disabled'}});expect(mocks.post).toHaveBeenNthCalledWith(3,'/admin/redeem-codes/1/expire');expect(mocks.delete).toHaveBeenCalledWith('/admin/redeem-codes/1')});it('binds announcement CRUD and read status',async()=>{mocks.get.mockResolvedValue({items:[]});mocks.post.mockResolvedValue({id:8});mocks.put.mockResolvedValue({id:8});mocks.delete.mockResolvedValue({message:'deleted'});const payload={title:'Notice',content:'Hello',status:'draft' as const,notify_mode:'silent' as const,targeting:{}};await listAdminAnnouncements({page:1,page_size:20,status:'draft'});await createAdminAnnouncement(payload);await updateAdminAnnouncement(8,{status:'active'});await getAdminAnnouncementReadStatus(8,{page:1,page_size:20});await deleteAdminAnnouncement(8);expect(mocks.get).toHaveBeenNthCalledWith(1,'/admin/announcements',{query:{page:1,page_size:20,status:'draft'}});expect(mocks.post).toHaveBeenCalledWith('/admin/announcements',payload);expect(mocks.put).toHaveBeenCalledWith('/admin/announcements/8',{status:'active'});expect(mocks.get).toHaveBeenNthCalledWith(2,'/admin/announcements/8/read-status',{query:{page:1,page_size:20}});expect(mocks.delete).toHaveBeenCalledWith('/admin/announcements/8')})})
