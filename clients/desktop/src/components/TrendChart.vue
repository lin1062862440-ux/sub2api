<script setup lang="ts">
import { Download } from '@lucide/vue'
import type { EChartsOption } from 'echarts'
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'

import type { TrendPoint } from '@/api'
import '@/lib/echarts'
import { formatCount } from '@/lib/format'

const props = defineProps<{ points: TrendPoint[] }>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const requestValues = computed(() => props.points.map((point) => point.requests ?? 0))
const tokenValues = computed(() => props.points.map((point) => point.total_tokens ?? 0))
const requestTotal = computed(() => requestValues.value.reduce((sum, value) => sum + value, 0))
const tokenTotal = computed(() => tokenValues.value.reduce((sum, value) => sum + value, 0))

function areaGradient(top: string, bottom: string) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
  }
}

const chartOption = computed<EChartsOption>(() => ({
  animationDuration: 620,
  animationEasing: 'cubicOut',
  color: ['#22d3ee', '#8b5cf6'],
  grid: {
    top: 18,
    right: 58,
    bottom: 48,
    left: 48,
    containLabel: false,
  },
  legend: {
    bottom: 2,
    left: 'center',
    icon: 'circle',
    itemWidth: 9,
    itemHeight: 9,
    itemGap: 24,
    textStyle: { color: '#64748b', fontSize: 12 },
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      lineStyle: { color: '#94a3b8', type: 'dashed', width: 1 },
      label: { backgroundColor: '#64748b' },
    },
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#dbe3ef',
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: '#475569', fontSize: 12 },
    extraCssText: 'box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16); border-radius: 6px;',
    formatter: (params: unknown) => {
      const rows = Array.isArray(params) ? params : [params]
      const first = rows[0] as { dataIndex?: number; axisValueLabel?: string } | undefined
      const index = first?.dataIndex ?? 0
      const date = props.points[index]?.date ?? first?.axisValueLabel ?? ''
      return [
        `<strong style="display:block;margin-bottom:7px;color:#1e293b">${date}</strong>`,
        `<div style="display:flex;min-width:150px;justify-content:space-between;gap:18px"><span><i style="display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:#22d3ee"></i>请求数</span><b style="color:#1e293b">${formatCount(requestValues.value[index] ?? 0)}</b></div>`,
        `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:5px"><span><i style="display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:#8b5cf6"></i>Token</span><b style="color:#1e293b">${formatCount(tokenValues.value[index] ?? 0)}</b></div>`,
      ].join('')
    },
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: props.points.map((point) => point.date),
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false },
    axisLabel: {
      color: '#64748b',
      fontSize: 11,
      hideOverlap: true,
      formatter: (value: string) => value.length > 10 ? value.slice(5) : value.slice(5),
    },
    splitLine: { show: false },
  },
  yAxis: [
    {
      type: 'value',
      min: 0,
      name: '请求数',
      nameTextStyle: { color: '#0891b2', fontSize: 11, padding: [0, 0, 4, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatCount(value),
      },
      splitLine: { lineStyle: { color: '#dbe3ef', type: 'solid' } },
    },
    {
      type: 'value',
      min: 0,
      name: 'Token',
      nameTextStyle: { color: '#7c3aed', fontSize: 11, padding: [0, 0, 4, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatCount(value),
      },
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: '请求数',
      type: 'line',
      yAxisIndex: 0,
      data: requestValues.value,
      smooth: 0.42,
      smoothMonotone: 'x',
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: false,
      lineStyle: { width: 2, color: '#22d3ee' },
      itemStyle: { color: '#22d3ee', borderColor: '#ffffff', borderWidth: 2 },
      areaStyle: { opacity: 0.78, color: areaGradient('#6ee7b7', '#22d3ee') },
      emphasis: { focus: 'series' },
    },
    {
      name: 'Token',
      type: 'line',
      yAxisIndex: 1,
      data: tokenValues.value,
      smooth: 0.42,
      smoothMonotone: 'x',
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: false,
      lineStyle: { width: 2, color: '#8b5cf6' },
      itemStyle: { color: '#8b5cf6', borderColor: '#ffffff', borderWidth: 2 },
      areaStyle: { opacity: 0.68, color: areaGradient('#60a5fa', '#8b5cf6') },
      emphasis: { focus: 'series' },
    },
  ],
}))

