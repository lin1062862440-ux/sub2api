import { execFile, spawn } from 'node:child_process'
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidSdk = process.env.ANDROID_SDK_ROOT
  || process.env.ANDROID_HOME
  || join(homedir(), 'Library', 'Android', 'sdk')

export function versionCodeForVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error('invalid-version')
  const [, major, minor, patch] = match.map(Number)
  if (minor > 999 || patch > 999) throw new Error('invalid-version')
  const code = major * 1_000_000 + minor * 1_000 + patch
  if (!Number.isSafeInteger(code) || code <= 0 || code > 2_100_000_000) {
    throw new Error('invalid-version')
  }
  return code
}

async function keychainSecret(service, account) {
  const helper = join(projectRoot, 'tools', 'keychain-secret.swift')
  const { stdout } = await execFileAsync('/usr/bin/swift', [helper, 'get', service, account], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024,
  })
  if (!stdout.length) throw new Error('missing-keychain-secret')
  return stdout.toString('utf8')
}

async function signingEnvironment() {
  const storePassword = process.env.LINAI_ANDROID_STORE_PASSWORD
    || await keychainSecret('ai.lin.android.release', 'store-password')
  const keyPassword = process.env.LINAI_ANDROID_KEY_PASSWORD
    || await keychainSecret('ai.lin.android.release', 'key-password')
  return {
    ...process.env,
    LINAI_ANDROID_KEYSTORE_PATH: resolve(
      process.env.LINAI_ANDROID_KEYSTORE_PATH
        || join(homedir(), '.tauri', 'linai-android-release.jks'),
    ),
    LINAI_ANDROID_KEY_ALIAS: process.env.LINAI_ANDROID_KEY_ALIAS || 'linai-android-release',
    LINAI_ANDROID_STORE_PASSWORD: storePassword,
    LINAI_ANDROID_KEY_PASSWORD: keyPassword,
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options,
    })
    child.once('error', reject)
    child.once('exit', (code) => code === 0
      ? resolvePromise()
      : reject(new Error('child-process-failed')))
  })
}

async function capture(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout.trim()
}

async function newestBuildTool(name) {
  const root = join(androidSdk, 'build-tools')
  const versions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
  if (!versions.length) throw new Error('missing-android-build-tools')
  return join(root, versions[0], name)
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

async function locateReleaseApk(buildStartedMs) {
  const roots = [
    join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk'),
    join(projectRoot, 'src-tauri', 'target', 'aarch64-linux-android', 'release', 'bundle', 'apk'),
  ]
  const candidates = []
  for (const root of roots) {
    for (const path of await walk(root)) {
      const name = basename(path).toLowerCase()
      if (!name.endsWith('.apk') || name.includes('debug') || name.includes('unsigned')) continue
      const info = await stat(path)
      if (info.mtimeMs + 1_000 >= buildStartedMs) candidates.push(path)
    }
  }
  if (candidates.length !== 1) throw new Error('expected-one-release-apk')
  return candidates[0]
}

async function auditApk(apk, version) {
  const apksigner = await newestBuildTool('apksigner')
  const zipalign = await newestBuildTool('zipalign')
  const apkanalyzer = join(androidSdk, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer')
  await run(apksigner, ['verify', '--verbose', '--print-certs', apk])
  await run(zipalign, ['-c', '-P', '16', '4', apk])

  const applicationId = await capture(apkanalyzer, ['manifest', 'application-id', apk])
  const versionName = await capture(apkanalyzer, ['manifest', 'version-name', apk])
  const versionCode = await capture(apkanalyzer, ['manifest', 'version-code', apk])
  const debuggable = await capture(apkanalyzer, ['manifest', 'debuggable', apk])
  const files = await capture(apkanalyzer, ['files', 'list', apk])
  const abis = new Set(
    files.split('\n').map((line) => /^\/lib\/([^/]+)\//.exec(line)?.[1]).filter(Boolean),
  )
  if (applicationId !== 'ai.lin.android') throw new Error('unexpected-application-id')
  if (versionName !== version) throw new Error('unexpected-version-name')
  if (Number(versionCode) !== versionCodeForVersion(version)) throw new Error('unexpected-version-code')
  if (debuggable !== 'false') throw new Error('release-is-debuggable')
  if (abis.size !== 1 || !abis.has('arm64-v8a')) throw new Error('unexpected-abi')
}

export async function buildAndroidRelease() {
  const packageJson = JSON.parse(await (await import('node:fs/promises')).readFile(
    join(projectRoot, 'package.json'),
    'utf8',
  ))
  const version = packageJson.version
  versionCodeForVersion(version)
  const env = await signingEnvironment()
  const buildStartedMs = Date.now()
  await run('pnpm', ['exec', 'tauri', 'android', 'build', '--apk', '--target', 'aarch64', '--ci'], { env })
  const builtApk = await locateReleaseApk(buildStartedMs)
  await auditApk(builtApk, version)

  const releaseDirectory = join(projectRoot, 'release', 'android', version)
  const artifact = join(releaseDirectory, `LinAI_${version}_arm64-release.apk`)
  await mkdir(releaseDirectory, { recursive: true })
  await cp(builtApk, artifact)
  console.log(`Android release ready: ${artifact}`)
  return artifact
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  buildAndroidRelease().catch(() => {
    console.error('Android release failed. Check signing credentials and the Android toolchain.')
    process.exitCode = 1
  })
}
