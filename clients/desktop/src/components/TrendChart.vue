<script setup lang="ts">
/**
 * Inline SVG area chart for the request trend.
 *
 * Hand-rolled rather than pulling in Chart.js: one series, no interaction
 * beyond hover, and this keeps the bundle small.
 */
import { computed } from 'vue'
import type { TrendPoint } from '@/api'
import { formatCount } from '@/lib/format'

const props = defineProps<{ points: TrendPoint[] }>()

const WIDTH = 720
const HEIGHT = 180
const PAD_TOP = 12
const PAD_BOTTOM = 22

const series = computed(() => props.points.map((point) => point.requests ?? 0))
const peak = computed(() => Math.max(1, ...series.value))

const coords = computed(() => {
  const values = series.value
  if (values.length === 0) return []
  const usable = HEIGHT - PAD_TOP - PAD_BOTTOM
  // A single data point has no span to divide, so anchor it mid-canvas.
  const step = values.length === 1 ? 0 : WIDTH / (values.length - 1)
  return values.map((value, index) => ({
    x: values.length === 1 ? WIDTH / 2 : index * step,
    y: PAD_TOP + usable - (value / peak.value) * usable,
    value,
    label: props.points[index]?.date ?? '',
  }))
})

const linePath = computed(() =>
  coords.value.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
)

const areaPath = computed(() => {
  if (coords.value.length === 0) return ''
  const base = HEIGHT - PAD_BOTTOM
  const first = coords.value[0]
  const last = coords.value[coords.value.length - 1]
  return `${linePath.value} L${last.x.toFixed(1)},${base} L${first.x.toFixed(1)},${base} Z`
})

/** Only the ends and midpoint get labels; a tick per day would crowd the axis. */
const axisLabels = computed(() => {
  const points = coords.value
  if (points.length === 0) return []
  const indices = points.length <= 2 ? [0, points.length - 1] : [0, Math.floor(points.length / 2), points.length - 1]
  return [...new Set(indices)].map((index) => ({
    x: points[index].x,
    text: (points[index].label || '').slice(5),
  }))
})
</script>

<template>
  <div class="chart">
    <div v-if="coords.length === 0" class="empty">暂无数据</div>
    <svg v-else :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" role="img" aria-label="请求趋势">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>

      <line
        v-for="ratio in [0, 0.5, 1]"
        :key="ratio"
        class="grid"
        x1="0"
        :y1="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
        :x2="WIDTH"
        :y2="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
      />

      <path :d="areaPath" fill="url(#trend-fill)" />
      <path :d="linePath" class="line" />

      <circle
        v-for="point in coords"
        :key="point.x"
        class="dot"
        :cx="point.x"
        :cy="point.y"
        r="7"
      >
        <title>{{ point.label }} · {{ formatCount(point.value) }} 次请求</title>
      </circle>
    </svg>

    <div v-if="axisLabels.length" class="axis">
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

<style scoped>
.chart {
  position: relative;
}

svg {
  display: block;
  width: 100%;
  height: 180px;
  overflow: visible;
}

.grid {
  stroke: var(--border-subtle);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  /* Without this, the non-uniform viewBox scaling would distort the stroke. */
  vector-effect: non-scaling-stroke;
}

.dot {
  fill: transparent;
}

.dot:hover {
  fill: var(--accent);
  fill-opacity: 0.25;
}

.axis {
  position: relative;
  height: 16px;
  margin-top: 2px;
}

.axis span {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.axis span:first-child {
  transform: none;
}

.axis span:last-child {
  transform: translateX(-100%);
}

.empty {
  display: grid;
  place-items: center;
  height: 180px;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>
