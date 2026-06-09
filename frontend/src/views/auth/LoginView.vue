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
            <h1 class="login-title text-5xl font-semibold leading-[1.04] tracking-[-0.03em] text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
            <p class="mt-5 max-w-lg text-lg leading-8 text-gray-700 dark:text-dark-200">
              {{ siteSubtitle }}
            </p>
          </div>

          <div class="mt-12 max-w-xl overflow-hidden rounded-2xl bg-gray-950 p-7 text-white dark:bg-dark-900">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-white/60">安全登录</p>
                <p class="mt-2 text-2xl font-semibold tracking-[-0.02em]">登录后继续管理 API、额度和账单</p>
              </div>
              <Icon name="key" size="lg" class="text-white/70" />
            </div>

            <div class="mt-8 grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl bg-white/10 p-4">
                <Icon name="shield" size="md" class="text-white/70" />
                <p class="mt-3 text-sm font-semibold">安全登录</p>
              </div>
              <div class="rounded-2xl bg-white/10 p-4">
                <Icon name="database" size="md" class="text-white/70" />
                <p class="mt-3 text-sm font-semibold">账号池</p>
              </div>
              <div class="rounded-2xl bg-white/10 p-4">
                <Icon name="chart" size="md" class="text-white/70" />
                <p class="mt-3 text-sm font-semibold">用量明细</p>
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
            <h1 class="text-3xl font-semibold tracking-[-0.02em] text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
          </div>

          <div class="rounded-2xl bg-white p-6 dark:bg-dark-900 sm:p-8">
            <div>
              <h2 class="text-2xl font-semibold tracking-[-0.02em] text-gray-950 dark:text-white">
                {{ t('auth.welcomeBack') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                {{ t('auth.signInToAccount') }}
              </p>
            </div>

            <form @submit.prevent="handleLogin" class="mt-7 space-y-5">
              <div
                v-if="errorMessage"
                class="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:bg-red-950/40 dark:text-red-200"
              >
                {{ errorMessage }}
              </div>

              <div>
                <label for="email" class="login-label">
                  {{ t('auth.emailLabel') }}
                </label>
                <div class="relative mt-2">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon name="mail" size="md" class="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="email"
                    v-model="formData.email"
                    type="email"
                    required
                    autofocus
                    autocomplete="email"
                    :disabled="authActionDisabled"
                    class="login-input pl-11"
                    :class="{ 'login-input-error': errors.email }"
                    :placeholder="t('auth.emailPlaceholder')"
                  />
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between gap-4">
                  <label for="password" class="login-label">
                    {{ t('auth.passwordLabel') }}
                  </label>
                  <router-link
                    v-if="passwordResetEnabled && !backendModeEnabled"
                    to="/forgot-password"
                    class="text-sm font-medium text-gray-700 transition-colors hover:text-gray-950 dark:text-dark-200 dark:hover:text-white"
                  >
                    {{ t('auth.forgotPassword') }}
                  </router-link>
                </div>
                <div class="relative mt-2">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon name="lock" size="md" class="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="password"
                    v-model="formData.password"
                    :type="showPassword ? 'text' : 'password'"
                    required
                    autocomplete="current-password"
                    :disabled="authActionDisabled"
                    class="login-input pl-11 pr-11"
                    :class="{ 'login-input-error': errors.password }"
                    :placeholder="t('auth.passwordPlaceholder')"
                  />
                  <button
                    type="button"
                    @click="showPassword = !showPassword"
                    :disabled="authActionDisabled"
                    class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-dark-200"
                  >
                    <Icon v-if="showPassword" name="eyeOff" size="md" />
                    <Icon v-else name="eye" size="md" />
                  </button>
                </div>
              </div>

              <div v-if="turnstileEnabled && turnstileSiteKey">
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
                :disabled="authActionDisabled || (turnstileEnabled && !turnstileToken)"
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
                <Icon v-else name="login" size="sm" />
                {{ isLoading ? t('auth.signingIn') : t('auth.signIn') }}
              </button>

              <LoginAgreementPrompt
                v-if="loginAgreementEnabled"
                :accepted="agreementAccepted"
                :documents="loginAgreementDocuments"
                :mode="loginAgreementMode"
                :updated-at="loginAgreementUpdatedAt"
                :visible="showAgreementModal"
                @accept="acceptLoginAgreement"
                @reject="rejectLoginAgreement"
                @open="showAgreementModal = true"
              />

              <div v-if="showOAuthLogin" class="space-y-3 pt-1">
                <div class="flex items-center gap-3">
                  <div class="h-px flex-1 bg-gray-200 dark:bg-dark-700"></div>
                  <span class="text-xs text-gray-500 dark:text-dark-400">
                    {{ t('auth.oauthOrContinue') }}
                  </span>
                  <div class="h-px flex-1 bg-gray-200 dark:bg-dark-700"></div>
                </div>

                <EmailOAuthButtons
                  :disabled="authActionDisabled"
                  :github-enabled="githubOAuthEnabled"
                  :google-enabled="googleOAuthEnabled"
                  :show-divider="false"
                />

                <LinuxDoOAuthSection
                  v-if="linuxdoOAuthEnabled"
                  :disabled="authActionDisabled"
                  :show-divider="false"
                />
                <DingTalkOAuthSection
                  v-if="dingtalkOAuthEnabled"
                  :disabled="authActionDisabled"
                  :show-divider="false"
                />
                <WechatOAuthSection
                  v-if="wechatOAuthEnabled"
                  :disabled="authActionDisabled"
                  :show-divider="false"
                />
                <OidcOAuthSection
                  v-if="oidcOAuthEnabled"
                  :disabled="authActionDisabled"
                  :provider-name="oidcOAuthProviderName"
                  :show-divider="false"
                />
              </div>
            </form>
          </div>

          <div v-if="!backendModeEnabled" class="mt-6 text-center text-sm text-gray-600 dark:text-dark-300">
            {{ t('auth.dontHaveAccount') }}
            <router-link
              to="/register"
              class="font-medium text-gray-950 transition-colors hover:text-gray-700 dark:text-white dark:hover:text-dark-200"
            >
              {{ t('auth.signUp') }}
            </router-link>
          </div>

          <p class="mt-8 text-center text-xs text-gray-400 dark:text-dark-500">
            &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
          </p>
        </section>
      </div>
    </main>
  </div>

  <!-- 2FA Modal -->
  <TotpLoginModal
    v-if="show2FAModal"
    ref="totpModalRef"
    :temp-token="totpTempToken"
    :user-email-masked="totpUserEmailMasked"
    @verify="handle2FAVerify"
    @cancel="handle2FACancel"
  />
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LinuxDoOAuthSection from '@/components/auth/LinuxDoOAuthSection.vue'
import DingTalkOAuthSection from '@/components/auth/DingTalkOAuthSection.vue'
import OidcOAuthSection from '@/components/auth/OidcOAuthSection.vue'
import WechatOAuthSection from '@/components/auth/WechatOAuthSection.vue'
import EmailOAuthButtons from '@/components/auth/EmailOAuthButtons.vue'
import LoginAgreementPrompt from '@/components/auth/LoginAgreementPrompt.vue'
import TotpLoginModal from '@/components/auth/TotpLoginModal.vue'
import Icon from '@/components/icons/Icon.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { useAuthStore, useAppStore } from '@/stores'
import { getPublicSettings, isTotp2FARequired, isWeChatWebOAuthEnabled } from '@/api/auth'
import type { LoginAgreementDocument, TotpLoginResponse } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { clearAllAffiliateReferralCodes } from '@/utils/oauthAffiliate'

const { t } = useI18n()
const LOGIN_AGREEMENT_STORAGE_KEY = 'sub2api_login_agreement_consent'

// ==================== Router & Stores ====================

const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const showPassword = ref<boolean>(false)
const publicSettingsLoaded = ref<boolean>(false)

// Public settings
const turnstileEnabled = ref<boolean>(false)
const turnstileSiteKey = ref<string>('')
const linuxdoOAuthEnabled = ref<boolean>(false)
const dingtalkOAuthEnabled = ref<boolean>(false)
const wechatOAuthEnabled = ref<boolean>(false)
const backendModeEnabled = ref<boolean>(false)
const oidcOAuthEnabled = ref<boolean>(false)
const oidcOAuthProviderName = ref<string>('OIDC')
const githubOAuthEnabled = ref<boolean>(false)
const googleOAuthEnabled = ref<boolean>(false)
const passwordResetEnabled = ref<boolean>(false)
const loginAgreementEnabled = ref<boolean>(false)
const loginAgreementMode = ref<'modal' | 'checkbox' | string>('modal')
const loginAgreementUpdatedAt = ref<string>('')
const loginAgreementRevision = ref<string>('')
const loginAgreementDocuments = ref<LoginAgreementDocument[]>([])
const agreementAccepted = ref<boolean>(false)
const showAgreementModal = ref<boolean>(false)
const fetchedSiteName = ref<string>('')
const fetchedSiteLogo = ref<string>('')
const fetchedSiteSubtitle = ref<string>('')

// Turnstile
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const turnstileToken = ref<string>('')

// 2FA state
const show2FAModal = ref<boolean>(false)
const totpTempToken = ref<string>('')
const totpUserEmailMasked = ref<string>('')
const totpModalRef = ref<InstanceType<typeof TotpLoginModal> | null>(null)

const formData = reactive({
  email: '',
  password: ''
})

const errors = reactive({
  email: '',
  password: '',
  turnstile: ''
})

const validationToastMessage = computed(
  () => errors.email || errors.password || errors.turnstile || ''
)

const agreementGateActive = computed(
  () => loginAgreementEnabled.value && !agreementAccepted.value
)

const authActionDisabled = computed(
  () => isLoading.value || !publicSettingsLoaded.value || agreementGateActive.value
)

const showOAuthLogin = computed(
  () =>
    !backendModeEnabled.value &&
    (linuxdoOAuthEnabled.value ||
      dingtalkOAuthEnabled.value ||
      wechatOAuthEnabled.value ||
      oidcOAuthEnabled.value ||
      githubOAuthEnabled.value ||
      googleOAuthEnabled.value)
)

const siteName = computed(
  () => fetchedSiteName.value || appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API'
)
const siteLogo = computed(
  () => fetchedSiteLogo.value || appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || ''
)
const siteSubtitle = computed(
  () => fetchedSiteSubtitle.value || appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform'
)
const currentYear = computed(() => new Date().getFullYear())

watch(validationToastMessage, (value, previousValue) => {
  if (value && value !== previousValue) {
    appStore.showError(value)
  }
})

// ==================== Lifecycle ====================

onMounted(async () => {
  const expiredFlag = sessionStorage.getItem('auth_expired')
  if (expiredFlag) {
    sessionStorage.removeItem('auth_expired')
    const message = t('auth.reloginRequired')
    errorMessage.value = message
    appStore.showWarning(message)
  }

  try {
    const settings = await getPublicSettings()
    fetchedSiteName.value = settings.site_name || ''
    fetchedSiteLogo.value = settings.site_logo || ''
    fetchedSiteSubtitle.value = settings.site_subtitle || ''
    turnstileEnabled.value = settings.turnstile_enabled
    turnstileSiteKey.value = settings.turnstile_site_key || ''
    linuxdoOAuthEnabled.value = settings.linuxdo_oauth_enabled
    dingtalkOAuthEnabled.value = settings.dingtalk_oauth_enabled ?? false
    wechatOAuthEnabled.value = isWeChatWebOAuthEnabled(settings)
    backendModeEnabled.value = settings.backend_mode_enabled
    oidcOAuthEnabled.value = settings.oidc_oauth_enabled
    oidcOAuthProviderName.value = settings.oidc_oauth_provider_name || 'OIDC'
    githubOAuthEnabled.value = settings.github_oauth_enabled
    googleOAuthEnabled.value = settings.google_oauth_enabled
    backendModeEnabled.value = settings.backend_mode_enabled
    passwordResetEnabled.value = settings.password_reset_enabled
    applyLoginAgreementSettings(settings)
  } catch (error) {
    console.error('Failed to load public settings:', error)
    loginAgreementEnabled.value = false
    agreementAccepted.value = true
  } finally {
    publicSettingsLoaded.value = true
  }
})

// ==================== Login Agreement ====================

function applyLoginAgreementSettings(settings: {
  login_agreement_enabled?: boolean
  login_agreement_mode?: string
  login_agreement_updated_at?: string
  login_agreement_revision?: string
  login_agreement_documents?: LoginAgreementDocument[]
}): void {
  const documents = Array.isArray(settings.login_agreement_documents)
    ? settings.login_agreement_documents.filter((doc) => doc.title?.trim())
    : []
  loginAgreementDocuments.value = documents
  loginAgreementEnabled.value = settings.login_agreement_enabled === true && documents.length > 0
  loginAgreementMode.value = settings.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
  loginAgreementUpdatedAt.value = settings.login_agreement_updated_at || ''
  loginAgreementRevision.value =
    settings.login_agreement_revision ||
    `${loginAgreementUpdatedAt.value}:${documents.map((doc) => `${doc.id}:${doc.title}`).join('|')}`

  agreementAccepted.value = !loginAgreementEnabled.value || hasAcceptedLoginAgreement(loginAgreementRevision.value)
  showAgreementModal.value =
    loginAgreementEnabled.value && !agreementAccepted.value && loginAgreementMode.value !== 'checkbox'
}

function hasAcceptedLoginAgreement(revision: string): boolean {
  if (!revision) {
    return false
  }
  try {
    const raw = localStorage.getItem(LOGIN_AGREEMENT_STORAGE_KEY)
    if (!raw) {
      return false
    }
    const parsed = JSON.parse(raw) as { revision?: string }
    return parsed.revision === revision
  } catch {
    return false
  }
}

function acceptLoginAgreement(): void {
  if (loginAgreementRevision.value) {
    localStorage.setItem(
      LOGIN_AGREEMENT_STORAGE_KEY,
      JSON.stringify({
        revision: loginAgreementRevision.value,
        accepted_at: new Date().toISOString()
      })
    )
  }
  agreementAccepted.value = true
  showAgreementModal.value = false
}

function rejectLoginAgreement(): void {
  localStorage.removeItem(LOGIN_AGREEMENT_STORAGE_KEY)
  agreementAccepted.value = false
  showAgreementModal.value = false
  appStore.showWarning('未同意最新条款前，无法输入账号密码或使用快捷登录。')
}

// ==================== Turnstile Handlers ====================

function onTurnstileVerify(token: string): void {
  turnstileToken.value = token
  errors.turnstile = ''
}

function onTurnstileExpire(): void {
  turnstileToken.value = ''
  errors.turnstile = t('auth.turnstileExpired')
}

function onTurnstileError(): void {
  turnstileToken.value = ''
  errors.turnstile = t('auth.turnstileFailed')
}

// ==================== Validation ====================

function validateForm(): boolean {
  // Reset errors
  errors.email = ''
  errors.password = ''
  errors.turnstile = ''

  let isValid = true

  if (agreementGateActive.value) {
    appStore.showWarning('请先阅读并同意最新条款后再登录。')
    if (loginAgreementMode.value !== 'checkbox') {
      showAgreementModal.value = true
    }
    return false
  }

  // Email validation
  if (!formData.email.trim()) {
    errors.email = t('auth.emailRequired')
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = t('auth.invalidEmail')
    isValid = false
  }

  // Password validation
  if (!formData.password) {
    errors.password = t('auth.passwordRequired')
    isValid = false
  } else if (formData.password.length < 6) {
    errors.password = t('auth.passwordMinLength')
    isValid = false
  }

  // Turnstile validation
  if (turnstileEnabled.value && !turnstileToken.value) {
    errors.turnstile = t('auth.completeVerification')
    isValid = false
  }

  return isValid
}

// ==================== Form Handlers ====================

async function handleLogin(): Promise<void> {
  // Clear previous error
  errorMessage.value = ''

  // Validate form
  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    // Call auth store login
    const response = await authStore.login({
      email: formData.email,
      password: formData.password,
      turnstile_token: turnstileEnabled.value ? turnstileToken.value : undefined
    })

    // Check if 2FA is required
    if (isTotp2FARequired(response)) {
      const totpResponse = response as TotpLoginResponse
      totpTempToken.value = totpResponse.temp_token || ''
      totpUserEmailMasked.value = totpResponse.user_email_masked || ''
      show2FAModal.value = true
      isLoading.value = false
      return
    }

    // Show success toast
    clearAllAffiliateReferralCodes()
    appStore.showSuccess(t('auth.loginSuccess'))

    // Redirect to dashboard or intended route
    const redirectTo = (router.currentRoute.value.query.redirect as string) || '/dashboard'
    await router.push(redirectTo)
  } catch (error: unknown) {
    // Reset Turnstile on error
    if (turnstileRef.value) {
      turnstileRef.value.reset()
      turnstileToken.value = ''
    }

    errorMessage.value = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.loginFailed'))

    // Also show error toast
    appStore.showError(errorMessage.value)
  } finally {
    isLoading.value = false
  }
}

// ==================== 2FA Handlers ====================

async function handle2FAVerify(code: string): Promise<void> {
  if (totpModalRef.value) {
    totpModalRef.value.setVerifying(true)
  }

  try {
    await authStore.login2FA(totpTempToken.value, code)

    // Close modal and show success
    show2FAModal.value = false
    clearAllAffiliateReferralCodes()
    appStore.showSuccess(t('auth.loginSuccess'))

    // Redirect to dashboard or intended route
    const redirectTo = (router.currentRoute.value.query.redirect as string) || '/dashboard'
    await router.push(redirectTo)
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: { message?: string } } }
    const message = err.response?.data?.message || err.message || t('profile.totp.loginFailed')

    if (totpModalRef.value) {
      totpModalRef.value.setError(message)
      totpModalRef.value.setVerifying(false)
    }
  }
}

function handle2FACancel(): void {
  show2FAModal.value = false
  totpTempToken.value = ''
  totpUserEmailMasked.value = ''
}
</script>

<style scoped>
.login-title {
  text-wrap: balance;
}

.login-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.dark .login-label {
  color: #cbd5e1;
}

.login-input {
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

.login-input::placeholder {
  color: #6b7280;
}

.login-input:focus {
  border-color: #111827;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.12);
  outline: none;
}

.login-input:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.login-input-error {
  border-color: #ef4444;
}

.dark .login-input {
  background: #1e293b;
  color: #f8fafc;
}

.dark .login-input::placeholder {
  color: #94a3b8;
}

.dark .login-input:focus {
  background: #0f172a;
}
</style>
