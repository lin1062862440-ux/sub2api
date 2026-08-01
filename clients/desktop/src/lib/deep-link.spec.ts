import { describe, expect, it } from 'vitest'
import {
  clearResetHandoff,
  consumeResetHandoff,
  parseResetDeepLink,
  setResetHandoff,
} from './deep-link'

describe('reset deep links', () => {
  it('accepts only a reset link with email and token', () => {
    expect(parseResetDeepLink('linai://reset-password?email=user%40example.com&token=abc123')).toEqual({
      email: 'user@example.com',
      token: 'abc123',
    })
    expect(parseResetDeepLink('linai://other?email=user%40example.com&token=abc123')).toBeNull()
    expect(parseResetDeepLink('https://lynn.lat/reset-password?email=user%40example.com&token=abc123')).toBeNull()
  })

  it('rejects missing or duplicate parameters', () => {
    expect(parseResetDeepLink('linai://reset-password?email=&token=abc123')).toBeNull()
    expect(parseResetDeepLink('linai://reset-password?email=user%40example.com&token=')).toBeNull()
    expect(parseResetDeepLink('linai://reset-password?email=user%40example.com&email=other%40example.com&token=abc')).toBeNull()
  })

  it('keeps the handoff in memory and clears it after consumption', () => {
    setResetHandoff({ email: 'user@example.com', token: 'abc123' })
    expect(consumeResetHandoff()).toEqual({ email: 'user@example.com', token: 'abc123' })
    expect(consumeResetHandoff()).toBeNull()
    clearResetHandoff()
  })
})
