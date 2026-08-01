<script setup lang="ts">
import { Check } from '@lucide/vue'

import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'

defineProps<{ modelValue: UsageDisplayAppearance }>()
defineEmits<{ 'update:modelValue': [value: UsageDisplayAppearance] }>()

const choices: readonly { id: UsageDisplayAppearance; label: string }[] = [
  { id: 'default', label: '默认浅色' },
  { id: 'dark', label: '深色' },
  { id: 'blur', label: 'Blur' },
]
</script>

<template>
  <div class="appearance-choices">
    <button
      v-for="choice in choices"
      :key="choice.id"
      type="button"
      class="appearance-choice"
      :class="`appearance-${choice.id}`"
      :data-testid="`usage-appearance-${choice.id}`"
      :aria-pressed="modelValue === choice.id"
      @click="$emit('update:modelValue', choice.id)"
    >
      <span class="appearance-sample">
        <Check v-if="modelValue === choice.id" :size="12" data-testid="appearance-check" />
        <strong>74%</strong>
        <i><b /></i>
      </span>
      <span>{{ choice.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.appearance-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.appearance-choice {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 5px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 10px;
  text-align: center;
}
.appearance-choice[aria-pressed='true'] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); color: var(--accent-strong); font-weight: 680; }
.appearance-choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.appearance-sample {
  position: relative;
  display: grid;
  height: 50px;
  align-content: center;
  gap: 6px;
  padding: 7px 8px;
  overflow: hidden;
  background: #e8f0f4;
  border-radius: 7px;
  color: #172431;
  text-align: left;
}
.appearance-sample > svg { position: absolute; top: 5px; right: 5px; }
.appearance-sample strong { font-size: 17px; font-weight: 620; line-height: 1; }
.appearance-sample i { display: block; width: 62%; height: 4px; overflow: hidden; background: rgba(52, 77, 99, 0.15); border-radius: 2px; }
.appearance-sample i b { display: block; width: 74%; height: 100%; background: #4d84e2; }
.appearance-dark .appearance-sample { background: #262947; color: #f7f8ff; }
.appearance-dark .appearance-sample i { background: rgba(224, 229, 255, 0.16); }
.appearance-dark .appearance-sample i b { background: #8ca7ff; }
.appearance-blur .appearance-sample { background: rgba(218, 248, 242, 0.86); color: #123b3a; box-shadow: inset -20px -14px 25px rgba(39, 174, 177, 0.2); }
.appearance-blur .appearance-sample i b { background: repeating-linear-gradient(90deg, #27aeb1 0 3px, transparent 3px 5px); }
</style>
