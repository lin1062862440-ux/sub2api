<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="item in windows"
      :key="item.label"
      class="flex items-center gap-2 text-[10px]"
      :title="titleFor(item.window, accountCount)"
    >
      <span
        :class="[
          'inline-flex h-5 w-8 shrink-0 items-center justify-center rounded px-1 font-semibold leading-none',
          item.badgeClass,
        ]"
      >
        {{ item.label }}
      </span>

      <span class="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
        <span
          class="block h-full rounded-full transition-all"
          :class="barClass(item.window)"
          :style="{ width: progressWidth(item.window) }"
        ></span>
      </span>

      <span class="w-10 text-right font-mono font-medium text-gray-600 dark:text-dark-300">
        {{ displayPercent(item.window) }}
      </span>
      <span class="text-gray-400 dark:text-dark-500">现在</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GroupCodexQuotaWindow } from '@/api/admin/groups'

const props = defineProps<{
  accountCount: number
  fiveHour: GroupCodexQuotaWindow
  sevenDay: GroupCodexQuotaWindow
}>()

const windows = computed(() => [
  {
    label: '5h',
    window: props.fiveHour,
    badgeClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
  },
  {
    label: '7d',
    window: props.sevenDay,
    badgeClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
])

function usageTone(used: number): 'empty' | 'low' | 'medium' | 'high' {
  if (!Number.isFinite(used) || used <= 0) return 'empty'
  if (used >= 90) return 'high'
  if (used >= 70) return 'medium'
  return 'low'
}

function barClass(window: GroupCodexQuotaWindow): string {
  if (window.sampled_accounts <= 0) return 'bg-transparent'
  const tone = usageTone(window.used_percent)
  if (tone === 'high') return 'bg-red-400 dark:bg-red-500'
  if (tone === 'medium') return 'bg-amber-400 dark:bg-amber-500'
  if (tone === 'empty') return 'bg-transparent'
  return 'bg-emerald-400 dark:bg-emerald-500'
}

function progressWidth(window: GroupCodexQuotaWindow): string {
  if (window.sampled_accounts <= 0) return '0%'
  return `${Math.max(0, Math.min(100, window.used_percent))}%`
}

function displayPercent(window: GroupCodexQuotaWindow): string {
  if (window.sampled_accounts <= 0) return '0%'
  return formatPercent(window.used_percent)
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`
}

function titleFor(window: GroupCodexQuotaWindow, total: number): string {
  const parts = [
    `used ${formatPercent(window.used_percent)}`,
    `remaining ${formatPercent(window.remaining_percent)}`,
    `${window.sampled_accounts}/${total} sampled`,
  ]
  if (window.missing_accounts > 0) parts.push(`${window.missing_accounts} missing`)
  if (window.expired_accounts > 0) parts.push(`${window.expired_accounts} expired`)
  return parts.join(' · ')
}
</script>
