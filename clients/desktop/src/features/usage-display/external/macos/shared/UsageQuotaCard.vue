<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink, Gauge, Power, RefreshCw } from '@lucide/vue'

import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import type { BalanceDisplaySnapshot } from '@/features/usage-display/core/store'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import BalanceOverview from './BalanceOverview.vue'
import SubscriptionOverview from './SubscriptionOverview.vue'

const props = defineProps<{
  source: 'balance' | 'subscription'
  appearance: UsageDisplayAppearance
  balance: BalanceDisplaySnapshot | null
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
  loading: boolean
  refreshing: boolean
  error: string
  lastUpdatedAt: Date | null
  draggable?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  'open-main': []
  quit: []
  drag: []
}>()

const sourceName = computed(() => props.source === 'balance'
  ? '账户余额'
  : props.subscription?.group?.name || '订阅用量')

const updateLabel = computed(() => {
  if (props.loading) return '正在读取'
  if (!props.lastUpdatedAt) return '等待更新'
  return `更新于 ${props.lastUpdatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})

function startDrag(event: MouseEvent) {
  if (!props.draggable || (event.target as HTMLElement).closest('button')) return
  emit('drag')
}
</script>

<template>
  <section
    class="usage-quota-card"
    :data-appearance="appearance"
    data-testid="usage-quota-card"
  >
    <header class="external-card-head" :class="{ draggable }" @mousedown="startDrag">
      <div class="external-identity">
        <span class="external-mark"><Gauge :size="18" /></span>
        <div>
          <strong>{{ sourceName }}</strong>
          <span><i :class="{ stale: error }" />{{ error ? '数据可能已过期' : updateLabel }}</span>
        </div>
      </div>
      <div class="external-actions">
        <button
          type="button"
          title="刷新用量"
          aria-label="刷新用量"
          data-testid="usage-refresh"
          :disabled="loading || refreshing"
          @mousedown.stop
          @click="$emit('refresh')"
        ><RefreshCw :size="15" :class="{ spinning: refreshing }" /></button>
        <button
          type="button"
          title="打开主窗口"
          aria-label="打开主窗口"
          data-testid="usage-open-main"
          @mousedown.stop
          @click="$emit('open-main')"
        ><ExternalLink :size="15" /></button>
        <button
          type="button"
          title="退出 LinAI"
          aria-label="退出 LinAI"
          data-testid="usage-quit"
          @mousedown.stop
          @click="$emit('quit')"
        ><Power :size="15" /></button>
      </div>
    </header>

    <p v-if="error" class="external-notice" data-testid="usage-card-notice">{{ error }}</p>

    <BalanceOverview v-if="source === 'balance'" :balance="balance" />
    <SubscriptionOverview v-else :subscription="subscription" :quota-summary="quotaSummary" />
  </section>
</template>
