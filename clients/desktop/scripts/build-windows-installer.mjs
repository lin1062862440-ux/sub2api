import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const targetFlagIndex = process.argv.indexOf('--target')
const target = targetFlagIndex >= 0 ? process.argv[targetFlagIndex + 1] : 'x86_64-pc-windows-msvc'
const artifactArch = new Map([
  ['x86_64-pc-windows-msvc', 'x64'],
  ['i686-pc-windows-msvc', 'x86'],
]).get(target)

if (!artifactArch) {
  throw new Error(`Unsupported Windows target: ${target || '(missing)'}`)
}

const packageJson = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
const version = packageJson.version

if (process.platform !== 'win32') {
  throw new Error('The Windows installer must be built on Windows')
}
const signingEnvironment = resolveSigningEnvironment()

runPnpm(['build:installer:windows:ui'])
runPnpm([
  'exec',
  'tauri',
  'build',
  '--target',
  target,
  '--bundles',
  'nsis',
  '--config',
  'src-tauri/tauri.windows.conf.json',
], signingEnvironment)

const nsisDirectory = join(desktopRoot, 'src-tauri', 'target', target, 'release', 'bundle', 'nsis')
const payload = newestExecutable(nsisDirectory)
const payloadSignature = `${payload}.sig`
if (!existsSync(payloadSignature)) {
  throw new Error(`Missing signed updater artifact: ${payloadSignature}`)
}
verifyGeneratedNsisDirectoryGuard()
const payloadSha256 = createHash('sha256').update(readFileSync(payload)).digest('hex')
const installerManifest = join(desktopRoot, 'src-installer-windows', 'Cargo.toml')

run(
  'cargo.exe',
  [
    '--config',
    'http.multiplexing=false',
    'build',
    '--target',
    target,
    '--release',
    '--features',
    'custom-protocol',
    '--manifest-path',
    installerManifest,
  ],
  {
    LINAI_NSIS_PAYLOAD: payload,
    LINAI_NSIS_PAYLOAD_SHA256: payloadSha256,
  },
)

const source = join(
  desktopRoot,
  'src-installer-windows',
  'target',
  target,
  'release',
  'linai-windows-installer.exe',
)
const outputDirectory = join(desktopRoot, 'dist-windows')
let output = join(outputDirectory, `LinAI-${version}-windows-${artifactArch}-setup.exe`)
mkdirSync(outputDirectory, { recursive: true })
try {
  copyFileSync(source, output)
} catch (error) {
  if (error?.code !== 'EBUSY' && error?.code !== 'EPERM') throw error
  output = join(outputDirectory, `LinAI-${version}-windows-${artifactArch}-setup-${payloadSha256.slice(0, 12)}.exe`)
  copyFileSync(source, output)
}

const updaterOutput = join(outputDirectory, `LinAI-${version}-windows-${artifactArch}-updater.exe`)
const updaterSignatureOutput = `${updaterOutput}.sig`
copyFileSync(payload, updaterOutput)
copyFileSync(payloadSignature, updaterSignatureOutput)

run(process.execPath, [
  join(desktopRoot, 'tools', 'write-updater-manifest.mjs'),
  '--package',
  updaterOutput,
  '--platform',
  artifactArch === 'x64' ? 'windows-x86_64' : 'windows-i686',
])

console.log(`Windows installer: ${output}`)
console.log(`Windows updater: ${updaterOutput}`)
console.log(`Windows updater signature: ${updaterSignatureOutput}`)

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 'unknown'}`)
  }
}

function runPnpm(args, extraEnv = {}) {
  const pnpmEntry = process.env.npm_execpath
  if (!pnpmEntry) throw new Error('npm_execpath is unavailable; run this script through pnpm')
  run(process.execPath, [pnpmEntry, ...args], extraEnv)
}

function newestExecutable(directory) {
  const candidates = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => join(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  if (candidates.length === 0) {
    throw new Error(`No NSIS payload found in ${directory}`)
  }
  return candidates[0]
}

function resolveSigningEnvironment() {
  let privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()
  if (!privateKey) {
    const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
      ?? join(homedir(), '.tauri', 'linai-updater.key')
    if (!existsSync(privateKeyPath)) {
      throw new Error(
        'Missing updater signing key. Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.',
      )
    }
    privateKey = readFileSync(privateKeyPath, 'utf8').trim()
  }

  if (!privateKey) throw new Error('Updater signing key is empty')
  if (isEncryptedPrivateKey(privateKey)
    && !Object.hasOwn(process.env, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')) {
    throw new Error('Encrypted updater signing key requires TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  }

  return {
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
  }
}

function isEncryptedPrivateKey(value) {
  try {
    return Buffer.from(value, 'base64').toString('utf8').includes('encrypted secret key')
  } catch {
    return false
  }
}

function verifyGeneratedNsisDirectoryGuard() {
  const script = join(
    desktopRoot,
    'src-tauri',
    'target',
    target,
    'release',
    'nsis',
    artifactArch,
    'installer.nsi',
  )
  const source = readFileSync(script, 'utf8')
  const hooks = join(desktopRoot, 'src-tauri', 'windows', 'installer-hooks.nsh')
  const hookSource = readFileSync(hooks, 'utf8')
  if (!source.includes(hooks) || !hookSource.includes('LINAI_UPDATE_INSTALL_DIR_GUARD')) {
    throw new Error('Generated NSIS installer is missing the update install-directory guard')
  }
}