function downloadChart() {
  const dataUrl = chartRef.value?.chart?.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  })
  if (!dataUrl) return

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `usage-trend-${new Date().toISOString().slice(0, 10)}.png`
  link.click()
}
</script>

<template>
  <div class="chart">
    <div v-if="points.length === 0" class="empty" data-testid="trend-empty">
      <strong>还没有趋势数据</strong>
      <span>产生请求后，这里会显示所选时间范围的变化。</span>
    </div>

    <template v-else>
      <div class="chart-toolbar">
        <div class="chart-heading">
          <span>渐变面积趋势</span>
          <small>真实数值</small>
        </div>
        <div class="toolbar-actions">
          <div class="range-totals">
            <div data-testid="range-request-total">
              <span>请求数</span>
              <strong>{{ formatCount(requestTotal) }}</strong>
            </div>
            <div data-testid="range-token-total">
              <span>Token</span>
              <strong>{{ formatCount(tokenTotal) }}</strong>
            </div>
          </div>
          <button class="download-button" type="button" title="下载图表" aria-label="下载图表" @click="downloadChart">
            <Download :size="17" :stroke-width="1.8" />
          </button>
        </div>
      </div>

      <VChart
        ref="chartRef"
        class="echart"
        data-testid="trend-echart"
        :option="chartOption"
        autoresize
      />
    </template>
  </div>
</template>

<style scoped>
.chart { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.chart-toolbar { display: flex; min-height: 52px; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 18px; }
.chart-heading { display: flex; min-width: 0; align-items: baseline; gap: 9px; }
.chart-heading > span { color: var(--text-primary); font-size: 14px; font-weight: 650; }
.chart-heading small { color: var(--text-tertiary); font-size: 11px; white-space: nowrap; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; }
.range-totals { display: flex; gap: 8px; }
.range-totals > div { display: grid; min-width: 112px; height: 40px; grid-template-columns: auto auto; align-items: center; gap: 10px; padding: 0 12px; background: rgba(236, 254, 255, 0.78); border: 1px solid rgba(103, 232, 249, 0.55); border-radius: 6px; }
.range-totals > div:last-child { background: rgba(245, 243, 255, 0.82); border-color: rgba(196, 181, 253, 0.66); }
.range-totals span { color: #0891b2; font-size: 12px; }
.range-totals > div:last-child span { color: #7c3aed; }
.range-totals strong { color: var(--text-primary); font-family: var(--font-data); font-size: 15px; font-variant-numeric: tabular-nums; }
.download-button { display: inline-flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; padding: 0; background: transparent; border: 1px solid transparent; border-radius: 5px; color: #64748b; cursor: pointer; }
.download-button:hover { background: var(--bg-hover); border-color: var(--border-default); color: var(--accent-strong); }
.download-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.echart { min-height: 190px; flex: 1; width: 100%; }
.empty { display: flex; min-height: 170px; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-secondary); text-align: center; }
.empty strong { color: var(--text-primary); font-size: 15px; font-weight: 620; }
.empty span { font-size: 14px; }

@media (max-width: 720px) {
  .chart-toolbar { align-items: flex-start; }
  .chart-heading small { display: none; }
  .range-totals > div { min-width: 88px; grid-template-columns: 1fr; gap: 0; padding: 3px 10px; }
}

@media (max-height: 680px) {
  .chart-toolbar { min-height: 44px; }
  .range-totals > div { height: 35px; }
}
</style>
