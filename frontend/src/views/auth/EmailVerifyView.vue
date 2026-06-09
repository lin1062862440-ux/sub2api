<template>
  <div class="min-h-screen bg-[#f5f5f7] text-gray-950 dark:bg-dark-950 dark:text-white">
    <header
      class="border-b border-gray-950/5 bg-[#f5f5f7]/90 backdrop-blur-xl dark:border-white/10 dark:bg-dark-950/85"
    >
      <nav class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <router-link
          to="/"
          class="flex min-w-0 items-center gap-3 text-gray-950 transition-colors hover:text-gray-700 dark:text-white dark:hover:text-dark-200"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-dark-900"
          >
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </span>
          <span class="truncate text-sm font-semibold sm:text-base">{{ siteName }}</span>
        </router-link>

        <router-link
          to="/"
          class="hidden text-sm font-medium text-gray-600 transition-colors hover:text-gray-950 dark:text-dark-300 dark:hover:text-white sm:inline-flex"
        >
          返回首页
        </router-link>
      </nav>
    </header>

    <main class="px-4 py-10 sm:px-6 lg:px-8">
      <div class="mx-auto grid min-h-[calc(100vh-9rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_26rem]">
        <section class="hidden lg:block">
          <div class="max-w-xl">
            <div
              class="mb-7 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-dark-900"
            >
              <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
            </div>
            <h1 class="auth-display-title text-5xl font-semibold leading-[1.04] text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
            <p class="mt-5 max-w-lg text-lg leading-8 text-gray-700 dark:text-dark-200">
              {{ siteSubtitle }}
            </p>
          </div>

          <div class="mt-12 max-w-xl overflow-hidden rounded-2xl bg-gray-950 p-7 text-white dark:bg-dark-900">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-white/60">邮箱验证</p>
                <p class="mt-2 text-2xl font-semibold">
                  输入验证码后创建账户
                </p>
              </div>
              <Icon name="mail" size="lg" class="text-white/70" />
            </div>

            <div class="mt-8 space-y-3 text-sm leading-6 text-white/70">
              <div class="flex items-center gap-3">
                <Icon name="checkCircle" size="sm" class="text-white/70" />
                <span>验证码用于确认邮箱归属</span>
              </div>
              <div class="flex items-center gap-3">
                <Icon name="shield" size="sm" class="text-white/70" />
                <span>注册数据只在当前验证流程中使用</span>
              </div>
              <div class="flex items-center gap-3">
                <Icon name="arrowRight" size="sm" class="text-white/70" />
                <span>验证完成后进入控制台</span>
              </div>
            </div>
          </div>
        </section>

        <section class="mx-auto w-full max-w-[26rem]">
          <div class="mb-8 text-center lg:hidden">
            <div
              class="mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-dark-900"
            >
              <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
            </div>
            <h1 class="text-3xl font-semibold text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
          </div>

          <div class="rounded-2xl bg-white p-6 dark:bg-dark-900 sm:p-8">
            <div>
              <h2 class="text-2xl font-semibold text-gray-950 dark:text-white">
                {{ t('auth.verifyYourEmail') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                {{ t('auth.sendCodeDesc') }}
                <span class="font-medium text-gray-950 dark:text-white">{{ email }}</span>
              </p>
            </div>

            <div
              v-if="!hasRegisterData"
              class="mt-7 rounded-2xl bg-amber-50 p-4 dark:bg-amber-900/20"
            >
              <div class="flex items-start gap-3">
                <Icon name="exclamationCircle" size="md" class="shrink-0 text-amber-500" />
                <div class="text-sm leading-6 text-amber-700 dark:text-amber-400">
                  <p class="font-medium">{{ t('auth.sessionExpired') }}</p>
                  <p class="mt-1">{{ t('auth.sessionExpiredDesc') }}</p>
                </div>
              </div>
            </div>

            <form v-else @submit.prevent="handleVerify" class="mt-7 space-y-5">
              <div>
                <label for="code" class="auth-label text-center">
                  {{ t('auth.verificationCode') }}
                </label>
                <input
                  id="code"
                  v-model="verifyCode"
                  type="text"
                  required
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  maxlength="6"
                  :disabled="isLoading"
                  class="auth-input text-center font-mono text-xl"
                  :class="{ 'auth-input-error': errors.code }"
                  placeholder="000000"
                />
                <p class="auth-hint text-center">{{ t('auth.verificationCodeHint') }}</p>
              </div>

              <div
                v-if="codeSent"
                class="rounded-2xl bg-gray-100 p-4 dark:bg-dark-800"
              >
                <div class="flex items-start gap-3">
                  <Icon name="checkCircle" size="md" class="shrink-0 text-gray-950 dark:text-white" />
                  <p class="text-sm leading-6 text-gray-600 dark:text-dark-300">
                    {{ t('auth.codeSentSuccess') }}
                  </p>
                </div>
              </div>

              <div v-if="turnstileEnabled && turnstileSiteKey && showResendTurnstile">
                <TurnstileWidget
                  ref="turnstileRef"
                  :site-key="turnstileSiteKey"
                  @verify="onTurnstileVerify"
                  @expire="onTurnstileExpire"
                  @error="onTurnstileError"
                />
              </div>

              <button
                type="submit"
                :disabled="isLoading || !verifyCode"
                class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
              >
                <svg
                  v-if="isLoading"
                  class="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <Icon v-else name="checkCircle" size="sm" />
                {{ isLoading ? t('auth.verifying') : t('auth.verifyAndCreate') }}
              </button>

              <div class="text-center">
                <button
                  v-if="countdown > 0"
                  type="button"
                  disabled
                  class="cursor-not-allowed text-sm text-gray-400 dark:text-dark-500"
                >
                  {{ t('auth.resendCountdown', { countdown }) }}
                </button>
                <button
                  v-else
                  type="button"
                  @click="handleResendCode"
                  :disabled="
                    isSendingCode || (turnstileEnabled && showResendTurnstile && !resendTurnstileToken)
                  "
                  class="text-sm font-medium text-gray-950 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:text-dark-200"
                >
                  <span v-if="isSendingCode">{{ t('auth.sendingCode') }}</span>
                  <span v-else-if="turnstileEnabled && !showResendTurnstile">
                    {{ t('auth.clickToResend') }}
                  </span>
                  <span v-else>{{ t('auth.resendCode') }}</span>
                </button>
              </div>
            </form>
          </div>

          <div class="mt-6 text-center">
            <button
              @click="handleBack"
              class="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-950 dark:text-dark-300 dark:hover:text-white"
            >
              <Icon name="arrowLeft" size="sm" />
              {{ t('auth.backToRegistration') }}
            </button>
          </div>

          <p class="mt-8 text-center text-xs text-gray-400 dark:text-dark-500">
            &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
          </p>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { useAuthStore, useAppStore } from '@/stores'
import {
  persistOAuthTokenContext,
  getPublicSettings,
  isOAuthLoginCompletion,
  type PendingOAuthSendVerifyCodeResponse,
  sendPendingOAuthVerifyCode,
  sendVerifyCode,
} from '@/api/auth'
import { apiClient } from '@/api/client'
import { buildAuthErrorMessage } from '@/utils/authError'
import {
  formatRegistrationEmailSuffixWhitelistForMessage,
  isRegistrationEmailSuffixAllowed,
  normalizeRegistrationEmailSuffixWhitelist
} from '@/utils/registrationEmailPolicy'
import {
  clearAllAffiliateReferralCodes,
  loadAffiliateReferralCode,
  oauthAffiliatePayload
} from '@/utils/oauthAffiliate'

const { t, locale } = useI18n()

// ==================== Router & Stores ====================

const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const isSendingCode = ref<boolean>(false)
const errorMessage = ref<string>('')
const codeSent = ref<boolean>(false)
const verifyCode = ref<string>('')
const countdown = ref<number>(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

// Registration data from sessionStorage
type PendingAuthTokenField = 'pending_auth_token' | 'pending_oauth_token'
type PendingAuthSessionSummary = {
  token: string
  token_field: PendingAuthTokenField
  provider: string
  redirect?: string
}
type PendingOAuthCreateAccountResponse = {
  auth_result?: string
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  provider?: string
  redirect?: string
}

const email = ref<string>('')
const password = ref<string>('')
const initialTurnstileToken = ref<string>('')
const promoCode = ref<string>('')
const invitationCode = ref<string>('')
const affCode = ref<string>('')
const pendingAuthToken = ref<string>('')
const pendingAuthTokenField = ref<PendingAuthTokenField>('pending_auth_token')
const pendingProvider = ref<string>('')
const pendingRedirect = ref<string>('')
const pendingAdoptionDecision = ref<{
  adoptDisplayName?: boolean
  adoptAvatar?: boolean
} | null>(null)
const hasRegisterData = ref<boolean>(false)

// Public settings
const turnstileEnabled = ref<boolean>(false)
const turnstileSiteKey = ref<string>('')
const siteName = ref<string>('Sub2API')
const siteLogo = ref<string>('')
const siteSubtitle = ref<string>('AI API Gateway Platform')
const registrationEmailSuffixWhitelist = ref<string[]>([])

// Turnstile for resend
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const resendTurnstileToken = ref<string>('')
const showResendTurnstile = ref<boolean>(false)

const errors = ref({
  code: '',
  turnstile: ''
})

const validationToastMessage = computed(
  () => errors.value.code || errors.value.turnstile || ''
)
const currentYear = computed(() => new Date().getFullYear())

watch(validationToastMessage, (value, previousValue) => {
  if (value && value !== previousValue) {
    appStore.showError(value)
  }
})

// ==================== Lifecycle ====================

onMounted(async () => {
  const activePendingSession = authStore.pendingAuthSession as PendingAuthSessionSummary | null

  // Load registration data from sessionStorage
  const registerDataStr = sessionStorage.getItem('register_data')
  if (registerDataStr) {
    try {
      const registerData = JSON.parse(registerDataStr)
      email.value = registerData.email || ''
      password.value = registerData.password || ''
      initialTurnstileToken.value = registerData.turnstile_token || ''
      promoCode.value = registerData.promo_code || ''
      invitationCode.value = registerData.invitation_code || ''
      affCode.value = registerData.aff_code || loadAffiliateReferralCode()
      pendingAuthToken.value = registerData.pending_auth_token || activePendingSession?.token || ''
      pendingAuthTokenField.value = registerData.pending_auth_token_field || activePendingSession?.token_field || 'pending_auth_token'
      pendingProvider.value = registerData.pending_provider || activePendingSession?.provider || ''
      pendingRedirect.value = registerData.pending_redirect || activePendingSession?.redirect || ''
      pendingAdoptionDecision.value = registerData.pending_adoption_decision
        ? {
            adoptDisplayName: registerData.pending_adoption_decision.adopt_display_name === true,
            adoptAvatar: registerData.pending_adoption_decision.adopt_avatar === true
          }
        : null
      hasRegisterData.value = !!(email.value && password.value)
    } catch {
      hasRegisterData.value = false
    }
  } else if (activePendingSession) {
    pendingAuthToken.value = activePendingSession.token
    pendingAuthTokenField.value = activePendingSession.token_field
    pendingProvider.value = activePendingSession.provider
    pendingRedirect.value = activePendingSession.redirect || ''
  }

  // Load public settings
  try {
    const settings = await getPublicSettings()
    turnstileEnabled.value = settings.turnstile_enabled
    turnstileSiteKey.value = settings.turnstile_site_key || ''
    siteName.value = settings.site_name || 'Sub2API'
    siteLogo.value = settings.site_logo || ''
    siteSubtitle.value = settings.site_subtitle || 'AI API Gateway Platform'
    registrationEmailSuffixWhitelist.value = normalizeRegistrationEmailSuffixWhitelist(
      settings.registration_email_suffix_whitelist || []
    )
  } catch (error) {
    console.error('Failed to load public settings:', error)
  }

  // Auto-send verification code if we have valid data
  if (hasRegisterData.value) {
    await sendCode()
  }
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

// ==================== Countdown ====================

function startCountdown(seconds: number): void {
  countdown.value = seconds

  if (countdownTimer) {
    clearInterval(countdownTimer)
  }

  countdownTimer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }
  }, 1000)
}

// ==================== Turnstile Handlers ====================

function onTurnstileVerify(token: string): void {
  resendTurnstileToken.value = token
  errors.value.turnstile = ''
}

function onTurnstileExpire(): void {
  resendTurnstileToken.value = ''
  errors.value.turnstile = t('auth.turnstileExpired')
}

function onTurnstileError(): void {
  resendTurnstileToken.value = ''
  errors.value.turnstile = t('auth.turnstileFailed')
}

function isPendingOAuthFlow(): boolean {
  return Boolean(pendingProvider.value.trim())
}

function shouldBypassRegistrationEmailPolicy(): boolean {
  return isPendingOAuthFlow() || Boolean(pendingAuthToken.value.trim())
}

function resolvePendingOAuthCallbackRoute(provider: string): string {
  switch (provider.trim().toLowerCase()) {
    case 'linuxdo':
      return '/auth/linuxdo/callback'
    case 'oidc':
      return '/auth/oidc/callback'
    case 'wechat':
      return '/auth/wechat/callback'
    default:
      return '/auth/callback'
  }
}

function isPendingOAuthSessionResponse(data: PendingOAuthCreateAccountResponse): boolean {
  return data.auth_result === 'pending_session'
}

function getPendingOAuthSendCodeSessionResponse(
  data: PendingOAuthSendVerifyCodeResponse,
): PendingOAuthSendVerifyCodeResponse | null {
  return data.auth_result === 'pending_session' ? data : null
}

function persistPendingOAuthSession(provider: string, redirect?: string): void {
  authStore.setPendingAuthSession({
    token: pendingAuthToken.value,
    token_field: pendingAuthTokenField.value,
    provider: provider.trim() || pendingProvider.value.trim(),
    redirect: redirect || pendingRedirect.value || undefined,
  })
}

// ==================== Send Code ====================

async function sendCode(): Promise<void> {
  isSendingCode.value = true
  errorMessage.value = ''

  try {
    if (!shouldBypassRegistrationEmailPolicy() && !isRegistrationEmailSuffixAllowed(email.value, registrationEmailSuffixWhitelist.value)) {
      errorMessage.value = buildEmailSuffixNotAllowedMessage()
      appStore.showError(errorMessage.value)
      return
    }

    const requestPayload = {
      email: email.value,
      [pendingAuthTokenField.value]: pendingAuthToken.value || undefined,
      // 优先使用重发时新获取的 token（因为初始 token 可能已被使用）
      turnstile_token: resendTurnstileToken.value || initialTurnstileToken.value || undefined
    } as Parameters<typeof sendVerifyCode>[0]
    const response = isPendingOAuthFlow()
      ? await sendPendingOAuthVerifyCode(requestPayload)
      : await sendVerifyCode(requestPayload)

    const pendingSendCodeSession = isPendingOAuthFlow()
      ? getPendingOAuthSendCodeSessionResponse(response as PendingOAuthSendVerifyCodeResponse)
      : null
    if (pendingSendCodeSession) {
      sessionStorage.removeItem('register_data')
      persistPendingOAuthSession(
        pendingSendCodeSession.provider || pendingProvider.value,
        pendingSendCodeSession.redirect,
      )
      await router.push(
        resolvePendingOAuthCallbackRoute(pendingSendCodeSession.provider || pendingProvider.value),
      )
      return
    }

    codeSent.value = true
    startCountdown(response.countdown)

    // Reset turnstile state（token 已使用，清除以避免重复使用）
    initialTurnstileToken.value = ''
    showResendTurnstile.value = false
    resendTurnstileToken.value = ''
  } catch (error: unknown) {
    errorMessage.value = buildAuthErrorMessage(error, {
      fallback: t('auth.sendCodeFailed')
    })

    appStore.showError(errorMessage.value)
  } finally {
    isSendingCode.value = false
  }
}

// ==================== Handlers ====================

async function handleResendCode(): Promise<void> {
  // If turnstile is enabled and we haven't shown it yet, show it
  if (turnstileEnabled.value && !showResendTurnstile.value) {
    showResendTurnstile.value = true
    return
  }

  // If turnstile is enabled but no token yet, wait
  if (turnstileEnabled.value && !resendTurnstileToken.value) {
    errors.value.turnstile = t('auth.completeVerification')
    return
  }

  await sendCode()
}

function validateForm(): boolean {
  errors.value.code = ''

  if (!verifyCode.value.trim()) {
    errors.value.code = t('auth.codeRequired')
    return false
  }

  if (!/^\d{6}$/.test(verifyCode.value.trim())) {
    errors.value.code = t('auth.invalidCode')
    return false
  }

  return true
}

async function handleVerify(): Promise<void> {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    if (!shouldBypassRegistrationEmailPolicy() && !isRegistrationEmailSuffixAllowed(email.value, registrationEmailSuffixWhitelist.value)) {
      errorMessage.value = buildEmailSuffixNotAllowedMessage()
      appStore.showError(errorMessage.value)
      return
    }

    if (isPendingOAuthFlow()) {
      const { data } = await apiClient.post<PendingOAuthCreateAccountResponse>(
        '/auth/oauth/pending/create-account',
        {
          email: email.value,
          password: password.value,
          verify_code: verifyCode.value.trim(),
          invitation_code: invitationCode.value || undefined,
          ...oauthAffiliatePayload(affCode.value || loadAffiliateReferralCode()),
          adopt_display_name: pendingAdoptionDecision.value?.adoptDisplayName,
          adopt_avatar: pendingAdoptionDecision.value?.adoptAvatar
        }
      )
      if (isPendingOAuthSessionResponse(data)) {
        sessionStorage.removeItem('register_data')
        persistPendingOAuthSession(data.provider || pendingProvider.value, data.redirect)
        await router.push(resolvePendingOAuthCallbackRoute(data.provider || pendingProvider.value))
        return
      }
      if (!isOAuthLoginCompletion(data)) {
        throw new Error(t('auth.verifyFailed'))
      }

      persistOAuthTokenContext(data)
      await authStore.setToken(data.access_token)
      authStore.clearPendingAuthSession?.()
    } else {
      // Register with verification code
      await authStore.register({
        email: email.value,
        password: password.value,
        verify_code: verifyCode.value.trim(),
        turnstile_token: initialTurnstileToken.value || undefined,
        promo_code: promoCode.value || undefined,
        invitation_code: invitationCode.value || undefined,
        ...(affCode.value ? { aff_code: affCode.value } : {})
      })
    }

    // Clear session data
    sessionStorage.removeItem('register_data')
    clearAllAffiliateReferralCodes()

    // Show success toast
    appStore.showSuccess(t('auth.accountCreatedSuccess', { siteName: siteName.value }))

    // Redirect to dashboard
    await router.push(pendingRedirect.value || '/dashboard')
  } catch (error: unknown) {
    errorMessage.value = buildAuthErrorMessage(error, {
      fallback: t('auth.verifyFailed')
    })

    appStore.showError(errorMessage.value)
  } finally {
    isLoading.value = false
  }
}

function handleBack(): void {
  // Clear session data
  sessionStorage.removeItem('register_data')

  // Go back to registration
  router.push('/register')
}

function buildEmailSuffixNotAllowedMessage(): string {
  const normalizedWhitelist = normalizeRegistrationEmailSuffixWhitelist(
    registrationEmailSuffixWhitelist.value
  )
  if (normalizedWhitelist.length === 0) {
    return t('auth.emailSuffixNotAllowed')
  }
  const separator = String(locale.value || '').toLowerCase().startsWith('zh') ? '、' : ', '
  return t('auth.emailSuffixNotAllowedWithAllowed', {
    suffixes: formatRegistrationEmailSuffixWhitelistForMessage(normalizedWhitelist, {
      separator,
      more: (count) => t('auth.emailSuffixAllowedMore', { count })
    })
  })
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.auth-display-title {
  text-wrap: balance;
}

.auth-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.dark .auth-label {
  color: #cbd5e1;
}

.auth-input {
  min-height: 3rem;
  width: 100%;
  border-radius: 0.875rem;
  border: 1px solid transparent;
  background: #f5f5f7;
  color: #111827;
  font-size: 0.875rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.auth-input::placeholder {
  color: #6b7280;
}

.auth-input:focus {
  border-color: #111827;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.12);
  outline: none;
}

.auth-input:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.auth-input-error {
  border-color: #ef4444;
}

.auth-hint {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.dark .auth-input {
  background: #1e293b;
  color: #f8fafc;
}

.dark .auth-input::placeholder {
  color: #94a3b8;
}

.dark .auth-input:focus {
  background: #0f172a;
}

.dark .auth-hint {
  color: #94a3b8;
}
</style>
