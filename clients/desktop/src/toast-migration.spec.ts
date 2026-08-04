import { describe, expect, it } from 'vitest'

const sourceModules = import.meta.glob([
  './views/**/*.vue',
  './mobile/views/**/*.vue',
  './components/**/*.vue',
  './features/**/*.vue',
  './layouts/**/*.vue',
], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const forbiddenPatterns = [
  { name: 'actionMessage identifier', pattern: /\bactionMessage\b/g },
  { name: 'successMessage identifier', pattern: /\bsuccessMessage\b/g },
  { name: 'action-message container or style', pattern: /\baction-message\b/g },
  { name: 'success-message container or style', pattern: /\bsuccess-message\b/g },
  {
    name: 'completed action assigned to local message.value',
    pattern: /\bmessage\.value\s*=\s*(?:['"`][^\n]*已[^\n]*|[^\n]*\?[^\n]*已[^\n]*)/g,
  },
]

describe('global toast migration source audit', () => {
  it('does not leave transient action-result containers in client views', () => {
    const violations = Object.entries(sourceModules).flatMap(([path, source]) =>
      forbiddenPatterns.flatMap(({ name, pattern }) => {
        pattern.lastIndex = 0
        return [...source.matchAll(pattern)].map((match) => {
          const line = source.slice(0, match.index).split('\n').length
          return `${path}:${line} ${name}`
        })
      }),
    )

    expect(violations, violations.join('\n')).toEqual([])
  })

  it('keeps core interaction surfaces connected to their semantic Toast methods', () => {
    const required: Record<string, Array<'success' | 'error' | 'warning' | 'info'>> = {
      './components/admin/AccountEditorDialog.vue': ['success', 'error'],
      './components/ChangePasswordDialog.vue': ['success', 'error'],
      './components/SettingsDialog.vue': ['success', 'error'],
      './features/usage-display/internal/settings/UsageDisplayDialog.vue': ['success', 'error'],
      './layouts/DesktopAppLayout.vue': ['success', 'error', 'info'],
      './views/RedeemView.vue': ['success', 'error', 'warning'],
      './views/admin/AdminAnnouncementsView.vue': ['success', 'error'],
      './views/admin/AdminSubscriptionsView.vue': ['success', 'error', 'warning'],
      './views/UserGroupMembersView.vue': ['success', 'error', 'warning'],
      './mobile/views/admin/MobileTeamWorkspaceView.vue': ['success', 'error', 'warning'],
    }
    const violations = Object.entries(required).flatMap(([path, methods]) => {
      const source = sourceModules[path] ?? ''
      return [
        !source.includes("from '@/stores/toast'") ? `${path} missing toast import` : '',
        ...methods.map((method) => !source.includes(`toast.${method}(`)
          ? `${path} missing ${method} toast`
          : ''),
      ].filter(Boolean)
    })

    expect(violations, violations.join('\n')).toEqual([])
  })
})
