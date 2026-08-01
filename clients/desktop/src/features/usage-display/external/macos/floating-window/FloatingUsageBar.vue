<script setup lang="ts">
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import ExternalMetricValue from '@/features/usage-display/external/macos/shared/ExternalMetricValue.vue'

defineProps<{
  value: string
  label: string
  appearance: UsageDisplayAppearance
  nativeError: string
}>()

defineEmits<{ enter: []; drag: [] }>()
</script>

<template>
  <button
    type="button"
    class="floating-usage-bar"
    :data-appearance="appearance"
    data-testid="floating-usage-bar"
    aria-label="展开用量详情"
    :aria-description="nativeError || undefined"
    @mouseenter="$emit('enter')"
    @mousedown="$emit('drag')"
    @click="$emit('enter')"
  >
    <span>{{ label }}</span>
    <ExternalMetricValue :value="value" />
  </button>
</template>
