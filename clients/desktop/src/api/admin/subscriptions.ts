import { http } from '@/lib/http'
import type { PaginatedResponse } from '@/api/types'
import type { AdminBulkAssignResult, AdminSubscription, AdminSubscriptionProgress } from './types'

export interface AssignAdminSubscriptionInput {
  user_id: number
  group_id: number
  validity_days?: number
  notes?: string
}

export interface BulkAssignAdminSubscriptionsInput {
  user_ids: number[]
  group_id: number
  validity_days?: number
  notes?: string
}

export function listAdminSubscriptions(params: {
  page?: number
  page_size?: number
  status?: string
  user_id?: number
  group_id?: number
  platform?: string
  search?: string
} = {}) {
  return http.get<PaginatedResponse<AdminSubscription>>('/admin/subscriptions', { query: params })
}

export function getAdminSubscriptionProgress(id: number) {
  return http.get<AdminSubscriptionProgress>(`/admin/subscriptions/${id}/progress`)
}

export function assignAdminSubscription(payload: AssignAdminSubscriptionInput) {
  return http.post<AdminSubscription>('/admin/subscriptions/assign', payload)
}

export function bulkAssignAdminSubscriptions(payload: BulkAssignAdminSubscriptionsInput) {
  return http.post<AdminBulkAssignResult>('/admin/subscriptions/bulk-assign', payload)
}

export function extendAdminSubscription(id: number, days: number) {
  return http.post<AdminSubscription>(`/admin/subscriptions/${id}/extend`, { days })
}

export function resetAdminSubscriptionQuota(id: number, payload: { daily: boolean; weekly: boolean; monthly: boolean }) {
  return http.post<AdminSubscription>(`/admin/subscriptions/${id}/reset-quota`, payload)
}

export function revokeAdminSubscription(id: number) {
  return http.post<{ message: string }>(`/admin/subscriptions/${id}/revoke`)
}

export function restoreAdminSubscription(id: number) {
  return http.post<AdminSubscription>(`/admin/subscriptions/${id}/restore`)
}
