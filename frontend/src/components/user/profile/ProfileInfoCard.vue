<template>
  <div class="profile-info-stack">
    <section
      data-testid="profile-overview-hero"
      class="profile-overview-panel"
    >
      <div class="px-5 py-5 md:px-6">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div
            class="profile-avatar-frame"
          >
            <img
              :src="avatarUrl"
              :alt="displayName"
              class="h-full w-full object-cover"
            >
          </div>

          <div class="min-w-0 flex-1 space-y-5">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-xl font-semibold text-gray-900 dark:text-white">
                  {{ displayName }}
                </h2>
                <span :class="['badge', user?.role === 'admin' ? 'badge-primary' : 'badge-gray']">
                  {{ user?.role === 'admin' ? t('profile.administrator') : t('profile.user') }}
                </span>
                <span
                  :class="['badge', user?.status === 'active' ? 'badge-success' : 'badge-danger']"
                >
                  {{
                    user?.status === 'active'
                      ? t('common.active')
                      : t('common.disabled')
                  }}
                </span>
              </div>

              <div class="space-y-1">
                <p class="truncate text-sm text-gray-600 dark:text-gray-300">
                  {{ primaryEmailDisplay }}
                </p>
                <div
                  v-if="sourceHints.length"
                  class="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  <span
                    v-for="hint in sourceHints"
                    :key="hint.key"
                    class="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 ring-1 ring-primary-100 dark:bg-dark-900/70 dark:ring-primary-900/40"
                  >
                    <Icon name="link" size="sm" />
                    {{ hint.text }}
                  </span>
                </div>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div data-testid="profile-overview-metric-balance" class="profile-metric-card">
                <p>
                  {{ t('profile.accountBalance') }}
                </p>
                <strong>
                  {{ formatCurrency(user?.balance || 0) }}
                </strong>
              </div>
              <div data-testid="profile-overview-metric-concurrency" class="profile-metric-card">
                <p>
                  {{ t('profile.concurrencyLimit') }}
                </p>
                <strong>
                  {{ user?.concurrency || 0 }}
                </strong>
              </div>
              <div data-testid="profile-overview-metric-member-since" class="profile-metric-card">
                <p>
                  {{ t('profile.memberSince') }}
                </p>
                <strong>
                  {{ memberSinceLabel }}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="space-y-6">
      <div data-testid="profile-main-column" class="profile-info-stack">
        <section
          data-testid="profile-basics-panel"
          class="profile-section-panel"
        >
          <div class="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t('profile.basicsTitle') }}
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ t('profile.basicsDescription') }}
              </p>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            <div class="profile-embedded-panel">
              <ProfileAvatarCard
                :user="user"
                embedded
              />
            </div>

            <div class="profile-embedded-panel">
              <ProfileEditForm
                :initial-username="user?.username || ''"
                embedded
              />
            </div>
          </div>
        </section>

        <section
          data-testid="profile-auth-bindings-panel"
          class="profile-section-panel"
        >
          <ProfileIdentityBindingsSection
            :user="user"
            :linuxdo-enabled="linuxdoEnabled"
            :dingtalk-enabled="dingtalkEnabled"
            :oidc-enabled="oidcEnabled"
            :oidc-provider-name="oidcProviderName"
            :wechat-enabled="wechatEnabled"
            :wechat-open-enabled="wechatOpenEnabled"
            :wechat-mp-enabled="wechatMpEnabled"
            embedded
            compact
          />
        </section>
      </div>

      <div data-testid="profile-side-column" class="profile-info-stack">
        <section
          v-if="sourceHints.length"
          class="profile-section-panel"
        >
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('profile.linkedProfileSources') }}
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('profile.linkedProfileSourcesDescription') }}
          </p>

          <div class="mt-5 grid gap-3">
            <div
              v-for="hint in sourceHints"
              :key="hint.key"
              class="profile-source-row"
            >
              <Icon name="link" size="sm" class="mt-0.5 text-gray-400 dark:text-gray-500" />
              <span>{{ hint.text }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import ProfileAvatarCard from '@/components/user/profile/ProfileAvatarCard.vue'
import ProfileEditForm from '@/components/user/profile/ProfileEditForm.vue'
import ProfileIdentityBindingsSection from '@/components/user/profile/ProfileIdentityBindingsSection.vue'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { User, UserAuthBindingStatus, UserAuthProvider, UserProfileSourceContext } from '@/types'

const props = withDefaults(defineProps<{
  user: User | null
  linuxdoEnabled?: boolean
  dingtalkEnabled?: boolean
  oidcEnabled?: boolean
  oidcProviderName?: string
  wechatEnabled?: boolean
  wechatOpenEnabled?: boolean
  wechatMpEnabled?: boolean
}>(), {
  linuxdoEnabled: false,
  dingtalkEnabled: false,
  oidcEnabled: false,
  oidcProviderName: 'OIDC',
  wechatEnabled: false,
  wechatOpenEnabled: undefined,
  wechatMpEnabled: undefined,
})

const { t } = useI18n()

function normalizeBindingStatus(binding: boolean | UserAuthBindingStatus | undefined): boolean | null {
  if (typeof binding === 'boolean') {
    return binding
  }
  if (!binding) {
    return null
  }
  if (typeof binding.bound === 'boolean') {
    return binding.bound
  }
  return Boolean(binding.provider_subject || binding.issuer || binding.provider_key)
}

function isEmailBound(user: User | null | undefined): boolean {
  if (typeof user?.email_bound === 'boolean') {
    return user.email_bound
  }

  const nested = user?.auth_bindings?.email ?? user?.identity_bindings?.email
  const normalized = normalizeBindingStatus(nested)
  return normalized ?? false
}

const avatarUrl = computed(() => resolveAvatarUrl(props.user?.avatar_url))
const displayName = computed(() => props.user?.username?.trim() || props.user?.email?.trim() || t('profile.user'))
const primaryEmailDisplay = computed(() => {
  const email = props.user?.email?.trim() || ''
  if (!email) {
    return ''
  }
  if (email.endsWith('.invalid') && !isEmailBound(props.user)) {
    return ''
  }
  return email
})
const memberSinceLabel = computed(() => {
  const raw = props.user?.created_at?.trim()
  if (!raw) {
    return '-'
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
  }).format(date)
})

