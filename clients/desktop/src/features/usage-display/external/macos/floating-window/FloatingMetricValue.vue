<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: string }>()

const percentage = computed(() => props.value.match(/^(\d+)(%)$/))
</script>

<template>
  <strong class="floating-metric-value" :class="{ 'is-percentage': percentage }">
    <span data-testid="floating-metric-number">{{ percentage?.[1] ?? value }}</span>
    <small v-if="percentage" data-testid="floating-metric-suffix">{{ percentage[2] }}</small>
  </strong>
</template>
