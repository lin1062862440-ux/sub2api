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
            <h1 class="auth-display-title text-5xl font-semibold leading-[1.04] tracking-[-0.03em] text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
            <p class="mt-5 max-w-lg text-lg leading-8 text-gray-700 dark:text-dark-200">
              {{ siteSubtitle }}
            </p>
          </div>

          <div class="mt-12 max-w-xl overflow-hidden rounded-2xl bg-gray-950 p-7 text-white dark:bg-dark-900">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-white/60">恢复访问</p>
                <p class="mt-2 text-2xl font-semibold tracking-[-0.02em]">
                  用邮箱重新进入你的控制台
                </p>
              </div>
              <Icon name="mail" size="lg" class="text-white/70" />
            </div>

            <p class="mt-8 max-w-md text-sm leading-6 text-white/70">
              输入注册邮箱后，系统会发送重置链接。为了账号安全，链接只用于本次密码重置流程。
            </p>
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
                {{ t('auth.forgotPasswordTitle') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                {{ t('auth.forgotPasswordHint') }}
              </p>
            </div>

      <!-- Success State -->
      <div v-if="isSubmitted" class="mt-7 space-y-6">
        <div class="rounded-2xl bg-gray-100 p-6 dark:bg-dark-800">
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-dark-900">
              <Icon name="checkCircle" size="lg" class="text-gray-950 dark:text-white" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-950 dark:text-white">
                {{ t('auth.resetEmailSent') }}
              </h3>
              <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                {{ t('auth.resetEmailSentHint') }}
              </p>
            </div>
          </div>
        </div>

        <div class="text-center">
          <router-link
            to="/login"
            class="inline-flex items-center gap-2 font-medium text-gray-950 transition-colors hover:text-gray-700 dark:text-white dark:hover:text-dark-200"
          >
            <Icon name="arrowLeft" size="sm" />
            {{ t('auth.backToLogin') }}
          </router-link>
        </div>
      </div>

      <!-- Form State -->
      <form v-else @submit.prevent="handleSubmit" class="mt-7 space-y-5">
        <!-- Email Input -->
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
              v-model="formData.email"
              type="email"
              required
              autofocus
              autocomplete="email"
              :disabled="isLoading"
              class="auth-input pl-11"
              :class="{ 'auth-input-error': errors.email }"
              :placeholder="t('auth.emailPlaceholder')"
            />
          </div>
        </div>

        <!-- Turnstile Widget -->
        <div v-if="turnstileEnabled && turnstileSiteKey">
          <TurnstileWidget
            ref="turnstileRef"
            :site-key="turnstileSiteKey"
            @verify="onTurnstileVerify"
            @expire="onTurnstileExpire"
            @error="onTurnstileError"
          />
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isLoading || (turnstileEnabled && !turnstileToken)"
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
          <Icon v-else name="mail" size="sm" />
          {{ isLoading ? t('auth.sendingResetLink') : t('auth.sendResetLink') }}
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
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { useAppStore } from '@/stores'
import { getPublicSettings, forgotPassword } from '@/api/auth'

const { t } = useI18n()

// ==================== Stores ====================

const appStore = useAppStore()

// ==================== State ====================

const isLoading = ref<boolean>(false)
const isSubmitted = ref<boolean>(false)
const errorMessage = ref<string>('')

// Public settings
const turnstileEnabled = ref<boolean>(false)
const turnstileSiteKey = ref<string>('')
const fetchedSiteName = ref<string>('')
const fetchedSiteLogo = ref<string>('')
const fetchedSiteSubtitle = ref<string>('')

// Turnstile
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const turnstileToken = ref<string>('')

const formData = reactive({
  email: ''
})

const errors = reactive({
  email: '',
  turnstile: ''
})

const validationToastMessage = computed(() => errors.email || errors.turnstile || '')
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
  try {
    const settings = await getPublicSettings()
    fetchedSiteName.value = settings.site_name || ''
    fetchedSiteLogo.value = settings.site_logo || ''
    fetchedSiteSubtitle.value = settings.site_subtitle || ''
    turnstileEnabled.value = settings.turnstile_enabled
    turnstileSiteKey.value = settings.turnstile_site_key || ''
  } catch (error) {
    console.error('Failed to load public settings:', error)
  }
})

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
  errors.email = ''
  errors.turnstile = ''

  let isValid = true

  // Email validation
  if (!formData.email.trim()) {
    errors.email = t('auth.emailRequired')
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = t('auth.invalidEmail')
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

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    await forgotPassword({
      email: formData.email,
      turnstile_token: turnstileEnabled.value ? turnstileToken.value : undefined
    })

    isSubmitted.value = true
    appStore.showSuccess(t('auth.resetEmailSent'))
  } catch (error: unknown) {
    // Reset Turnstile on error
    if (turnstileRef.value) {
      turnstileRef.value.reset()
      turnstileToken.value = ''
    }

    const err = error as { message?: string; response?: { data?: { detail?: string } } }

    if (err.response?.data?.detail) {
      errorMessage.value = err.response.data.detail
    } else if (err.message) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = t('auth.sendResetLinkFailed')
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
