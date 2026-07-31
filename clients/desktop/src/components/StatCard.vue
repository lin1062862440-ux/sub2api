<script setup lang="ts">
/** A single headline metric with an optional secondary line. */
defineProps<{
  label: string
  value: string
  hint?: string
  accent?: boolean
}>()
</script>

<template>
  <div class="stat" :class="{ 'stat-accent': accent }">
    <span class="label">{{ label }}</span>
    <span class="value">{{ value }}</span>
    <span v-if="hint" class="hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.stat-accent {
  background: linear-gradient(160deg, var(--accent-muted), var(--bg-surface) 70%);
  border-color: var(--accent-border);
}

.label {
  font-size: 12px;
  color: var(--text-secondary);
}

.value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  /* Keeps columns aligned when digits change width during refreshes. */
  font-variant-numeric: tabular-nums;
}

.hint {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
