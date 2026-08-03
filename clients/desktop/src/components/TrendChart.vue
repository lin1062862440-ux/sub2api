<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { TrendPoint } from '@/api'
import { formatCount } from '@/lib/format'

const props = defineProps<{ points: TrendPoint[] }>()

const WIDTH = 760
const HEIGHT = 230
const PAD_TOP = 16
const PAD_BOTTOM = 28
const MIN_AXIS_LABEL_GAP = 104

const xAxisRef = ref<HTMLElement | null>(null)
const axisWidth = ref(560)
const activeIndex = ref<number | null>(null)
let axisResizeObserver: ResizeObserver | undefined

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

function evenlySpacedIndexes(length: number, maxLabels: number) {
  if (length <= 0) return []
  const count = Math.min(length, Math.max(2, maxLabels))
  if (count === 1) return [0]
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round((index * (length - 1)) / (count - 1))))]
}

const axisLabels = computed(() => {
  const coords = requestCoords.value
  const maxLabels = Math.floor(axisWidth.value / MIN_AXIS_LABEL_GAP) + 1
  return evenlySpacedIndexes(coords.length, maxLabels).map((index) => ({
    x: coords[index].x,
    text: coords[index].label.slice(5),
  }))
})

const hitTargets = computed(() => requestCoords.value.map((point, index, coords) => {
  const previousX = coords[index - 1]?.x
  const nextX = coords[index + 1]?.x
  return {
    index,
    x: previousX === undefined ? 0 : (previousX + point.x) / 2,
    width: nextX === undefined
      ? WIDTH - (previousX === undefined ? 0 : (previousX + point.x) / 2)
      : (point.x + nextX) / 2 - (previousX === undefined ? 0 : (previousX + point.x) / 2),
  }
}))

const activePoint = computed(() => {
  if (activeIndex.value === null) return null
  const source = props.points[activeIndex.value]
  const request = requestCoords.value[activeIndex.value]
  const token = tokenCoords.value[activeIndex.value]
  if (!source || !request || !token) return null
  return { source, request, token }
})

const tooltipStyle = computed(() => {
  const point = activePoint.value
  if (!point) return undefined
  const placeOnLeft = point.request.x > WIDTH / 2
  return {
    left: `${(point.request.x / WIDTH) * 100}%`,
    top: `clamp(42px, ${(Math.min(point.request.y, point.token.y) / HEIGHT) * 100}%, calc(100% - 42px))`,
    transform: placeOnLeft
      ? 'translate(calc(-100% - 12px), -50%)'
      : 'translate(12px, -50%)',
  }
})

onMounted(() => {
  const updateAxisWidth = () => {
    if (xAxisRef.value?.clientWidth) axisWidth.value = xAxisRef.value.clientWidth
  }
  updateAxisWidth()
  if (typeof ResizeObserver !== 'undefined' && xAxisRef.value) {
    axisResizeObserver = new ResizeObserver(updateAxisWidth)
    axisResizeObserver.observe(xAxisRef.value)
  }
})

onBeforeUnmount(() => axisResizeObserver?.disconnect())

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
        <div class="plot" @pointerleave="activeIndex = null">
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
          <div class="plot-canvas">
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
            <template v-if="activePoint">
              <line
                class="hover-guide"
                data-testid="trend-hover-guide"
                :x1="activePoint.request.x"
                :x2="activePoint.request.x"
                :y1="PAD_TOP"
                :y2="HEIGHT - PAD_BOTTOM"
              />
              <circle class="active-point request-point" :cx="activePoint.request.x" :cy="activePoint.request.y" r="5.5" />
              <circle class="active-point token-point" :cx="activePoint.token.x" :cy="activePoint.token.y" r="5.5" />
            </template>
            <rect
              v-for="target in hitTargets"
              :key="`hit-${target.index}`"
              class="hit-target"
              data-testid="trend-hit-target"
              :x="target.x"
              :y="PAD_TOP"
              :width="target.width"
              :height="HEIGHT - PAD_TOP - PAD_BOTTOM"
              @pointerenter="activeIndex = target.index"
              @pointermove="activeIndex = target.index"
            />
            </svg>
            <div
              v-if="activePoint"
              class="trend-tooltip"
              data-testid="trend-tooltip"
              role="status"
              :style="tooltipStyle"
            >
              <strong>{{ activePoint.source.date }}</strong>
              <span><i class="request-swatch" />请求数 <b>{{ formatCount(activePoint.request.value) }}</b></span>
              <span><i class="token-swatch" />Token <b>{{ formatCount(activePoint.token.value) }}</b></span>
            </div>
          </div>
        </div>

        <div ref="xAxisRef" class="x-axis" aria-hidden="true">
          <span
            v-for="label in axisLabels"
            :key="label.x"
            data-testid="trend-axis-label"
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
.plot-canvas { position: relative; width: 100%; height: 100%; }
svg { display: block; width: 100%; height: 100%; overflow: visible; }
.grid-line { stroke: var(--border-subtle); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.request-area { fill: rgba(37, 99, 235, 0.065); }
.series-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.15; vector-effect: non-scaling-stroke; animation: line-enter 320ms var(--motion-ease-out) both; }
.request-line { stroke: var(--accent); }
.token-line { stroke: #8056e8; animation-delay: 90ms; }
.series-point { fill: var(--bg-surface); stroke-width: 1.8; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; animation: linai-point-settle 360ms var(--motion-ease-out) 480ms both; }
.token-point { animation-delay: 560ms; }
.request-point { stroke: var(--accent); }
.token-point { stroke: #8056e8; }
.hover-guide { stroke: rgba(100, 116, 139, 0.72); stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; pointer-events: none; }
.active-point { fill: var(--bg-surface); stroke-width: 2.2; vector-effect: non-scaling-stroke; pointer-events: none; }
.hit-target { fill: transparent; cursor: crosshair; }
.trend-tooltip { position: absolute; z-index: 2; display: grid; min-width: 158px; gap: 6px; padding: 10px 11px; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16); color: var(--text-secondary); font-size: 12px; pointer-events: none; }
.trend-tooltip strong { color: var(--text-primary); font-family: var(--font-data); font-size: 12px; font-weight: 650; }
.trend-tooltip span { display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 7px; white-space: nowrap; }
.trend-tooltip i { width: 7px; height: 7px; border-radius: 50%; }
.trend-tooltip b { color: var(--text-primary); font-family: var(--font-data); font-weight: 650; font-variant-numeric: tabular-nums; }
.request-swatch { background: var(--accent); }
.token-swatch { background: #8056e8; }
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

@keyframes line-enter {
  from { opacity: 0.35; }
  to { opacity: 1; }
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
