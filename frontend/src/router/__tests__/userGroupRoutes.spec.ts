import { describe, expect, it } from 'vitest'
import { legacyUserGroupQuotaDestination, userGroupQuotaDestination } from '@/router/userGroupRoutes'

describe('user group quota route compatibility', () => {
  it('redirects the old detail route into the combined workspace and preserves query state', () => {
    expect(userGroupQuotaDestination('7', { source: 'legacy' })).toEqual({
      name: 'UserGroupMembers',
      params: { id: '7' },
      query: { source: 'legacy', openQuota: '1' },
    })
  })

  it('redirects valid legacy query links and rejects missing team ids', () => {
    expect(legacyUserGroupQuotaDestination('7')).toEqual({
      name: 'UserGroupMembers',
      params: { id: '7' },
      query: { openQuota: '1' },
    })
    expect(legacyUserGroupQuotaDestination(undefined)).toEqual({ name: 'UserGroups' })
  })
})
