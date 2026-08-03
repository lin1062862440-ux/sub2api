import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import sharp from 'sharp'

const ANDROID_NAMESPACE = 'http://schemas.android.com/apk/res/android'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const densitySpecs = [
  { density: 'mdpi', legacySize: 48, foregroundSize: 108 },
  { density: 'hdpi', legacySize: 72, foregroundSize: 162 },
  { density: 'xhdpi', legacySize: 96, foregroundSize: 216 },
  { density: 'xxhdpi', legacySize: 144, foregroundSize: 324 },
  { density: 'xxxhdpi', legacySize: 192, foregroundSize: 432 },
]
const iconNames = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']
const pngSpecs = densitySpecs.flatMap((densitySpec) =>
  iconNames.map((iconName) => ({
    relativePath: path.join(`mipmap-${densitySpec.density}`, iconName),
    density: densitySpec.density,
    iconName,
    expectedSize:
      iconName === 'ic_launcher_foreground.png'
        ? densitySpec.foregroundSize
        : densitySpec.legacySize,
  })),
)
const xmlSpecs = [
  { relativePath: path.join('mipmap-anydpi-v26', 'ic_launcher.xml'), type: 'adaptive' },
  { relativePath: path.join('mipmap-anydpi-v26', 'ic_launcher_round.xml'), type: 'adaptive' },
  { relativePath: path.join('values', 'ic_launcher_background.xml'), type: 'color' },
]

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readRegularFile(filePath, label) {
  try {
    const fileStats = await stat(filePath)
    if (!fileStats.isFile()) throw new Error('not a file')
    return await readFile(filePath)
  } catch {
    throw new Error(`${label} must be a readable regular file`)
  }
}

