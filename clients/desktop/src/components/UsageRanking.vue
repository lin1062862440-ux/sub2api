<script setup lang="ts">
export interface UsageRankingRow { id: string | number; label: string; value: string; share: number }

withDefaults(defineProps<{
  title: string
  subtitle: string
  rows: UsageRankingRow[]
  emptyText: string
  loading?: boolean
  tone?: 'blue' | 'teal'
}>(), { loading: false, tone: 'blue' })
</script>

<template>
  <section class="ranking" :class="`tone-${tone}`">
    <header><div><h3>{{ title }}</h3><p>{{ subtitle }}</p></div><span>Top {{ Math.min(rows.length, 3) }}</span></header>
    <div v-if="loading" class="ranking-loading" aria-label="正在加载排行">
      <i v-for="index in 3" :key="index" />
    </div>
    <div v-else-if="rows.length === 0" class="empty">{{ emptyText }}</div>
    <ol v-else>
      <li v-for="row in rows.slice(0, 3)" :key="row.id" :title="row.label">
        <div><strong>{{ row.label }}</strong><span>{{ row.value }}</span><em>{{ row.share.toFixed(1) }}%</em></div>
        <i><span :style="{ width: `${Math.max(row.share, 2)}%` }" /></i>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ranking { min-width: 0; min-height: 0; padding: 13px 15px; overflow: hidden; background: rgba(255,255,255,.72); border: 1px solid rgba(205,216,231,.92); border-radius: 8px; transition: transform var(--motion-standard) var(--motion-ease-out), border-color var(--motion-fast) ease, box-shadow var(--motion-standard) ease; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
h3 { font-size: 14px; font-weight: 700; }
p { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
header > span { color: var(--text-tertiary); font-size: 12px; }
ol { display: flex; flex-direction: column; gap: 9px; margin: 0; padding: 0; list-style: none; }
li { min-width: 0; }
li > div { display: grid; grid-template-columns: minmax(0,1fr) 58px 42px; align-items: center; gap: 7px; }
strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
li span, em { color: var(--text-tertiary); font-size: 12px; font-style: normal; text-align: right; }
em { color: var(--accent-strong); }
li > i { display: block; height: 3px; margin-top: 5px; overflow: hidden; background: var(--bg-inset); border-radius: 2px; }
li > i span { display: block; height: 100%; background: var(--accent); border-radius: inherit; transform-origin: left center; animation: linai-bar-grow 640ms var(--motion-ease-out) both; }
li:nth-child(2) > i span { animation-delay: 70ms; }
li:nth-child(3) > i span { animation-delay: 140ms; }
.tone-teal em { color: var(--success); }
.tone-teal li > i span { background: #0fa38f; }
.empty { display: grid; min-height: 80px; color: var(--text-tertiary); font-size: 13px; place-items: center; }
.ranking-loading { display: grid; gap: 10px; padding-top: 2px; }
.ranking-loading i { display: block; height: 20px; background: linear-gradient(105deg, #e8edf4 30%, #f5f8fc 47%, #e8edf4 64%); background-size: 220% 100%; border-radius: 5px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.ranking-loading i:nth-child(2) { width: 84%; }
.ranking-loading i:nth-child(3) { width: 68%; }
@media (hover: hover) and (pointer: fine) { .ranking:hover { border-color: rgba(139,166,211,.78); box-shadow: 0 10px 24px rgba(31,51,78,.08); transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .ranking, li > i span, .ranking-loading i { animation: none; transform: none; } }
</style>
