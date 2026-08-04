import { http } from '@/lib/http'

export interface UserGroupCapabilities {
  can_access: boolean
  can_manage: boolean
  can_manage_quota: boolean
  group_count: number
}

export interface UserGroup {
  id: number
  name: string
  description: string
  status: 'active' | 'archived'
  member_count: number
  viewer_count: number
  prompt_capture_enabled?: boolean
  can_view_prompt?: boolean
  created_by?: number | null
  created_at: string
  updated_at: string
}

export interface UserGroupMutation {
  name: string
  description: string
}

export interface UserGroupMember {
  user_id: number
  email: string
  username: string
  avatar_url?: string
  status: string
  balance?: number
  joined_at: string
}

export interface UserGroupTeamSubscriptionGroup {
  billing_group_id: number
  name: string
  platform: 'openai' | 'anthropic' | string
  status: string
}

export interface UserGroupQuotaPolicy {
  enabled: boolean
  weekly_limit_usd: number
  weekly_usage_usd: number
  weekly_window_start?: string | null
  weekly_reset_at?: string | null
}

export interface UserGroupQuotaMember {
  user_id: number
  email: string
  username: string
  avatar_url?: string
  status: string
  weekly_limit_usd: number
  weekly_usage_usd: number
  weekly_window_start?: string | null
}

export interface UserGroupQuotaOverview {
  group_id: number
  policy: UserGroupQuotaPolicy
  managers: UserGroupViewer[]
  members: UserGroupQuotaMember[]
  allocated_usd: number
  can_manage: boolean
  can_configure: boolean
  team_subscription_groups: UserGroupTeamSubscriptionGroup[]
  available_team_subscription_groups?: UserGroupTeamSubscriptionGroup[]
}

export interface UserGroupQuotaPolicyMutation {
  enabled: boolean
  weekly_limit_usd: number
}

export interface UserGroupMemberQuotaMutation {
  user_id: number
  weekly_limit_usd: number
}

export interface UserGroupViewer {
  user_id: number
  email: string
  username: string
  avatar_url?: string
  status: string
  granted_at: string
}

export interface UserGroupSubscriptionRow {
  member: UserGroupMember
  subscription_id?: number | null
  billing_group_id?: number | null
  billing_group: string
  platform: string
  status: string
  starts_at?: string | null
  expires_at?: string | null
  daily_used: number
  daily_limit?: number | null
  weekly_used: number
  weekly_limit?: number | null
  monthly_used: number
  monthly_limit?: number | null
}

export interface UserGroupSubscriptionResult {
  summary: {
    member_count: number
    active_subscription_count: number
    no_subscription_count: number
    total_balance: number
    active_subscription_usage: number
  }
  items: UserGroupSubscriptionRow[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface UserGroupUsageSummary {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens: number
  total_tokens: number
  total_actual_cost: number
}

export interface UserGroupUsageByUser {
  user_id: number
  email: string
  username: string
  total_requests: number
  total_tokens: number
  total_actual_cost: number
}

export interface UserGroupUsageItem {
  id: number
  user_id: number
  email: string
  username: string
  request_id: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  actual_cost: number
  billing_type?: 0 | 1
  created_at: string
}

export interface UserGroupUsageResult {
  summary: UserGroupUsageSummary
  by_user: UserGroupUsageByUser[]
  items: UserGroupUsageItem[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface UserGroupSubscriptionParams {
  status?: string
  page?: number
  page_size?: number
}

export interface UserGroupUsageParams {
  start_date?: string
  end_date?: string
  timezone?: string
  user_id?: number
  model?: string
  page?: number
  page_size?: number
}

export function getUserGroupCapabilities() {
  return http.get<UserGroupCapabilities>('/user-groups/capabilities')
}

export function listUserGroups() {
  return http.get<UserGroup[]>('/user-groups')
}

export function createUserGroup(payload: UserGroupMutation) {
  return http.post<UserGroup>('/user-groups', payload)
}

export function updateUserGroup(id: number, payload: UserGroupMutation) {
  return http.put<UserGroup>(`/user-groups/${id}`, payload)
}

export function archiveUserGroup(id: number) {
  return http.delete<void>(`/user-groups/${id}`)
}

export function getUserGroupMembers(id: number) {
  return http.get<UserGroupMember[]>(`/user-groups/${id}/members`)
}

export function replaceUserGroupMembers(id: number, userIds: number[]) {
  return http.put<void>(`/user-groups/${id}/members`, { user_ids: userIds })
}

export function getUserGroupViewers(id: number) {
  return http.get<UserGroupViewer[]>(`/user-groups/${id}/viewers`)
}

export function replaceUserGroupViewers(id: number, userIds: number[]) {
  return http.put<void>(`/user-groups/${id}/viewers`, { user_ids: userIds })
}

export function getUserGroupSubscriptions(id: number, params: UserGroupSubscriptionParams = {}) {
  return http.get<UserGroupSubscriptionResult>(`/user-groups/${id}/subscriptions`, { query: { ...params } })
}

export function getUserGroupUsage(id: number, params: UserGroupUsageParams = {}) {
  return http.get<UserGroupUsageResult>(`/user-groups/${id}/usage`, { query: { ...params } })
}

export function getUserGroupQuotaOverview(id: number) {
  return http.get<UserGroupQuotaOverview>(`/user-groups/${id}/quota`)
}

export function setUserGroupQuotaPolicy(id: number, payload: UserGroupQuotaPolicyMutation) {
  return http.put<void>(`/user-groups/${id}/quota-policy`, payload)
}

export function replaceUserGroupQuotaManagers(id: number, userIds: number[]) {
  return http.put<void>(`/user-groups/${id}/quota-managers`, { user_ids: userIds })
}

export function updateUserGroupMemberQuotas(id: number, members: UserGroupMemberQuotaMutation[]) {
  return http.put<void>(`/user-groups/${id}/member-quotas`, { members })
}

export function replaceUserGroupTeamSubscriptions(id: number, billingGroupIds: number[]) {
  return http.put<void>(`/user-groups/${id}/team-subscription-groups`, { billing_group_ids: billingGroupIds })
}

export function resetUserGroupQuotaUsage(id: number) {
  return http.post<void>(`/user-groups/${id}/quota-reset`)
}
