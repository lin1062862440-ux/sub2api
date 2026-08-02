import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
])

const nsisDirectory = join(desktopRoot, 'src-tauri', 'target', target, 'release', 'bundle', 'nsis')
const payload = newestExecutable(nsisDirectory)
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

console.log(`Windows installer: ${output}`)

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

function runPnpm(args) {
  const pnpmEntry = process.env.npm_execpath
  if (!pnpmEntry) throw new Error('npm_execpath is unavailable; run this script through pnpm')
  run(process.execPath, [pnpmEntry, ...args])
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
