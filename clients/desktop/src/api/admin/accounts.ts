import { http } from '@/lib/http'

import type {
  AdminAccount,
  AdminAccountModel,
  AdminAccountTestRequest,
  AdminAccountUsageInfo,
  AdminAccountListParams,
  AdminAccountListResponse,
  AdminAccountTestResult,
  CreateAdminAccountRequest,
  UpdateAdminAccountRequest,
} from './types'

export function listAdminAccounts(params: AdminAccountListParams = {}) {
  return http.get<AdminAccountListResponse>('/admin/accounts', {
    query: {
      ...params,
      lite: '1',
      include_scheduler_score: '0',
    },
  })
}

export function getAdminAccount(id: number) {
  return http.get<AdminAccount>(`/admin/accounts/${id}`)
}

export function createAdminAccount(payload: CreateAdminAccountRequest) {
  return http.post<AdminAccount>('/admin/accounts', payload)
}

export function updateAdminAccount(id: number, payload: UpdateAdminAccountRequest) {
  return http.put<AdminAccount>(`/admin/accounts/${id}`, payload)
}

export function getAdminAccountModels(id: number) {
  return http.get<AdminAccountModel[]>(`/admin/accounts/${id}/models`)
}

export function getAdminAccountUsage(id: number, options: { force?: boolean; source?: 'active' | 'passive' } = {}) {
  const query: Record<string, string> = {}
  if (options.force) query.force = 'true'
  if (options.source) query.source = options.source
  return http.get<AdminAccountUsageInfo>(`/admin/accounts/${id}/usage`, {
    query: Object.keys(query).length ? query : undefined,
  })
}

export function testAdminAccount(id: number, payload: AdminAccountTestRequest = { model_id: '', prompt: '' }) {
  return testAdminAccountStream(id, payload)
}

interface AccountTestEvent {
  type?: string
  success?: boolean
  error?: string
}

async function testAdminAccountStream(id: number, payload: AdminAccountTestRequest): Promise<AdminAccountTestResult> {
  const startedAt = Date.now()
  const stream = await http.postText(`/admin/accounts/${id}/test`, payload)
  let completed = false

  for (const line of stream.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (!data) continue
    let event: AccountTestEvent
    try {
      event = JSON.parse(data) as AccountTestEvent
    } catch {
      continue
    }
    if (event.type === 'error') {
      throw new Error(event.error || '连接测试失败')
    }
    if (event.type === 'test_complete' && event.success) {
      completed = true
    }
  }

  if (!completed) throw new Error('测试未返回完成状态')
  return { success: true, message: '连接测试通过', latency_ms: Date.now() - startedAt }
}

export function refreshAdminAccountCredentials(id: number) {
  return http.post<AdminAccount>(`/admin/accounts/${id}/refresh`)
}

export function clearAdminAccountError(id: number) {
  return http.post<AdminAccount>(`/admin/accounts/${id}/clear-error`)
}

export function recoverAdminAccount(id: number) {
  return http.post<AdminAccount>(`/admin/accounts/${id}/recover-state`)
}

export function setAdminAccountSchedulable(id: number, schedulable: boolean) {
  return http.post<AdminAccount>(`/admin/accounts/${id}/schedulable`, { schedulable })
}
