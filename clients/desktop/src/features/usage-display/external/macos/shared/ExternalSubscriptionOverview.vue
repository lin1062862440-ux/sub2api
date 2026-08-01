<script setup lang="ts">
import { computed } from 'vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import ExternalMetricValue from './ExternalMetricValue.vue'
import QuotaRow from './QuotaRow.vue'
import { resolveExternalQuotaPresentation } from './quota-presentation'

const props = defineProps<{
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
}>()

const presentation = computed(() => resolveExternalQuotaPresentation(props.quotaSummary))
const primaryQuota = computed(() => presentation.value.primary)
const secondaryQuotas = computed(() => presentation.value.secondary)
const primaryProgressStyle = computed(() => ({
  width: `${primaryQuota.value?.remainingPercent ?? 0}%`,
}))

const expiryLabel = computed(() => {
  const value = props.subscription?.expires_at
  if (!value) return '长期有效'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '有效期未知'
  return `有效期至 ${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`
})

function resetLabel(value: Date | null) {
  if (!value) return '重置时间未知'
  const remaining = value.getTime() - Date.now()
  if (remaining <= 0) return '即将重置'
  const hours = Math.ceil(remaining / 3_600_000)
  return hours < 24 ? `${hours} 小时后重置` : `${Math.ceil(hours / 24)} 天后重置`
}
</script>

<template>
  <section class="usage-overview subscription-overview" data-testid="floating-subscription-overview">
    <div
      v-if="subscription && quotaSummary"
      class="subscription-content"
      :data-quota-count="quotaSummary.quotas.length"
    >
      <div
        v-if="primaryQuota"
        class="subscription-primary"
        :class="{ constrained: primaryQuota.remainingPercent <= 20 }"
      >
        <div class="external-primary">
          <span data-testid="floating-primary-label">剩余额度</span>
          <ExternalMetricValue :value="`${primaryQuota.remainingPercent}%`" />
          <div class="floating-primary-track" data-testid="floating-primary-progress" aria-hidden="true">
            <span :style="primaryProgressStyle" />
          </div>
          <div class="floating-primary-meta" data-testid="floating-primary-meta">
            <span>{{ primaryQuota.label }} · ${{ primaryQuota.used.toFixed(2) }} / ${{ primaryQuota.limit.toFixed(2) }}</span>
            <small>{{ resetLabel(primaryQuota.resetAt) }}</small>
          </div>
        </div>
      </div>

      <div v-if="secondaryQuotas.length" class="quota-list">
        <QuotaRow
          v-for="quota in secondaryQuotas"
          :key="quota.key"
          :quota="quota"
          :show-icon="false"
          fill-mode="remaining"
        />
      </div>
      <div v-else-if="!primaryQuota" class="unlimited-state">
        <span>当前订阅无周期额度限制</span>
      </div>

      <footer class="floating-subscription-expiry" data-testid="floating-subscription-expiry">
        {{ expiryLabel }}
      </footer>
    </div>

    <div v-else class="missing-subscription">
      <strong>订阅不可用</strong>
      <span>请在客户端内重新选择订阅组</span>
    </div>
  </section>
</template>
