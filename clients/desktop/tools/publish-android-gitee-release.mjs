import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { createGiteeReleaseClient } from './publish-gitee-release.mjs'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'linsource/linai-desktop-release'

export async function publishAndroidRelease({
  publishVersioned,
  verifyVersioned,
  publishManifest,
  verifyManifest,
}) {
  await publishVersioned()
  await verifyVersioned()
  await publishManifest()
  await verifyManifest()
}

async function keychainToken() {
  const helper = join(projectRoot, 'tools', 'keychain-secret.swift')
  const { stdout } = await execFileAsync(
    '/usr/bin/swift',
    [helper, 'get', 'ai.lin.release', 'gitee-token'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 },
  )
  if (!stdout.length) throw new Error('missing-gitee-token')
  return stdout.toString('utf8')
}

async function fetchPublic(url, operation) {
  const response = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}`)
  return response
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const version = packageJson.version
  const directory = join(projectRoot, 'release', 'android', version)
  const apk = join(directory, `LinAI_${version}_arm64-release.apk`)
  const signature = `${apk}.sig`
  const manifestPath = join(directory, 'android-latest.json')
  const manifestBytes = await readFile(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const asset = manifest.platforms?.['android-aarch64']
  if (!asset || manifest.version !== version) throw new Error('invalid-local-manifest')

  const token = process.env.GITEE_TOKEN || await keychainToken()
  const client = createGiteeReleaseClient({ token })
  const versionTag = `android-v${version}`
  const manifestTag = 'android-latest'
  const signatureUrl = `${asset.url}.sig`

  await publishAndroidRelease({
    publishVersioned: () => client.publishRelease({
      repo: repository,
      tag: versionTag,
      name: `LinAI Android ${version}`,
      body: manifest.notes || `LinAI Android ${version}`,
      files: [apk, signature],
    }),
    verifyVersioned: async () => {
      const publicApk = Buffer.from(await (await fetchPublic(asset.url, 'public APK verification')).arrayBuffer())
      const publicSignature = await (await fetchPublic(signatureUrl, 'public signature verification')).text()
      if (
        publicApk.length !== asset.bytes
        || createHash('sha256').update(publicApk).digest('hex') !== asset.sha256
        || publicSignature.trim() !== asset.signature.trim()
      ) throw new Error('public-versioned-assets-mismatch')
    },
    publishManifest: () => client.publishRelease({
      repo: repository,
      tag: manifestTag,
      name: 'LinAI Android Latest',
      body: 'Latest LinAI Android updater manifest.',
      files: [manifestPath],
    }),
    verifyManifest: async () => {
      const manifestUrl = `https://gitee.com/${repository}/releases/download/${manifestTag}/android-latest.json`
      const publicManifest = Buffer.from(
        await (await fetchPublic(manifestUrl, 'public manifest verification')).arrayBuffer(),
      )
      if (!publicManifest.equals(manifestBytes)) throw new Error('public-manifest-mismatch')
      await fetchPublic(asset.url, 'final public APK verification')
    },
  })
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'unknown failure'
    console.error(`Android publication failed: ${message}`)
    process.exitCode = 1
  })
}
