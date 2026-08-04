<template>
  <section data-test="usage-summary-band" class="grid grid-cols-2 divide-x divide-y divide-gray-200 border-y border-gray-200 dark:divide-dark-700 dark:border-dark-700 sm:grid-cols-2 xl:grid-cols-5 xl:divide-y-0">
    <div class="px-5 py-4">
      <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.requests') }}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatNumber(summary.total_requests) }}</p>
    </div>
    <div class="px-5 py-4">
      <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.totalTokens') }}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatNumber(summary.total_tokens) }}</p>
    </div>
    <div class="px-5 py-4">
      <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.totalCost') }}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatCurrency(summary.total_actual_cost) }}</p>
    </div>
    <div data-test="input-tokens" class="px-5 py-4">
      <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.inputTokens') }}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatNumber(summary.total_input_tokens) }}</p>
    </div>
    <div data-test="output-tokens" class="px-5 py-4 sm:col-span-2 xl:col-span-1">
      <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.outputTokens') }}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-primary-600 dark:text-primary-400">{{ formatNumber(summary.total_output_tokens) }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UserGroupUsageSummary } from '@/types/userGroups'

defineProps<{ summary: UserGroupUsageSummary }>()
const { t, locale } = useI18n()

function formatNumber(value: number) {
  return new Intl.NumberFormat(locale.value, { notation: value >= 100000 ? 'compact' : 'standard' }).format(value || 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(value || 0)
}
</script>
