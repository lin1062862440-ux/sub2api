<template>
  <div class="min-w-0 space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-semibold text-gray-950 dark:text-white">
            {{ t('userGroups.workspace.title') }}
          </h1>
          <span
            v-if="!canManage"
            data-test="workspace-read-only"
            class="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800"
          >
            {{ t('userGroups.common.readOnly') }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {{ t('userGroups.workspace.description') }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <nav
      class="scrollbar-hide -mx-1 flex min-w-0 gap-6 overflow-x-auto border-b border-gray-200 px-1 dark:border-dark-700"
      :aria-label="t('userGroups.workspace.navigation')"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.key"
        :data-test="`workspace-tab-${tab.key}`"
        :to="tab.to"
        :aria-current="route.name === tab.routeName ? 'page' : undefined"
        class="shrink-0 border-b-2 border-transparent px-0.5 pb-3 pt-1 text-sm font-medium text-gray-600 transition-colors duration-200 hover:text-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-300 dark:hover:text-white"
        :class="route.name === tab.routeName ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300' : ''"
      >
        {{ t(`userGroups.workspace.tabs.${tab.key}`) }}
      </RouterLink>
    </nav>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)

const preservedGroupQuery = computed(() => {
  const groupId = route.query.group_id
  return typeof groupId === 'string' && /^\d+$/.test(groupId) ? { group_id: groupId } : {}
})

const tabs = computed(() => [
  { key: 'groups', routeName: 'UserGroups', to: { name: 'UserGroups', query: preservedGroupQuery.value } },
  { key: 'subscriptions', routeName: 'UserGroupSubscriptions', to: { name: 'UserGroupSubscriptions', query: preservedGroupQuery.value } },
  { key: 'usage', routeName: 'UserGroupUsage', to: { name: 'UserGroupUsage', query: preservedGroupQuery.value } },
])
</script>
