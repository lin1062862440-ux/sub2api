<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { formatUsageOrbValue } from '@/features/usage-display/core/format'
import {
  setFloatingUsageExpanded,
  startFloatingUsageDrag,
} from '@/features/usage-display/core/host'
import { usageDisplayStore } from '@/features/usage-display/core/store'
import FloatingUsageCard from './FloatingUsageCard.vue'
import FloatingUsageBar from './FloatingUsageBar.vue'
import FloatingUsageOrb from './FloatingUsageOrb.vue'
import { resolveFloatingQuotaPresentation } from './quota-presentation'

const { state } = usageDisplayStore
const mode = ref<'collapsed' | 'expanding' | 'expanded' | 'collapsing'>('collapsed')
const nativeError = ref('')
let collapseTimer: number | null = null
let interactionSequence = 0

const primaryQuota = computed(() => resolveFloatingQuotaPresentation(state.quotaSummary).primary)

const orbValue = computed(() => {
  if (state.config.source === 'balance') {
    return formatUsageOrbValue({ kind: 'balance', balance: state.balance?.available ?? null })
  }
  if (
    !state.subscription
    || state.subscription.id !== state.config.subscriptionId
    || !state.quotaSummary
  ) return formatUsageOrbValue({ kind: 'unavailable' })
  return formatUsageOrbValue({
    kind: 'subscription',
    remainingPercent: primaryQuota.value?.remainingPercent ?? null,
    unlimited: state.quotaSummary.unlimited,
  })
})

const configIdentity = computed(() => [
  state.config.source,
  state.config.subscriptionId ?? '',
  state.config.appearance,
  state.config.floatingStyle,
].join(':'))

function cancelCollapse() {
  if (collapseTimer !== null) window.clearTimeout(collapseTimer)
  collapseTimer = null
}

async function expand() {
  cancelCollapse()
  if (mode.value === 'expanded' || mode.value === 'expanding') return
  const sequence = ++interactionSequence
  mode.value = 'expanding'
  nativeError.value = ''
  try {
    await setFloatingUsageExpanded(true)
    if (sequence !== interactionSequence) return
    mode.value = 'expanded'
    void usageDisplayStore.refresh()
  } catch {
    if (sequence !== interactionSequence) return
    mode.value = 'collapsed'
    nativeError.value = '展开失败'
  }
}

function scheduleCollapse() {
  cancelCollapse()
  const sequence = ++interactionSequence
  collapseTimer = window.setTimeout(() => {
    if (sequence !== interactionSequence) return
    mode.value = 'collapsing'
    mode.value = 'collapsed'
    void setFloatingUsageExpanded(false).catch(() => {
      nativeError.value = '收起失败'
    })
  }, 180)
}

function drag() {
  void startFloatingUsageDrag()
}

watch(configIdentity, () => {
  cancelCollapse()
  interactionSequence += 1
  mode.value = 'collapsed'
  nativeError.value = ''
  void setFloatingUsageExpanded(false).catch(() => {
    nativeError.value = '收起失败'
  })
}, { flush: 'sync' })

onBeforeUnmount(() => cancelCollapse())
</script>

<template>
  <main class="macos-floating-window" data-testid="macos-floating-window">
    <FloatingUsageCard
      v-if="mode === 'expanded'"
      :source="state.config.source"
      :appearance="state.config.appearance"
      :balance="state.balance"
      :subscription="state.subscription"
      :quota-summary="state.quotaSummary"
      :loading="state.loading"
      :error="state.error"
      :last-updated-at="state.lastUpdatedAt"
      @mouseenter="cancelCollapse"
      @mouseleave="scheduleCollapse"
      @drag="drag"
    />
    <FloatingUsageOrb
      v-else-if="state.config.floatingStyle === 'orb'"
      :value="orbValue"
      :appearance="state.config.appearance"
      :native-error="nativeError"
      @enter="expand"
      @drag="drag"
    />
    <FloatingUsageBar
      v-else
      :value="orbValue"
      :label="state.config.source === 'balance' ? '可用余额' : '剩余额度'"
      :appearance="state.config.appearance"
      :native-error="nativeError"
      @enter="expand"
      @drag="drag"
    />
  </main>
</template>
