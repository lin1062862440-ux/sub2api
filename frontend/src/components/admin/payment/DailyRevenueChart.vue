<template>
  <div class="card p-4">
    <h3 class="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
      {{ t('payment.admin.dailyRevenue') }}
    </h3>
    <div class="h-64">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
      <EChart v-else-if="chartOption" :option="chartOption" />
      <div
        v-else
        class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400"
      >
        {{ t('payment.admin.noData') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EChart from '@/components/charts/EChart.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import type { DailyPaymentStats } from '@/types/payment'
import { gradientAreaSeries } from '@/utils/echarts'

const { t } = useI18n()
const theme = useEChartTheme()

const props = defineProps<{
  data: DailyPaymentStats[]
  loading?: boolean
}>()

const colors = ['#3b82f6', '#a855f7', '#f59e0b', '#ef4444']

const chartOption = computed<Record<string, unknown> | null>(() => {
  if (!props.data || props.data.length === 0) return null
  const currencies = [...new Set(props.data.flatMap(day => Object.keys(day.amount)))].sort()
  return {
    animationDuration: 450,
    grid: { left: 58, right: 58, top: 50, bottom: 28 },
    legend: { type: 'scroll', top: 0, textStyle: { color: theme.value.text, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.value.tooltipBackground,
      borderColor: theme.value.grid,
      textStyle: { color: theme.value.text }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.data.map(d => d.date),
      axisLine: { lineStyle: { color: theme.value.grid } },
      axisLabel: { color: theme.value.mutedText, fontSize: 10 },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: t('payment.admin.revenue'),
        nameTextStyle: { color: theme.value.mutedText },
        axisLabel: { color: theme.value.mutedText, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.value.grid, type: 'dashed' } }
      },
      {
        type: 'value',
        name: t('payment.admin.orderCount'),
        position: 'right',
        nameTextStyle: { color: '#10b981' },
        axisLabel: { color: '#10b981', fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      ...currencies.map((currency, index) => {
        const color = colors[index % colors.length]
        return gradientAreaSeries(
          `${currency} ${t('payment.admin.revenue')}`,
          props.data.map(day => day.amount[currency] || 0),
          color,
          { stack: 'revenue' }
        )
      }),
      gradientAreaSeries(t('payment.admin.orderCount'), props.data.map(d => d.count), '#10b981', {
        yAxisIndex: 1,
        stack: 'orders'
      })
    ]
  }
})
</script>
