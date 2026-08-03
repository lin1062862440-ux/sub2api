<template>
  <BaseDialog
    :show="show"
    :title="t('userGroups.usage.promptDetails')"
    width="wide"
    close-on-click-outside
    @close="emit('close')"
  >
    <div class="max-h-[68vh] overflow-y-auto pr-1" data-test="prompt-detail-body">
      <div v-if="loading" class="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <Icon name="refresh" size="lg" class="animate-spin text-primary-600 dark:text-primary-400" />
        <span>{{ t('userGroups.usage.promptLoading') }}</span>
      </div>

      <div v-else-if="forbidden" data-test="prompt-forbidden" class="flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <Icon name="lock" size="lg" />
        </span>
        <p class="mt-4 text-sm text-gray-700 dark:text-gray-200">{{ t('userGroups.usage.promptForbidden') }}</p>
      </div>

      <div v-else-if="error" data-test="prompt-error" class="flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <button type="button" class="btn btn-secondary mt-4" @click="emit('retry')">{{ t('userGroups.usage.promptRetry') }}</button>
      </div>

      <div v-else-if="prompts.length === 0" data-test="prompt-empty" class="flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-dark-800 dark:text-gray-300">
          <Icon name="chatBubble" size="lg" />
        </span>
        <p class="mt-4 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.promptUnavailable') }}</p>
      </div>

      <div v-else class="space-y-4">
        <article v-for="(prompt, index) in prompts" :key="prompt.id" class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-800/70">
            <div class="flex min-w-0 items-center gap-2">
              <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">{{ index + 1 }}</span>
              <span class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ prompt.model || '-' }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span class="rounded-md bg-white px-2 py-1 dark:bg-dark-900">{{ prompt.protocol || '-' }}</span>
              <span class="rounded-md bg-white px-2 py-1 dark:bg-dark-900">{{ prompt.stage || '-' }}</span>
              <span class="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{{ t('userGroups.usage.promptRedacted') }}</span>
              <span v-if="prompt.truncated" class="rounded-md bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{{ t('userGroups.usage.promptTruncated') }}</span>
            </div>
          </header>
          <pre class="whitespace-pre-wrap break-words px-4 py-4 font-sans text-sm leading-6 text-gray-800 dark:text-gray-100">{{ prompt.redacted_prompt }}</pre>
          <footer class="grid gap-2 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 dark:border-dark-700 dark:text-gray-400 sm:grid-cols-2">
            <span>{{ t('userGroups.usage.promptCapturedAt') }} · {{ formatDateTime(prompt.captured_at) }}</span>
            <span class="sm:text-right">{{ t('userGroups.usage.promptExpiresAt') }} · {{ formatDateTime(prompt.expires_at) }}</span>
          </footer>
        </article>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import type { UserGroupPromptDetail } from '@/types/userGroups'

defineProps<{
  show: boolean
  prompts: UserGroupPromptDetail[]
  loading?: boolean
  error?: string
  forbidden?: boolean
}>()

const emit = defineEmits<{
  close: []
  retry: []
}>()

const { t, locale } = useI18n()

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
</script>
