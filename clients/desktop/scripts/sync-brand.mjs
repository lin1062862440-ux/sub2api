import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import sharp from 'sharp'

import { BACKEND_ORIGIN } from '../src/host.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const assetsDirectory = path.join(projectDirectory, 'src', 'assets')
const publicDirectory = path.join(projectDirectory, 'public')
const iconDirectory = path.join(projectDirectory, 'src-tauri', 'icons')

function decodeDataImage(value) {
  const match = /^data:image\/(svg\+xml|png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(value)
  if (!match) return null

  const bytes = Buffer.from(match[2], 'base64')
  return bytes.length > 0 ? bytes : null
}

async function downloadLogo(value) {
  const embedded = decodeDataImage(value)
  if (embedded) return embedded

  if (!value.startsWith('https://')) {
    throw new Error('LinAI site_logo must be an HTTPS URL or a supported base64 image')
  }

  const response = await fetch(value, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Logo request failed with HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function getPublicBrand() {
  const response = await fetch(`${BACKEND_ORIGIN}/api/v1/settings/public`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Public settings request failed with HTTP ${response.status}`)

  const envelope = await response.json()
  if (envelope?.code !== 0 || !envelope?.data?.site_logo) {
    throw new Error('Public settings did not return a LinAI site_logo')
  }
  return envelope.data
}

async function run() {
  const brand = await getPublicBrand()
  const logoBytes = await downloadLogo(brand.site_logo)

  await Promise.all([
    mkdir(assetsDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
    mkdir(iconDirectory, { recursive: true }),
  ])

  const fallbackLogo = await sharp(logoBytes)
    .resize({ width: 320, height: 320, fit: 'contain' })
    .png()
    .toBuffer()

  const compactMark = await sharp(logoBytes)
    .trim()
    .resize({
      width: 520,
      height: 520,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const iconTileSize = 824
  const iconTileRadius = 185
  const iconTile = Buffer.from(`
    <svg width="${iconTileSize}" height="${iconTileSize}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="1"
        y="1"
        width="${iconTileSize - 2}"
        height="${iconTileSize - 2}"
        rx="${iconTileRadius}"
        fill="#FFFFFF"
        stroke="#DCE5F3"
        stroke-width="2"
      />
    </svg>
  `)

  const appIcon = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: iconTile, gravity: 'center' },
      { input: compactMark, gravity: 'center' },
    ])
    .png()
    .toBuffer()

  const fallbackPath = path.join(assetsDirectory, 'linai-logo.png')
  const faviconPath = path.join(publicDirectory, 'favicon.png')
  const iconSourcePath = path.join(iconDirectory, 'linai-icon-source.png')

  await Promise.all([
    writeFile(fallbackPath, fallbackLogo),
    writeFile(faviconPath, fallbackLogo),
    writeFile(iconSourcePath, appIcon),
  ])

  const iconResult = spawnSync('pnpm', ['exec', 'tauri', 'icon', iconSourcePath], {
    cwd: projectDirectory,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (iconResult.status !== 0) throw new Error('Tauri icon generation failed')

  console.log(`Synced ${brand.site_name || 'LinAI'} branding from ${BACKEND_ORIGIN}`)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
