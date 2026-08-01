<script setup lang="ts">
import { computed } from 'vue'

import type { TrendPoint } from '@/api'
import { formatCount } from '@/lib/format'

const props = defineProps<{ points: TrendPoint[] }>()

const WIDTH = 760
const HEIGHT = 230
const PAD_TOP = 16
const PAD_BOTTOM = 28

const requestValues = computed(() => props.points.map((point) => point.requests ?? 0))
const tokenValues = computed(() => props.points.map((point) => point.total_tokens ?? 0))
const requestPeak = computed(() => Math.max(1, ...requestValues.value))
const tokenPeak = computed(() => Math.max(1, ...tokenValues.value))
const requestTotal = computed(() => requestValues.value.reduce((sum, value) => sum + value, 0))
const tokenTotal = computed(() => tokenValues.value.reduce((sum, value) => sum + value, 0))

function buildCoords(values: number[], peak: number) {
  if (values.length === 0) return []
  const usableHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const step = values.length === 1 ? 0 : WIDTH / (values.length - 1)
  return values.map((value, index) => ({
    x: values.length === 1 ? WIDTH / 2 : index * step,
    y: PAD_TOP + usableHeight - (value / peak) * usableHeight,
    value,
    label: props.points[index]?.date ?? '',
  }))
}

const requestCoords = computed(() => buildCoords(requestValues.value, requestPeak.value))
const tokenCoords = computed(() => buildCoords(tokenValues.value, tokenPeak.value))

function linePath(coords: Array<{ x: number; y: number }>) {
  return coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')
}

const requestLinePath = computed(() => linePath(requestCoords.value))
const tokenLinePath = computed(() => linePath(tokenCoords.value))

