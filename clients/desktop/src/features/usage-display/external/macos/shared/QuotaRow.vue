<script setup lang="ts">
import { computed } from 'vue'

import {
  usageRiskLevel,
  usedPercentFromRemaining,
  type ResolvedUsageQuota,
} from '@/features/usage-display/core/format'

const props = defineProps<{
  quota: ResolvedUsageQuota
}>()
const usedPercent = computed(() => usedPercentFromRemaining(props.quota.remainingPercent))
const riskLevel = computed(() => usageRiskLevel(usedPercent.value))
const progressStyle = computed(() => ({
  width: `${usedPercent.value}%`,
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
    :data-usage-risk="riskLevel"
    :class="{
      'compact-value': usedPercent < 20,
    }"
    data-testid="usage-quota-row"
  >
    <div class="quota-head">
      <strong>{{ quota.label }}</strong>
      <span>{{ usedPercent }}%</span>
    </div>
    <div class="quota-track" aria-hidden="true">
      <span :style="progressStyle"><b>{{ usedPercent }}%</b></span>
    </div>
    <div class="quota-meta">
      <span>${{ quota.used.toFixed(2) }} / ${{ quota.limit.toFixed(2) }}</span>
      <small>{{ resetLabel(quota.resetAt) }}</small>
    </div>
  </div>
</template>
