<script setup lang="ts">
import { Check } from '@lucide/vue'

import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import { usageAppearances } from '@/features/usage-display/external/macos/shared/appearance'

defineProps<{ modelValue: UsageDisplayAppearance }>()
defineEmits<{ 'update:modelValue': [value: UsageDisplayAppearance] }>()

const choices = usageAppearances
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
.appearance-sky .appearance-sample { background: #dcecf5; color: #24374a; box-shadow: inset -18px -14px 28px rgba(83, 148, 186, 0.18); }
.appearance-sky .appearance-sample i { background: rgba(39, 72, 98, 0.13); }
.appearance-sky .appearance-sample i b { background: #5d9fc6; }
.appearance-meadow .appearance-sample { background: #edf1c9; color: #364126; box-shadow: inset -18px -14px 28px rgba(172, 183, 79, 0.2); }
.appearance-meadow .appearance-sample i { background: rgba(69, 80, 36, 0.13); }
.appearance-meadow .appearance-sample i b { background: #96a941; }
.appearance-sunset .appearance-sample { background: #f4d6cd; color: #52302c; box-shadow: inset -18px -14px 28px rgba(206, 106, 87, 0.19); }
.appearance-sunset .appearance-sample i { background: rgba(94, 47, 40, 0.13); }
.appearance-sunset .appearance-sample i b { background: #cf7666; }
</style>
