import { http } from '@/lib/http'
import type { PaginatedResponse } from '@/api/types'
import type { AdminAuditLog } from './types'

export function listAdminAuditLogs(params: { page?: number; page_size?: number; start_time?: string; end_time?: string; actor_email?: string; auth_method?: string; action?: string; method?: string; client_ip?: string; success?: string; q?: string } = {}) {
  return http.get<PaginatedResponse<AdminAuditLog>>('/admin/audit-logs', { query: params })
}
export function getAdminAuditLog(id: number) { return http.get<AdminAuditLog>(`/admin/audit-logs/${id}`) }