const requestAreaPath = computed(() => {
  if (requestCoords.value.length === 0) return ''
  const baseline = HEIGHT - PAD_BOTTOM
  const first = requestCoords.value[0]
  const last = requestCoords.value[requestCoords.value.length - 1]
  return `${requestLinePath.value} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
})

const axisLabels = computed(() => {
  const coords = requestCoords.value
  if (coords.length <= 7) return coords.map((point) => ({ x: point.x, text: point.label.slice(5) }))
  const step = Math.ceil((coords.length - 1) / 6)
  return coords
    .filter((_, index) => index === 0 || index === coords.length - 1 || index % step === 0)
    .map((point) => ({ x: point.x, text: point.label.slice(5) }))
})

const requestMarkers = computed(() => {
  const coords = requestCoords.value
  if (coords.length <= 14) return coords
  const step = Math.ceil((coords.length - 1) / 10)
  return coords.filter((_, index) => index === 0 || index === coords.length - 1 || index % step === 0)
})

const tokenMarkers = computed(() => {
  const coords = tokenCoords.value
  if (coords.length <= 14) return coords
  const step = Math.ceil((coords.length - 1) / 10)
  return coords.filter((_, index) => index === 0 || index === coords.length - 1 || index % step === 0)
})
</script>

<template>
  <div class="chart">
    <div v-if="requestCoords.length === 0" class="empty" data-testid="trend-empty">
      <strong>还没有趋势数据</strong>
      <span>产生请求后，这里会显示所选时间范围的变化。</span>
    </div>

    <template v-else>
      <div class="chart-toolbar">
        <div class="legend" aria-label="图表图例">
          <span class="legend-request"><i />请求数</span>
          <span class="legend-token"><i />Token</span>
        </div>
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
      </div>

      <div class="plot-shell">
        <div class="plot">
          <div class="y-scale y-scale-left" aria-hidden="true">
            <span>{{ formatCount(requestPeak) }}</span>
            <span>{{ formatCount(requestPeak / 2) }}</span>
            <span>0</span>
          </div>
          <div class="y-scale y-scale-right" aria-hidden="true">
            <span>{{ formatCount(tokenPeak) }}</span>
            <span>{{ formatCount(tokenPeak / 2) }}</span>
            <span>0</span>
          </div>
          <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" role="img" aria-label="请求数与 Token 趋势">
            <line
              v-for="ratio in [0, 0.5, 1]"
              :key="ratio"
              class="grid-line"
              x1="0"
              :y1="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
              :x2="WIDTH"
              :y2="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
            />
            <path :d="requestAreaPath" class="request-area" />
            <path :d="requestLinePath" class="series-line request-line" data-testid="trend-line" pathLength="1" />
            <path :d="tokenLinePath" class="series-line token-line" data-testid="token-line" pathLength="1" />
            <circle
              v-for="point in requestMarkers"
              :key="`request-${point.label}`"
              class="series-point request-point"
              data-testid="trend-point"
              :cx="point.x"
              :cy="point.y"
              r="4.5"
            >
              <title>{{ point.label }} · {{ formatCount(point.value) }} 次请求</title>
            </circle>
            <circle
              v-for="point in tokenMarkers"
              :key="`token-${point.label}`"
              class="series-point token-point"
              data-testid="token-point"
              :cx="point.x"
              :cy="point.y"
              r="4.5"
            >
              <title>{{ point.label }} · {{ formatCount(point.value) }} Token</title>
            </circle>
          </svg>
        </div>

        <div class="x-axis" aria-hidden="true">
          <span
            v-for="label in axisLabels"
            :key="label.x"
            :style="{ left: `${(label.x / WIDTH) * 100}%` }"
          >
            {{ label.text }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chart { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.chart-toolbar { display: flex; min-height: 46px; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 20px; }
.legend { display: flex; align-items: center; gap: 18px; }
.legend > span { display: inline-flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 14px; }
.legend i { position: relative; display: inline-block; width: 16px; height: 2px; background: currentColor; }
.legend i::after { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; background: var(--bg-surface); border: 2px solid currentColor; border-radius: 50%; content: ''; transform: translate(-50%, -50%); }
.legend-request { color: var(--accent) !important; }
.legend-token { color: #8056e8 !important; }
.range-totals { display: flex; gap: 8px; }
.range-totals > div { display: grid; min-width: 116px; height: 44px; grid-template-columns: auto auto; align-items: center; gap: 10px; padding: 0 13px; background: rgba(240, 245, 255, 0.72); border: 1px solid rgba(191, 209, 244, 0.72); border-radius: 6px; }
.range-totals > div:last-child { background: rgba(247, 242, 255, 0.68); border-color: rgba(213, 195, 244, 0.75); }
.range-totals span { color: var(--accent-strong); font-size: 13px; }
.range-totals > div:last-child span { color: #7044ca; }
.range-totals strong { font-family: var(--font-data); font-size: 16px; font-variant-numeric: tabular-nums; }
.plot-shell { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.plot { position: relative; min-height: 145px; flex: 1; padding: 0 52px 0 48px; }
svg { display: block; width: 100%; height: 100%; overflow: visible; }
.grid-line { stroke: var(--border-subtle); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.request-area { fill: rgba(37, 99, 235, 0.065); }
.series-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.15; vector-effect: non-scaling-stroke; animation: draw-line 620ms cubic-bezier(0.22, 0.78, 0.24, 1) both; }
.request-line { stroke: var(--accent); }
.token-line { stroke: #8056e8; animation-delay: 90ms; }
.series-point { fill: var(--bg-surface); stroke-width: 1.8; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; animation: linai-point-settle 360ms var(--motion-ease-out) 480ms both; }
.token-point { animation-delay: 560ms; }
.request-point { stroke: var(--accent); }
.token-point { stroke: #8056e8; }
.request-point:hover { fill: var(--accent-soft); }
.token-point:hover { fill: #f0eafe; }
.y-scale { position: absolute; top: 3px; bottom: 23px; display: flex; width: 42px; flex-direction: column; justify-content: space-between; color: var(--text-tertiary); font-family: var(--font-data); font-size: 12px; }
.y-scale-left { left: 0; text-align: right; }
.y-scale-right { right: 0; text-align: left; }
.x-axis { position: relative; height: 17px; flex: 0 0 auto; margin: 2px 52px 0 48px; }
.x-axis span { position: absolute; color: var(--text-tertiary); font-family: var(--font-data); font-size: 12px; transform: translateX(-50%); white-space: nowrap; }
.x-axis span:first-child { transform: none; }
.x-axis span:last-child { transform: translateX(-100%); }
.empty { display: flex; min-height: 170px; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-secondary); text-align: center; }
.empty strong { color: var(--text-primary); font-size: 15px; font-weight: 620; }
.empty span { font-size: 14px; }

@keyframes draw-line {
  from { stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0.35; }
  to { stroke-dasharray: 1; stroke-dashoffset: 0; opacity: 1; }
}

@media (max-height: 680px) {
  .chart-toolbar { min-height: 40px; }
  .range-totals > div { height: 35px; }
}

@media (prefers-reduced-motion: reduce) {
  .series-line,
  .series-point { animation: none; transform: none; }
}
</style>
