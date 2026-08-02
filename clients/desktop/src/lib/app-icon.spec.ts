import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appIconPath = path.join(
  projectDirectory,
  'src-tauri',
  'icons',
  'linai-icon-source.png',
)

function pixelAt(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return Array.from(data.subarray(offset, offset + 4))
}

describe('generated macOS app icon', () => {
  it('keeps transparent corners around an opaque icon body', async () => {
    const { data, info } = await sharp(appIconPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const corners = [
      pixelAt(data, info.width, 0, 0),
      pixelAt(data, info.width, info.width - 1, 0),
      pixelAt(data, info.width, 0, info.height - 1),
      pixelAt(data, info.width, info.width - 1, info.height - 1),
    ]

    expect(corners).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(pixelAt(data, info.width, info.width / 2, info.height / 2)[3]).toBe(255)
  })
})
