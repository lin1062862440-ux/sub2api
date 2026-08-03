import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

async function source(path: string): Promise<string> {
  try {
    return await readFile(resolve(process.cwd(), path), 'utf8')
  } catch {
    return ''
  }
}

describe('Android release signing policy', () => {
  it('requires a dedicated release keystore without a debug fallback', async () => {
    const gradle = await source('src-tauri/gen/android/app/build.gradle.kts')

    expect(gradle).toContain('signingConfigs.create("release")')
    expect(gradle).toContain('requireSecret("LINAI_ANDROID_KEYSTORE_PATH")')
    expect(gradle).toContain('requireSecret("LINAI_ANDROID_STORE_PASSWORD")')
    expect(gradle).toContain('requireSecret("LINAI_ANDROID_KEY_PASSWORD")')
    expect(gradle).toContain('requireSecret("LINAI_ANDROID_KEY_ALIAS")')
    expect(gradle).not.toContain('signingConfig = signingConfigs.getByName("debug")')
  })

  it('stores Keychain secrets from stdin and never from process arguments', async () => {
    const helper = await source('tools/keychain-secret.swift')

    expect(helper).toContain('FileHandle.standardInput.readDataToEndOfFile()')
    expect(helper).toContain('kSecValueData')
    expect(helper).not.toMatch(/add-generic-password|\s-w\s/)
    expect(helper).not.toMatch(/CommandLine\.arguments\[[^\]]+\].*(secret|password|token)/i)
  })

  it('derives deterministic Android version codes', async () => {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), 'tools/android-release.mjs')).href
    const releaseTools = await import(moduleUrl)

    expect(releaseTools.versionCodeForVersion('0.1.4')).toBe(1_004)
    expect(releaseTools.versionCodeForVersion('2.3.45')).toBe(2_003_045)
    expect(() => releaseTools.versionCodeForVersion('2.3')).toThrow('invalid-version')
  })

  it('audits signing, alignment, identity, debuggability and ABI after build', async () => {
    const wrapper = await source('tools/android-release.mjs')

    expect(wrapper).toContain('apksigner')
    expect(wrapper).toContain('zipalign')
    expect(wrapper).toContain('apkanalyzer')
    expect(wrapper).toContain('arm64-v8a')
    expect(wrapper).toContain('LINAI_ANDROID_KEYSTORE_PATH')
    expect(wrapper).not.toContain('GITEE_TOKEN')
  })
})
