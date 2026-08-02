import { http } from '@/lib/http'

import type {
  AdminBalanceHistoryResponse,
  AdminBalanceUpdateRequest,
  AdminBindIdentityRequest,
  AdminBoundIdentity,
  AdminGroupOption,
  AdminPlatformQuota,
  AdminPlatformQuotaUpdate,
  AdminQuotaPlatform,
  AdminQuotaWindow,
  AdminUser,
  AdminUserApiKeysResponse,
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserUsageSummary,
  CreateAdminUserRequest,
  UpdateAdminUserRequest,
} from './types'

export function listAdminUsers(params: AdminUserListParams = {}) {
  return http.get<AdminUserListResponse>('/admin/users', {
    query: { ...params, include_subscriptions: true },
  })
}

export function getAdminUser(id: number) {
  return http.get<AdminUser>(`/admin/users/${id}`)
}

export function getAdminGroups() {
  return http.get<AdminGroupOption[]>('/admin/groups/all')
}

export function createAdminUser(payload: CreateAdminUserRequest) {
  return http.post<AdminUser>('/admin/users', payload)
}

export function updateAdminUser(id: number, payload: UpdateAdminUserRequest) {
  return http.put<AdminUser>(`/admin/users/${id}`, payload)
}

export function deleteAdminUser(id: number) {
  return http.delete<{ message: string }>(`/admin/users/${id}`)
}

export function updateAdminUserBalance(id: number, payload: AdminBalanceUpdateRequest) {
  return http.post<AdminUser>(`/admin/users/${id}/balance`, {
    ...payload,
    notes: payload.notes ?? '',
  })
}

export function replaceAdminUserGroup(id: number, oldGroupId: number, newGroupId: number) {
  return http.post<{ migrated_keys: number }>(`/admin/users/${id}/replace-group`, {
    old_group_id: oldGroupId,
    new_group_id: newGroupId,
  })
}

export function bindAdminUserIdentity(id: number, payload: AdminBindIdentityRequest) {
  return http.post<AdminBoundIdentity>(`/admin/users/${id}/auth-identities`, payload)
}

export function getAdminUserApiKeys(id: number) {
  return http.get<AdminUserApiKeysResponse>(`/admin/users/${id}/api-keys`)
}

export function getAdminUserUsage(id: number, period = 'month') {
  return http.get<AdminUserUsageSummary>(`/admin/users/${id}/usage`, { query: { period } })
}

export function getAdminUserBalanceHistory(
  id: number,
  params: { page?: number; page_size?: number; type?: string } = {},
) {
  return http.get<AdminBalanceHistoryResponse>(`/admin/users/${id}/balance-history`, { query: params })
}

export function getAdminUserPlatformQuotas(id: number) {
  return http.get<{ platform_quotas: AdminPlatformQuota[] }>(`/admin/users/${id}/platform-quotas`)
}

export function updateAdminUserPlatformQuotas(id: number, quotas: AdminPlatformQuotaUpdate[]) {
  return http.put<{ platform_quotas: AdminPlatformQuota[] }>(`/admin/users/${id}/platform-quotas`, { quotas })
}

export function resetAdminUserPlatformQuota(id: number, platform: AdminQuotaPlatform, window: AdminQuotaWindow) {
  return http.post<{ platform_quotas: AdminPlatformQuota[] }>(`/admin/users/${id}/platform-quotas/reset`, {
    platform,
    window,
  })
}
