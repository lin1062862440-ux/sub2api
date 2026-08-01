<script setup lang="ts">
import { Boxes, CircleDollarSign, Clock3, FileText } from '@lucide/vue'

import type { UsageStats } from '@/api'
import { formatCost, formatCount, formatDuration } from '@/lib/format'

defineProps<{ stats: UsageStats | null; simpleMode?: boolean; loading?: boolean; refreshing?: boolean }>()
</script>

<template>
  <section class="usage-summary" :class="{ simple: simpleMode, loading, loaded: !loading, refreshing }" aria-label="用量汇总">
    <div class="summary-item tone-blue"><FileText :size="20" /><span>总请求</span><strong>{{ formatCount(stats?.total_requests) }}</strong></div>
    <div class="summary-item tone-violet"><Boxes :size="20" /><span>总 Token</span><strong>{{ formatCount(stats?.total_tokens) }}</strong></div>
    <div v-if="!simpleMode" class="summary-item tone-green"><CircleDollarSign :size="20" /><span>实际消费</span><strong>{{ formatCost(stats?.total_actual_cost) }}</strong></div>
    <div class="summary-item tone-coral"><Clock3 :size="20" /><span>平均耗时</span><strong>{{ formatDuration(stats?.average_duration_ms) }}</strong></div>
  </section>
</template>

<style scoped>
.usage-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.usage-summary.simple { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.summary-item { position: relative; display: grid; min-width: 0; height: 64px; grid-template-columns: 24px minmax(0,1fr); grid-template-rows: 20px 25px; column-gap: 10px; align-items: center; padding: 9px 14px; overflow: hidden; background: rgba(255,255,255,.72); border: 1px solid rgba(205,216,231,.92); border-radius: 7px; transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast) ease, box-shadow var(--motion-standard) ease; }
.summary-item::after { position: absolute; z-index: 2; top: -20%; bottom: -20%; left: 0; width: 24%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.76), transparent); content: ''; opacity: 0; pointer-events: none; transform: translateX(-115%) skewX(-12deg); }
.loaded .summary-item { animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.loaded .summary-item:nth-child(2) { animation-delay: 55ms; }
.loaded .summary-item:nth-child(3) { animation-delay: 110ms; }
.loaded .summary-item:nth-child(4) { animation-delay: 165ms; }
.loading .summary-item::after { opacity: 1; width: 42%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), transparent); animation: linai-highlight-sweep 1.15s linear infinite; }
.loading .summary-item > * { opacity: .34; }
.refreshing .summary-item::after { animation: linai-highlight-sweep 820ms var(--motion-ease-out) both; }
.summary-item svg { grid-row: 1 / 3; }
.summary-item span { align-self: end; color: var(--text-tertiary); font-size: 13px; font-weight: 500; }
.summary-item strong { overflow: hidden; align-self: start; color: var(--text-primary); font-size: 17px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.tone-blue { color: var(--accent); }
.tone-violet { color: #7255d9; }
.tone-green { color: var(--success); }
.tone-green strong { color: var(--success); }
.tone-coral { color: var(--coral); }
@media (max-width: 1050px) { .summary-item { padding-right: 8px; padding-left: 8px; } }
@media (hover: hover) and (pointer: fine) { .summary-item:hover { border-color: rgba(139,166,211,.78); box-shadow: 0 10px 24px rgba(31,51,78,.08); transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .summary-item, .summary-item::after { animation: none !important; transform: none; } }
</style>
