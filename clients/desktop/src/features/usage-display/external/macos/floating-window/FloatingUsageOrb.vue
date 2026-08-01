<script setup lang="ts">
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import FloatingMetricValue from './FloatingMetricValue.vue'

defineProps<{
  value: string
  appearance: UsageDisplayAppearance
  nativeError: string
}>()

defineEmits<{ enter: []; drag: [] }>()
</script>

<template>
  <button
    type="button"
    class="floating-usage-orb"
    :data-appearance="appearance"
    data-testid="floating-usage-orb"
    aria-label="展开用量详情"
    :aria-description="nativeError || undefined"
    @mouseenter="$emit('enter')"
    @mousedown="$emit('drag')"
    @click="$emit('enter')"
  >
    <FloatingMetricValue :value="value" />
  </button>
</template>
