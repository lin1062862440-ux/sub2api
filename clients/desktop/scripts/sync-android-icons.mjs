import { access, copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
const iconNames = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']

export async function syncAndroidIcons({ sourceRoot, androidResRoot }) {
  try {
    await access(androidResRoot)
  } catch {
    throw new Error(
      `Android generated resources not found at ${androidResRoot}. Run \`pnpm android:init\` first.`,
    )
  }

  for (const density of densities) {
    for (const iconName of iconNames) {
      const relativePath = path.join(`mipmap-${density}`, iconName)
      try {
        await access(path.join(sourceRoot, relativePath))
      } catch {
        throw new Error(`Missing Android launcher icon source: ${relativePath}`)
      }
    }
  }

  const manifestPath = path.join(androidResRoot, '..', 'AndroidManifest.xml')
  const iconAnchor = '        android:icon="@mipmap/ic_launcher"'
  const roundIconAttribute = '        android:roundIcon="@mipmap/ic_launcher_round"'
  const manifest = await readFile(manifestPath, 'utf8')
  if (!manifest.includes(iconAnchor)) {
    throw new Error('AndroidManifest.xml is missing android:icon="@mipmap/ic_launcher"')
  }
  if (!manifest.includes('android:roundIcon=')) {
    await writeFile(manifestPath, manifest.replace(iconAnchor, `${iconAnchor}\n${roundIconAttribute}`))
  }

  for (const density of densities) {
    const directoryName = `mipmap-${density}`
    const targetDirectory = path.join(androidResRoot, directoryName)
    await mkdir(targetDirectory, { recursive: true })

    for (const iconName of iconNames) {
      await copyFile(
        path.join(sourceRoot, directoryName, iconName),
        path.join(targetDirectory, iconName),
      )
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
    .then(() => console.log('Synced 15 Android launcher icon files.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
