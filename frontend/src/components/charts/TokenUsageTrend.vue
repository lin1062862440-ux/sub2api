<template>
  <div class="card p-4">
    <h3 class="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
      {{ t('admin.dashboard.tokenUsageTrend') }}
    </h3>
    <div v-if="loading" class="flex h-48 items-center justify-center">
      <LoadingSpinner />
    </div>
    <div v-else-if="trendData.length > 0 && chartOption" class="h-48">
      <EChart :option="chartOption" />
    </div>
    <div
      v-else
      class="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400"
    >
      {{ t('admin.dashboard.noDataAvailable') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EChart from '@/components/charts/EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import type { TrendDataPoint } from '@/types'
import { gradientAreaSeries } from '@/utils/echarts'

const { t } = useI18n()

const props = defineProps<{
  trendData: TrendDataPoint[]
  loading?: boolean
}>()

const theme = useEChartTheme()

const chartColors = computed(() => ({
  input: '#3b82f6',
  output: '#10b981',
  cacheCreation: '#f59e0b',
  cacheRead: '#06b6d4',
  cacheHitRate: '#8b5cf6'
}))

const chartOption = computed<Record<string, unknown> | null>(() => {
  if (!props.trendData?.length) return null

  return {
    animationDuration: 450,
    grid: { left: 58, right: 48, top: 50, bottom: 26 },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: theme.value.text, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.value.tooltipBackground,
      borderColor: theme.value.grid,
      textStyle: { color: theme.value.text },
      formatter: (params: any[]) => {
        const dataIndex = params[0]?.dataIndex ?? 0
        const rows = params.map((item) => {
          const value = Number(item.value ?? 0)
          const formatted = item.seriesName === 'Cache Hit Rate' ? `${value.toFixed(1)}%` : formatTokens(value)
          return `${item.marker}${item.seriesName}: ${formatted}`
        })
        const point = props.trendData[dataIndex]
        if (point) rows.push(`Actual: $${formatCost(point.actual_cost)} | Standard: $${formatCost(point.cost)}`)
        return [params[0]?.axisValueLabel ?? '', ...rows].join('<br/>')
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.trendData.map((d) => d.date),
      axisLine: { lineStyle: { color: theme.value.grid } },
      axisLabel: { color: theme.value.mutedText, fontSize: 10 },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: { color: theme.value.mutedText, fontSize: 10, formatter: (value: number) => formatTokens(value) },
        splitLine: { lineStyle: { color: theme.value.grid, type: 'dashed' } }
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        position: 'right',
        axisLabel: { color: chartColors.value.cacheHitRate, fontSize: 10, formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series: [
      gradientAreaSeries('Input', props.trendData.map((d) => d.input_tokens), chartColors.value.input, { stack: 'tokens' }),
      gradientAreaSeries('Output', props.trendData.map((d) => d.output_tokens), chartColors.value.output, { stack: 'tokens' }),
      gradientAreaSeries('Cache Creation', props.trendData.map((d) => d.cache_creation_tokens), chartColors.value.cacheCreation, { stack: 'tokens' }),
      gradientAreaSeries('Cache Read', props.trendData.map((d) => d.cache_read_tokens), chartColors.value.cacheRead, { stack: 'tokens' }),
      gradientAreaSeries(
        'Cache Hit Rate',
        props.trendData.map((d) => {
          const totalPromptTokens = d.input_tokens + d.cache_read_tokens + d.cache_creation_tokens
          return totalPromptTokens > 0 ? (d.cache_read_tokens / totalPromptTokens) * 100 : 0
        }),
        chartColors.value.cacheHitRate,
        { yAxisIndex: 1, stack: 'rate', lineStyle: { color: chartColors.value.cacheHitRate, width: 2, type: 'dashed' } }
      )
    ]
  }
})

const formatTokens = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`
  } else if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`
  }
  return value.toLocaleString()
}

const formatCost = (value: number): string => {
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'K'
  } else if (value >= 1) {
    return value.toFixed(2)
  } else if (value >= 0.01) {
    return value.toFixed(3)
  }
  return value.toFixed(4)
}
</script>
