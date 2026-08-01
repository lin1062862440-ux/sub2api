<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { hideUsageDisplay, openMainWindow, quitDesktopApp } from '@/features/usage-display/core/host'
import { usageDisplayStore } from '@/features/usage-display/core/store'
import UsageQuotaCard from '@/features/usage-display/external/macos/shared/UsageQuotaCard.vue'

const { state } = usageDisplayStore

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') void hideUsageDisplay()
}

async function openMain() {
  await openMainWindow()
  await hideUsageDisplay()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void usageDisplayStore.refresh()
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div
    class="macos-menu-bar-popover"
    tabindex="-1"
    data-testid="macos-menu-bar-popover"
    @keydown="handleKeydown"
  >
    <UsageQuotaCard
      :source="state.config.source"
      :appearance="state.config.appearance"
      :balance="state.balance"
      :subscription="state.subscription"
      :quota-summary="state.quotaSummary"
      :loading="state.loading"
      :refreshing="state.refreshing"
      :error="state.error"
      :last-updated-at="state.lastUpdatedAt"
      @refresh="usageDisplayStore.refresh"
      @open-main="openMain"
      @quit="quitDesktopApp"
    />
  </div>
</template>
