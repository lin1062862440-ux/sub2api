import { http } from '@/lib/http'
import type { AdminChannelMonitor, AdminChannelMonitorInput, AdminMonitorHistoryItem } from './types'
import type { PaginatedResponse } from '@/api/types'

export function listAdminChannelMonitors(params: { page?: number; page_size?: number; provider?: string; enabled?: boolean; search?: string } = {}) {
  return http.get<PaginatedResponse<AdminChannelMonitor>>('/admin/channel-monitors', { query: params })
}
export function getAdminChannelMonitor(id: number) { return http.get<AdminChannelMonitor>(`/admin/channel-monitors/${id}`) }
export function createAdminChannelMonitor(payload: AdminChannelMonitorInput) { return http.post<AdminChannelMonitor>('/admin/channel-monitors', payload) }
export function updateAdminChannelMonitor(id: number, payload: Partial<AdminChannelMonitorInput>) { return http.put<AdminChannelMonitor>(`/admin/channel-monitors/${id}`, payload) }
export function deleteAdminChannelMonitor(id: number) { return http.delete<void>(`/admin/channel-monitors/${id}`) }
export function runAdminChannelMonitor(id: number) { return http.post<{ results: AdminMonitorHistoryItem[] }>(`/admin/channel-monitors/${id}/run`) }
export function getAdminChannelMonitorHistory(id: number, params: { model?: string; limit?: number } = {}) { return http.get<{ items: AdminMonitorHistoryItem[] }>(`/admin/channel-monitors/${id}/history`, { query: params }) }
