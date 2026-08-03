import { describe, expect, it } from 'vitest'

import { decodeAndroidUpdateManifest } from './android-updater-manifest'

const asset = {
  url: 'https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk',
  bytes: 1_024,
  sha256: 'a'.repeat(64),
  signature: 'untrusted comment: signature\nRWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
}

const validManifest = {
  version: '0.1.5',
  version_code: 1_005,
  notes: '安全更新',
  pub_date: '2026-08-03T00:00:00.000Z',
  platforms: { 'android-aarch64': asset },
}

describe('decodeAndroidUpdateManifest', () => {
  it('accepts a newer ARM64 release from the fixed public repository', () => {
    expect(decodeAndroidUpdateManifest(validManifest, 1_004)).toEqual({
      version: '0.1.5',
      versionCode: 1_005,
      notes: '安全更新',
      publishedAt: '2026-08-03T00:00:00.000Z',
      url: asset.url,
      bytes: 1_024,
      sha256: 'a'.repeat(64),
      signature: asset.signature,
    })
  })

  it.each([
    ['an array root', []],
    ['a missing platform', { ...validManifest, platforms: {} }],
    ['a non-numeric version', { ...validManifest, version: '0.1.beta' }],
    ['a non-incrementing code', { ...validManifest, version_code: 1_004 }],
    ['a fractional code', { ...validManifest, version_code: 1_005.5 }],
    ['an invalid publication date', { ...validManifest, pub_date: 'not-a-date' }],
    ['oversized notes', { ...validManifest, notes: 'a'.repeat(8_001) }],
    ['an HTTP URL', { ...validManifest, platforms: { 'android-aarch64': { ...asset, url: asset.url.replace('https:', 'http:') } } }],
    ['a credential URL', { ...validManifest, platforms: { 'android-aarch64': { ...asset, url: asset.url.replace('https://', 'https://token@') } } }],
    ['another Gitee repository', { ...validManifest, platforms: { 'android-aarch64': { ...asset, url: asset.url.replace('linsource/linai-desktop-release', 'someone/other') } } }],
    ['a mismatched release tag', { ...validManifest, platforms: { 'android-aarch64': { ...asset, url: asset.url.replace('android-v0.1.5', 'android-v0.1.6') } } }],
    ['a zero byte count', { ...validManifest, platforms: { 'android-aarch64': { ...asset, bytes: 0 } } }],
    ['an uppercase digest', { ...validManifest, platforms: { 'android-aarch64': { ...asset, sha256: 'A'.repeat(64) } } }],
    ['a malformed signature', { ...validManifest, platforms: { 'android-aarch64': { ...asset, signature: 'short' } } }],
  ])('rejects %s', (_name, input) => {
    expect(() => decodeAndroidUpdateManifest(input, 1_004)).toThrow('invalid-update-manifest')
  })
})
