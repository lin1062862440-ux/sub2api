<script setup lang="ts">
interface MetricItem {
  id: string
  label: string
  value: string
  detail?: string
  tone?: 'brand' | 'cost'
}

defineProps<{ items: MetricItem[] }>()
</script>

<template>
  <dl class="metric-strip">
    <div
      v-for="item in items"
      :key="item.id"
      class="metric"
      :class="item.tone ? `metric-${item.tone}` : undefined"
      :data-testid="`metric-${item.id}`"
    >
      <dt>{{ item.label }}</dt>
      <dd>{{ item.value }}</dd>
      <span v-if="item.detail">{{ item.detail }}</span>
    </div>
  </dl>
</template>

<style scoped>
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.metric {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 116px;
  flex-direction: column;
  justify-content: center;
  padding: 20px 22px;
}

.metric + .metric {
  border-left: 1px solid var(--border-subtle);
}

.metric::after {
  position: absolute;
  top: 0;
  right: 22px;
  left: 22px;
  height: 2px;
  content: '';
  background: transparent;
}

.metric-brand::after {
  background: var(--accent);
}

.metric-cost::after {
  background: var(--coral);
}

dt {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 560;
}

dd {
  margin: 5px 0 3px;
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 680;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-brand dd {
  color: var(--accent-strong);
}

.metric-cost dd {
  color: var(--coral);
}

.metric span {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1040px) {
  .metric {
    padding-right: 16px;
    padding-left: 16px;
  }

  dd {
    font-size: 21px;
  }
}
</style>
