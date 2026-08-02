import type { PaginatedResponse } from '@/api/types'
import { http } from '@/lib/http'
import type { AdminRedeemCode, AdminRedeemCodeType, AdminRedeemStats } from './types'

export interface AdminRedeemFilters {
  type?: AdminRedeemCodeType
  status?: string
  search?: string
}

export function listAdminRedeemCodes(
  params: AdminRedeemFilters & { page?: number; page_size?: number } = {},
) {
  return http.get<PaginatedResponse<AdminRedeemCode>>('/admin/redeem-codes', {
    query: {
      page: params.page,
      page_size: params.page_size,
      type: params.type,
      status: params.status,
      search: params.search,
    },
  })
}

export function getAdminRedeemStats() {
  return http.get<AdminRedeemStats>('/admin/redeem-codes/stats')
}

export function generateAdminRedeemCodes(payload: {
  count: number
  type: AdminRedeemCodeType
  value: number
  group_id?: number | null
  validity_days?: number
  expires_in_days?: number | null
}) {
  return http.post<AdminRedeemCode[]>('/admin/redeem-codes/generate', payload)
}

export function batchUpdateAdminRedeemCodes(
  ids: number[],
  fields: {
    status?: 'unused' | 'disabled'
    expires_at?: string | null
    notes?: string
    group_id?: number | null
  },
) {
  return http.post<{ updated: number; message: string }>('/admin/redeem-codes/batch-update', {
    ids,
    fields,
  })
}

export function batchDeleteAdminRedeemCodes(ids: number[]) {
  return http.post<{ deleted: number; message: string }>('/admin/redeem-codes/batch-delete', { ids })
}

export function exportAdminRedeemCodes(filters: AdminRedeemFilters = {}) {
  return http.getText('/admin/redeem-codes/export', {
    query: {
      type: filters.type,
      status: filters.status,
      search: filters.search,
    },
  })
}

export function expireAdminRedeemCode(id: number) {
  return http.post<AdminRedeemCode>(`/admin/redeem-codes/${id}/expire`)
}

export function deleteAdminRedeemCode(id: number) {
  return http.delete<{ message: string }>(`/admin/redeem-codes/${id}`)
}