async function inspectPng(bytes, relativePath) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath} is not a valid PNG`)
  }

  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error('invalid PNG')
    return metadata
  } catch {
    throw new Error(`${relativePath} is not a valid PNG`)
  }
}

function parseXml(xml, label) {
  const errors = []
  let document
  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') errors.push(message)
      },
    }).parseFromString(xml, 'application/xml')
  } catch {
    throw new Error(`${label} is malformed XML`)
  }

  if (!document?.documentElement) throw new Error(`${label} is malformed XML`)
  return { document, errors }
}

function directElementChildren(element, localName) {
  const matches = []
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const node = element.childNodes[index]
    if (node.nodeType === 1 && node.localName === localName) matches.push(node)
  }
  return matches
}

function validateAdaptiveXml(bytes, relativePath) {
  const label = path.basename(relativePath)
  const { document, errors } = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes), label)
  if (errors.length > 0 || document.documentElement.localName !== 'adaptive-icon') {
    throw new Error(`${label} is malformed XML`)
  }

  const root = document.documentElement
  if (root.lookupNamespaceURI('android') !== ANDROID_NAMESPACE) {
    throw new Error(`${label} must declare the Android namespace`)
  }
  const foregrounds = directElementChildren(root, 'foreground')
  const backgrounds = directElementChildren(root, 'background')
  if (
    foregrounds.length !== 1 ||
    foregrounds[0].getAttributeNS(ANDROID_NAMESPACE, 'drawable') !==
      '@mipmap/ic_launcher_foreground'
  ) {
    throw new Error(`${label} foreground must reference @mipmap/ic_launcher_foreground`)
  }
  if (
    backgrounds.length !== 1 ||
    backgrounds[0].getAttributeNS(ANDROID_NAMESPACE, 'drawable') !==
      '@color/ic_launcher_background'
  ) {
    throw new Error(`${label} background must reference @color/ic_launcher_background`)
  }
}

function validateColorXml(bytes, relativePath) {
  const label = path.basename(relativePath)
  const { document, errors } = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes), label)
  const colors = directElementChildren(document.documentElement, 'color').filter(
    (element) => element.getAttribute('name') === 'ic_launcher_background',
  )
  if (
    errors.length > 0 ||
    document.documentElement.localName !== 'resources' ||
    colors.length !== 1 ||
    !colors[0].textContent.trim()
  ) {
    throw new Error(`${label} must define ic_launcher_background`)
  }
}

function validateManifestDocument(xml) {
  const { document, errors } = parseXml(xml, 'AndroidManifest.xml')
  const root = document.documentElement
  if (root.lookupNamespaceURI('android') !== ANDROID_NAMESPACE) {
    throw new Error('AndroidManifest.xml must declare the Android namespace')
  }
  if (errors.length > 0 || root.localName !== 'manifest') {
    throw new Error('AndroidManifest.xml is malformed XML')
  }

  const applications = directElementChildren(root, 'application')
  if (applications.length !== 1) {
    throw new Error('AndroidManifest.xml must contain exactly one application element')
  }
  const application = applications[0]
  if (application.getAttributeNS(ANDROID_NAMESPACE, 'icon') !== '@mipmap/ic_launcher') {
    throw new Error('application android:icon must equal @mipmap/ic_launcher')
  }
  return { document, application }
}

function lineColumnToOffset(xml, lineNumber, columnNumber) {
  let offset = 0
  for (let line = 1; line < lineNumber; line += 1) {
    const newlineOffset = xml.indexOf('\n', offset)
    if (newlineOffset === -1) throw new Error('AndroidManifest.xml locator is invalid')
    offset = newlineOffset + 1
  }
  return offset + columnNumber - 1
}

function attributeMatchAt(xml, offset) {
  const match = /^([^\s=]+)(\s*=\s*)(["'])(.*?)\3/s.exec(xml.slice(offset))
  if (!match) throw new Error('AndroidManifest.xml attribute locator is invalid')
  return match
}

function attributeNameOffset(xml, attribute, applicationOffset) {
  const locatorOffset = lineColumnToOffset(xml, attribute.lineNumber, attribute.columnNumber)
  const attributeOffset = xml.lastIndexOf(attribute.name, locatorOffset)
  if (attributeOffset < applicationOffset) {
    throw new Error('AndroidManifest.xml attribute locator is invalid')
  }
  return attributeOffset
}

function patchRoundIcon(xml, application) {
  const iconAttribute = application.getAttributeNodeNS(ANDROID_NAMESPACE, 'icon')
  const roundIconAttribute = application.getAttributeNodeNS(ANDROID_NAMESPACE, 'roundIcon')
  if (!iconAttribute?.lineNumber || !iconAttribute?.columnNumber) {
    throw new Error('AndroidManifest.xml icon locator is unavailable')
  }
  const applicationOffset = lineColumnToOffset(
    xml,
    application.lineNumber,
    application.columnNumber,
  )

  if (roundIconAttribute) {
    const attributeOffset = attributeNameOffset(xml, roundIconAttribute, applicationOffset)
    const match = attributeMatchAt(xml, attributeOffset)
    const valueOffset = attributeOffset + match[1].length + match[2].length + 1
    return (
      xml.slice(0, valueOffset) +
      '@mipmap/ic_launcher_round' +
      xml.slice(valueOffset + match[4].length)
    )
  }

  const iconOffset = attributeNameOffset(xml, iconAttribute, applicationOffset)
  const match = attributeMatchAt(xml, iconOffset)
  const insertionOffset = iconOffset + match[0].length
  const newline = xml.includes('\r\n') ? '\r\n' : '\n'
  const lineStart = xml.lastIndexOf(newline, iconOffset - 1)
  const multiline = lineStart >= applicationOffset
  const indentation = multiline
    ? xml.slice(lineStart + newline.length, iconOffset)
    : ''
  const separator = multiline ? `${newline}${indentation}` : ' '
  return (
    xml.slice(0, insertionOffset) +
    `${separator}android:roundIcon="@mipmap/ic_launcher_round"` +
    xml.slice(insertionOffset)
  )
}

function prepareManifest(bytes) {
  let xml
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('AndroidManifest.xml is malformed XML')
  }
  const { document, application } = validateManifestDocument(xml)
  const updated = patchRoundIcon(xml, application)
  application.setAttributeNS(
    ANDROID_NAMESPACE,
    'android:roundIcon',
    '@mipmap/ic_launcher_round',
  )
  validateManifestDocument(new XMLSerializer().serializeToString(document))

  const verified = validateManifestDocument(updated)
  if (
    verified.application.getAttributeNS(ANDROID_NAMESPACE, 'roundIcon') !==
    '@mipmap/ic_launcher_round'
  ) {
    throw new Error('AndroidManifest.xml roundIcon normalization failed')
  }
  return Buffer.from(updated)
}

async function prepareSources(sourceRoot) {
  const rawPngs = new Map()
  const metadata = new Map()
  for (const spec of pngSpecs) {
    const bytes = await readRegularFile(
      path.join(sourceRoot, spec.relativePath),
      spec.relativePath,
    )
    rawPngs.set(spec.relativePath, bytes)
    metadata.set(spec.relativePath, await inspectPng(bytes, spec.relativePath))
  }

  const pngs = new Map(rawPngs)
  const normalizedSources = new Map()
  for (const spec of pngSpecs) {
    const imageMetadata = metadata.get(spec.relativePath)
    const isRegeneratedHdpiLegacy =
      spec.density === 'hdpi' &&
      spec.iconName !== 'ic_launcher_foreground.png' &&
      imageMetadata.width === 49 &&
      imageMetadata.height === 49

    if (isRegeneratedHdpiLegacy) {
      const xhdpiRelativePath = path.join('mipmap-xhdpi', spec.iconName)
      const normalized = await sharp(rawPngs.get(xhdpiRelativePath))
        .resize(72, 72, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer()
      await inspectPng(normalized, spec.relativePath)
      pngs.set(spec.relativePath, normalized)
      normalizedSources.set(spec.relativePath, normalized)
      continue
    }

    if (imageMetadata.width !== spec.expectedSize || imageMetadata.height !== spec.expectedSize) {
      throw new Error(
        `${spec.relativePath} must be a ${spec.expectedSize}x${spec.expectedSize} PNG`,
      )
    }
  }

  const xmls = new Map()
  for (const spec of xmlSpecs) {
    const bytes = await readRegularFile(
      path.join(sourceRoot, spec.relativePath),
      spec.relativePath,
    )
    if (spec.type === 'adaptive') validateAdaptiveXml(bytes, spec.relativePath)
    else validateColorXml(bytes, spec.relativePath)
    xmls.set(spec.relativePath, bytes)
  }

  return { pngs, xmls, normalizedSources }
}

async function stageEntries(stageRoot, entries) {
  for (let index = 0; index < entries.length; index += 1) {
    const stagedPath = path.join(stageRoot, 'files', String(index))
    await mkdir(path.dirname(stagedPath), { recursive: true })
    await writeFile(stagedPath, entries[index].bytes)
    const stagedBytes = await readFile(stagedPath)
    if (hash(stagedBytes) !== hash(entries[index].bytes)) {
      throw new Error(`Staging hash mismatch for ${entries[index].label}`)
    }
    entries[index].stagedPath = stagedPath
  }
}

async function commitEntries(entries, stageRoot) {
  const changed = []
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const backupPath = path.join(stageRoot, 'backups', String(index))
      let originalType = 'absent'
      try {
        const destinationStats = await stat(entry.destination)
        if (destinationStats.isFile()) {
          originalType = 'file'
          await mkdir(path.dirname(backupPath), { recursive: true })
          await copyFile(entry.destination, backupPath)
        } else originalType = 'other'
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      await mkdir(path.dirname(entry.destination), { recursive: true })
      changed.push({ destination: entry.destination, originalType, backupPath })
      await copyFile(entry.stagedPath, entry.destination)
      if (hash(await readFile(entry.destination)) !== hash(entry.bytes)) {
        throw new Error(`Committed hash mismatch for ${entry.label}`)
      }
    }
  } catch (commitError) {
    const rollbackErrors = []
    for (const entry of changed.reverse()) {
      try {
        if (entry.originalType === 'file') await copyFile(entry.backupPath, entry.destination)
        else if (entry.originalType === 'absent') await rm(entry.destination, { force: true })
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([commitError, ...rollbackErrors], 'Android icon sync rollback failed')
    }
    throw commitError
  }
}

export async function syncAndroidIcons({ sourceRoot, androidResRoot }) {
  try {
    const resourceStats = await stat(androidResRoot)
    if (!resourceStats.isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(
      `Android generated resources not found at ${androidResRoot}. Run \`pnpm android:init\` first.`,
    )
  }

  const mainRoot = path.dirname(androidResRoot)
  const lockPath = path.join(mainRoot, '.sync-android-icons.lock')
  try {
    await mkdir(lockPath)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('Another Android launcher icon sync is already running')
    }
    throw error
  }

  let stageRoot
  try {
    const manifestPath = path.join(mainRoot, 'AndroidManifest.xml')
    const manifest = prepareManifest(
      await readRegularFile(manifestPath, 'AndroidManifest.xml'),
    )
    const { pngs, xmls, normalizedSources } = await prepareSources(sourceRoot)
    const entries = [
      { destination: manifestPath, bytes: manifest, label: 'AndroidManifest.xml' },
      ...[...normalizedSources].map(([relativePath, bytes]) => ({
        destination: path.join(sourceRoot, relativePath),
        bytes,
        label: `source/${relativePath}`,
      })),
      ...[...pngs].map(([relativePath, bytes]) => ({
        destination: path.join(androidResRoot, relativePath),
        bytes,
        label: relativePath,
      })),
      ...[...xmls].map(([relativePath, bytes]) => ({
        destination: path.join(androidResRoot, relativePath),
        bytes,
        label: relativePath,
      })),
    ]

    stageRoot = await mkdtemp(path.join(mainRoot, '.android-icons-stage-'))
    await stageEntries(stageRoot, entries)
    await commitEntries(entries, stageRoot)
  } finally {
    try {
      if (stageRoot) await rm(stageRoot, { recursive: true, force: true })
    } finally {
      await rm(lockPath, { recursive: true, force: true })
    }
  }
}

const scriptPath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null
const isDirectInvocation = invokedPath === (await realpath(scriptPath))

if (isDirectInvocation) {
  const projectRoot = path.resolve(path.dirname(scriptPath), '..')
  const sourceRoot = path.join(projectRoot, 'src-tauri', 'icons', 'android')
  const androidResRoot = path.join(
    projectRoot,
    'src-tauri',
    'gen',
    'android',
    'app',
    'src',
    'main',
    'res',
  )

  syncAndroidIcons({ sourceRoot, androidResRoot })
    .then(() => console.log('Validated and synced Android launcher icon resources.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
