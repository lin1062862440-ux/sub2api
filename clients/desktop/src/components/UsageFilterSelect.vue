<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'

export interface UsageFilterOption {
  value: string | number
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string | number
  label: string
  options: UsageFilterOption[]
  testId?: string
  stacked?: boolean
}>(), {
  testId: undefined,
  stacked: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  change: [value: string | number]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const listboxId = `usage-filter-${useId()}`
const selectedLabel = computed(() => (
  props.options.find((option) => option.value === props.modelValue)?.label ?? props.options[0]?.label ?? ''
))

function select(option: UsageFilterOption) {
  open.value = false
  if (option.value === props.modelValue) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

function handlePointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="usage-filter-select" :class="{ 'is-open': open, 'is-stacked': stacked }" :data-testid="testId">
    <span v-if="stacked" class="select-label">{{ label }}</span>
    <button
      class="select-trigger"
      type="button"
      role="combobox"
      :aria-label="label"
      :aria-controls="listboxId"
      :aria-expanded="open"
      :data-testid="testId ? `${testId}-trigger` : undefined"
      @click="open = !open"
    >
      <span v-if="!stacked" class="select-label">{{ label }}</span>
      <span class="select-value">{{ selectedLabel }}</span>
      <ChevronDown :size="14" />
    </button>

    <div v-if="open" :id="listboxId" class="select-options" role="listbox" :aria-label="label">
      <button
        v-for="option in options"
        :key="`${typeof option.value}:${option.value}`"
        class="select-option"
        :class="{ selected: option.value === modelValue }"
        type="button"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="select(option)"
      >
        <span>{{ option.label }}</span>
        <Check v-if="option.value === modelValue" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.usage-filter-select { position: relative; min-width: 0; height: 44px; background: rgba(255,255,255,.7); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-tertiary); transition: border-color var(--motion-fast) ease, box-shadow var(--motion-fast) ease, background var(--motion-fast) ease; }
.usage-filter-select.is-open { z-index: 35; background: var(--bg-surface); border-color: rgba(88,126,207,.72); box-shadow: 0 0 0 3px rgba(71,111,199,.1); }
.select-trigger { display: flex; width: 100%; height: 100%; min-width: 0; align-items: center; gap: 7px; padding: 0 10px 0 12px; background: transparent; border: 0; color: inherit; cursor: pointer; font: inherit; text-align: left; }
.select-label { flex: 0 0 auto; color: var(--text-tertiary); font-size: 13px; }
.select-value { overflow: hidden; min-width: 0; flex: 1 1 auto; color: var(--text-primary); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.select-trigger > svg { flex: 0 0 auto; color: var(--text-tertiary); transition: transform var(--motion-fast) var(--motion-ease-out), color var(--motion-fast) ease; }
.is-open .select-trigger > svg { color: var(--accent-strong); transform: rotate(180deg); }
.select-options { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; display: grid; width: max(100%, max-content); min-width: 100%; max-width: min(280px, calc(100vw - 32px)); max-height: 280px; gap: 2px; overflow-y: auto; padding: 5px; background: rgba(250,252,255,.98); border: 1px solid var(--border-strong); border-radius: 6px; box-shadow: 0 14px 30px rgba(28,45,72,.16); backdrop-filter: blur(18px) saturate(1.2); transform-origin: top left; animation: usage-select-in var(--motion-fast) var(--motion-ease-out) both; }
.select-option { display: flex; width: 100%; min-width: 0; height: 34px; align-items: center; justify-content: space-between; gap: 14px; padding: 0 9px; background: transparent; border: 0; border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 13px; text-align: left; white-space: nowrap; }
.select-option span { overflow: hidden; text-overflow: ellipsis; }
.select-option svg { flex: 0 0 auto; color: var(--accent-strong); }
.select-option.selected { background: var(--accent-soft); color: var(--accent-strong); font-weight: 650; }
.usage-filter-select.is-stacked { display: grid; height: auto; gap: 6px; background: transparent; border: 0; box-shadow: none; }
.is-stacked > .select-label { font-size: 13px; }
.is-stacked .select-trigger { height: 40px; padding: 0 9px; background: rgba(255,255,255,.72); border: 1px solid var(--border-strong); border-radius: 5px; }
.is-stacked.is-open .select-trigger { background: var(--bg-surface); border-color: rgba(88,126,207,.72); box-shadow: 0 0 0 3px rgba(71,111,199,.1); }
@media (hover: hover) and (pointer: fine) { .usage-filter-select:not(.is-stacked):hover { background: var(--bg-surface); border-color: rgba(139,166,211,.78); } .select-option:hover { background: rgba(231,238,251,.9); color: var(--text-primary); } }
@keyframes usage-select-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .select-options { animation: none; } }
</style>
