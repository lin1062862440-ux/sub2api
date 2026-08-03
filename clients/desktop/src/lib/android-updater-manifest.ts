export interface AndroidUpdateRelease {
  version: string
  versionCode: number
  notes: string
  publishedAt: string
  url: string
  bytes: number
  sha256: string
  signature: string
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SIGNATURE_PATTERN = /^untrusted comment: [^\r\n]{1,256}\n[A-Za-z0-9+/=]{16,2048}(?:\ntrusted comment: [^\r\n]{1,1024}\n[A-Za-z0-9+/=]{16,2048})?$/
const RELEASE_PATH_PATTERN = /^\/linsource\/linai-desktop-release\/releases\/download\/android-v([^/]+)\/[A-Za-z0-9._-]+\.apk$/
const MAX_NOTES_LENGTH = 8_000

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function expectedVersionCode(version: string): number | null {
  const match = VERSION_PATTERN.exec(version)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 999)) return null
  const code = parts[0]! * 1_000_000 + parts[1]! * 1_000 + parts[2]!
  return Number.isSafeInteger(code) && code > 0 ? code : null
}

export function decodeAndroidUpdateManifest(
  input: unknown,
  installedCode: number,
): AndroidUpdateRelease {
  try {
    if (!isPlainObject(input) || !isPlainObject(input.platforms)) throw new Error()
    const asset = input.platforms['android-aarch64']
    if (!isPlainObject(asset)) throw new Error()

    if (typeof input.version !== 'string') throw new Error()
    const calculatedCode = expectedVersionCode(input.version)
    if (
      calculatedCode === null
      || typeof input.version_code !== 'number'
      || !Number.isSafeInteger(input.version_code)
      || input.version_code !== calculatedCode
      || input.version_code <= installedCode
    ) throw new Error()

    if (
      typeof input.notes !== 'string'
      || input.notes.length > MAX_NOTES_LENGTH
      || input.notes.includes('\0')
    ) throw new Error()
    if (
      typeof input.pub_date !== 'string'
      || !input.pub_date.trim()
      || !Number.isFinite(Date.parse(input.pub_date))
    ) throw new Error()

    if (typeof asset.url !== 'string') throw new Error()
    const url = new URL(asset.url)
    const releasePath = RELEASE_PATH_PATTERN.exec(url.pathname)
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'gitee.com'
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !releasePath
      || releasePath[1] !== input.version
    ) throw new Error()

    if (
      typeof asset.bytes !== 'number'
      || !Number.isSafeInteger(asset.bytes)
      || asset.bytes <= 0
    ) throw new Error()
    if (typeof asset.sha256 !== 'string' || !SHA256_PATTERN.test(asset.sha256)) throw new Error()
    if (typeof asset.signature !== 'string' || !SIGNATURE_PATTERN.test(asset.signature)) throw new Error()

    return {
      version: input.version,
      versionCode: input.version_code,
      notes: input.notes,
      publishedAt: input.pub_date,
      url: asset.url,
      bytes: asset.bytes,
      sha256: asset.sha256,
      signature: asset.signature,
    }
  } catch {
    throw new Error('invalid-update-manifest')
  }
}
