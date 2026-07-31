<script setup lang="ts">
import { computed } from 'vue'

import type { TrendPoint } from '@/api'
import { formatCount } from '@/lib/format'

const props = defineProps<{ points: TrendPoint[] }>()

const WIDTH = 760
const HEIGHT = 230
const PAD_TOP = 18
const PAD_BOTTOM = 30

const values = computed(() => props.points.map((point) => point.requests ?? 0))
const peak = computed(() => Math.max(1, ...values.value))

const coords = computed(() => {
  if (values.value.length === 0) return []

  const usableHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const step = values.value.length === 1 ? 0 : WIDTH / (values.value.length - 1)
  return values.value.map((value, index) => ({
    x: values.value.length === 1 ? WIDTH / 2 : index * step,
    y: PAD_TOP + usableHeight - (value / peak.value) * usableHeight,
    value,
    label: props.points[index]?.date ?? '',
  }))
})

const linePath = computed(() =>
  coords.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' '),
)

const areaPath = computed(() => {
  if (coords.value.length === 0) return ''
  const baseline = HEIGHT - PAD_BOTTOM
  const first = coords.value[0]
  const last = coords.value[coords.value.length - 1]
  return `${linePath.value} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
})

const axisLabels = computed(() =>
  coords.value.map((point) => ({
    x: point.x,
    text: point.label.slice(5),
  })),
)
</script>

<template>
  <div class="chart">
    <div v-if="coords.length === 0" class="empty" data-testid="trend-empty">
      <strong>还没有趋势数据</strong>
      <span>产生请求后，这里会显示最近 7 天的变化。</span>
    </div>

    <template v-else>
      <div class="plot">
        <div class="y-scale" aria-hidden="true">
          <span>{{ formatCount(peak) }}</span>
          <span>{{ formatCount(peak / 2) }}</span>
          <span>0</span>
        </div>
        <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" role="img" aria-label="最近 7 天请求趋势">
          <line
            v-for="ratio in [0, 0.5, 1]"
            :key="ratio"
            class="grid-line"
            x1="0"
            :y1="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
            :x2="WIDTH"
            :y2="PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * ratio"
          />
          <path :d="areaPath" class="area" />
          <path :d="linePath" class="line" data-testid="trend-line" />
          <circle
            v-for="point in coords"
            :key="point.label"
            class="point"
            data-testid="trend-point"
            :cx="point.x"
            :cy="point.y"
            r="6"
          >
            <title>{{ point.label }} · {{ formatCount(point.value) }} 次请求</title>
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
    </template>
  </div>
</template>

<style scoped>
.chart {
  min-height: 264px;
}

.plot {
  position: relative;
  padding-left: 48px;
}

svg {
  display: block;
  width: 100%;
  height: 230px;
  overflow: visible;
}

.grid-line {
  stroke: var(--border-subtle);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.area {
  fill: rgba(37, 99, 235, 0.07);
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
  vector-effect: non-scaling-stroke;
}

.point {
  fill: var(--bg-surface);
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.point:hover {
  fill: var(--accent-soft);
}

.y-scale {
  position: absolute;
  top: 10px;
  bottom: 26px;
  left: 0;
  display: flex;
  width: 40px;
  flex-direction: column;
  justify-content: space-between;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: right;
}

.x-axis {
  position: relative;
  height: 20px;
  margin: 3px 0 0 48px;
}

.x-axis span {
  position: absolute;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 10px;
  transform: translateX(-50%);
  white-space: nowrap;
}

.x-axis span:first-child {
  transform: none;
}

.x-axis span:last-child {
  transform: translateX(-100%);
}

.empty {
  display: flex;
  min-height: 264px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
  text-align: center;
}

.empty strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 620;
}

.empty span {
  font-size: 12px;
}
</style>
