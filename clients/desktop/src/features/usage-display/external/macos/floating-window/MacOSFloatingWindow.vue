<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { formatUsageOrbValue } from '@/features/usage-display/core/format'
import {
  openMainWindow,
  quitDesktopApp,
  setFloatingUsageExpanded,
  startFloatingUsageDrag,
} from '@/features/usage-display/core/host'
import { usageDisplayStore } from '@/features/usage-display/core/store'
import UsageQuotaCard from '@/features/usage-display/external/macos/shared/UsageQuotaCard.vue'
import FloatingUsageOrb from './FloatingUsageOrb.vue'

const { state } = usageDisplayStore
const mode = ref<'collapsed' | 'expanding' | 'expanded' | 'collapsing'>('collapsed')
const nativeError = ref('')
let collapseTimer: number | null = null
let interactionSequence = 0

const orbValue = computed(() => {
  if (state.config.source === 'balance') {
    return formatUsageOrbValue({ kind: 'balance', balance: state.balance?.available ?? null })
  }
  if (!state.quotaSummary) return formatUsageOrbValue({ kind: 'unavailable' })
  return formatUsageOrbValue({
    kind: 'subscription',
    remainingPercent: state.quotaSummary.remainingPercent,
    unlimited: state.quotaSummary.unlimited,
  })
})

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

onBeforeUnmount(() => cancelCollapse())
</script>

<template>
  <main class="macos-floating-window" data-testid="macos-floating-window">
    <UsageQuotaCard
      v-if="mode === 'expanded'"
      :source="state.config.source"
      :appearance="state.config.appearance"
      :balance="state.balance"
      :subscription="state.subscription"
      :quota-summary="state.quotaSummary"
      :loading="state.loading"
      :refreshing="state.refreshing"
      :error="state.error"
      :last-updated-at="state.lastUpdatedAt"
      draggable
      @mouseenter="cancelCollapse"
      @mouseleave="scheduleCollapse"
      @drag="drag"
      @refresh="usageDisplayStore.refresh"
      @open-main="openMainWindow"
      @quit="quitDesktopApp"
    />
    <FloatingUsageOrb
      v-else
      :value="orbValue"
      :appearance="state.config.appearance"
      :native-error="nativeError"
      @enter="expand"
      @drag="drag"
    />
  </main>
</template>
