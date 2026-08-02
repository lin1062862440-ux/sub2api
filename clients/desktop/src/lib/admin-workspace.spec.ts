import { beforeEach, describe, expect, it } from 'vitest'

import {
  ADMIN_WORKSPACE_STORAGE_KEY,
  readWorkspaceMode,
  saveWorkspaceMode,
  workspaceDestination,
} from './admin-workspace'

describe('admin workspace preference', () => {
  beforeEach(() => localStorage.clear())

  it('never exposes an admin workspace to ordinary users', () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')

    expect(readWorkspaceMode({ role: 'user' })).toBe('personal')
  })

  it('opens the admin workspace on an administrators first launch', () => {
    expect(readWorkspaceMode({ role: 'admin' })).toBe('admin')
  })

  it('persists an administrators last workspace', () => {
    saveWorkspaceMode('personal', { role: 'admin' })

    expect(localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)).toBe('personal')
    expect(readWorkspaceMode({ role: 'admin' })).toBe('personal')
    expect(workspaceDestination('personal')).toBe('dashboard')
    expect(workspaceDestination('admin')).toBe('admin-dashboard')
  })

  it('does not persist workspace changes for ordinary users', () => {
    saveWorkspaceMode('admin', { role: 'user' })

    expect(localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)).toBeNull()
  })
})
