export interface UserGroupCapabilities {
  can_access: boolean
  can_manage: boolean
  group_count: number
}

export interface UserGroup {
  id: number
  name: string
  description: string
  status: 'active' | 'archived'
  member_count: number
  viewer_count: number
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
  balance: number
  joined_at: string
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
  balance_consumption: number
  subscription_consumption: number
}

export interface UserGroupUsageByUser {
  user_id: number
  email: string
  username: string
  total_requests: number
  total_tokens: number
  total_actual_cost: number
  balance_consumption: number
  subscription_consumption: number
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
  billing_type: 0 | 1
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
  billing_type?: 0 | 1
  page?: number
  page_size?: number
}
