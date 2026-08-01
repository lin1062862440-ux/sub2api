<template>
  <div data-test="quota-progress" class="min-w-[180px]">
    <div class="mb-1 flex items-center justify-between gap-3 text-xs">
      <span class="text-gray-500 dark:text-gray-400">{{ label }}</span>
      <span class="tabular-nums text-gray-700 dark:text-gray-200">
        {{ formatMoney(used) }}
        <template v-if="limit !== null && limit !== undefined"> / {{ formatMoney(limit) }}</template>
        <template v-else> · {{ t('userGroups.subscriptions.unlimited') }}</template>
      </span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
      <div
        class="h-full rounded-full transition-[width] duration-300"
        :class="barClass"
        :style="{ width: `${percentage}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  label: string
  used: number
  limit?: number | null
}>()

const { t } = useI18n()
const percentage = computed(() => {
  if (props.limit === null || props.limit === undefined || props.limit <= 0) return 0
  return Math.min(100, Math.max(0, (props.used / props.limit) * 100))
})
const barClass = computed(() => {
  if (percentage.value >= 90) return 'bg-red-500'
  if (percentage.value >= 70) return 'bg-amber-500'
  return 'bg-primary-500'
})

function formatMoney(value: number) {
  return `$${(value || 0).toFixed(2)}`
}
</script>
