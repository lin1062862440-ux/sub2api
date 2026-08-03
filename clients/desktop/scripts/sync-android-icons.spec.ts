import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { DOMParser } from '@xmldom/xmldom'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { syncAndroidIcons } from './sync-android-icons.mjs'

const ANDROID_NAMESPACE = 'http://schemas.android.com/apk/res/android'
const densitySpecs = [
  { density: 'mdpi', legacySize: 48, foregroundSize: 108 },
  { density: 'hdpi', legacySize: 72, foregroundSize: 162 },
  { density: 'xhdpi', legacySize: 96, foregroundSize: 216 },
  { density: 'xxhdpi', legacySize: 144, foregroundSize: 324 },
  { density: 'xxxhdpi', legacySize: 192, foregroundSize: 432 },
]
const iconNames = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']
const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="${ANDROID_NAMESPACE}">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@color/ic_launcher_background"/>
</adaptive-icon>
`

const backgroundColorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#fff</color>
</resources>
`

function defaultManifest(newline = '\n') {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<manifest xmlns:android="${ANDROID_NAMESPACE}">`,
    '    <application',
    '        android:icon="@mipmap/ic_launcher"',
    '        android:label="@string/app_name">',
    '    </application>',
    '</manifest>',
    '',
  ].join(newline)
}

async function createPng(size: number, seed: number) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: {
        r: (seed * 47) % 255,
        g: (seed * 83) % 255,
        b: (seed * 131) % 255,
        alpha: 0.85,
      },
    },
  })
    .png()
    .toBuffer()
}

function findIdatChunk(bytes: Buffer) {
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') return { offset, length, dataOffset: offset + 8 }
    offset += 12 + length
  }
  throw new Error('PNG fixture has no IDAT chunk')
}

function truncateIdat(bytes: Buffer) {
  const chunk = findIdatChunk(bytes)
  return bytes.subarray(0, chunk.dataOffset + Math.max(1, Math.floor(chunk.length / 2)))
}

function corruptIdat(bytes: Buffer) {
  const chunk = findIdatChunk(bytes)
  const corrupted = Buffer.from(bytes)
  corrupted[chunk.dataOffset + Math.floor(chunk.length / 2)] ^= 0xff
  return corrupted
}

async function createFixture({
  conventionalPaths = false,
  hdpiLegacySize = 72,
  manifest = defaultManifest(),
  rootPrefix = 'linai-android-icons-',
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), rootPrefix))
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
  await writeFile(manifestPath, manifest)

  const expected = new Map<string, Buffer>()
  let seed = 1
  for (const spec of densitySpecs) {
    const directory = path.join(sourceRoot, `mipmap-${spec.density}`)
    await mkdir(directory, { recursive: true })
    for (const iconName of iconNames) {
      const expectedSize = iconName === 'ic_launcher_foreground.png' ? spec.foregroundSize : spec.legacySize
      const size = spec.density === 'hdpi' && iconName !== 'ic_launcher_foreground.png'
        ? hdpiLegacySize
        : expectedSize
      const bytes = await createPng(size, seed++)
      await writeFile(path.join(directory, iconName), bytes)
      expected.set(`${spec.density}/${iconName}`, bytes)
    }
  }

  const adaptiveDirectory = path.join(sourceRoot, 'mipmap-anydpi-v26')
  const valuesDirectory = path.join(sourceRoot, 'values')
  await mkdir(adaptiveDirectory, { recursive: true })
  await mkdir(valuesDirectory, { recursive: true })
  await Promise.all([
    writeFile(path.join(adaptiveDirectory, 'ic_launcher.xml'), adaptiveIconXml),
    writeFile(path.join(adaptiveDirectory, 'ic_launcher_round.xml'), adaptiveIconXml),
    writeFile(path.join(valuesDirectory, 'ic_launcher_background.xml'), backgroundColorXml),
  ])

  return { root, sourceRoot, androidResRoot, manifestPath, expected }
}

async function expectPngSize(filePath: string, expectedSize: number) {
  const metadata = await sharp(filePath).metadata()
  expect(metadata.format).toBe('png')
  expect([metadata.width, metadata.height]).toEqual([expectedSize, expectedSize])
}

async function expectNoTransactionArtifacts(androidResRoot: string) {
  const mainRoot = path.dirname(androidResRoot)
  await expect(lstat(path.join(mainRoot, '.sync-android-icons.lock')))
    .rejects.toMatchObject({ code: 'ENOENT' })
  expect((await readdir(mainRoot)).some((name) => name.startsWith('.android-icons-stage-')))
    .toBe(false)
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function writeLockOwner(
  androidResRoot: string,
  owner: { pid: number; transactionPath: string | null },
) {
  const lockPath = path.join(androidResRoot, '..', '.sync-android-icons.lock')
  await mkdir(lockPath)
  await writeFile(
    path.join(lockPath, 'owner.json'),
    JSON.stringify({
      version: 1,
      pid: owner.pid,
      startedAt: new Date().toISOString(),
      transactionPath: owner.transactionPath,
    }),
  )
  return lockPath
}

function parseManifest(xml: string) {
  const errors: string[] = []
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') errors.push(message)
    },
  }).parseFromString(xml, 'application/xml')
  expect(errors).toEqual([])
  return document
}

async function installCliScript(root: string) {
  const scriptsDirectory = path.join(root, 'scripts')
  const scriptPath = path.join(scriptsDirectory, 'sync-android-icons.mjs')
  await mkdir(scriptsDirectory, { recursive: true })
  await copyFile(path.resolve('scripts', 'sync-android-icons.mjs'), scriptPath)
  await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir')
  return scriptPath
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('syncAndroidIcons resources', () => {
  it('copies all valid launcher PNGs byte-for-byte and synchronizes adaptive XML resources', async () => {
    const { sourceRoot, androidResRoot, expected } = await createFixture()

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    for (const [relativePath, expectedBytes] of expected) {
      const [density, iconName] = relativePath.split('/')
      const actual = await readFile(path.join(androidResRoot, `mipmap-${density}`, iconName))
      expect(actual.equals(expectedBytes), relativePath).toBe(true)
    }
    for (const relativePath of [
      path.join('mipmap-anydpi-v26', 'ic_launcher.xml'),
      path.join('mipmap-anydpi-v26', 'ic_launcher_round.xml'),
      path.join('values', 'ic_launcher_background.xml'),
    ]) {
      expect(await readFile(path.join(androidResRoot, relativePath), 'utf8')).toBe(
        await readFile(path.join(sourceRoot, relativePath), 'utf8'),
      )
    }
  })

  it('normalizes regenerated 49px hdpi legacy icons to 72px from their xhdpi variants', async () => {
    const { sourceRoot, androidResRoot } = await createFixture({ hdpiLegacySize: 49 })
    const xhdpiHashBefore = await sharp(
      path.join(sourceRoot, 'mipmap-xhdpi', 'ic_launcher.png'),
    ).toBuffer()

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    for (const iconName of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const source = path.join(sourceRoot, 'mipmap-hdpi', iconName)
      const target = path.join(androidResRoot, 'mipmap-hdpi', iconName)
      await expectPngSize(source, 72)
      await expectPngSize(target, 72)
      expect(await readFile(target)).toEqual(await readFile(source))
    }
    expect(await readFile(path.join(sourceRoot, 'mipmap-xhdpi', 'ic_launcher.png'))).toEqual(
      xhdpiHashBefore,
    )
  })

  it('rejects a PNG with the wrong density dimensions before writing targets', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    const source = path.join(sourceRoot, 'mipmap-xxhdpi', 'ic_launcher.png')
    await writeFile(source, await createPng(143, 99))
    const manifestBefore = await readFile(manifestPath)

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'mipmap-xxhdpi/ic_launcher.png must be a 144x144 PNG',
    )
    expect(await readFile(manifestPath)).toEqual(manifestBefore)
  })

  it('rejects a non-PNG source with an actionable filename', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await writeFile(path.join(sourceRoot, 'mipmap-mdpi', 'ic_launcher.png'), Buffer.from('not png'))

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'mipmap-mdpi/ic_launcher.png is not a valid PNG',
    )
  })

  it.each([
    ['a truncated IDAT stream', truncateIdat],
    ['a corrupted IDAT chunk', corruptIdat],
  ])('fully decodes and rejects %s without changing any live files', async (_label, damage) => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    const relativePath = path.join('mipmap-mdpi', 'ic_launcher.png')
    const sourcePath = path.join(sourceRoot, relativePath)
    const damagedSource = damage(await readFile(sourcePath))
    await expect(sharp(damagedSource).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 48,
      height: 48,
    })
    await writeFile(sourcePath, damagedSource)
    const targetPath = path.join(androidResRoot, relativePath)
    const originalTarget = Buffer.from('existing generated target')
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, originalTarget)
    const originalManifest = await readFile(manifestPath)

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      `${relativePath} is not a valid PNG`,
    )

    expect(await readFile(sourcePath)).toEqual(damagedSource)
    expect(await readFile(targetPath)).toEqual(originalTarget)
    expect(await readFile(manifestPath)).toEqual(originalManifest)
    await expectNoTransactionArtifacts(androidResRoot)
  })

  it('rejects a source path that is not a regular file', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const source = path.join(sourceRoot, 'mipmap-mdpi', 'ic_launcher_round.png')
    await rm(source)
    await mkdir(source)

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'mipmap-mdpi/ic_launcher_round.png must be a readable regular file',
    )
  })

  it('fails with the actionable relative filename when a source icon is missing', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await rm(path.join(sourceRoot, 'mipmap-xxhdpi', 'ic_launcher_round.png'))

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'mipmap-xxhdpi/ic_launcher_round.png must be a readable regular file',
    )
  })

  it('rejects adaptive descriptors whose resource references drift', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await writeFile(
      path.join(sourceRoot, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'),
      adaptiveIconXml.replace('@mipmap/ic_launcher_foreground', '@drawable/old_foreground'),
    )

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'ic_launcher_round.xml foreground must reference @mipmap/ic_launcher_foreground',
    )
  })

  it.each([
    path.join('mipmap-anydpi-v26', 'ic_launcher_round.xml'),
    path.join('values', 'ic_launcher_background.xml'),
  ])('rejects non-UTF-8 XML with its relative source path: %s', async (relativePath) => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await writeFile(
      path.join(sourceRoot, relativePath),
      Buffer.concat([Buffer.from('<?xml version="1.0"?><resources>'), Buffer.from([0xff]), Buffer.from('</resources>')]),
    )

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      `${relativePath} is not valid UTF-8 XML`,
    )
  })

  it.each(['red', '#12', '#12345', '@drawable/icon_background'])(
    'rejects an invalid Android launcher background color: %s',
    async (color) => {
      const { sourceRoot, androidResRoot } = await createFixture()
      const relativePath = path.join('values', 'ic_launcher_background.xml')
      await writeFile(
        path.join(sourceRoot, relativePath),
        backgroundColorXml.replace('#fff', color),
      )

      await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
        `${relativePath} must define a valid ic_launcher_background color`,
      )
    },
  )

  it('repairs drifted generated adaptive descriptors from validated source XML', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const targetDirectory = path.join(androidResRoot, 'mipmap-anydpi-v26')
    await mkdir(targetDirectory, { recursive: true })
    await writeFile(
      path.join(targetDirectory, 'ic_launcher_round.xml'),
      adaptiveIconXml.replace('@color/ic_launcher_background', '@color/old_background'),
    )

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    expect(await readFile(path.join(targetDirectory, 'ic_launcher_round.xml'))).toEqual(
      await readFile(path.join(sourceRoot, 'mipmap-anydpi-v26', 'ic_launcher_round.xml')),
    )
  })
})

describe('syncAndroidIcons manifest semantics', () => {
  it('preserves manifest formatting outside the inserted roundIcon attribute', async () => {
    const manifest = defaultManifest()
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture({ manifest })

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    expect(await readFile(manifestPath, 'utf8')).toBe(
      manifest.replace(
        '        android:icon="@mipmap/ic_launcher"',
        '        android:icon="@mipmap/ic_launcher"\n' +
          '        android:roundIcon="@mipmap/ic_launcher_round"',
      ),
    )
  })

  it('uses XML semantics with comments and whitespace, normalizes roundIcon, and preserves CRLF', async () => {
    const manifest = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<manifest xmlns:android = "${ANDROID_NAMESPACE}">`,
      '    <!-- android:icon="@mipmap/fake" android:roundIcon="@mipmap/fake" -->',
      '    <application android:icon = "@mipmap/ic_launcher"',
      '        android:roundIcon = "@mipmap/old_round"',
      '        android:label = "@string/app_name">',
      '    </application>',
      '</manifest>',
      '',
    ].join('\r\n')
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture({ manifest })

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    const updated = await readFile(manifestPath, 'utf8')
    expect(updated.replace(/\r\n/g, '')).not.toContain('\n')
    expect(updated).toContain('android:icon="@mipmap/fake"')
    const application = parseManifest(updated).getElementsByTagName('application')[0]
    expect(application.getAttributeNS(ANDROID_NAMESPACE, 'icon')).toBe('@mipmap/ic_launcher')
    expect(application.getAttributeNS(ANDROID_NAMESPACE, 'roundIcon')).toBe(
      '@mipmap/ic_launcher_round',
    )
  })

  it('is byte-for-byte idempotent after normalizing the manifest', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    await syncAndroidIcons({ sourceRoot, androidResRoot })
    const firstManifest = await readFile(manifestPath)

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    expect(await readFile(manifestPath)).toEqual(firstManifest)
  })

  it('rejects a comment-only fake launcher icon attribute', async () => {
    const manifest = defaultManifest()
      .replace(
        '    <application',
        '    <!-- android:icon="@mipmap/ic_launcher" -->\n    <application',
      )
      .replace('        android:icon="@mipmap/ic_launcher"\n', '')
    const { sourceRoot, androidResRoot } = await createFixture({ manifest })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'application android:icon must equal @mipmap/ic_launcher',
    )
  })

  it('rejects a malformed manifest', async () => {
    const manifest = defaultManifest().replace('</application>', '')
    const { sourceRoot, androidResRoot } = await createFixture({ manifest })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'AndroidManifest.xml is malformed XML',
    )
  })

  it('rejects duplicate roundIcon attributes', async () => {
    const manifest = defaultManifest().replace(
      '        android:icon="@mipmap/ic_launcher"',
      '        android:icon="@mipmap/ic_launcher"\n' +
        '        android:roundIcon="@mipmap/one"\n' +
        '        android:roundIcon="@mipmap/two"',
    )
    const { sourceRoot, androidResRoot } = await createFixture({ manifest })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'AndroidManifest.xml is malformed XML',
    )
  })

  it('rejects manifests without exactly one direct application element', async () => {
    const manifest = defaultManifest().replace(
      '    </application>',
      '    </application>\n    <application android:icon="@mipmap/ic_launcher"/>',
    )
    const { sourceRoot, androidResRoot } = await createFixture({ manifest })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'AndroidManifest.xml must contain exactly one application element',
    )
  })

  it('rejects a missing Android namespace or wrong launcher icon value', async () => {
    const noNamespace = defaultManifest()
      .replace(` xmlns:android="${ANDROID_NAMESPACE}"`, '')
      .replaceAll('android:', '')
    const first = await createFixture({ manifest: noNamespace })
    await expect(
      syncAndroidIcons({ sourceRoot: first.sourceRoot, androidResRoot: first.androidResRoot }),
    ).rejects.toThrow('AndroidManifest.xml must declare the Android namespace')

    const wrongIcon = defaultManifest().replace('@mipmap/ic_launcher', '@mipmap/old_launcher')
    const second = await createFixture({ manifest: wrongIcon })
    await expect(
      syncAndroidIcons({ sourceRoot: second.sourceRoot, androidResRoot: second.androidResRoot }),
    ).rejects.toThrow('application android:icon must equal @mipmap/ic_launcher')
  })

  it('fails clearly when AndroidManifest.xml is missing', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture()
    await rm(manifestPath)

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'AndroidManifest.xml must be a readable regular file',
    )
  })
})

