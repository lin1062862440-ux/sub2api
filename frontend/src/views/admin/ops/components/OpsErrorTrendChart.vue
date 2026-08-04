<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EChart from '@/components/charts/EChart.vue'
import type { OpsErrorTrendPoint } from '@/api/admin/ops'
import type { ChartState } from '../types'
import { formatHistoryLabel, sumNumbers } from '../utils/opsFormatters'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { gradientAreaSeries } from '@/utils/echarts'

interface Props {
  points: OpsErrorTrendPoint[]
  loading: boolean
  timeRange: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'openRequestErrors'): void
  (e: 'openUpstreamErrors'): void
}>()
const { t } = useI18n()
const theme = useEChartTheme()

const colors = computed(() => ({
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#9ca3af'
}))

const totalRequestErrors = computed(() => sumNumbers(props.points.map((p) => p.error_count_sla ?? 0)))

const totalUpstreamErrors = computed(() =>
  sumNumbers(
    props.points.map((p) => (p.upstream_error_count_excl_429_529 ?? 0) + (p.upstream_429_count ?? 0) + (p.upstream_529_count ?? 0))
  )
)

const totalDisplayed = computed(() =>
  sumNumbers(props.points.map((p) => (p.error_count_sla ?? 0) + (p.upstream_error_count_excl_429_529 ?? 0) + (p.business_limited_count ?? 0)))
)

const hasRequestErrors = computed(() => totalRequestErrors.value > 0)
const hasUpstreamErrors = computed(() => totalUpstreamErrors.value > 0)

const chartOption = computed<Record<string, unknown> | null>(() => {
  if (!props.points.length || totalDisplayed.value <= 0) return null
  return {
    animationDuration: 450,
    grid: { left: 42, right: 16, top: 42, bottom: 24 },
    legend: {
      type: 'scroll',
      top: 0,
      right: 0,
      textStyle: { color: theme.value.text, fontSize: 10 }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.value.tooltipBackground,
      borderColor: theme.value.grid,
      textStyle: { color: theme.value.text }
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
      minInterval: 1,
      axisLabel: { color: theme.value.mutedText, fontSize: 10 },
      splitLine: { lineStyle: { color: theme.value.grid, type: 'dashed' } }
    },
    series: [
      gradientAreaSeries(t('admin.ops.errorsSla'), props.points.map((p) => p.error_count_sla ?? 0), colors.value.red, { stack: 'errors' }),
      gradientAreaSeries(t('admin.ops.upstreamExcl429529'), props.points.map((p) => p.upstream_error_count_excl_429_529 ?? 0), colors.value.purple, { stack: 'errors' }),
      gradientAreaSeries(t('admin.ops.businessLimited'), props.points.map((p) => p.business_limited_count ?? 0), colors.value.gray, {
        stack: 'errors',
        lineStyle: { color: colors.value.gray, width: 2, type: 'dashed' }
      })
    ]
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
        <svg class="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
          />
        </svg>
        {{ t('admin.ops.errorTrend') }}
        <HelpTooltip :content="t('admin.ops.tooltips.errorTrend')" />
      </h3>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
          :disabled="!hasRequestErrors"
          @click="emit('openRequestErrors')"
        >
          {{ t('admin.ops.errorDetails.requestErrors') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
          :disabled="!hasUpstreamErrors"
          @click="emit('openUpstreamErrors')"
        >
          {{ t('admin.ops.errorDetails.upstreamErrors') }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1">
      <EChart v-if="state === 'ready' && chartOption" :option="chartOption" />
      <div v-else class="flex h-full items-center justify-center">
        <div v-if="state === 'loading'" class="animate-pulse text-sm text-gray-400">{{ t('common.loading') }}</div>
        <EmptyState v-else :title="t('common.noData')" :description="t('admin.ops.charts.emptyError')" />
      </div>
    </div>
  </div>
</template>
