<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="hasHomeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- HTML mode - SECURITY: homeContent is admin-only setting, XSS risk is acceptable -->
    <div v-else v-html="homeContent"></div>
  </div>

  <!-- Compact Home Page -->
  <div
    v-else-if="compactHomeEnabled"
    data-testid="compact-home"
    class="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-white"
  >
    <header class="border-b border-gray-200 px-4 py-4 sm:px-6 dark:border-dark-800">
      <nav class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <img
            :src="siteLogo || '/logo.svg'"
            alt="Logo"
            class="h-9 w-9 shrink-0 rounded-lg object-contain"
          />
          <span class="min-w-0 truncate text-base font-semibold">{{ siteName }}</span>
        </div>
        <div class="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
          <LocaleSwitcher />
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-dark-400 dark:hover:bg-dark-800"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>
          <button
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-dark-400 dark:hover:bg-dark-800"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            @click="toggleTheme"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>
          <router-link
            :to="isAuthenticated ? dashboardPath : '/login'"
            class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {{ isAuthenticated ? t('home.dashboard') : t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="flex min-w-0 flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <div class="min-w-0 max-w-2xl text-center">
        <img
          :src="siteLogo || '/logo.svg'"
          alt="Logo"
          class="mx-auto mb-6 h-20 w-20 rounded-2xl object-contain"
        />
        <h1 class="[overflow-wrap:anywhere] text-3xl font-bold md:text-4xl">{{ siteName }}</h1>
        <p class="mt-4 whitespace-pre-wrap [overflow-wrap:anywhere] text-base text-gray-600 dark:text-dark-300">{{ siteSubtitle }}</p>
        <router-link
          :to="isAuthenticated ? dashboardPath : '/login'"
          class="mt-8 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          {{ isAuthenticated ? t('home.goToDashboard') : t('home.login') }}
        </router-link>
      </div>
    </main>

    <footer class="min-w-0 border-t border-gray-200 px-4 py-5 text-center text-sm text-gray-500 [overflow-wrap:anywhere] sm:px-6 dark:border-dark-800 dark:text-dark-400">
      &copy; {{ currentYear }} {{ siteName }}
    </footer>
  </div>

  <!-- Default Home Page -->
  <div v-else class="min-h-screen bg-[#f5f5f7] text-gray-950 dark:bg-dark-950 dark:text-white">
    <header
      class="sticky top-0 z-30 border-b border-gray-950/5 bg-[#f5f5f7]/90 backdrop-blur-xl dark:border-white/10 dark:bg-dark-950/85"
    >
      <nav class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <router-link
          to="/"
          class="flex min-w-0 items-center gap-3 text-gray-950 transition-colors hover:text-gray-700 dark:text-white dark:hover:text-dark-200"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-dark-900"
          >
            <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-full w-full object-contain" />
          </span>
          <span class="truncate text-sm font-semibold sm:text-base">{{ siteName }}</span>
        </router-link>

        <div class="hidden items-center gap-7 text-sm text-gray-600 dark:text-dark-300 md:flex">
          <a href="#overview" class="transition-colors hover:text-gray-950 dark:hover:text-white">概览</a>
          <a href="#capabilities" class="transition-colors hover:text-gray-950 dark:hover:text-white">能力</a>
          <a href="#models" class="transition-colors hover:text-gray-950 dark:hover:text-white">模型</a>
        </div>

        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <LocaleSwitcher />

          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white hover:text-gray-950 dark:text-dark-400 dark:hover:bg-dark-900 dark:hover:text-white"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>

          <button
            @click="toggleTheme"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white hover:text-gray-950 dark:text-dark-400 dark:hover:bg-dark-900 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>

          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="inline-flex h-9 items-center gap-1.5 rounded-full bg-gray-950 py-1 pl-1 pr-3 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold dark:bg-gray-950/10"
            >
              {{ userInitial }}
            </span>
            <span class="hidden sm:inline">{{ t('home.dashboard') }}</span>
            <Icon name="externalLink" size="xs" />
          </router-link>
          <router-link
            v-else
            to="/login"
            class="inline-flex h-9 items-center rounded-full bg-gray-950 px-4 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
          >
            {{ t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main>
      <section id="overview" class="px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
        <div class="mx-auto max-w-7xl">
          <div class="mx-auto max-w-4xl text-center">
            <div
              class="mx-auto mb-7 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-dark-900"
            >
              <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
            </div>

            <h1
              class="home-title text-5xl font-semibold leading-[1.04] text-gray-950 dark:text-white sm:text-6xl lg:text-7xl"
            >
              {{ siteName }}
            </h1>
            <p
              class="home-copy mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-700 dark:text-dark-200 sm:text-xl"
            >
              {{ siteSubtitle }}
            </p>

            <div class="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <router-link
                :to="isAuthenticated ? dashboardPath : '/login'"
                class="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-dark-100"
              >
                {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
                <Icon name="arrowRight" size="sm" :stroke-width="2" />
              </router-link>

              <a
                v-if="docUrl"
                :href="docUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-white hover:text-gray-950 dark:text-dark-200 dark:hover:bg-dark-900 dark:hover:text-white"
              >
                {{ t('home.docs') }}
                <Icon name="externalLink" size="sm" />
              </a>
            </div>
          </div>

          <div
            class="mx-auto mt-14 max-w-6xl overflow-hidden rounded-2xl bg-gray-950 text-white dark:bg-dark-900"
          >
            <div class="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
              <div class="relative min-h-[380px] overflow-hidden p-6 sm:p-8 lg:p-10">
                <div class="absolute inset-x-8 top-10 h-px bg-white/10"></div>
                <div class="relative z-10">
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-white/60">Unified API</p>
                      <h2 class="mt-2 text-3xl font-semibold sm:text-4xl">
                        一个入口，连接多种模型
                      </h2>
                    </div>
                    <div
                      class="hidden rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-950 sm:block"
                    >
                      Ready
                    </div>
                  </div>

                  <div class="mt-10 space-y-4">
                    <div
                      class="flex items-center justify-between rounded-2xl bg-white px-4 py-4 text-gray-950"
                    >
                      <div class="flex items-center gap-3">
                        <span
                          class="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-950 text-white"
                        >
                          <Icon name="key" size="sm" />
                        </span>
                        <div>
                          <p class="text-sm font-semibold">Client API Key</p>
                          <p class="text-xs text-gray-500">统一鉴权与访问控制</p>
                        </div>
                      </div>
                      <Icon name="arrowRight" size="sm" class="text-gray-500" />
                    </div>

                    <div class="grid gap-3 sm:grid-cols-3">
                      <div class="rounded-2xl bg-white/10 p-4">
                        <Icon name="swap" size="md" class="text-white/70" />
                        <p class="mt-3 text-sm font-semibold">智能路由</p>
                        <p class="mt-1 text-xs leading-5 text-white/60">按模型和账号状态分发请求</p>
                      </div>
                      <div class="rounded-2xl bg-white/10 p-4">
                        <Icon name="shield" size="md" class="text-white/70" />
                        <p class="mt-3 text-sm font-semibold">会话保持</p>
                        <p class="mt-1 text-xs leading-5 text-white/60">连续对话固定到合适账号</p>
                      </div>
                      <div class="rounded-2xl bg-white/10 p-4">
                        <Icon name="chart" size="md" class="text-white/70" />
                        <p class="mt-3 text-sm font-semibold">用量记录</p>
                        <p class="mt-1 text-xs leading-5 text-white/60">账单、额度和明细可追踪</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-[#fbfbfd] p-5 text-gray-950 dark:bg-dark-800 dark:text-white sm:p-6 lg:p-8">
                <div class="rounded-2xl bg-white p-5 dark:bg-dark-900">
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <p class="text-sm font-semibold text-gray-950 dark:text-white">Routing plane</p>
                      <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                        Claude, GPT, Gemini, Antigravity
                      </p>
                    </div>
                    <Icon name="server" size="lg" class="text-gray-700 dark:text-dark-200" />
                  </div>

                  <div class="mt-6 space-y-4">
                    <div>
                      <div class="mb-2 flex justify-between text-xs text-gray-500 dark:text-dark-400">
                        <span>Claude</span>
                        <span>active</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                        <div class="signal-line h-full w-[82%] rounded-full bg-gray-950 dark:bg-white"></div>
                      </div>
                    </div>
                    <div>
                      <div class="mb-2 flex justify-between text-xs text-gray-500 dark:text-dark-400">
                        <span>GPT</span>
                        <span>ready</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                        <div
                          class="signal-line signal-line-delay h-full w-[68%] rounded-full bg-gray-500 dark:bg-dark-300"
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div class="mb-2 flex justify-between text-xs text-gray-500 dark:text-dark-400">
                        <span>Gemini</span>
                        <span>standby</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                        <div class="signal-line h-full w-[54%] rounded-full bg-gray-400 dark:bg-dark-500"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-4">
                  <div class="rounded-2xl bg-white p-5 dark:bg-dark-900">
                    <Icon name="database" size="md" class="text-gray-700 dark:text-dark-200" />
                    <p class="mt-4 text-2xl font-semibold">Pool</p>
                    <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">多账号池自动切换</p>
                  </div>
                  <div class="rounded-2xl bg-white p-5 dark:bg-dark-900">
                    <Icon name="creditCard" size="md" class="text-gray-700 dark:text-dark-200" />
                    <p class="mt-4 text-2xl font-semibold">Quota</p>
                    <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">
                      额度、计费、限流统一管理
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" class="px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div class="mx-auto max-w-7xl">
          <div class="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div class="rounded-2xl bg-white p-7 dark:bg-dark-900 sm:p-9 lg:p-12">
              <Icon name="globe" size="xl" class="text-gray-700 dark:text-dark-200" />
              <h2
                class="home-title mt-8 max-w-2xl text-3xl font-semibold text-gray-950 dark:text-white sm:text-5xl"
              >
                统一控制台
              </h2>
              <p class="home-copy mt-5 max-w-2xl text-base leading-8 text-gray-700 dark:text-dark-300">
                号池多账号无感切换，无需更换账号，只需 API KEY 即可享用多额度，统一管理模型、额度和账单规则。
              </p>

              <div class="mt-10 flex flex-wrap gap-3">
                <span class="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-dark-800 dark:text-dark-200">
                  {{ t('home.tags.subscriptionToApi') }}
                </span>
                <span class="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-dark-800 dark:text-dark-200">
                  {{ t('home.tags.stickySession') }}
                </span>
                <span class="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-dark-800 dark:text-dark-200">
                  {{ t('home.tags.realtimeBilling') }}
                </span>
              </div>
            </div>

            <div class="grid gap-5">
              <div class="rounded-2xl bg-gray-950 p-7 text-white dark:bg-dark-900 sm:p-8">
                <Icon name="server" size="lg" class="text-white/70" />
                <h3 class="mt-6 text-2xl font-semibold">
                  {{ t('home.features.unifiedGateway') }}
                </h3>
                <p class="mt-3 text-sm leading-7 text-white/70">
                  {{ t('home.features.unifiedGatewayDesc') }}
                </p>
              </div>

              <div class="rounded-2xl bg-white p-7 dark:bg-dark-900 sm:p-8">
                <Icon name="shield" size="lg" class="text-gray-700 dark:text-dark-200" />
                <h3 class="mt-6 text-2xl font-semibold text-gray-950 dark:text-white">
                  {{ t('home.features.multiAccount') }}
                </h3>
                <p class="mt-3 text-sm leading-7 text-gray-700 dark:text-dark-300">
                  {{ t('home.features.multiAccountDesc') }}
                </p>
              </div>
            </div>
          </div>

          <div class="mt-5 rounded-2xl bg-white p-7 dark:bg-dark-900 sm:p-9">
            <div class="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div class="max-w-2xl">
                <Icon name="chart" size="lg" class="text-gray-700 dark:text-dark-200" />
                <h3 class="mt-5 text-3xl font-semibold text-gray-950 dark:text-white">
                  {{ t('home.features.balanceQuota') }}
                </h3>
                <p class="mt-3 text-base leading-8 text-gray-700 dark:text-dark-300">
                  {{ t('home.features.balanceQuotaDesc') }}
                </p>
              </div>
              <div class="grid min-w-0 gap-3 sm:min-w-[360px]">
                <div class="flex items-center justify-between rounded-2xl bg-gray-100 px-4 py-3 dark:bg-dark-800">
                  <span class="text-sm text-gray-600 dark:text-dark-300">Billing mode</span>
                  <span class="text-sm font-semibold text-gray-950 dark:text-white">按量计费</span>
                </div>
                <div class="flex items-center justify-between rounded-2xl bg-gray-100 px-4 py-3 dark:bg-dark-800">
                  <span class="text-sm text-gray-600 dark:text-dark-300">Quota policy</span>
                  <span class="text-sm font-semibold text-gray-950 dark:text-white">可配置</span>
                </div>
                <div class="flex items-center justify-between rounded-2xl bg-gray-100 px-4 py-3 dark:bg-dark-800">
                  <span class="text-sm text-gray-600 dark:text-dark-300">Usage detail</span>
                  <span class="text-sm font-semibold text-gray-950 dark:text-white">可追踪</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="models" class="px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        <div class="mx-auto max-w-7xl">
          <div class="mx-auto max-w-3xl text-center">
            <h2
              class="home-title text-3xl font-semibold text-gray-950 dark:text-white sm:text-5xl"
            >
              {{ t('home.providers.title') }}
            </h2>
            <p class="mt-4 text-base leading-8 text-gray-700 dark:text-dark-300">
              {{ t('home.providers.description') }}。接入后按同一套密钥、额度和账单规则使用。
            </p>
          </div>

          <div class="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-3">
            <span class="model-pill">
              <span class="model-mark bg-[#d97706]">C</span>
              {{ t('home.providers.claude') }}
            </span>
            <span class="model-pill">
              <span class="model-mark bg-gray-950">G</span>
              GPT
            </span>
            <span class="model-pill">
              <span class="model-mark bg-blue-600">G</span>
              {{ t('home.providers.gemini') }}
            </span>
            <span class="model-pill">
              <span class="model-mark bg-rose-600">A</span>
              {{ t('home.providers.antigravity') }}
            </span>
            <span class="model-pill">
              <span class="model-mark bg-gray-400">+</span>
              {{ t('home.providers.more') }}
            </span>
          </div>
        </div>
      </section>
    </main>

    <footer class="px-4 py-8 sm:px-6 lg:px-8">
      <div
        class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-gray-950/10 pt-8 text-center text-sm text-gray-500 dark:border-white/10 dark:text-dark-400 sm:flex-row sm:text-left"
      >
        <p>&copy; {{ currentYear }} {{ siteName }}. {{ t('home.footer.allRightsReserved') }}</p>
        <div class="flex items-center gap-5">
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-gray-950 dark:hover:text-white"
          >
            {{ t('home.docs') }}
          </a>
          <a
            :href="githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-gray-950 dark:hover:text-white"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import { sanitizeUrl } from '@/utils/url'

const { t } = useI18n()

const authStore = useAuthStore()
const appStore = useAppStore()

// Site settings - directly from appStore (already initialized from injected config)
const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API')
const siteLogo = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform')
const docUrl = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.doc_url || appStore.docUrl || ''))
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
const hasHomeContent = computed(() => homeContent.value.trim().length > 0)
const compactHomeEnabled = computed(() => appStore.cachedPublicSettings?.compact_home_enabled === true)

// Check if homeContent is a URL (for iframe display)
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

// Theme
const isDark = ref(document.documentElement.classList.contains('dark'))

// GitHub URL
const githubUrl = 'https://github.com/Wei-Shaw/sub2api'

// Auth state
const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => isAdmin.value ? '/admin/dashboard' : '/dashboard')
const userInitial = computed(() => {
  const user = authStore.user
  if (!user || !user.email) return ''
  return user.email.charAt(0).toUpperCase()
})

// Current year for footer
const currentYear = computed(() => new Date().getFullYear())

// Toggle theme
function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

onMounted(() => {
  initTheme()

  // Check auth state
  authStore.checkAuth()

  // Ensure public settings are loaded (will use cache if already loaded from injected config)
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>

<style scoped>
.home-title {
  letter-spacing: 0;
  text-wrap: balance;
}

.home-copy {
  text-wrap: pretty;
}

.signal-line {
  animation: signal-breathe 4s ease-in-out infinite;
  transform-origin: left center;
}

.signal-line-delay {
  animation-delay: 0.7s;
}

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 3rem;
  border-radius: 9999px;
  background: #ffffff;
  padding: 0.5rem 1rem 0.5rem 0.625rem;
  color: #111827;
  font-size: 0.875rem;
  font-weight: 600;
}

.dark .model-pill {
  background: #0f172a;
  color: #f8fafc;
}

.model-mark {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
}

@keyframes signal-breathe {
  0%,
  100% {
    transform: scaleX(0.92);
    opacity: 0.72;
  }

  50% {
    transform: scaleX(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .signal-line {
    animation: none;
  }
}
</style>
