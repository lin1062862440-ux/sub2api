import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Android package scripts', () => {
  it('synchronizes launcher icons before every APK build', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts?.['android:icons']).toBe('node scripts/sync-android-icons.mjs')
    expect(packageJson.scripts?.['android:apk']).toBe(
      'pnpm android:icons && tauri android build --debug --apk --target aarch64 --ci',
    )
  })
})
