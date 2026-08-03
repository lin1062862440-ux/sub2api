import { execFile } from 'node:child_process'
import { createHash, createPublicKey, verify as verifyEd25519 } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { versionCodeForVersion } from './android-release.mjs'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'linsource/linai-desktop-release'

export async function generateAndroidUpdateManifest({
  apkPath,
  notes = '',
  pubDate = new Date().toISOString(),
  versions,
  inspectApk,
  signer,
  verifySignature,
}) {
  if (typeof notes !== 'string' || notes.length > 8_000) throw new Error('invalid-notes')
  if (!Number.isFinite(Date.parse(pubDate))) throw new Error('invalid-pub-date')
  const versionSet = new Set(Object.values(versions))
  if (versionSet.size !== 1) throw new Error('version-mismatch')
  const version = versions.packageJson
  const expectedCode = versionCodeForVersion(version)
  const identity = await inspectApk(apkPath)
  if (
    identity.applicationId !== 'ai.lin.android'
    || identity.versionName !== version
    || identity.versionCode !== expectedCode
  ) throw new Error('apk-identity-mismatch')

  const bytes = await readFile(apkPath)
  const signature = String(await signer(apkPath)).trim()
  if (!signature) throw new Error('missing-signature')
  if (verifySignature) await verifySignature(bytes, signature)

  return {
    version,
    version_code: expectedCode,
    notes,
    pub_date: new Date(pubDate).toISOString(),
    platforms: {
      'android-aarch64': {
        url: `https://gitee.com/${repository}/releases/download/android-v${version}/${basename(apkPath)}`,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        signature,
      },
    },
  }
}

function decodeTextKey(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8').trim()
}

function minisignParts(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('invalid-minisign-data')
  return lines
}

export function unwrapTauriSignature(value) {
  const encoded = String(value).trim()
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('invalid-tauri-signature')
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim()
  const lines = decoded.split(/\r?\n/)
  if (
    lines.length !== 4
    || !lines[0].startsWith('untrusted comment: ')
    || !lines[2].startsWith('trusted comment: ')
  ) throw new Error('invalid-tauri-signature')
  return decoded
}

export function verifyMinisign(bytes, signatureText, encodedPublicKey) {
  const publicLines = minisignParts(decodeTextKey(encodedPublicKey))
  const signatureLines = minisignParts(signatureText)
  if (signatureLines.length !== 4) throw new Error('invalid-minisign-signature')
  const publicPacket = Buffer.from(publicLines[1], 'base64')
  const signaturePacket = Buffer.from(signatureLines[1], 'base64')
  const globalSignature = Buffer.from(signatureLines[3], 'base64')
  if (
    publicPacket.length !== 42
    || signaturePacket.length !== 74
    || globalSignature.length !== 64
    || !publicPacket.subarray(2, 10).equals(signaturePacket.subarray(2, 10))
  ) throw new Error('invalid-minisign-signature')

  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')
  const key = createPublicKey({
    key: Buffer.concat([spkiPrefix, publicPacket.subarray(10)]),
    format: 'der',
    type: 'spki',
  })
  const digest = createHash('blake2b512').update(bytes).digest()
  const trustedComment = Buffer.from(signatureLines[2].replace(/^trusted comment: /, ''))
  const primarySignature = signaturePacket.subarray(10)
  if (
    !verifyEd25519(null, digest, key, primarySignature)
    || !verifyEd25519(
      null,
      Buffer.concat([primarySignature, trustedComment]),
      key,
      globalSignature,
    )
  ) throw new Error('signature-verification-failed')
}

function parseArgs(argv) {
  const options = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue
    const value = argv[index + 1]
    if (value && !value.startsWith('--')) {
      options.set(argv[index].slice(2), value)
      index += 1
    } else options.set(argv[index].slice(2), 'true')
  }
  return options
}

async function projectVersions() {
  const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const tauri = JSON.parse(await readFile(join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const cargo = await readFile(join(projectRoot, 'src-tauri', 'Cargo.toml'), 'utf8')
  const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1]
  if (!cargoVersion) throw new Error('missing-cargo-version')
  return { packageJson: packageJson.version, cargo: cargoVersion, tauri: tauri.version }
}

function androidSdkRoot() {
  return process.env.ANDROID_SDK_ROOT
    || process.env.ANDROID_HOME
    || join(homedir(), 'Library', 'Android', 'sdk')
}

async function inspectApk(apkPath) {
  const analyzer = join(androidSdkRoot(), 'cmdline-tools', 'latest', 'bin', 'apkanalyzer')
  const inspect = async (verb) => (await execFileAsync(
    analyzer,
    ['manifest', verb, apkPath],
    { encoding: 'utf8' },
  )).stdout.trim()
  return {
    applicationId: await inspect('application-id'),
    versionName: await inspect('version-name'),
    versionCode: Number(await inspect('version-code')),
  }
}

async function keychainSecret(account) {
  const helper = join(projectRoot, 'tools', 'keychain-secret.swift')
  const { stdout } = await execFileAsync(
    '/usr/bin/swift',
    [helper, 'get', 'ai.lin.release', account],
    { encoding: 'buffer', maxBuffer: 64 * 1024 },
  )
  return stdout.toString('utf8')
}

async function signApk(apkPath) {
  const env = { ...process.env }
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ''
  const defaultPath = join(homedir(), '.tauri', 'linai-updater.key')
  if (!env.TAURI_SIGNING_PRIVATE_KEY && !env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
    try {
      await readFile(defaultPath)
      env.TAURI_SIGNING_PRIVATE_KEY_PATH = defaultPath
    } catch {
      env.TAURI_SIGNING_PRIVATE_KEY = await keychainSecret('updater-private-key')
    }
  }
  await execFileAsync(
    'pnpm',
    ['exec', 'tauri', 'signer', 'sign', apkPath],
    { cwd: projectRoot, env, maxBuffer: 1024 * 1024 },
  )
  const signaturePath = `${apkPath}.sig`
  const signature = unwrapTauriSignature(await readFile(signaturePath, 'utf8'))
  await writeFile(signaturePath, `${signature}\n`)
  return signature
}

async function locateApk(version) {
  const directory = join(projectRoot, 'release', 'android', version)
  const files = (await readdir(directory)).filter((name) => name.endsWith('-release.apk'))
  if (files.length !== 1) throw new Error('expected-one-audited-apk')
  return join(directory, files[0])
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const versions = await projectVersions()
  const apkPath = options.get('apk') || await locateApk(versions.packageJson)
  const config = JSON.parse(await readFile(join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const manifest = await generateAndroidUpdateManifest({
    apkPath,
    notes: options.get('notes') || '',
    pubDate: options.get('pub-date') || new Date().toISOString(),
    versions,
    inspectApk,
    signer: signApk,
    verifySignature: (bytes, signature) => verifyMinisign(
      bytes,
      signature,
      config.plugins.updater.pubkey,
    ),
  })
  const output = resolve(
    options.get('out') || join(dirname(apkPath), 'android-latest.json'),
  )
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Android updater manifest ready: ${output}`)
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch(() => {
    console.error('Android manifest generation failed. Check the audited APK and signing key.')
    process.exitCode = 1
  })
}
