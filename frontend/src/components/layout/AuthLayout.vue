<template>
  <div class="auth-shell min-h-screen bg-[#f5f5f7] text-gray-950 dark:bg-dark-950 dark:text-white">
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
            <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-full w-full object-contain" />
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
              <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-full w-full object-contain" />
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
                <p class="text-sm font-medium text-white/60">{{ panelKicker }}</p>
                <p class="mt-2 text-2xl font-semibold">{{ panelTitle }}</p>
              </div>
              <Icon :name="panelIcon" size="lg" class="text-white/70" />
            </div>

            <div class="mt-8 grid gap-3 sm:grid-cols-3">
              <div
                v-for="item in panelItems"
                :key="item.text"
                class="rounded-2xl bg-white/10 p-4"
              >
                <Icon :name="item.icon" size="md" class="text-white/70" />
                <p class="mt-3 text-sm font-semibold">{{ item.text }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="mx-auto w-full max-w-[26rem]">
          <div class="mb-8 text-center lg:hidden">
            <div
              class="mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-dark-900"
            >
              <img :src="siteLogo || '/logo.svg'" alt="Logo" class="h-full w-full object-contain" />
            </div>
            <h1 class="text-3xl font-semibold text-gray-950 dark:text-white">
              {{ siteName }}
            </h1>
          </div>

          <div class="auth-card rounded-2xl bg-white p-6 dark:bg-dark-900 sm:p-8">
            <slot />
          </div>

          <div class="mt-6 text-center text-sm">
            <slot name="footer" />
          </div>

          <div class="mt-8 text-center text-xs text-gray-400 dark:text-dark-500">
            &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'
import Icon from '@/components/icons/Icon.vue'

type IconName = InstanceType<typeof Icon>['$props']['name']

type PanelItem = {
  icon: IconName
  text: string
}

const props = withDefaults(defineProps<{
  panelKicker?: string
  panelTitle?: string
  panelIcon?: IconName
  panelItems?: PanelItem[]
}>(), {
  panelKicker: '安全登录',
  panelTitle: '登录后继续管理 API、额度和账单',
  panelIcon: 'key',
  panelItems: () => [
    { icon: 'shield', text: '安全登录' },
    { icon: 'database', text: '账号池' },
    { icon: 'chart', text: '用量明细' }
  ]
})

const appStore = useAppStore()

const siteName = computed(() => appStore.siteName || 'Sub2API')
const siteLogo = computed(() => sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'Subscription to API Conversion Platform')
const panelKicker = computed(() => props.panelKicker)
const panelTitle = computed(() => props.panelTitle)
const panelIcon = computed(() => props.panelIcon)
const panelItems = computed(() => props.panelItems)

const currentYear = computed(() => new Date().getFullYear())

onMounted(() => {
  appStore.fetchPublicSettings()
})
</script>
