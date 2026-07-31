/**
 * Response shapes for the endpoints this client uses.
 *
 * These mirror `frontend/src/types/index.ts` and `frontend/src/api/usage.ts`,
 * trimmed to the fields the desktop client actually reads.
 */

export interface User {
  id: number
  username: string
  email: string
  avatar_url?: string | null
  role: 'admin' | 'user'
  balance: number
  frozen_balance?: number
  concurrency: number
  rpm_limit?: number
  status: 'active' | 'disabled'
  last_active_at?: string | null
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  user: User & { run_mode?: 'standard' | 'simple' }
}

/** Returned instead of `AuthResponse` when the account has TOTP enabled. */
export interface TotpLoginResponse {
  requires_2fa: true
  temp_token: string
  user_email_masked?: string
}

export type LoginResponse = AuthResponse | TotpLoginResponse

export function isTotpRequired(response: LoginResponse): response is TotpLoginResponse {
  return 'requires_2fa' in response && response.requires_2fa === true
}

export interface PlatformDashboardStats {
  platform: string
  total_requests: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
}

export interface DashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens: number
  today_cache_read_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
  by_platform?: PlatformDashboardStats[]
}

export interface TrendPoint {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface TrendResponse {
  trend: TrendPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface ModelStat {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface ModelStatsResponse {
  models: ModelStat[]
}

/**
 * Public site configuration. Drives which login methods the client offers, so
 * the desktop app exposes exactly what the deployment has enabled.
 */
export interface PublicSettings {
  site_name: string
  site_logo: string
  site_subtitle: string
  version: string
  registration_enabled: boolean
  email_verify_enabled?: boolean
  registration_email_suffix_whitelist?: string[]
  promo_code_enabled?: boolean
  invitation_code_enabled?: boolean
  affiliate_enabled?: boolean
  login_agreement_enabled?: boolean
  login_agreement_mode?: 'modal' | 'checkbox' | string
  login_agreement_updated_at?: string
  login_agreement_revision?: string
  login_agreement_documents?: LoginAgreementDocument[]
  password_reset_enabled: boolean
  turnstile_enabled: boolean
  turnstile_site_key: string
  passkey_enabled?: boolean
  linuxdo_oauth_enabled: boolean
  dingtalk_oauth_enabled?: boolean
  wechat_oauth_enabled: boolean
  oidc_oauth_enabled: boolean
  oidc_oauth_provider_name: string
  github_oauth_enabled: boolean
  google_oauth_enabled: boolean
  payment_enabled: boolean
  doc_url: string
  contact_info: string
}

export interface LoginAgreementDocument {
  id: string
  title: string
  content_md: string
}

export interface SendVerifyCodeResponse {
  message: string
  countdown: number
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordResponse {
  message: string
}
