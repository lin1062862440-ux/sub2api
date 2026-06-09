import defaultAvatarUrl from '@/assets/default-avatar.svg'

export function resolveAvatarUrl(avatarUrl?: string | null): string {
  return avatarUrl?.trim() || defaultAvatarUrl
}

