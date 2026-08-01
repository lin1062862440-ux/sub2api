<script setup lang="ts">
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

defineProps<{
  value: string
  appearance: UsageDisplayAppearance
  stale: boolean
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
    @mouseenter="$emit('enter')"
    @mousedown="$emit('drag')"
    @click="$emit('enter')"
  >
    <span class="orb-brand">L</span>
    <strong>{{ value }}</strong>
    <i v-if="stale" aria-label="数据可能已过期" />
    <small v-if="nativeError" data-testid="floating-native-error">{{ nativeError }}</small>
  </button>
</template>
