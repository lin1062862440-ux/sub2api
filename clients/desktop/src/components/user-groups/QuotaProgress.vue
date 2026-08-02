<script setup lang="ts">
import { computed } from 'vue'
import { formatCost } from '@/lib/format'

const props = defineProps<{ label: string; used: number; limit?: number | null }>()
const percent = computed(() => props.limit == null || props.limit <= 0 ? 0 : Math.max(0, Math.min(100, props.used / props.limit * 100)))
const full = computed(() => props.limit != null && props.limit > 0 && props.used >= props.limit)
</script>

<template>
  <div class="ug-quota">
    <div><span>{{ label }}</span><strong>{{ limit == null ? '不限' : `${Math.round(percent)}%` }}</strong></div>
    <i><b :class="{ full }" :style="{ width: `${percent}%` }" /></i>
    <small>{{ formatCost(used) }} / {{ limit == null ? '不限' : formatCost(limit) }}</small>
  </div>
</template>
