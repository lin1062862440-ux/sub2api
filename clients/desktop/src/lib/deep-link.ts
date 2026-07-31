export interface ResetHandoff {
  email: string
  token: string
}

let resetHandoff: ResetHandoff | null = null

export function parseResetDeepLink(value: string): ResetHandoff | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'linai:' || url.hostname !== 'reset-password' || (url.pathname !== '' && url.pathname !== '/')) return null

  const emailValues = url.searchParams.getAll('email')
  const tokenValues = url.searchParams.getAll('token')
  if (emailValues.length !== 1 || tokenValues.length !== 1) return null

  const email = emailValues[0]?.trim() ?? ''
  const token = tokenValues[0]?.trim() ?? ''
  if (!email || !token || !email.includes('@')) return null
  return { email, token }
}

export function setResetHandoff(value: ResetHandoff): void {
  resetHandoff = { ...value }
}

export function consumeResetHandoff(): ResetHandoff | null {
  const value = resetHandoff
  resetHandoff = null
  return value
}

export function clearResetHandoff(): void {
  resetHandoff = null
}
