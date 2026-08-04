<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EChart from '@/components/charts/EChart.vue'
import type { OpsThroughputGroupBreakdownItem, OpsThroughputPlatformBreakdownItem, OpsThroughputTrendPoint } from '@/api/admin/ops'
import type { ChartState } from '../types'
import { formatHistoryLabel, sumNumbers } from '../utils/opsFormatters'
import HelpTooltip from '@/components/common/HelpTooltip.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatNumber } from '@/utils/format'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { gradientAreaSeries } from '@/utils/echarts'

interface Props {
  points: OpsThroughputTrendPoint[]
  loading: boolean
  timeRange: string
  byPlatform?: OpsThroughputPlatformBreakdownItem[]
  topGroups?: OpsThroughputGroupBreakdownItem[]
  fullscreen?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()
const emit = defineEmits<{
  (e: 'selectPlatform', platform: string): void
  (e: 'selectGroup', groupId: number): void
  (e: 'openDetails'): void
}>()

const theme = useEChartTheme()
const throughputChartRef = ref<InstanceType<typeof EChart> | null>(null)
watch(
  () => props.timeRange,
  () => {
    setTimeout(() => throughputChartRef.value?.resetZoom(), 100)
  }
)

const colors = computed(() => ({
  blue: '#3b82f6',
  green: '#10b981',
}))

const totalRequests = computed(() => sumNumbers(props.points.map((p) => p.request_count)))

const chartOption = computed<Record<string, unknown> | null>(() => {
  if (!props.points.length || totalRequests.value <= 0) return null
  return {
    animationDuration: 450,
    grid: { left: 42, right: 42, top: 42, bottom: 34 },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: theme.value.text, fontSize: 10 }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.value.tooltipBackground,
      borderColor: theme.value.grid,
      textStyle: { color: theme.value.text },
      valueFormatter: (value: number) => Number(value).toFixed(1)
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true },
      { type: 'slider', show: false, xAxisIndex: 0, start: 0, end: 100 }
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map((p) => formatHistoryLabel(p.bucket_start, props.timeRange)),
      axisLabel: { color: theme.value.mutedText, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: theme.value.grid } },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        position: 'left',
        axisLabel: { color: theme.value.mutedText, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.value.grid, type: 'dashed' } }
      },
      {
        type: 'value',
        position: 'right',
        axisLabel: { color: colors.value.green, fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      gradientAreaSeries('QPS', props.points.map((p) => p.qps ?? 0), colors.value.blue, { stack: 'qps' }),
      gradientAreaSeries(t('admin.ops.tpsK'), props.points.map((p) => (p.tps ?? 0) / 1000), colors.value.green, {
        yAxisIndex: 1,
        stack: 'tps'
      })
    ]
  }
})

const state = computed<ChartState>(() => {
  if (chartOption.value) return 'ready'
  if (props.loading) return 'loading'
  return 'empty'
})

function resetZoom() {
  throughputChartRef.value?.resetZoom()
}

function downloadChart() {
  const url = throughputChartRef.value?.getDataURL()
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `ops-throughput-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
  a.click()
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
    <div
      data-testid="throughput-chart-header"
      class="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <h3 class="flex min-w-0 items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
        <svg class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        {{ t('admin.ops.throughputTrend') }}
        <HelpTooltip v-if="!props.fullscreen" :content="t('admin.ops.tooltips.throughputTrend')" />
      </h3>
      <div
        data-testid="throughput-chart-toolbar"
        class="flex w-full min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 sm:w-auto sm:justify-end"
      >
        <span class="flex shrink-0 items-center gap-1"><span class="h-2 w-2 rounded-full bg-blue-500"></span>QPS</span>
        <span class="flex shrink-0 items-center gap-1"><span class="h-2 w-2 rounded-full bg-green-500"></span>{{ t('admin.ops.tpsK') }}</span>
        <template v-if="!props.fullscreen">
          <button
            type="button"
            class="inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
            :disabled="state !== 'ready'"
            :title="t('admin.ops.requestDetails.title')"
            @click="emit('openDetails')"
          >
            {{ t('admin.ops.requestDetails.details') }}
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
            :disabled="state !== 'ready'"
            :title="t('admin.ops.charts.resetZoomHint')"
            @click="resetZoom"
          >
            {{ t('admin.ops.charts.resetZoom') }}
          </button>
          <button
            type="button"
            class="inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
            :disabled="state !== 'ready'"
            :title="t('admin.ops.charts.downloadChartHint')"
            @click="downloadChart"
          >
            {{ t('admin.ops.charts.downloadChart') }}
          </button>
        </template>
      </div>
    </div>

    <!-- Drilldown chips (baseline interaction: click to set global filter) -->
    <div v-if="(props.topGroups?.length ?? 0) > 0" class="mb-3 flex flex-wrap gap-2">
      <button
        v-for="g in props.topGroups"
        :key="g.group_id"
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-200 dark:hover:bg-dark-800"
        @click="emit('selectGroup', g.group_id)"
      >
        <span class="max-w-[180px] truncate">{{ g.group_name || `#${g.group_id}` }}</span>
        <span class="text-gray-400 dark:text-gray-500">{{ formatNumber(g.request_count) }}</span>
      </button>
    </div>

    <div v-else-if="(props.byPlatform?.length ?? 0) > 0" class="mb-3 flex flex-wrap gap-2">
      <button
        v-for="p in props.byPlatform"
        :key="p.platform"
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-200 dark:hover:bg-dark-800"
        @click="emit('selectPlatform', p.platform)"
      >
        <span class="uppercase">{{ p.platform }}</span>
        <span class="text-gray-400 dark:text-gray-500">{{ formatNumber(p.request_count) }}</span>
      </button>
    </div>

    <div class="min-h-0 min-w-0 flex-1">
      <EChart v-if="state === 'ready' && chartOption" ref="throughputChartRef" :option="chartOption" />
      <div v-else class="flex h-full items-center justify-center">
        <div v-if="state === 'loading'" class="animate-pulse text-sm text-gray-400">{{ t('common.loading') }}</div>
        <EmptyState v-else :title="t('common.noData')" :description="t('admin.ops.charts.emptyRequest')" />
      </div>
    </div>
  </div>
</template>
