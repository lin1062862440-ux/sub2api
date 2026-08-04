import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { arch as processArch, platform as processPlatform } from 'node:process'
import { basename, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_GITEE_REPO = 'linsource/linai-desktop-release'
const DEFAULT_MANIFEST_TAG = 'desktop-latest'
const scriptPath = fileURLToPath(import.meta.url)

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main()
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const out = resolve(root, args.get('out') ?? 'latest.json')
  const giteeRepo = args.get('gitee-repo') ?? process.env.GITEE_RELEASE_REPO ?? DEFAULT_GITEE_REPO
  const releaseTag = args.get('tag') ?? process.env.GITEE_RELEASE_TAG ?? `desktop-v${tauriConfig.version}`
  const manifestTag = args.get('manifest-tag') ?? process.env.GITEE_MANIFEST_TAG ?? DEFAULT_MANIFEST_TAG
  const baseUrl = args.get('base-url') ?? `https://gitee.com/${giteeRepo}/releases/download/${releaseTag}`
  const manifestUrl = `https://gitee.com/${giteeRepo}/releases/download/${manifestTag}/${basename(out)}`
  const bundleRoot = resolve(root, args.get('bundle-root') ?? join('src-tauri', 'target', 'release', 'bundle'))
  const packagePath = args.get('package')
    ? resolve(root, args.get('package'))
    : findUpdaterPackage(bundleRoot, processPlatform)

  if (!packagePath || !existsSync(packagePath)) {
    console.error(`Missing updater package under ${relative(root, bundleRoot)}`)
    process.exitCode = 1
    return
  }

  const signaturePath = resolve(root, args.get('signature') ?? `${packagePath}.sig`)
  if (!existsSync(signaturePath)) {
    console.error(`Missing updater signature: ${relative(root, signaturePath)}`)
    process.exitCode = 1
    return
  }

  const target = args.get('platform') ?? inferUpdaterPlatform(packagePath, processPlatform, processArch)
  const assetUrl = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(basename(packagePath))}`
  const signature = readFileSync(signaturePath, 'utf8').trim()
  const existing = readExistingManifest(out)
  const manifest = mergeManifest(existing, {
    version: tauriConfig.version,
    notes: args.get('notes'),
    target,
    signature,
    url: assetUrl,
    pubDate: new Date().toISOString(),
  })

  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${out}`)
  console.log(`Platform: ${target}`)
  console.log(`Package URL: ${assetUrl}`)
  console.log(`Manifest URL: ${manifestUrl}`)
}

export function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      args.set(key, 'true')
    } else {
      args.set(key, value)
      index += 1
    }
  }
  return args
}

export function inferUpdaterPlatform(file, hostPlatform = processPlatform, hostArch = processArch) {
  if (file.endsWith('.app.tar.gz')) return `darwin-${normalizeArch(hostArch)}`
  if (extname(file).toLowerCase() === '.exe') return `windows-${normalizeArch(hostArch)}`
  if (file.endsWith('.AppImage')) return `linux-${normalizeArch(hostArch)}`
  throw new Error(`Cannot infer updater platform from package: ${file}`)
}

export function mergeManifest(existing, { version, notes, target, signature, url, pubDate }) {
  const sameVersion = existing?.version === version
  return {
    version,
    notes: notes ?? (sameVersion ? existing.notes : '') ?? '',
    pub_date: pubDate,
    platforms: {
      ...(sameVersion && existing.platforms ? existing.platforms : {}),
      [target]: { signature, url },
    },
  }
}

export function findUpdaterPackage(directory, hostPlatform = processPlatform) {
  if (!existsSync(directory)) return null
  const files = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
  if (hostPlatform === 'win32') return files.find((file) => extname(file).toLowerCase() === '.exe') ?? null
  if (hostPlatform === 'darwin') return files.find((file) => file.endsWith('.app.tar.gz')) ?? null
  return files.find((file) => file.endsWith('.AppImage')) ?? null
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function normalizeArch(arch) {
  if (arch === 'x64') return 'x86_64'
  if (arch === 'ia32' || arch === 'x86') return 'i686'
  if (arch === 'arm64') return 'aarch64'
  throw new Error(`Unsupported updater architecture: ${arch}`)
}

function readExistingManifest(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Existing updater manifest is invalid: ${error.message}`)
  }
}
