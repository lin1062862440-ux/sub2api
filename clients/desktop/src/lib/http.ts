/**
 * HTTP client for the LinAI backend.
 *
 * Requests are issued by the Rust side via `@tauri-apps/plugin-http`, so they
 * bypass the webview's CORS checks entirely — the backend needs no
 * `cors.allowed_origins` entry for the desktop client.
 *
 * The backend wraps every response in `{ code, message, data }`; `code === 0`
 * means success. This module unwraps that envelope and handles the 401 →
 * refresh → retry cycle once per request.
 */
import { fetch } from '@tauri-apps/plugin-http'
import { API_BASE_URL } from '@/config'
import { getSession, saveSession, clearSession } from './storage'

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export class ApiError extends Error {
  readonly status: number
  readonly code: number | string
  readonly metadata?: unknown

  constructor(params: { status: number; code: number | string; message: string; metadata?: unknown }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status
    this.code = params.code
    this.metadata = params.metadata
  }
}

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()

/** Notified when the session is gone for good and the UI must return to login. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function emitUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener())
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** Skips the Authorization header and the refresh cycle (login, public settings). */
  anonymous?: boolean
  signal?: AbortSignal
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

let refreshInFlight: Promise<string | null> | null = null

/**
 * Exchanges the refresh token for a new access token.
 *
 * Concurrent 401s share one in-flight refresh so we never fire duplicate
 * refresh calls, mirroring the web client's queueing behaviour.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const session = await getSession()
    if (!session?.refreshToken) return null

    try {
      const response = await fetch(buildUrl(API_BASE_URL, '/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      })
      if (!response.ok) return null

      const envelope = (await response.json()) as ApiEnvelope<{
        access_token: string
        refresh_token?: string
        expires_in?: number
      }>
      if (envelope.code !== 0 || !envelope.data?.access_token) return null

      // The backend rotates the refresh token on every refresh; persisting only
      // the access token would leave a stale refresh token behind and break the
      // next renewal.
      await saveSession({
        accessToken: envelope.data.access_token,
        refreshToken: envelope.data.refresh_token ?? null,
        expiresIn: envelope.data.expires_in ?? null,
      })
      return envelope.data.access_token
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

async function send<T>(path: string, options: RequestOptions, retrying = false): Promise<T> {
  const method = options.method ?? 'GET'
  const query = { ...options.query }
  // The backend uses the timezone to pick default date ranges on GET endpoints.
  if (method === 'GET' && query.timezone === undefined) {
    query.timezone = currentTimezone()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': 'zh-CN',
  }

  if (!options.anonymous) {
    const session = await getSession()
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`
    }
  }

  let response: Response
  try {
    response = await fetch(buildUrl(API_BASE_URL, path, query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : '无法连接到服务器',
    })
  }

  if (response.status === 401 && !options.anonymous && !retrying) {
    const token = await refreshAccessToken()
    if (token) {
      return send<T>(path, options, true)
    }
    await clearSession()
    emitUnauthorized()
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' })
  }

  // Any non-JSON body (an HTML error page from a proxy, for example) surfaces
  // as a plain status error rather than a parse crash.
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: `服务器返回了非预期的响应 (HTTP ${response.status})`,
    })
  }

  const envelope = payload as Partial<ApiEnvelope<T>> & Record<string, unknown>

  if (envelope && typeof envelope === 'object' && 'code' in envelope) {
    if (envelope.code === 0) {
      return envelope.data as T
    }
    throw new ApiError({
      status: response.status,
      code: envelope.code as number,
      message: (envelope.message as string) || '请求失败',
      metadata: envelope.metadata,
    })
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: response.status,
      message: `请求失败 (HTTP ${response.status})`,
    })
  }

  return payload as T
}

export const http = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'DELETE' }),
}
