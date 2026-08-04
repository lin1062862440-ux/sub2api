import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const DEFAULT_REPO = 'linsource/linai-desktop-release'
const DEFAULT_MANIFEST_TAG = 'desktop-latest'
const scriptPath = fileURLToPath(import.meta.url)

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await main(process.argv.slice(2))
}

export async function main(argv) {
  const options = parseArgs(argv)
  const desktopRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const repo = options.get('repo') ?? process.env.GITEE_RELEASE_REPO ?? DEFAULT_REPO
  const version = readConsistentVersion(desktopRoot)
  const releaseTag = options.get('tag') ?? `desktop-v${version}`
  const manifestTag = options.get('manifest-tag') ?? DEFAULT_MANIFEST_TAG
  const latestUrl = `https://gitee.com/${repo}/releases/download/${manifestTag}/latest.json`
  const latestPath = join(desktopRoot, 'latest.json')
  const validateOnly = options.has('validate-only')
  const assetsOnly = options.has('assets-only')

  requireReleaseEnvironment({ publishing: !validateOnly })
  console.log(`Preparing Windows ${version} release for ${repo}`)

  const baseline = await fetchJson(latestUrl)
  if (!assetsOnly && baseline.version !== version) {
    throw new Error(
      `Remote latest version is ${baseline.version}, but local version is ${version}. `
      + 'Publish the matching macOS manifest first or align the local version.',
    )
  }
  const baselinePlatforms = assetsOnly ? [] : Object.keys(baseline.platforms ?? {})
  if (assetsOnly) {
    console.log(
      `Assets-only mode: desktop-latest remains at ${baseline.version}; `
      + `Windows ${version} will not be offered automatically.`,
    )
  } else {
    writeFileSync(latestPath, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`Preserving remote platforms: ${baselinePlatforms.join(', ') || '(none)'}`)
  }

  const notes = options.get('notes') ?? baseline.notes ?? ''
  if (!validateOnly) {
    runPnpm(desktopRoot, ['bundle:windows:x64'])
    runPnpm(desktopRoot, ['bundle:windows:x86'])
    runPnpm(desktopRoot, [
      'updater:manifest',
      '--',
      '--package',
      `dist-windows/LinAI-${version}-windows-x64-updater.exe`,
      '--platform',
      'windows-x86_64',
      '--notes',
      notes,
    ])
  }

  const artifacts = releaseArtifacts(desktopRoot, version)
  const manifest = validateReleaseArtifacts({
    desktopRoot,
    version,
    repo,
    releaseTag,
    baselinePlatforms,
    artifacts,
  })

  if (!validateOnly) {
    const publishTool = join(desktopRoot, 'tools', 'publish-gitee-release.mjs')
    run(process.execPath, [
      publishTool,
      '--repo', repo,
      '--tag', releaseTag,
      '--name', `LinAI Desktop ${version}`,
      '--body', notes,
      ...artifacts.flatMap(({ path }) => ['--file', path]),
    ], desktopRoot)

    if (!assetsOnly) {
      run(process.execPath, [
        publishTool,
        '--repo', repo,
        '--tag', manifestTag,
        '--name', 'LinAI Desktop Latest',
        '--body', 'Latest LinAI Desktop updater manifest.',
        '--file', latestPath,
      ], desktopRoot)
    }
  }

  await verifyPublicRelease({
    repo,
    releaseTag,
    latestUrl,
    latestPath,
    manifest,
    artifacts,
    verifyManifest: !assetsOnly,
  })
  const action = validateOnly ? 'validated' : 'released and verified'
  console.log(`Windows ${version} ${action}: https://gitee.com/${repo}/releases/tag/${releaseTag}`)
}

export function parseArgs(argv) {
  const parsed = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) continue
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) parsed.set(key, 'true')
    else {
      parsed.set(key, value)
      index += 1
    }
  }
  return parsed
}

export function readConsistentVersion(desktopRoot) {
  const versions = new Map([
    ['package.json', readJsonVersion(join(desktopRoot, 'package.json'))],
    ['src-tauri/tauri.conf.json', readJsonVersion(join(desktopRoot, 'src-tauri', 'tauri.conf.json'))],
    ['src-tauri/Cargo.toml', readTomlVersion(join(desktopRoot, 'src-tauri', 'Cargo.toml'))],
    ['src-installer-windows/tauri.conf.json', readJsonVersion(join(desktopRoot, 'src-installer-windows', 'tauri.conf.json'))],
    ['src-installer-windows/Cargo.toml', readTomlVersion(join(desktopRoot, 'src-installer-windows', 'Cargo.toml'))],
  ])
  const unique = [...new Set(versions.values())]
  if (unique.length !== 1) {
    throw new Error(`Desktop versions do not match: ${[...versions].map(([file, value]) => `${file}=${value}`).join(', ')}`)
  }
  return unique[0]
}

export function validateManifest(manifest, { version, baselinePlatforms, expectedEntries }) {
  if (manifest.version !== version) {
    throw new Error(`Manifest version ${manifest.version} does not match ${version}`)
  }
  for (const platform of baselinePlatforms) {
    if (!manifest.platforms?.[platform]) throw new Error(`Manifest dropped baseline platform ${platform}`)
  }
  for (const [platform, expected] of Object.entries(expectedEntries)) {
    const actual = manifest.platforms?.[platform]
    if (!actual) throw new Error(`Manifest is missing ${platform}`)
    if (actual.url !== expected.url) throw new Error(`Manifest URL is incorrect for ${platform}`)
    if (actual.signature !== expected.signature) throw new Error(`Manifest signature is incorrect for ${platform}`)
  }
  return manifest
}

