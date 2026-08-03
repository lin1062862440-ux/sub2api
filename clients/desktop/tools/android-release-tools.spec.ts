import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

describe('Android updater manifest and publication', () => {
  it('hashes exact APK bytes and creates a deterministic fixed-repository manifest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'linai-android-manifest-'))
    try {
      const apkPath = join(directory, 'LinAI_0.1.5_arm64-release.apk')
      await writeFile(apkPath, Buffer.from([0, 1, 2, 3, 255]))
      const moduleUrl = pathToFileURL(resolve(
        process.cwd(),
        'tools/write-android-updater-manifest.mjs',
      )).href
      const { generateAndroidUpdateManifest } = await import(moduleUrl)
      const options = {
        apkPath,
        notes: '稳定性改进',
        pubDate: '2026-08-03T00:00:00.000Z',
        versions: { packageJson: '0.1.5', cargo: '0.1.5', tauri: '0.1.5' },
        inspectApk: async () => ({
          applicationId: 'ai.lin.android', versionName: '0.1.5', versionCode: 1_005,
        }),
        signer: async () => 'untrusted comment: signature\nRWQfixture',
      }

      const first = await generateAndroidUpdateManifest(options)
      const second = await generateAndroidUpdateManifest(options)

      expect(first).toEqual(second)
      expect(first).toMatchObject({
        version: '0.1.5',
        version_code: 1_005,
        notes: '稳定性改进',
        pub_date: '2026-08-03T00:00:00.000Z',
        platforms: {
          'android-aarch64': {
            bytes: 5,
            sha256: 'ff5d8507b6a72bee2debce2c0054798deaccdc5d8a1b945b6280ce8aa9cba52e',
            signature: 'untrusted comment: signature\nRWQfixture',
            url: 'https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI_0.1.5_arm64-release.apk',
          },
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('publishes versioned assets before replacing the fixed manifest', async () => {
    const moduleUrl = pathToFileURL(resolve(
      process.cwd(),
      'tools/publish-android-gitee-release.mjs',
    )).href
    const { publishAndroidRelease } = await import(moduleUrl)
    const calls: string[] = []

    await publishAndroidRelease({
      publishVersioned: async () => { calls.push('publish:android-v0.1.5') },
      verifyVersioned: async () => { calls.push('verify:android-v0.1.5') },
      publishManifest: async () => { calls.push('publish:android-latest') },
      verifyManifest: async () => { calls.push('verify:android-latest') },
    })

    expect(calls).toEqual([
      'publish:android-v0.1.5',
      'verify:android-v0.1.5',
      'publish:android-latest',
      'verify:android-latest',
    ])
  })

  it('keeps Gitee tokens out of URLs and API response bodies out of errors', async () => {
    const publisher = await source('tools/publish-gitee-release.mjs')

    expect(publisher).toContain('Authorization')
    expect(publisher).not.toMatch(new RegExp('[?&]access_' + 'token='))
    expect(publisher).not.toContain('response.text()')
  })
})