const providerLabels = computed<Record<UserAuthProvider, string>>(() => ({
  email: t('profile.authBindings.providers.email'),
  linuxdo: t('profile.authBindings.providers.linuxdo'),
  dingtalk: t('profile.authBindings.providers.dingtalk'),
  oidc: t('profile.authBindings.providers.oidc', { providerName: props.oidcProviderName }),
  wechat: t('profile.authBindings.providers.wechat'),
  github: 'GitHub',
  google: 'Google'
}))

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function normalizeProvider(value: string): UserAuthProvider | null {
  const normalized = value.trim().toLowerCase()
  if (
    normalized === 'email' ||
    normalized === 'linuxdo' ||
    normalized === 'wechat' ||
    normalized === 'github' ||
    normalized === 'google'
  ) {
    return normalized
  }
  if (normalized === 'oidc' || normalized.startsWith('oidc:') || normalized.startsWith('oidc/')) {
    return 'oidc'
  }
  return null
}

function readObjectString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function resolveThirdPartySource(
  rawSource: string | UserProfileSourceContext | null | undefined
): { provider: UserAuthProvider; label: string } | null {
  if (!rawSource) {
    return null
  }

  if (typeof rawSource === 'string') {
    const provider = normalizeProvider(rawSource)
    if (!provider || provider === 'email') {
      return null
    }
    return {
      provider,
      label: providerLabels.value[provider]
    }
  }

  const sourceRecord = rawSource as Record<string, unknown>
  const provider = normalizeProvider(
    readObjectString(sourceRecord, 'provider', 'source', 'provider_type', 'auth_provider')
  )
  if (!provider || provider === 'email') {
    return null
  }

  const explicitLabel = readObjectString(
    sourceRecord,
    'provider_label',
    'label',
    'provider_name',
    'providerName'
  )

  return {
    provider,
    label: explicitLabel || providerLabels.value[provider]
  }
}

const sourceHints = computed(() => {
  const currentUser = props.user
  if (!currentUser) {
    return []
  }

  const hints: Array<{ key: string; text: string }> = []
  const avatarSource = resolveThirdPartySource(
    currentUser.profile_sources?.avatar ?? currentUser.avatar_source
  )
  const usernameSource = resolveThirdPartySource(
    currentUser.profile_sources?.username ??
      currentUser.profile_sources?.display_name ??
      currentUser.profile_sources?.nickname ??
      currentUser.display_name_source ??
      currentUser.username_source ??
      currentUser.nickname_source
  )

  if (avatarSource) {
    hints.push({
      key: 'avatar',
      text: t('profile.authBindings.source.avatar', { providerName: avatarSource.label })
    })
  }

  if (usernameSource) {
    hints.push({
      key: 'username',
      text: t('profile.authBindings.source.username', { providerName: usernameSource.label })
    })
  }

  return hints
})
</script>

<style scoped>
.profile-info-stack {
  display: grid;
  gap: 1rem;
}

.profile-overview-panel,
.profile-section-panel {
  border: 1px solid rgb(17 24 39 / 0.06);
  border-radius: 1rem;
  background: rgb(255 255 255);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04), 0 1px 2px rgb(15 23 42 / 0.03);
}

.profile-avatar-frame {
  display: flex;
  height: 5rem;
  width: 5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 1.25rem;
  background: rgb(248 250 252);
  color: rgb(15 23 42);
  font-size: 1.5rem;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgb(17 24 39 / 0.06);
}

.profile-metric-card {
  border-radius: 0.875rem;
  border: 1px solid rgb(226 232 240);
  background: rgb(248 250 252);
  padding: 0.875rem;
}

.profile-metric-card p {
  color: rgb(100 116 139);
  font-size: 0.75rem;
  font-weight: 650;
  line-height: 1rem;
}

.profile-metric-card strong {
  display: block;
  margin-top: 0.25rem;
  color: rgb(15 23 42);
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 750;
  line-height: 1.5rem;
}

.profile-section-panel {
  padding: 1.25rem;
}

.profile-embedded-panel,
.profile-source-row {
  border-radius: 0.875rem;
  border: 1px solid rgb(226 232 240);
  background: rgb(248 250 252);
}

.profile-embedded-panel {
  padding: 1rem;
}

.profile-source-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: rgb(71 85 105);
  font-size: 0.875rem;
}

:global(.dark) .profile-overview-panel,
:global(.dark) .profile-section-panel {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.52);
  box-shadow: none;
}

:global(.dark) .profile-avatar-frame,
:global(.dark) .profile-metric-card,
:global(.dark) .profile-embedded-panel,
:global(.dark) .profile-source-row {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.72);
}

:global(.dark) .profile-metric-card p {
  color: rgb(148 163 184);
}

:global(.dark) .profile-metric-card strong {
  color: rgb(255 255 255);
}
</style>
