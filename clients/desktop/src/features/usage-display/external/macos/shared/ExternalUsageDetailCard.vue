<script setup lang="ts">
import { computed } from 'vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import type { BalanceDisplaySnapshot } from '@/features/usage-display/core/store'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import BalanceOverview from './BalanceOverview.vue'
import ExternalSubscriptionOverview from './ExternalSubscriptionOverview.vue'
import { resolveExternalQuotaPresentation } from './quota-presentation'

const props = withDefaults(defineProps<{
  source: 'balance' | 'subscription'
  appearance: UsageDisplayAppearance
  balance: BalanceDisplaySnapshot | null
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
  loading: boolean
  error: string
  lastUpdatedAt: Date | null
  draggable?: boolean
}>(), { draggable: false })

const emit = defineEmits<{ drag: [] }>()
const sourceName = computed(() => props.source === 'balance'
  ? '账户余额'
  : props.subscription?.group?.name || '订阅用量')
const updateLabel = computed(() => {
  if (props.loading) return '正在读取'
  if (!props.lastUpdatedAt) return '等待更新'
  return `更新于 ${props.lastUpdatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})
const nativePrimaryQuota = computed(() => props.appearance === 'native' && props.source === 'subscription'
  ? resolveExternalQuotaPresentation(props.quotaSummary).primary
  : null)

function startDrag() {
  if (props.draggable) emit('drag')
}
</script>

<template>
  <section
    class="external-usage-detail-card"
    :class="{ 'native-landscape': appearance === 'native' }"
    :data-appearance="appearance"
    data-testid="external-usage-detail-card"
  >
    <header class="external-detail-head" :class="{ draggable }" @mousedown="startDrag">
      <div class="external-detail-identity">
        <p>LINAI · PRO</p>
        <strong>{{ sourceName }}</strong>
        <span><i :class="{ stale: error }" />{{ error ? '数据可能已过期' : updateLabel }}</span>
      </div>
      <div v-if="nativePrimaryQuota" class="native-primary-metric" data-testid="native-primary-metric">
        <span>剩余额度</span>
        <strong>{{ nativePrimaryQuota.remainingPercent }}<small>%</small></strong>
      </div>
    </header>

    <p v-if="error" class="external-detail-notice" data-testid="floating-usage-notice">{{ error }}</p>
    <BalanceOverview v-if="source === 'balance'" :balance="balance" />
    <ExternalSubscriptionOverview v-else :subscription="subscription" :quota-summary="quotaSummary" />
  </section>
</template>
