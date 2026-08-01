<script setup lang="ts">
import { computed } from 'vue'
import { CalendarClock, CircleGauge } from '@lucide/vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import QuotaRow from './QuotaRow.vue'

const props = withDefaults(defineProps<{
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
  showIcons?: boolean
}>(), { showIcons: true })

const subscriptionName = computed(() => props.subscription?.group?.name || '订阅用量')

function dateLabel(value: string | null | undefined) {
  if (!value) return '长期有效'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <section class="usage-overview subscription-overview" data-testid="subscription-overview">
    <div v-if="subscription && quotaSummary" class="subscription-content">
      <div class="subscription-primary">
        <div class="external-primary">
          <span>最紧额度剩余</span>
          <strong>{{ quotaSummary.unlimited ? '∞' : `${quotaSummary.remainingPercent}%` }}</strong>
        </div>
        <div class="subscription-copy">
          <small>当前订阅</small>
          <h2>{{ subscriptionName }}</h2>
          <span><CalendarClock v-if="showIcons" :size="13" />{{ dateLabel(subscription.expires_at) }} 到期</span>
        </div>
      </div>
      <div v-if="quotaSummary.quotas.length" class="quota-list">
        <QuotaRow
          v-for="quota in quotaSummary.quotas"
          :key="quota.key"
          :quota="quota"
          :show-icon="showIcons"
        />
      </div>
      <div v-else class="unlimited-state"><CircleGauge v-if="showIcons" :size="17" /><span>当前订阅无周期额度限制</span></div>
    </div>
    <div v-else class="missing-subscription">
      <CircleGauge v-if="showIcons" :size="24" />
      <strong>订阅不可用</strong>
      <span>请在客户端内重新选择订阅组</span>
    </div>
  </section>
</template>
