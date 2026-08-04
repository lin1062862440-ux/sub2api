/**
 * Persistent storage backed by the Tauri store plugin.
 *
 * We deliberately avoid localStorage: the desktop client keeps auth tokens on
 * disk under the app's data directory, so they survive webview data clears and
 * are not reachable from page scripts.
 *
 * The backend address is not stored here — it is fixed at build time in
 * `src/config.ts`.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import { isTauri } from '@tauri-apps/api/core'

const store = isTauri() ? new LazyStore('linai.json', { autoSave: 100 }) : null

export const StorageKey = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  tokenExpiresAt: 'token_expires_at',
} as const

async function get<T>(key: string): Promise<T | null> {
  if (!store) {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return null
    try { return JSON.parse(raw) as T }
    catch { return null }
  }
  const value = await store.get<T>(key)
  return value ?? null
}

async function set(key: string, value: unknown): Promise<void> {
  if (store) await store.set(key, value)
  else sessionStorage.setItem(key, JSON.stringify(value))
}

async function remove(key: string): Promise<void> {
  if (store) await store.delete(key)
  else sessionStorage.removeItem(key)
}

async function save(): Promise<void> {
  await store?.save()
}

// ==================== Tokens ====================

export interface StoredSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

export async function getSession(): Promise<StoredSession | null> {
  const accessToken = await get<string>(StorageKey.accessToken)
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: await get<string>(StorageKey.refreshToken),
    expiresAt: await get<number>(StorageKey.tokenExpiresAt),
  }
}

export async function saveSession(session: {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number | null
}): Promise<void> {
  await set(StorageKey.accessToken, session.accessToken)
  if (session.refreshToken) {
    await set(StorageKey.refreshToken, session.refreshToken)
  }
  if (session.expiresIn) {
    await set(StorageKey.tokenExpiresAt, Date.now() + session.expiresIn * 1000)
  }
  await save()
}

export async function clearSession(): Promise<void> {
  await remove(StorageKey.accessToken)
  await remove(StorageKey.refreshToken)
  await remove(StorageKey.tokenExpiresAt)
  await save()
}
