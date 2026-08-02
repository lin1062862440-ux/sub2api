import { http } from '@/lib/http'

import type {
  AdminGroup,
  AdminGroupListParams,
  AdminGroupListResponse,
  CreateAdminGroupRequest,
  UpdateAdminGroupRequest,
} from './types'

export function listAdminGroups(params: AdminGroupListParams = {}) {
  return http.get<AdminGroupListResponse>('/admin/groups', { query: { ...params } })
}

export function createAdminGroup(payload: CreateAdminGroupRequest) {
  return http.post<AdminGroup>('/admin/groups', payload)
}

export function updateAdminGroup(id: number, payload: UpdateAdminGroupRequest) {
  return http.put<AdminGroup>(`/admin/groups/${id}`, payload)
}

export function updateAdminGroupStatus(id: number, status: AdminGroup['status']) {
  return updateAdminGroup(id, { status })
}