describe('syncAndroidIcons transaction', () => {
  it('fails clearly when another icon sync owns the exclusive lock', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const lockPath = await writeLockOwner(androidResRoot, {
      pid: process.pid,
      transactionPath: null,
    })

    const error = await syncAndroidIcons({ sourceRoot, androidResRoot }).catch((caught) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain(`Another Android launcher icon sync owns ${lockPath}`)
    expect(error.message).toContain(`PID ${process.pid}`)
    expect(error.message).toContain('rerun')
    expect(await lstat(lockPath)).toBeTruthy()
  })

  it('cleans a dead owner lock without a live transaction and retries safely', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    await writeLockOwner(androidResRoot, { pid: 99_999_999, transactionPath: null })

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    await expectNoTransactionArtifacts(androidResRoot)
  })

  it('preserves an unsafe lock when owner metadata cannot be validated', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const lockPath = path.join(androidResRoot, '..', '.sync-android-icons.lock')
    await mkdir(lockPath)
    await writeFile(path.join(lockPath, 'owner.json'), '{invalid json')

    const error = await syncAndroidIcons({ sourceRoot, androidResRoot }).catch((caught) => caught)

    expect(error.message).toContain(`Cannot safely recover Android launcher icon lock ${lockPath}`)
    expect(error.message).toContain('Do not delete it manually')
    expect(await readFile(path.join(lockPath, 'owner.json'), 'utf8')).toBe('{invalid json')
  })

  it('recovers a dead owner crash journal before starting the next sync', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()
    const mainRoot = path.dirname(androidResRoot)
    const transactionPath = path.join(mainRoot, '.android-icons-stage-crash-fixture')
    const destination = path.join(androidResRoot, 'mipmap-mdpi', 'ic_launcher.png')
    const backupPath = path.join(transactionPath, 'backups', '0')
    const stagedPath = path.join(transactionPath, 'files', '0')
    const originalBytes = Buffer.from('original target before crash')
    const committedBytes = Buffer.from('new target left by crashed sync')
    await mkdir(path.dirname(destination), { recursive: true })
    await mkdir(path.dirname(backupPath), { recursive: true })
    await writeFile(destination, committedBytes)
    await writeFile(backupPath, originalBytes)
    await writeFile(
      path.join(transactionPath, 'journal.json'),
      JSON.stringify({
        version: 1,
        status: 'committing',
        sourceRoot,
        androidResRoot,
        entries: [
          {
            destination,
            stagedPath,
            backupPath,
            originalType: 'file',
            originalHash: sha256(originalBytes),
            newHash: sha256(committedBytes),
          },
        ],
      }),
    )
    await writeLockOwner(androidResRoot, { pid: 99_999_999, transactionPath })
    await writeFile(path.join(sourceRoot, 'mipmap-mdpi', 'ic_launcher.png'), Buffer.from('not png'))

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow(
      'mipmap-mdpi/ic_launcher.png is not a valid PNG',
    )

    expect(await readFile(destination)).toEqual(originalBytes)
    await expectNoTransactionArtifacts(androidResRoot)
  })

  it('rolls back the manifest, normalized source, and replaced resources after a mid-commit failure', async () => {
    const { sourceRoot, androidResRoot, manifestPath } = await createFixture({ hdpiLegacySize: 49 })
    const originalManifest = await readFile(manifestPath)
    const sourceHdpi = path.join(sourceRoot, 'mipmap-hdpi', 'ic_launcher.png')
    const originalSourceHdpi = await readFile(sourceHdpi)
    const firstTarget = path.join(androidResRoot, 'mipmap-mdpi', 'ic_launcher.png')
    await mkdir(path.dirname(firstTarget), { recursive: true })
    const originalFirstTarget = Buffer.from('original generated icon')
    await writeFile(firstTarget, originalFirstTarget)
    const failingTarget = path.join(androidResRoot, 'mipmap-xhdpi', 'ic_launcher.png')
    await mkdir(failingTarget, { recursive: true })

    await expect(syncAndroidIcons({ sourceRoot, androidResRoot })).rejects.toThrow()

    expect(await readFile(manifestPath)).toEqual(originalManifest)
    expect(await readFile(sourceHdpi)).toEqual(originalSourceHdpi)
    expect(await readFile(firstTarget)).toEqual(originalFirstTarget)
    await expect(lstat(path.join(androidResRoot, 'mipmap-anydpi-v26', 'ic_launcher_round.xml')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(path.join(androidResRoot, '..', '.sync-android-icons.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(path.join(androidResRoot, '..'))).some((name) => name.startsWith('.android-icons-stage-')))
      .toBe(false)
  })

  it('cleans staging and lock artifacts after a successful sync', async () => {
    const { sourceRoot, androidResRoot } = await createFixture()

    await syncAndroidIcons({ sourceRoot, androidResRoot })

    await expect(lstat(path.join(androidResRoot, '..', '.sync-android-icons.lock')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(path.join(androidResRoot, '..'))).some((name) => name.startsWith('.android-icons-stage-')))
      .toBe(false)
  })
})

describe('syncAndroidIcons CLI', () => {
  it('resolves a symlinked script inside a project path containing spaces', async () => {
    const { root, sourceRoot, androidResRoot } = await createFixture({
      conventionalPaths: true,
      rootPrefix: 'linai android icons ',
    })
    const scriptPath = await installCliScript(root)
    const linkedScriptPath = path.join(root, 'scripts', 'android icons alias.mjs')
    await symlink(scriptPath, linkedScriptPath)

    await execFileAsync(process.execPath, [linkedScriptPath])

    await expectPngSize(path.join(sourceRoot, 'mipmap-hdpi', 'ic_launcher.png'), 72)
    expect(await readFile(path.join(androidResRoot, 'mipmap-anydpi-v26', 'ic_launcher_round.xml')))
      .toEqual(await readFile(path.join(sourceRoot, 'mipmap-anydpi-v26', 'ic_launcher_round.xml')))
  })

  it('exits non-zero and explains android:init when generated Android resources are absent', async () => {
    const { root, androidResRoot } = await createFixture({ conventionalPaths: true })
    const scriptPath = await installCliScript(root)
    await rm(path.join(androidResRoot, '..', '..', '..'), { recursive: true })

    await expect(execFileAsync(process.execPath, [scriptPath])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Run `pnpm android:init` first'),
    })
  })
})
