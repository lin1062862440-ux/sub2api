import { describe, expect, it } from 'vitest'

import {
  isMobileOverflowActive,
  isMobileRouteAllowed,
  mobileNavigation,
} from './navigation'

describe('mobile navigation model', () => {
  it('defines the exact personal bottom-navigation destinations', () => {
    expect(mobileNavigation('personal').direct.map((item) => item.routeName))
      .toEqual(['dashboard', 'usage', 'subscriptions'])
  })

  it('defines administrator direct and overflow destinations', () => {
    expect(mobileNavigation('admin').direct.map((item) => item.routeName))
      .toEqual(['admin-dashboard', 'admin-accounts', 'admin-groups', 'admin-users'])
    expect(mobileNavigation('admin').overflow.map((item) => item.routeName))
      .toEqual(['user-groups', 'admin-subscriptions'])
  })

  it('identifies active administrator overflow destinations', () => {
    expect(isMobileOverflowActive('user-groups', 'admin')).toBe(true)
    expect(isMobileOverflowActive('admin-users', 'admin')).toBe(false)
  })

  it('denies excluded mobile routes', () => {
    expect(isMobileRouteAllowed('channels', 'personal')).toBe(false)
    expect(isMobileRouteAllowed('admin-usage', 'admin')).toBe(false)
  })

  it('allows profile as an account route without adding it to bottom navigation', () => {
    expect(isMobileRouteAllowed('profile', 'personal')).toBe(true)
    expect(mobileNavigation('personal').direct.map((item) => item.routeName)).not.toContain('profile')
  })
})
