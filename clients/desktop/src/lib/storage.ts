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

const store = new LazyStore('linai.json', { autoSave: 100 })

export const StorageKey = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  tokenExpiresAt: 'token_expires_at',
} as const

async function get<T>(key: string): Promise<T | null> {
  const value = await store.get<T>(key)
  return value ?? null
}

async function set(key: string, value: unknown): Promise<void> {
  await store.set(key, value)
}

async function remove(key: string): Promise<void> {
  await store.delete(key)
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
  await store.save()
}

export async function clearSession(): Promise<void> {
  await remove(StorageKey.accessToken)
  await remove(StorageKey.refreshToken)
  await remove(StorageKey.tokenExpiresAt)
  await store.save()
}
