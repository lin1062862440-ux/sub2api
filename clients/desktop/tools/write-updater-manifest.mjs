import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { arch as processArch } from 'node:process'

const DEFAULT_GITEE_REPO = 'linsource/linai-desktop-release'
const DEFAULT_MANIFEST_TAG = 'desktop-latest'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (!arg.startsWith('--')) continue
  const key = arg.slice(2)
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    args.set(key, 'true')
  } else {
    args.set(key, value)
    index += 1
  }
}

const root = new URL('..', import.meta.url)
const tauriConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const bundleRoot = new URL('../src-tauri/target/release/bundle', import.meta.url)
const out = args.get('out') ?? 'latest.json'
const giteeRepo = args.get('gitee-repo') ?? process.env.GITEE_RELEASE_REPO ?? DEFAULT_GITEE_REPO
const releaseTag = args.get('tag') ?? process.env.GITEE_RELEASE_TAG ?? `desktop-v${tauriConfig.version}`
const manifestTag = args.get('manifest-tag') ?? process.env.GITEE_MANIFEST_TAG ?? DEFAULT_MANIFEST_TAG
const baseUrl = args.get('base-url') ?? `https://gitee.com/${giteeRepo}/releases/download/${releaseTag}`
const manifestUrl = `https://gitee.com/${giteeRepo}/releases/download/${manifestTag}/${basename(out)}`

const updaterPackage = findUpdaterPackage(bundleRoot.pathname)
if (!updaterPackage) {
  console.error(`Missing updater package under ${relative(root.pathname, bundleRoot.pathname)}`)
  process.exit(1)
}
const signaturePath = `${updaterPackage}.sig`
if (!existsSync(signaturePath)) {
  console.error(`Missing updater signature: ${relative(root.pathname, signaturePath)}`)
  process.exit(1)
}

const target = `darwin-${processArch === 'arm64' ? 'aarch64' : 'x86_64'}`
const assetUrl = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(basename(updaterPackage))}`
const signature = readFileSync(signaturePath, 'utf8').trim()

const manifest = {
  version: tauriConfig.version,
  notes: args.get('notes') ?? '',
  pub_date: new Date().toISOString(),
  platforms: {
    [target]: {
      signature,
      url: assetUrl,
    },
  },
}

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${out}`)
console.log(`Package URL: ${assetUrl}`)
console.log(`Manifest URL: ${manifestUrl}`)

function findUpdaterPackage(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? [findUpdaterPackage(path)].filter(Boolean) : [path]
  })

  return files.find((file) => file.endsWith('.app.tar.gz')) ?? files.find((file) => extname(file) === '.AppImage')
}
