<script setup lang="ts">
import { computed } from 'vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import QuotaRow from './QuotaRow.vue'
import { resolveExternalQuotaPresentation } from './quota-presentation'

const props = defineProps<{
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
}>()

const quotas = computed(() => {
  const presentation = resolveExternalQuotaPresentation(props.quotaSummary)
  return presentation.primary
    ? [presentation.primary, ...presentation.secondary]
    : []
})

const expiryLabel = computed(() => {
  const value = props.subscription?.expires_at
  if (!value) return '长期有效'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '有效期未知'
  return `有效期至 ${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`
})

</script>

<template>
  <section class="usage-overview subscription-overview" data-testid="floating-subscription-overview">
    <div
      v-if="subscription && quotaSummary"
      class="subscription-content"
      :data-quota-count="quotas.length"
    >
      <div v-if="quotas.length" class="quota-list">
        <QuotaRow
          v-for="quota in quotas"
          :key="quota.key"
          :quota="quota"
        />
      </div>
      <div v-else class="unlimited-state">
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
