<script setup lang="ts">
import type { BalanceDisplaySnapshot } from '@/features/usage-display/core/store'

defineProps<{ balance: BalanceDisplaySnapshot | null }>()

function money(value: number | null | undefined) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '--'
}
</script>

<template>
  <section class="usage-overview balance-overview" data-testid="balance-overview">
    <div class="external-primary">
      <span>可用余额</span>
      <strong>{{ money(balance?.available) }}</strong>
    </div>
    <div class="period-grid">
      <div><span>今日消费</span><strong>{{ money(balance?.today) }}</strong></div>
      <div><span>近 7 天</span><strong>{{ money(balance?.last7Days) }}</strong></div>
      <div><span>本月消费</span><strong>{{ money(balance?.thisMonth) }}</strong></div>
    </div>
  </section>
</template>
