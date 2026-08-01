import { describe, expect, it } from 'vitest'
import { resolveUserGroupRouteAccess } from '@/router/userGroupAccess'

describe('user group route access', () => {
  it('does not affect routes without the user group requirement', () => {
    expect(resolveUserGroupRouteAccess(false, false, false)).toBeNull()
  })

  it('allows administrators and delegated viewers', () => {
    expect(resolveUserGroupRouteAccess(true, true, false)).toBeNull()
    expect(resolveUserGroupRouteAccess(true, false, true)).toBeNull()
  })

  it('redirects ungranted users to their dashboard', () => {
    expect(resolveUserGroupRouteAccess(true, false, false)).toBe('/dashboard')
  })
})
