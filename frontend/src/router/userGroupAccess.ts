export function resolveUserGroupRouteAccess(
  requiresAccess: boolean,
  isAdmin: boolean,
  hasAccess: boolean,
): string | null {
  if (!requiresAccess || isAdmin || hasAccess) {
    return null
  }

  return '/dashboard'
}
