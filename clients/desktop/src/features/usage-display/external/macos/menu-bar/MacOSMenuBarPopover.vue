<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { hideUsageDisplay } from '@/features/usage-display/core/host'
import { usageDisplayStore } from '@/features/usage-display/core/store'
import ExternalUsageDetailCard from '@/features/usage-display/external/macos/shared/ExternalUsageDetailCard.vue'

const { state } = usageDisplayStore

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') void hideUsageDisplay()
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
    <ExternalUsageDetailCard
      :source="state.config.source"
      :appearance="state.config.appearance"
      :balance="state.balance"
      :subscription="state.subscription"
      :quota-summary="state.quotaSummary"
      :loading="state.loading"
      :error="state.error"
      :last-updated-at="state.lastUpdatedAt"
    />
  </div>
</template>
