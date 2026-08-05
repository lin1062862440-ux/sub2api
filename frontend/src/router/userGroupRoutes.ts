import type { LocationQuery, RouteLocationRaw } from 'vue-router'

export function userGroupQuotaDestination(id: unknown, query: LocationQuery = {}): RouteLocationRaw {
  return {
    name: 'UserGroupMembers',
    params: { id: String(id) },
    query: { ...query, openQuota: '1' },
  }
}

export function legacyUserGroupQuotaDestination(groupId: unknown): RouteLocationRaw {
  const id = typeof groupId === 'string' ? groupId : ''
  return /^\d+$/.test(id) ? userGroupQuotaDestination(id) : { name: 'UserGroups' }
}
