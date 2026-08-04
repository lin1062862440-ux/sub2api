<template>
  <div class="min-w-0 space-y-5">
    <header class="space-y-4">
      <RouterLink
        :to="{ name: 'UserGroups' }"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-300 dark:hover:text-white"
        data-test="back-to-group-list"
      >
        <Icon name="arrowLeft" size="sm" />
        {{ t('userGroups.detail.backToList') }}
      </RouterLink>

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-base font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {{ group?.name.trim().slice(0, 1) || '#' }}
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="break-words text-2xl font-semibold text-gray-950 dark:text-white">
                {{ group?.name || t('userGroups.detail.loading') }}
              </h1>
              <span
                v-if="group"
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                :class="group.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300'"
              >
                {{ group.status === 'active' ? t('userGroups.groups.active') : group.status }}
              </span>
              <span v-if="readOnly" data-test="detail-read-only" class="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {{ t('userGroups.common.readOnly') }}
              </span>
            </div>
            <p class="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">
              {{ group?.description || t('userGroups.detail.descriptionFallback') }}
            </p>
          </div>
        </div>
        <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
    </header>

    <nav
      v-if="group"
      class="scrollbar-hide -mx-1 flex min-w-0 gap-6 overflow-x-auto border-b border-gray-200 px-1 dark:border-dark-700"
      :aria-label="t('userGroups.detail.navigation')"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="{ name: tab.routeName, params: { id: String(group.id) } }"
        :data-test="`group-detail-tab-${tab.key}`"
        :aria-current="route.name === tab.routeName ? 'page' : undefined"
        class="shrink-0 border-b-2 border-transparent px-0.5 pb-3 pt-1 text-sm font-medium text-gray-600 transition-colors duration-200 hover:text-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-300 dark:hover:text-white"
        :class="route.name === tab.routeName ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300' : ''"
      >
        {{ t(`userGroups.detail.tabs.${tab.key}`) }}
      </RouterLink>
    </nav>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Icon from '@/components/icons/Icon.vue'
import type { UserGroup } from '@/types/userGroups'

defineProps<{
  group: UserGroup | null
  readOnly?: boolean
}>()

const route = useRoute()
const { t } = useI18n()
const tabs = computed(() => [
  { key: 'members', routeName: 'UserGroupMembers' },
  { key: 'planQuota', routeName: 'UserGroupPlanQuota' },
  { key: 'usage', routeName: 'UserGroupUsage' },
])
</script>
