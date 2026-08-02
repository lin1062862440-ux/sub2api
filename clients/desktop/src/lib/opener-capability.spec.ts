import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readPermissions(file: string): unknown[] {
  const capability = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as {
    permissions: unknown[]
  }
  return capability.permissions
}

describe('external URL opener capability', () => {
  it.each([
    'src-tauri/capabilities/default.json',
  ])('allows standard web URLs in %s', (file) => {
    expect(readPermissions(file)).toContain('opener:allow-default-urls')
  })
})
