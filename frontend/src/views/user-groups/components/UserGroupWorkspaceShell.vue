<template>
  <div class="min-w-0 space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-semibold text-gray-950 dark:text-white">
            {{ t('userGroups.workspace.title') }}
          </h1>
          <span
            v-if="showReadOnly"
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

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)
const showReadOnly = computed(() => !canManage.value)
</script>
