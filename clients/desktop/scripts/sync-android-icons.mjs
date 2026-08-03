import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
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
const LOCK_NAME = '.sync-android-icons.lock'
const OWNER_NAME = 'owner.json'
const JOURNAL_NAME = 'journal.json'
const TRANSACTION_PREFIX = '.android-icons-stage-'
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

function isPathInside(root, candidate) {
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate))
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath)
}

async function pathState(filePath) {
  try {
    const fileStats = await stat(filePath)
    if (fileStats.isFile()) return { type: 'file', bytes: await readFile(filePath) }
    return { type: 'other' }
  } catch (error) {
    if (error?.code === 'ENOENT') return { type: 'absent' }
    throw error
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, filePath)
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    throw new Error(`${label} is missing or invalid JSON`)
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    return null
  }
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
    const { info } = await sharp(bytes, { failOn: 'error' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (
      metadata.format !== 'png' ||
      !metadata.width ||
      !metadata.height ||
      info.width !== metadata.width ||
      info.height !== metadata.height ||
      info.channels !== 4
    ) {
      throw new Error('invalid PNG')
    }
    return info
  } catch {
    throw new Error(`${relativePath} is not a valid PNG`)
  }
}

function decodeXml(bytes, relativePath) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${relativePath} is not valid UTF-8 XML`)
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
  const label = relativePath
  const { document, errors } = parseXml(decodeXml(bytes, relativePath), label)
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
  const label = relativePath
  const { document, errors } = parseXml(decodeXml(bytes, relativePath), label)
  const colors = directElementChildren(document.documentElement, 'color').filter(
    (element) => element.getAttribute('name') === 'ic_launcher_background',
  )
  const value = colors[0]?.textContent.trim()
  const validColor =
    /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|@color\/[a-z0-9_.]+)$/i.test(value || '')
  if (
    errors.length > 0 ||
    document.documentElement.localName !== 'resources' ||
    colors.length !== 1 ||
    !validColor
  ) {
    throw new Error(`${label} must define a valid ic_launcher_background color`)
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

function validateJournal(journal, transactionPath, { sourceRoot, androidResRoot }) {
  const manifestPath = path.join(path.dirname(androidResRoot), 'AndroidManifest.xml')
  if (
    journal?.version !== 1 ||
    !['prepared', 'committing', 'committed', 'rolled_back'].includes(journal.status) ||
    path.resolve(journal.sourceRoot || '') !== path.resolve(sourceRoot) ||
    path.resolve(journal.androidResRoot || '') !== path.resolve(androidResRoot) ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error('transaction journal metadata does not match this icon sync')
  }

  const destinations = new Set()
  for (const entry of journal.entries) {
    const destination = path.resolve(entry.destination || '')
    const validDestination =
      destination === path.resolve(manifestPath) ||
      isPathInside(sourceRoot, destination) ||
      isPathInside(androidResRoot, destination)
    if (
      !validDestination ||
      destinations.has(destination) ||
      !isPathInside(path.join(transactionPath, 'files'), entry.stagedPath || '') ||
      !isPathInside(path.join(transactionPath, 'backups'), entry.backupPath || '') ||
      !['file', 'absent', 'other'].includes(entry.originalType) ||
      !/^[0-9a-f]{64}$/.test(entry.newHash || '') ||
      (entry.originalType === 'file' && !/^[0-9a-f]{64}$/.test(entry.originalHash || ''))
    ) {
      throw new Error('transaction journal contains an unsafe path or checksum')
    }
    destinations.add(destination)
  }
  return journal
}

async function journalIsFullyCommitted(journal) {
  if (journal.status !== 'committed') return false
  for (const entry of journal.entries) {
    const current = await pathState(entry.destination)
    if (current.type !== 'file' || hash(current.bytes) !== entry.newHash) return false
  }
  return true
}

async function restoreJournal(journal, transactionPath, context) {
  validateJournal(journal, transactionPath, context)
  if (await journalIsFullyCommitted(journal)) return

  for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
    const entry = journal.entries[index]
    const current = await pathState(entry.destination)
    if (entry.originalType === 'file') {
      const backup = await pathState(entry.backupPath)
      if (backup.type !== 'file' || hash(backup.bytes) !== entry.originalHash) {
        throw new Error(`backup checksum is unsafe for ${entry.destination}`)
      }
      if (current.type === 'file' && hash(current.bytes) === entry.originalHash) continue
      if (current.type !== 'absent' && !(current.type === 'file' && hash(current.bytes) === entry.newHash)) {
        throw new Error(`live file changed outside the transaction: ${entry.destination}`)
      }
      const restorePath = path.join(
        path.dirname(entry.destination),
        `.${path.basename(entry.destination)}.android-icons-restore-${process.pid}-${index}`,
      )
      await copyFile(entry.backupPath, restorePath)
      await rename(restorePath, entry.destination)
    } else if (entry.originalType === 'absent') {
      if (current.type === 'absent') continue
      if (current.type !== 'file' || hash(current.bytes) !== entry.newHash) {
        throw new Error(`live file changed outside the transaction: ${entry.destination}`)
      }
      await rm(entry.destination, { force: true })
    } else if (current.type !== 'other') {
      throw new Error(`non-file destination changed outside the transaction: ${entry.destination}`)
    }
  }

  journal.status = 'rolled_back'
  await writeJsonAtomic(path.join(transactionPath, JOURNAL_NAME), journal)
}

async function prepareJournal(entries, stageRoot, context) {
  const journalEntries = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const original = await pathState(entry.destination)
    const backupPath = path.join(stageRoot, 'backups', String(index))
    if (original.type === 'file') {
      await mkdir(path.dirname(backupPath), { recursive: true })
      await copyFile(entry.destination, backupPath)
      if (hash(await readFile(backupPath)) !== hash(original.bytes)) {
        throw new Error(`Backup hash mismatch for ${entry.label}`)
      }
    }
    journalEntries.push({
      destination: entry.destination,
      stagedPath: entry.stagedPath,
      backupPath,
      originalType: original.type,
      originalHash: original.type === 'file' ? hash(original.bytes) : null,
      newHash: hash(entry.bytes),
    })
  }

  const journal = {
    version: 1,
    status: 'prepared',
    sourceRoot: context.sourceRoot,
    androidResRoot: context.androidResRoot,
    completedIndexes: [],
    entries: journalEntries,
  }
  validateJournal(journal, stageRoot, context)
  await writeJsonAtomic(path.join(stageRoot, JOURNAL_NAME), journal)
  return journal
}

async function commitEntries(entries, stageRoot, context) {
  const journal = await prepareJournal(entries, stageRoot, context)
  journal.status = 'committing'
  await writeJsonAtomic(path.join(stageRoot, JOURNAL_NAME), journal)
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      await mkdir(path.dirname(entry.destination), { recursive: true })
      await rename(entry.stagedPath, entry.destination)
      if (hash(await readFile(entry.destination)) !== hash(entry.bytes)) {
        throw new Error(`Committed hash mismatch for ${entry.label}`)
      }
      journal.completedIndexes.push(index)
      await writeJsonAtomic(path.join(stageRoot, JOURNAL_NAME), journal)
    }
    journal.status = 'committed'
    await writeJsonAtomic(path.join(stageRoot, JOURNAL_NAME), journal)
  } catch (commitError) {
    try {
      await restoreJournal(journal, stageRoot, context)
    } catch (rollbackError) {
      const failure = new AggregateError(
        [commitError, rollbackError],
        `Android icon sync rollback is incomplete; preserve ${stageRoot} for safe recovery`,
      )
      failure.preserveTransaction = true
      throw failure
    }
    throw commitError
  }
}

function lockRecoveryError(lockPath, detail) {
  return new Error(
    `Cannot safely recover Android launcher icon lock ${lockPath}: ${detail}. ` +
      'Do not delete it manually; confirm no icon sync process is active, then rerun for automatic recovery.',
  )
}

function validateTransactionPath(mainRoot, transactionPath) {
  return (
    typeof transactionPath === 'string' &&
    path.dirname(path.resolve(transactionPath)) === path.resolve(mainRoot) &&
    path.basename(transactionPath).startsWith(TRANSACTION_PREFIX)
  )
}

async function recoverStaleLock(lockPath, mainRoot, context) {
  let owner
  try {
    owner = await readJson(path.join(lockPath, OWNER_NAME), 'lock owner')
  } catch (error) {
    throw lockRecoveryError(lockPath, error.message)
  }
  if (owner.version !== 1 || !Number.isFinite(Date.parse(owner.startedAt || ''))) {
    throw lockRecoveryError(lockPath, 'owner metadata is invalid')
  }

  const alive = processIsAlive(owner.pid)
  if (alive === true) {
    throw new Error(
      `Another Android launcher icon sync owns ${lockPath} (PID ${owner.pid}). ` +
        'Wait for it to finish; if that PID no longer exists, rerun for automatic recovery.',
    )
  }
  if (alive === null) throw lockRecoveryError(lockPath, `cannot determine whether PID ${owner.pid} is alive`)

  if (owner.transactionPath !== null) {
    if (!validateTransactionPath(mainRoot, owner.transactionPath)) {
      throw lockRecoveryError(lockPath, 'transaction path is outside the Android main directory')
    }
    const transaction = await pathState(owner.transactionPath)
    if (transaction.type === 'other') {
      const journalPath = path.join(owner.transactionPath, JOURNAL_NAME)
      const journalState = await pathState(journalPath)
      if (journalState.type === 'file') {
        let journal
        try {
          journal = JSON.parse(journalState.bytes.toString('utf8'))
          await restoreJournal(journal, owner.transactionPath, context)
        } catch (error) {
          throw lockRecoveryError(lockPath, error.message)
        }
      } else if (journalState.type !== 'absent') {
        throw lockRecoveryError(lockPath, 'transaction journal is not a regular file')
      }
      await rm(owner.transactionPath, { recursive: true, force: true })
    } else if (transaction.type === 'file') {
      throw lockRecoveryError(lockPath, 'transaction path is not a directory')
    }
  } else {
    const liveStages = (await readdir(mainRoot, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(TRANSACTION_PREFIX),
    )
    if (liveStages.length > 0) {
      throw lockRecoveryError(lockPath, 'owner has no journal but transaction staging directories exist')
    }
  }

  await rm(lockPath, { recursive: true, force: true })
}

async function acquireLock(mainRoot, context) {
  const lockPath = path.join(mainRoot, LOCK_NAME)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath)
      const owner = {
        version: 1,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        transactionPath: null,
      }
      try {
        await writeJsonAtomic(path.join(lockPath, OWNER_NAME), owner)
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true })
        throw error
      }
      return { lockPath, owner }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      await recoverStaleLock(lockPath, mainRoot, context)
    }
  }
  throw lockRecoveryError(lockPath, 'lock was reacquired while stale recovery retried')
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
  const context = { sourceRoot: path.resolve(sourceRoot), androidResRoot: path.resolve(androidResRoot) }
  const { lockPath, owner } = await acquireLock(mainRoot, context)

  let stageRoot
  let preserveTransaction = false
  try {
    const [mainStats, sourceStats, resourceStats] = await Promise.all([
      stat(mainRoot),
      stat(sourceRoot),
      stat(androidResRoot),
    ])
    if (mainStats.dev !== sourceStats.dev || mainStats.dev !== resourceStats.dev) {
      throw new Error('Android icon source, generated resources, and transaction staging must share a filesystem')
    }
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
    owner.transactionPath = stageRoot
    await writeJsonAtomic(path.join(lockPath, OWNER_NAME), owner)
    await stageEntries(stageRoot, entries)
    await commitEntries(entries, stageRoot, context)
  } catch (error) {
    preserveTransaction = error?.preserveTransaction === true
    throw error
  } finally {
    if (!preserveTransaction) {
      if (stageRoot) await rm(stageRoot, { recursive: true, force: true })
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
