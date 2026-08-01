<script setup lang="ts">
import { computed } from 'vue'
import { Clock3 } from '@lucide/vue'

import type { ResolvedUsageQuota } from '@/features/usage-display/core/format'

const props = withDefaults(defineProps<{
  quota: ResolvedUsageQuota
  showIcon?: boolean
  fillMode?: 'used' | 'remaining'
}>(), { showIcon: true, fillMode: 'used' })
const progressStyle = computed(() => ({
  width: `${props.fillMode === 'remaining'
    ? props.quota.remainingPercent
    : 100 - props.quota.remainingPercent}%`,
}))

function resetLabel(value: Date | null) {
  if (!value) return '重置时间未知'
  const remaining = value.getTime() - Date.now()
  if (remaining <= 0) return '即将重置'
  const hours = Math.ceil(remaining / 3_600_000)
  return hours < 24 ? `${hours} 小时后重置` : `${Math.ceil(hours / 24)} 天后重置`
}
</script>

<template>
  <div
    class="quota-row"
    :class="{ constrained: quota.remainingPercent <= 20 }"
    data-testid="usage-quota-row"
  >
    <div class="quota-head">
      <strong>{{ quota.label }}</strong>
      <span>${{ quota.used.toFixed(2) }} / ${{ quota.limit.toFixed(2) }}</span>
      <b>{{ quota.remainingPercent }}%</b>
    </div>
    <div class="quota-track" aria-hidden="true"><span :style="progressStyle" /></div>
    <small><Clock3 v-if="showIcon" :size="11" />{{ resetLabel(quota.resetAt) }}</small>
  </div>
</template>
