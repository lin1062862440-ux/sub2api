import { http } from '@/lib/http'
import type { AdminUsageError, AdminUsageLog, AdminUsageParams, AdminUsageStats } from './types'
import type { PaginatedResponse } from '@/api/types'

export function listAdminUsage(params: AdminUsageParams = {}) {
  return http.get<PaginatedResponse<AdminUsageLog>>('/admin/usage', {
    query: { ...params, sort_by: 'created_at', sort_order: 'desc' },
  })
}

export function getAdminUsageStats(params: Omit<AdminUsageParams, 'page' | 'page_size'> = {}) {
  return http.get<AdminUsageStats>('/admin/usage/stats', { query: params })
}

export function listAdminUsageErrors(params: {
  page?: number; page_size?: number; view?: 'errors' | 'excluded' | 'all'; start_time?: string; end_time?: string
  user_id?: number; api_key_id?: number; account_id?: number; group_id?: number; model?: string; q?: string
}) {
  return http.get<PaginatedResponse<AdminUsageError>>('/admin/ops/errors', {
    query: { ...params, sort_by: 'created_at', sort_order: 'desc' },
  })
}

export function getAdminUsageError(id: number) {
  return http.get<AdminUsageError>(`/admin/ops/errors/${id}`)
}
