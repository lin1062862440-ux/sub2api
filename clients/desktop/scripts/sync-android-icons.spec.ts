import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { syncAndroidIcons } from './sync-android-icons.mjs'

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
const iconNames = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']
const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

async function createFixture({ conventionalPaths = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'linai-android-icons-'))
  temporaryDirectories.push(root)

  const sourceRoot = conventionalPaths
    ? path.join(root, 'src-tauri', 'icons', 'android')
    : path.join(root, 'source')
  const androidResRoot = conventionalPaths
    ? path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res')
    : path.join(root, 'android', 'app', 'src', 'main', 'res')
  const manifestPath = path.join(androidResRoot, '..', 'AndroidManifest.xml')
  await mkdir(sourceRoot, { recursive: true })
  await mkdir(androidResRoot, { recursive: true })
  await writeFile(
    manifestPath,
    [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '    <application',
      '        android:icon="@mipmap/ic_launcher"',
      '        android:label="@string/app_name">',
      '    </application>',
      '</manifest>',
      '',
    ].join('\n'),
  )

  const expected = new Map<string, Buffer>()
  for (const density of densities) {
    const directory = path.join(sourceRoot, `mipmap-${density}`)
    await mkdir(directory, { recursive: true })
    for (const iconName of iconNames) {
      const bytes = Buffer.from(`${density}/${iconName}\0linai`)
      await writeFile(path.join(directory, iconName), bytes)
      expected.set(`${density}/${iconName}`, bytes)
    }
  }

  return { root, sourceRoot, androidResRoot, manifestPath, expected }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('syncAndroidIcons', () => {
  it('copies all launcher icon variants byte-for-byte for every Android density', async () => {
    const { sourceRoot, androidResRoot, expected } = await createFixture()

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    for (const [relativePath, expectedBytes] of expected) {
      const [density, iconName] = relativePath.split('/')
      const actual = await readFile(path.join(androidResRoot, `mipmap-${density}`, iconName))
      expect(actual.equals(expectedBytes), relativePath).toBe(true)
    }
  })

  it('fails with the actionable relative filename when a source icon is missing', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const relativePath = path.join('mipmap-xxhdpi', 'ic_launcher_round.png')
    await rm(path.join(sourceRoot, relativePath))

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      `Missing Android launcher icon source: ${relativePath}`,
    )
  })

  it('preserves android:icon and inserts the round launcher icon reference', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    const manifest = await readFile(manifestPath, 'utf8')
    expect(manifest).toContain(
      '        android:icon="@mipmap/ic_launcher"\n' +
        '        android:roundIcon="@mipmap/ic_launcher_round"\n',
    )
  })

  it('leaves an existing round icon reference unchanged on repeated syncs', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    await syncAndroidIcons({ sourceRoot, androidResRoot })
    const firstManifest = await readFile(manifestPath, 'utf8')

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    const secondManifest = await readFile(manifestPath, 'utf8')
    expect(secondManifest).toBe(firstManifest)
    expect(secondManifest.match(/android:roundIcon=/g)).toHaveLength(1)
  })

  it('fails when the exact launcher icon manifest anchor is missing', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    const manifest = await readFile(manifestPath, 'utf8')
    await writeFile(manifestPath, manifest.replace('android:icon="@mipmap/ic_launcher"\n', ''))

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'AndroidManifest.xml is missing android:icon="@mipmap/ic_launcher"',
    )
  })

  it('explains how to initialize Android when the generated resource root is missing', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await rm(path.join(androidResRoot, '..', '..', '..'), { recursive: true })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'Run `pnpm android:init` first',
    )
  })

  it('resolves source and generated resource paths from its own location when run directly', async () => {
    const { root, androidResRoot, manifestPath, expected } = await createFixture({
      conventionalPaths: true,
    })
    const scriptsDirectory = path.join(root, 'scripts')
    const scriptPath = path.join(scriptsDirectory, 'sync-android-icons.mjs')
    await mkdir(scriptsDirectory, { recursive: true })
    await copyFile(path.resolve('scripts', 'sync-android-icons.mjs'), scriptPath)

    await execFileAsync(process.execPath, [scriptPath])

    for (const [relativePath, expectedBytes] of expected) {
      const [density, iconName] = relativePath.split('/')
      const actual = await readFile(path.join(androidResRoot, `mipmap-${density}`, iconName))
      expect(actual.equals(expectedBytes), relativePath).toBe(true)
    }
    expect(await readFile(manifestPath, 'utf8')).toContain(
      'android:roundIcon="@mipmap/ic_launcher_round"',
    )
  })
})
