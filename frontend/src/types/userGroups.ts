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
  can_view_prompt: boolean
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
  joined_at: string
}

export interface UserGroupTeamSubscriptionGroup {
  billing_group_id: number
  name: string
  platform: 'openai' | 'anthropic' | string
  status: string
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
  weekly_used: number
  weekly_limit?: number | null
}

export interface UserGroupSubscriptionResult {
  summary: {
    member_count: number
    active_subscription_count: number
    no_subscription_count: number
    allocated_quota_usd: number
    team_subscription_usage: number
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
  created_at: string
  prompt_available?: boolean
}

export interface UserGroupPromptDetail {
  id: number
  request_id: string
  protocol: string
  model: string
  stage: string
  redacted_prompt: string
  prompt_length: number
  truncated: boolean
  captured_at: string
  expires_at: string
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
