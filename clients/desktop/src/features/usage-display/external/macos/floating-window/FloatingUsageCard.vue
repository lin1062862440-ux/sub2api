<script setup lang="ts">
import { computed } from 'vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import type { BalanceDisplaySnapshot } from '@/features/usage-display/core/store'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import BalanceOverview from '@/features/usage-display/external/macos/shared/BalanceOverview.vue'
import FloatingSubscriptionOverview from './FloatingSubscriptionOverview.vue'

const props = defineProps<{
  source: 'balance' | 'subscription'
  appearance: UsageDisplayAppearance
  balance: BalanceDisplaySnapshot | null
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
  loading: boolean
  error: string
  lastUpdatedAt: Date | null
}>()

const emit = defineEmits<{ drag: [] }>()

const sourceName = computed(() => props.source === 'balance'
  ? '账户余额'
  : props.subscription?.group?.name || '订阅用量')

const updateLabel = computed(() => {
  if (props.loading) return '正在读取'
  if (!props.lastUpdatedAt) return '等待更新'
  return `更新于 ${props.lastUpdatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})
</script>

<template>
  <section
    class="floating-usage-card"
    :data-appearance="appearance"
    data-testid="floating-usage-card"
  >
    <header class="floating-card-head" @mousedown="emit('drag')">
      <p>LINAI · {{ source === 'subscription' ? 'PRO' : 'BALANCE' }}</p>
      <strong>{{ sourceName }}</strong>
      <span><i :class="{ stale: error }" />{{ error ? '数据可能已过期' : updateLabel }}</span>
    </header>

    <p v-if="error" class="floating-notice" data-testid="floating-usage-notice">{{ error }}</p>

    <BalanceOverview v-if="source === 'balance'" :balance="balance" />
    <FloatingSubscriptionOverview
      v-else
      :subscription="subscription"
      :quota-summary="quotaSummary"
    />
  </section>
</template>
