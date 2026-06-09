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
                <p class="text-sm font-medium text-white/60">重置密码</p>
                <p class="mt-2 text-2xl font-semibold">
                  设置新密码后继续管理控制台
                </p>
              </div>
              <Icon name="lock" size="lg" class="text-white/70" />
            </div>

            <div class="mt-8 space-y-3 text-sm leading-6 text-white/70">
              <div class="flex items-center gap-3">
                <Icon name="mail" size="sm" class="text-white/70" />
                <span>通过邮箱链接确认账号身份</span>
              </div>
              <div class="flex items-center gap-3">
                <Icon name="shield" size="sm" class="text-white/70" />
                <span>重置完成后原密码立即失效</span>
              </div>
              <div class="flex items-center gap-3">
                <Icon name="key" size="sm" class="text-white/70" />
                <span>登录后可继续管理 API Key 与用量</span>
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
                {{ t('auth.resetPasswordTitle') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                {{ t('auth.resetPasswordHint') }}
              </p>
            </div>

            <div v-if="isInvalidLink" class="mt-7 space-y-6">
              <div class="rounded-2xl bg-amber-50 p-6 dark:bg-amber-900/20">
                <div class="flex flex-col items-center gap-4 text-center">
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-dark-900">
                    <Icon name="exclamationCircle" size="lg" class="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold text-amber-800 dark:text-amber-200">
                      {{ t('auth.invalidResetLink') }}
                    </h3>
                    <p class="mt-2 text-sm leading-6 text-amber-700 dark:text-amber-300">
                      {{ t('auth.invalidResetLinkHint') }}
                    </p>
                  </div>
                </div>
              </div>

              <router-link
                to="/forgot-password"
                class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
              >
                <Icon name="mail" size="sm" />
                {{ t('auth.requestNewResetLink') }}
              </router-link>
            </div>

            <div v-else-if="isSuccess" class="mt-7 space-y-6">
              <div class="rounded-2xl bg-gray-100 p-6 dark:bg-dark-800">
                <div class="flex flex-col items-center gap-4 text-center">
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-dark-900">
                    <Icon name="checkCircle" size="lg" class="text-gray-950 dark:text-white" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold text-gray-950 dark:text-white">
                      {{ t('auth.passwordResetSuccess') }}
                    </h3>
                    <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                      {{ t('auth.passwordResetSuccessHint') }}
                    </p>
                  </div>
                </div>
              </div>

              <router-link
                to="/login"
                class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
              >
                <Icon name="login" size="sm" />
                {{ t('auth.signIn') }}
              </router-link>
            </div>

            <form v-else @submit.prevent="handleSubmit" class="mt-7 space-y-5">
              <div>
                <label for="email" class="auth-label">
                  {{ t('auth.emailLabel') }}
                </label>
                <div class="relative">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon name="mail" size="md" class="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="email"
                    :value="email"
                    type="email"
                    readonly
                    disabled
                    class="auth-input pl-11"
                  />
                </div>
              </div>

              <div>
                <label for="password" class="auth-label">
                  {{ t('auth.newPassword') }}
                </label>
                <div class="relative">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon name="lock" size="md" class="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="password"
                    v-model="formData.password"
                    :type="showPassword ? 'text' : 'password'"
                    required
                    autocomplete="new-password"
                    :disabled="isLoading"
                    class="auth-input pl-11 pr-11"
                    :class="{ 'auth-input-error': errors.password }"
                    :placeholder="t('auth.newPasswordPlaceholder')"
                  />
                  <button
                    type="button"
                    :disabled="isLoading"
                    @click="showPassword = !showPassword"
                    class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-dark-200"
                  >
                    <Icon v-if="showPassword" name="eyeOff" size="md" />
                    <Icon v-else name="eye" size="md" />
                  </button>
                </div>
              </div>

              <div>
                <label for="confirmPassword" class="auth-label">
                  {{ t('auth.confirmPassword') }}
                </label>
                <div class="relative">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon name="lock" size="md" class="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="confirmPassword"
                    v-model="formData.confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    required
                    autocomplete="new-password"
                    :disabled="isLoading"
                    class="auth-input pl-11 pr-11"
                    :class="{ 'auth-input-error': errors.confirmPassword }"
                    :placeholder="t('auth.confirmPasswordPlaceholder')"
                  />
                  <button
                    type="button"
                    :disabled="isLoading"
                    @click="showConfirmPassword = !showConfirmPassword"
                    class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-dark-200"
                  >
                    <Icon v-if="showConfirmPassword" name="eyeOff" size="md" />
                    <Icon v-else name="eye" size="md" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                :disabled="isLoading"
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
                {{ isLoading ? t('auth.resettingPassword') : t('auth.resetPassword') }}
              </button>
            </form>
          </div>

          <div class="mt-6 text-center text-sm text-gray-600 dark:text-dark-300">
            {{ t('auth.rememberedPassword') }}
            <router-link
              to="/login"
              class="font-medium text-gray-950 transition-colors hover:text-gray-700 dark:text-white dark:hover:text-dark-200"
            >
              {{ t('auth.signIn') }}
            </router-link>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores'
import { getPublicSettings, resetPassword } from '@/api/auth'

const { t } = useI18n()

// ==================== Router & Stores ====================

const route = useRoute()
const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const isSuccess = ref<boolean>(false)
const errorMessage = ref<string>('')
const showPassword = ref<boolean>(false)
const showConfirmPassword = ref<boolean>(false)
const fetchedSiteName = ref<string>('')
const fetchedSiteLogo = ref<string>('')
const fetchedSiteSubtitle = ref<string>('')

// URL parameters
const email = ref<string>('')
const token = ref<string>('')

const formData = reactive({
  password: '',
  confirmPassword: ''
})

const errors = reactive({
  password: '',
  confirmPassword: ''
})

const validationToastMessage = computed(
  () => errors.password || errors.confirmPassword || ''
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

// Check if the reset link is valid (has email and token)
const isInvalidLink = computed(() => !email.value || !token.value)

// ==================== Lifecycle ====================

onMounted(async () => {
  // Get email and token from URL query parameters
  email.value = (route.query.email as string) || ''
  token.value = (route.query.token as string) || ''

  try {
    const settings = await getPublicSettings()
    fetchedSiteName.value = settings.site_name || ''
    fetchedSiteLogo.value = settings.site_logo || ''
    fetchedSiteSubtitle.value = settings.site_subtitle || ''
  } catch (error) {
    console.error('Failed to load public settings:', error)
  }

  if (!email.value || !token.value) {
    appStore.showError(t('auth.invalidResetLink'))
  }
})

// ==================== Validation ====================

function validateForm(): boolean {
  errors.password = ''
  errors.confirmPassword = ''

  let isValid = true

  // Password validation
  if (!formData.password) {
    errors.password = t('auth.passwordRequired')
    isValid = false
  } else if (formData.password.length < 6) {
    errors.password = t('auth.passwordMinLength')
    isValid = false
  }

  // Confirm password validation
  if (!formData.confirmPassword) {
    errors.confirmPassword = t('auth.confirmPasswordRequired')
    isValid = false
  } else if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = t('auth.passwordsDoNotMatch')
    isValid = false
  }

  return isValid
}

// ==================== Form Handlers ====================

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    await resetPassword({
      email: email.value,
      token: token.value,
      new_password: formData.password
    })

    isSuccess.value = true
    appStore.showSuccess(t('auth.passwordResetSuccess'))
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: { detail?: string; code?: string } } }

    // Check for invalid/expired token error
    if (err.response?.data?.code === 'INVALID_RESET_TOKEN') {
      errorMessage.value = t('auth.invalidOrExpiredToken')
    } else if (err.response?.data?.detail) {
      errorMessage.value = err.response.data.detail
    } else if (err.message) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = t('auth.resetPasswordFailed')
    }

    appStore.showError(errorMessage.value)
  } finally {
    isLoading.value = false
  }
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
</style>
