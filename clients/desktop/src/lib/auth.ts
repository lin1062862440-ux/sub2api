const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function passwordsMatch(password: string, confirmation: string): boolean {
  return password.length > 0 && password === confirmation
}

export function isValidVerificationCode(value: string): boolean {
  return /^\d{6}$/.test(value.replace(/\s/g, ''))
}

export function isAllowedRegistrationEmail(email: string, suffixes: readonly string[]): boolean {
  if (suffixes.length === 0) return true
  const normalized = email.toLowerCase()
  return suffixes.some((suffix) => normalized.endsWith(suffix.trim().toLowerCase()))
}
