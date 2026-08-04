<script setup lang="ts">
import { ref } from 'vue'
import VChart from 'vue-echarts'
import '@/lib/echarts'

defineProps<{
  option: Record<string, unknown>
}>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)

function getChart() {
  return chartRef.value?.chart
}

function resetZoom() {
  getChart()?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
}

function getDataURL() {
  return getChart()?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
}

defineExpose({ getChart, getDataURL, resetZoom })
</script>

<template>
  <VChart ref="chartRef" class="h-full w-full" :option="option" autoresize />
</template>
