import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../AppSidebar.vue'), 'utf8')

describe('AppSidebar user group menus', () => {
  it('declares one sidebar entry for the whole user group workspace', () => {
    expect(source.match(/path: '\/user-groups'/g)).toHaveLength(1)
    expect(source).not.toContain("{ path: '/user-group-subscriptions'")
    expect(source).not.toContain("{ path: '/user-group-usage'")
    expect(source).toContain('userGroupWorkspacePaths')
  })

  it('gates regular-user menu items by backend capability', () => {
    expect(source).toContain('authStore.hasUserGroupAccess')
    expect(source).toContain('buildUserGroupNavItems')
  })
})
