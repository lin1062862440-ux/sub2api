<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EChart from '@/components/charts/EChart.vue'
import type { OpsThroughputTrendPoint } from '@/api/admin/ops'
import type { ChartState } from '../types'
import { formatHistoryLabel, sumNumbers } from '../utils/opsFormatters'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { gradientAreaSeries } from '@/utils/echarts'

interface Props {
  points: OpsThroughputTrendPoint[]
  loading: boolean
  timeRange: string
  fullscreen?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()
const theme = useEChartTheme()

const colors = computed(() => ({
  teal: '#14b8a6'
}))

const totalRequests = computed(() => sumNumbers(props.points.map((p) => p.request_count)))

const chartOption = computed<Record<string, unknown> | null>(() => {
  if (!props.points.length || totalRequests.value <= 0) return null
  const values = props.points.map((p) => {
    const requests = p.request_count ?? 0
    const switches = p.switch_count ?? 0
    return requests > 0 ? switches / requests : 0
  })
  return {
    animationDuration: 450,
    grid: { left: 42, right: 16, top: 42, bottom: 24 },
    legend: { top: 0, right: 0, textStyle: { color: theme.value.text, fontSize: 10 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.value.tooltipBackground,
      borderColor: theme.value.grid,
      textStyle: { color: theme.value.text },
      valueFormatter: (value: number) => Number(value).toFixed(3)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map((p) => formatHistoryLabel(p.bucket_start, props.timeRange)),
      axisLabel: { color: theme.value.mutedText, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: theme.value.grid } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: theme.value.mutedText, fontSize: 10, formatter: (value: number) => Number(value).toFixed(3) },
      splitLine: { lineStyle: { color: theme.value.grid, type: 'dashed' } }
    },
    series: [gradientAreaSeries(t('admin.ops.switchRate'), values, colors.value.teal, { stack: 'switch-rate' })]
  }
})

const state = computed<ChartState>(() => {
  if (chartOption.value) return 'ready'
  if (props.loading) return 'loading'
  return 'empty'
})
</script>

<template>
  <div class="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
    <div class="mb-4 flex shrink-0 items-center justify-between">
      <h3 class="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
        <svg class="h-4 w-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h10M7 12h6m-6 5h3" />
        </svg>
        {{ t('admin.ops.switchRateTrend') }}
        <HelpTooltip v-if="!props.fullscreen" :content="t('admin.ops.tooltips.switchRateTrend')" />
      </h3>
    </div>

    <div class="min-h-0 flex-1">
      <EChart v-if="state === 'ready' && chartOption" :option="chartOption" />
      <div v-else class="flex h-full items-center justify-center">
        <div v-if="state === 'loading'" class="animate-pulse text-sm text-gray-400">{{ t('common.loading') }}</div>
        <EmptyState v-else :title="t('common.noData')" :description="t('admin.ops.charts.emptyRequest')" />
      </div>
    </div>
  </div>
</template>
