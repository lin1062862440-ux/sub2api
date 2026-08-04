import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const androidRoot = resolve(process.cwd(), 'src-tauri/gen/android/app/src/main')
const manifest = readFileSync(resolve(androidRoot, 'AndroidManifest.xml'), 'utf8')
const providerPaths = readFileSync(resolve(androidRoot, 'res/xml/file_paths.xml'), 'utf8')
const plugin = readFileSync(
  resolve(androidRoot, 'java/ai/lin/android/updater/AndroidUpdaterPlugin.kt'),
  'utf8',
)

describe('Android native updater boundary', () => {
  it('requests installer access and exposes only the updater cache directory', () => {
    expect(manifest).toContain('android.permission.REQUEST_INSTALL_PACKAGES')
    expect(providerPaths).toContain('<cache-path name="linai_updates" path="linai-updates/" />')
    expect(providerPaths).not.toContain('<external-path')
    expect(providerPaths).not.toContain('path="."')
  })

  it('revalidates package identity before using a read-only FileProvider intent', () => {
    expect(plugin).toContain('archiveSecurityFailure(path)')
    expect(plugin).toContain('activity.packageManager.canRequestPackageInstalls()')
    expect(plugin).toContain('FileProvider.getUriForFile(')
    expect(plugin).toContain('Intent.FLAG_GRANT_READ_URI_PERMISSION')
    expect(plugin).not.toContain('FLAG_GRANT_WRITE_URI_PERMISSION')
  })

  it('never accepts a caller-provided download destination', () => {
    const downloadArgs = plugin.slice(plugin.indexOf('class DownloadArgs'), plugin.indexOf('class PathArgs'))
    expect(downloadArgs).not.toContain('path:')
    expect(downloadArgs).not.toContain('destination')
  })
})
