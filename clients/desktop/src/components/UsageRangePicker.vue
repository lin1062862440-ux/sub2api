<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarDays, ChevronDown } from '@lucide/vue'

import {
  resolveCustomUsageRange,
  resolveUsageRange,
  usageRangePresets,
  type UsageDateRange,
  type UsageRangePreset,
} from '@/lib/usage-range'

const model = defineModel<UsageDateRange>({ required: true })
const root = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const open = ref(false)
const draftStart = ref(model.value.startDate)
const draftEnd = ref(model.value.endDate)
const position = ref({ top: 0, left: 0 })

const customValid = computed(() => Boolean(
  draftStart.value
  && draftEnd.value
  && draftStart.value <= draftEnd.value,
))

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  draftStart.value = model.value.startDate
  draftEnd.value = model.value.endDate
  await nextTick()
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return
  const width = 320
  position.value = {
    top: rect.bottom + 7,
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
  }
}

function choosePreset(preset: Exclude<UsageRangePreset, 'custom'>) {
  model.value = resolveUsageRange(preset)
  open.value = false
}

function applyCustom() {
  if (!customValid.value) return
  model.value = resolveCustomUsageRange(draftStart.value, draftEnd.value)
  open.value = false
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!root.value?.contains(target) && !popover.value?.contains(target)) open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="range-picker">
    <button
      class="range-trigger"
      data-testid="range-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <CalendarDays :size="15" />
      <span>{{ model.label }}</span>
      <ChevronDown :size="14" :class="{ open }" />
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="open"
      ref="popover"
      class="range-popover no-drag"
      data-testid="range-popover"
      role="dialog"
      aria-label="选择时间范围"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      <div class="preset-grid">
        <button
          v-for="preset in usageRangePresets"
          :key="preset.value"
          type="button"
          :data-testid="`preset-${preset.value}`"
          :class="{ active: model.preset === preset.value }"
          @click="choosePreset(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="custom-range">
        <label>
          <span>开始日期</span>
          <input v-model="draftStart" data-testid="custom-start" type="date" :max="draftEnd || undefined">
        </label>
        <i aria-hidden="true">→</i>
        <label>
          <span>结束日期</span>
          <input v-model="draftEnd" data-testid="custom-end" type="date" :min="draftStart || undefined">
        </label>
      </div>
      <button class="apply-range" data-testid="apply-custom" type="button" :disabled="!customValid" @click="applyCustom">
        应用
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.range-picker { display: inline-flex; }
.range-trigger { display: inline-flex; height: 40px; align-items: center; gap: 8px; padding: 0 12px; background: rgba(255,255,255,.72); border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-secondary); font-size: 14px; }
.range-trigger:hover { background: var(--bg-surface); color: var(--text-primary); }
.range-trigger svg:last-child { color: var(--text-tertiary); transition: transform 160ms ease; }
.range-trigger svg.open { transform: rotate(180deg); }
.range-popover { position: fixed; z-index: 60; width: 320px; padding: 10px; background: rgba(250,252,255,.98); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 8px 18px rgba(30,48,74,.14); color: var(--text-primary); }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.preset-grid button { height: 34px; padding: 0 10px; background: transparent; border: 0; border-radius: 6px; color: var(--text-secondary); font-size: 14px; text-align: left; }
.preset-grid button:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
.preset-grid button.active { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
.custom-range { display: grid; grid-template-columns: 1fr 18px 1fr; align-items: end; gap: 6px; margin-top: 8px; padding-top: 9px; border-top: 1px solid var(--border-subtle); }
.custom-range label { display: grid; gap: 5px; color: var(--text-tertiary); font-size: 12px; }
.custom-range input { width: 100%; height: 36px; padding: 0 7px; background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-primary); font-size: 13px; }
.custom-range i { align-self: end; height: 34px; color: var(--text-tertiary); font-style: normal; line-height: 34px; text-align: center; }
.apply-range { display: block; height: 34px; margin: 10px 0 0 auto; padding: 0 14px; background: var(--accent); border: 1px solid var(--accent); border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; }
.apply-range:hover:not(:disabled) { background: var(--accent-strong); }
.apply-range:disabled { opacity: .45; }
@media (prefers-reduced-motion: reduce) { .range-trigger svg:last-child { transition: none; } }
</style>
