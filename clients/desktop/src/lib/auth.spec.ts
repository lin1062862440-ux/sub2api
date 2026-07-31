import { describe, expect, it } from 'vitest'
import {
  isAllowedRegistrationEmail,
  isValidEmail,
  isValidVerificationCode,
  passwordsMatch,
} from './auth'

describe('authentication validation helpers', () => {
  it('accepts a valid email and rejects malformed addresses', () => {
    expect(isValidEmail('person@example.com')).toBe(true)
    expect(isValidEmail('person@example')).toBe(false)
    expect(isValidEmail(' person@example.com ')).toBe(false)
  })

  it('matches passwords only when both values are non-empty and equal', () => {
    expect(passwordsMatch('secret1', 'secret1')).toBe(true)
    expect(passwordsMatch('secret1', 'secret2')).toBe(false)
    expect(passwordsMatch('', '')).toBe(false)
  })

  it('requires exactly six numeric verification-code characters', () => {
    expect(isValidVerificationCode('123456')).toBe(true)
    expect(isValidVerificationCode('123 456')).toBe(true)
    expect(isValidVerificationCode('12345')).toBe(false)
    expect(isValidVerificationCode('12345a')).toBe(false)
  })

  it('matches registration email suffixes case-insensitively', () => {
    const allowed = ['@qq.com', '@163.com', '@gmail.com', '@yeah.net']
    expect(isAllowedRegistrationEmail('person@GMAIL.com', allowed)).toBe(true)
    expect(isAllowedRegistrationEmail('person@outlook.com', allowed)).toBe(false)
    expect(isAllowedRegistrationEmail('person@gmail.com', [])).toBe(true)
  })
})