function requireReleaseEnvironment({ publishing }) {
  if (process.platform !== 'win32') throw new Error('Windows releases must be built on Windows')
  if (!publishing) return
  if (!process.env.GITEE_TOKEN) throw new Error('Missing GITEE_TOKEN')
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
    throw new Error('Missing TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH')
  }
}

function releaseArtifacts(desktopRoot, version) {
  return ['x64', 'x86'].flatMap((arch) => [
    { kind: 'setup', arch, path: join(desktopRoot, 'dist-windows', `LinAI-${version}-windows-${arch}-setup.exe`) },
    { kind: 'updater', arch, path: join(desktopRoot, 'dist-windows', `LinAI-${version}-windows-${arch}-updater.exe`) },
    { kind: 'signature', arch, path: join(desktopRoot, 'dist-windows', `LinAI-${version}-windows-${arch}-updater.exe.sig`) },
  ])
}

function validateReleaseArtifacts({ desktopRoot, version, repo, releaseTag, baselinePlatforms, artifacts }) {
  for (const artifact of artifacts) {
    if (!existsSync(artifact.path) || readFileSync(artifact.path).length === 0) {
      throw new Error(`Missing release artifact: ${artifact.path}`)
    }
  }

  const expectedEntries = {}
  for (const [arch, platform, target] of [
    ['x64', 'windows-x86_64', 'x86_64-pc-windows-msvc'],
    ['x86', 'windows-i686', 'i686-pc-windows-msvc'],
  ]) {
    const updater = artifacts.find((item) => item.arch === arch && item.kind === 'updater')
    const signature = artifacts.find((item) => item.arch === arch && item.kind === 'signature')
    const native = join(desktopRoot, 'src-tauri', 'target', target, 'release', 'bundle', 'nsis',
      `LinAI_${version}_${arch === 'x64' ? 'x64' : 'x86'}-setup.exe`)
    if (sha256File(native) !== sha256File(updater.path)) {
      throw new Error(`${arch} updater differs from the signed native NSIS package`)
    }
    expectedEntries[platform] = {
      signature: readFileSync(signature.path, 'utf8').trim(),
      url: `https://gitee.com/${repo}/releases/download/${releaseTag}/${basename(updater.path)}`,
    }

    const nsisScript = join(desktopRoot, 'src-tauri', 'target', target, 'release', 'nsis', arch, 'installer.nsi')
    if (!readFileSync(nsisScript, 'utf8').includes('installer-hooks.nsh')) {
      throw new Error(`${arch} generated NSIS script does not include installer hooks`)
    }
  }

  const hooks = readFileSync(join(desktopRoot, 'src-tauri', 'windows', 'installer-hooks.nsh'), 'utf8')
  if (!hooks.includes('LINAI_UPDATE_INSTALL_DIR_GUARD') || !hooks.includes('${FileExists}')) {
    throw new Error('NSIS update install-directory guard is incomplete')
  }

  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'latest.json'), 'utf8'))
  return validateManifest(manifest, { version, baselinePlatforms, expectedEntries })
}

async function verifyPublicRelease({
  repo,
  releaseTag,
  latestUrl,
  latestPath,
  manifest,
  artifacts,
  verifyManifest,
}) {
  let publicManifest = manifest
  if (verifyManifest) {
    const remoteManifestText = await fetchText(latestUrl)
    if (sha256Buffer(Buffer.from(remoteManifestText)) !== sha256File(latestPath)) {
      throw new Error('Public latest.json differs from the uploaded manifest')
    }
    publicManifest = JSON.parse(remoteManifestText)
    if (publicManifest.version !== manifest.version) {
      throw new Error('Public manifest version is incorrect')
    }
  }

  for (const platform of ['windows-x86_64', 'windows-i686']) {
    const arch = platform === 'windows-x86_64' ? 'x64' : 'x86'
    const updater = artifacts.find((item) => item.arch === arch && item.kind === 'updater')
    const downloaded = await fetchBuffer(publicManifest.platforms[platform].url)
    if (sha256Buffer(downloaded) !== sha256File(updater.path)) {
      throw new Error(`Public ${platform} updater hash does not match`)
    }
  }

  for (const artifact of artifacts.filter((item) => item.kind !== 'updater')) {
    const url = `https://gitee.com/${repo}/releases/download/${releaseTag}/${basename(artifact.path)}`
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Public asset is unavailable (${response.status}): ${url}`)
  }
}

function readJsonVersion(path) {
  const version = JSON.parse(readFileSync(path, 'utf8')).version
  if (!version) throw new Error(`Missing version in ${path}`)
  return version
}

function readTomlVersion(path) {
  const match = readFileSync(path, 'utf8').match(/^version\s*=\s*"([^"]+)"/m)
  if (!match) throw new Error(`Missing package version in ${path}`)
  return match[1]
}

function runPnpm(cwd, args) {
  const pnpmEntry = process.env.npm_execpath
  if (!pnpmEntry) throw new Error('Run this release through pnpm')
  run(process.execPath, [pnpmEntry, ...args], cwd)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status ?? 'unknown'}`)
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url))
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

async function fetchBuffer(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path))
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}
