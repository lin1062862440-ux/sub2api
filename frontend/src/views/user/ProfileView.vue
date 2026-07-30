<template>
  <AppLayout>
    <div
      data-testid="profile-shell"
      class="profile-page"
    >
      <section class="profile-head">
        <div class="profile-head-copy">
          <ProductIcon name="profile" tone="blue" size="sm" />
          <div class="min-w-0">
            <span>{{ t('profile.description') }}</span>
          </div>
        </div>
        <div class="profile-head-stat">
          <ProductIcon name="bolt" tone="amber" size="xs" bare />
          <span>{{ t('profile.concurrencyLimit') }}</span>
          <strong>{{ user?.concurrency || 0 }}</strong>
        </div>
        <div class="profile-head-stat">
          <ProductIcon name="wallet" tone="emerald" size="xs" bare />
          <span>{{ t('profile.accountBalance') }}</span>
          <strong>${{ (user?.balance || 0).toFixed(2) }}</strong>
        </div>
      </section>

      <ProfileInfoCard
        :user="user"
        :linuxdo-enabled="linuxdoOAuthEnabled"
        :dingtalk-enabled="dingtalkOAuthEnabled"
        :oidc-enabled="oidcOAuthEnabled"
        :oidc-provider-name="oidcOAuthProviderName"
        :wechat-enabled="wechatOAuthEnabled"
        :wechat-open-enabled="wechatOAuthOpenEnabled"
        :wechat-mp-enabled="wechatOAuthMPEnabled"
      />

      <div v-if="contactInfo" class="profile-support-card">
        <div class="flex items-center gap-4">
          <ProductIcon name="document" tone="blue" size="sm" />
          <div>
            <h3>
              {{ t('common.contactSupport') }}
            </h3>
            <p>{{ contactInfo }}</p>
          </div>
        </div>
      </div>

      <ProfilePasswordForm />

      <ProfileBalanceNotifyCard
        v-if="user && balanceLowNotifyEnabled"
        :enabled="user.balance_notify_enabled ?? true"
        :threshold="user.balance_notify_threshold"
        :extra-emails="user.balance_notify_extra_emails ?? []"
        :system-default-threshold="systemDefaultThreshold"
        :user-email="user.email"
      />

      <ProfileTotpCard />
      <ProfilePasskeyCard :enabled="passkeyEnabled" />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import ProductIcon from '@/components/common/ProductIcon.vue'
import ProfileBalanceNotifyCard from '@/components/user/profile/ProfileBalanceNotifyCard.vue'
import ProfileInfoCard from '@/components/user/profile/ProfileInfoCard.vue'
import ProfilePasswordForm from '@/components/user/profile/ProfilePasswordForm.vue'
import ProfileTotpCard from '@/components/user/profile/ProfileTotpCard.vue'
import ProfilePasskeyCard from '@/components/user/profile/ProfilePasskeyCard.vue'
import { isWeChatWebOAuthEnabled } from '@/api/auth'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()
const user = computed(() => authStore.user)

const contactInfo = ref('')
const balanceLowNotifyEnabled = ref(false)
const systemDefaultThreshold = ref(0)
const linuxdoOAuthEnabled = ref(false)
const dingtalkOAuthEnabled = ref(false)
const wechatOAuthEnabled = ref(false)
const wechatOAuthOpenEnabled = ref<boolean | undefined>(undefined)
const wechatOAuthMPEnabled = ref<boolean | undefined>(undefined)
const oidcOAuthEnabled = ref(false)
const oidcOAuthProviderName = ref('OIDC')
const passkeyEnabled = ref(false)

onMounted(async () => {
  const profileRefresh = authStore.refreshUser().catch((error) => {
    console.error('Failed to refresh profile:', error)
  })

  const settingsLoad = appStore.fetchPublicSettings()
    .then((settings) => {
      if (!settings) {
        return
      }
      contactInfo.value = settings.contact_info || ''
      balanceLowNotifyEnabled.value = settings.balance_low_notify_enabled ?? false
      systemDefaultThreshold.value = settings.balance_low_notify_threshold ?? 0
      linuxdoOAuthEnabled.value = settings.linuxdo_oauth_enabled ?? false
      dingtalkOAuthEnabled.value = settings.dingtalk_oauth_enabled ?? false
      wechatOAuthEnabled.value = isWeChatWebOAuthEnabled(settings)
      wechatOAuthOpenEnabled.value = typeof settings.wechat_oauth_open_enabled === 'boolean'
        ? settings.wechat_oauth_open_enabled
        : undefined
      wechatOAuthMPEnabled.value = typeof settings.wechat_oauth_mp_enabled === 'boolean'
        ? settings.wechat_oauth_mp_enabled
        : undefined
      oidcOAuthEnabled.value = settings.oidc_oauth_enabled ?? false
      oidcOAuthProviderName.value = settings.oidc_oauth_provider_name || 'OIDC'
      passkeyEnabled.value = settings.passkey_enabled === true
    })
    .catch((error) => {
      console.error('Failed to load settings:', error)
    })

  await Promise.all([profileRefresh, settingsLoad])
})
</script>

<style scoped>
.profile-page {
  margin: 0 auto;
  display: flex;
  max-width: 72rem;
  flex-direction: column;
  gap: 1rem;
}

.profile-head {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) minmax(10rem, 0.34fr) minmax(10rem, 0.34fr);
  gap: 0.875rem;
}

.profile-head-copy,
.profile-head-stat,
.profile-support-card {
  border: 1px solid rgb(17 24 39 / 0.06);
  border-radius: 1rem;
  background: rgb(255 255 255);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04), 0 1px 2px rgb(15 23 42 / 0.03);
}

.profile-head-copy {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
}

.profile-head-stat span {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
  color: rgb(100 116 139);
}

.profile-head-copy span {
  display: block;
  color: rgb(71 85 105);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.profile-head-stat {
  display: grid;
  align-content: center;
  gap: 0.125rem;
  min-height: 4rem;
  padding: 0.75rem 0.875rem;
}

.profile-head-stat span {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.profile-head-stat strong {
  color: rgb(15 23 42);
  font-variant-numeric: tabular-nums;
  font-size: 1.125rem;
  font-weight: 750;
  line-height: 1.5rem;
}

.profile-support-card {
  padding: 1rem;
}

.profile-support-card h3 {
  color: rgb(15 23 42);
  font-weight: 700;
}

.profile-support-card p {
  color: rgb(71 85 105);
  font-size: 0.875rem;
  font-weight: 600;
}

:global(.dark) .profile-head-copy,
:global(.dark) .profile-head-stat,
:global(.dark) .profile-support-card {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.52);
  box-shadow: none;
}

:global(.dark) .profile-head-copy span,
:global(.dark) .profile-head-stat span,
:global(.dark) .profile-support-card p {
  color: rgb(148 163 184);
}

:global(.dark) .profile-head-stat strong,
:global(.dark) .profile-support-card h3 {
  color: rgb(255 255 255);
}

@media (max-width: 900px) {
  .profile-head {
    grid-template-columns: 1fr;
  }
}
</style>
