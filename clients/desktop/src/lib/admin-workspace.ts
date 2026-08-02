import type { User } from '@/api'

export type WorkspaceMode = 'personal' | 'admin'

export const ADMIN_WORKSPACE_STORAGE_KEY = 'linai.desktop.workspace'

type RoleSource = Pick<User, 'role'> | null | undefined

export function canUseAdminWorkspace(user: RoleSource): boolean {
  return user?.role === 'admin'
}

export function readWorkspaceMode(user: RoleSource): WorkspaceMode {
  if (!canUseAdminWorkspace(user)) return 'personal'
  const stored = localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)
  return stored === 'personal' || stored === 'admin' ? stored : 'admin'
}

export function saveWorkspaceMode(mode: WorkspaceMode, user: RoleSource): void {
  if (!canUseAdminWorkspace(user)) return
  localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, mode)
}

export function workspaceDestination(mode: WorkspaceMode): 'dashboard' | 'admin-dashboard' {
  return mode === 'admin' ? 'admin-dashboard' : 'dashboard'
}
