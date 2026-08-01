import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../AppSidebar.vue'), 'utf8')

describe('AppSidebar user group menus', () => {
  it('declares all three dedicated H5 menu paths', () => {
    expect(source).toContain("path: '/user-groups'")
    expect(source).toContain("path: '/user-group-subscriptions'")
    expect(source).toContain("path: '/user-group-usage'")
  })

  it('gates regular-user menu items by backend capability', () => {
    expect(source).toContain('authStore.hasUserGroupAccess')
    expect(source).toContain('buildUserGroupNavItems')
  })
})
