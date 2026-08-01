<script setup lang="ts">
import type { UsageLog, UsageRequestType } from '@/api'
import { formatCost, formatCount, formatDateTime, formatDuration } from '@/lib/format'

withDefaults(defineProps<{ rows: UsageLog[]; loading: boolean; simpleMode?: boolean; filtered?: boolean }>(), {
  simpleMode: false,
  filtered: false,
})

function totalTokens(row: UsageLog): number {
  return row.total_tokens ?? row.input_tokens + row.output_tokens + row.cache_creation_tokens + row.cache_read_tokens
}

function requestType(row: UsageLog): UsageRequestType {
  return row.request_type ?? (row.stream ? 'stream' : 'sync')
}

const typeLabels: Record<UsageRequestType, string> = {
  unknown: '未知', sync: '同步', stream: '流式', ws_v2: 'WS', cyber: '安全', live: 'Live',
}
</script>

<template>
  <div class="records-table" :class="{ simple: simpleMode }">
    <div class="table-head" aria-hidden="true">
      <span>时间</span><span>API Key</span><span>模型 / 端点</span><span>类型</span><span>Token</span><span v-if="!simpleMode">消费</span><span>首字 / 总耗时</span>
    </div>
    <div v-if="loading" class="table-loading" aria-label="正在加载用量明细"><i v-for="index in 5" :key="index" /></div>
    <div v-else-if="rows.length === 0" class="table-empty">
      <strong>{{ filtered ? '没有匹配当前筛选的记录' : '当前时间范围内还没有使用记录' }}</strong>
      <span>{{ filtered ? '调整筛选条件后再试。' : '发起 API 调用后，请求明细会显示在这里。' }}</span>
    </div>
    <div v-else class="table-body">
      <div v-for="row in rows" :key="row.id" class="table-row">
        <span class="time">{{ formatDateTime(row.created_at) }}</span>
        <strong :title="row.api_key?.name">{{ row.api_key?.name || `Key #${row.api_key_id}` }}</strong>
        <div class="model"><strong :title="row.model">{{ row.model }}</strong><small :title="row.inbound_endpoint || ''">{{ row.inbound_endpoint || '—' }}</small></div>
        <span class="type-badge" :class="`type-${requestType(row)}`">{{ typeLabels[requestType(row)] }}</span>
        <div class="tokens"><strong>{{ formatCount(totalTokens(row)) }}</strong><small>入 {{ formatCount(row.input_tokens) }} · 出 {{ formatCount(row.output_tokens) }}</small></div>
        <strong v-if="!simpleMode" class="cost">{{ formatCost(row.actual_cost) }}</strong>
        <div class="latency"><strong>{{ formatDuration(row.first_token_ms) }}</strong><small>{{ formatDuration(row.duration_ms) }}</small></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.records-table { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.table-head, .table-row { display: grid; grid-template-columns: 126px 112px minmax(170px,1.3fr) 54px 98px 76px 94px; align-items: center; gap: 11px; padding: 0 16px; }
.records-table.simple .table-head, .records-table.simple .table-row { grid-template-columns: 126px 112px minmax(170px,1.3fr) 54px 98px 94px; }
.table-head { min-height: 34px; flex: 0 0 auto; background: rgba(237,242,247,.72); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 12px; }
.table-body { min-height: 0; overflow-y: visible; }
.table-row { min-height: 54px; border-bottom: 1px solid rgba(223,229,238,.78); color: var(--text-secondary); font-size: 13px; animation: linai-surface-enter 360ms var(--motion-ease-out) both; }
.table-row:nth-child(2) { animation-delay: 28ms; }
.table-row:nth-child(3) { animation-delay: 56ms; }
.table-row:nth-child(4) { animation-delay: 84ms; }
.table-row:nth-child(5) { animation-delay: 112ms; }
.table-row:nth-child(6) { animation-delay: 140ms; }
.table-row:hover { background: rgba(247,249,252,.82); }
.table-row > strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.time { color: var(--text-tertiary); font-size: 12px; }
.model, .tokens, .latency { display: flex; min-width: 0; flex-direction: column; }
.model strong, .tokens strong, .latency strong { overflow: hidden; color: var(--text-primary); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.model small, .tokens small, .latency small { overflow: hidden; margin-top: 3px; color: var(--text-tertiary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.type-badge { justify-self: start; padding: 3px 6px; background: var(--bg-inset); border-radius: 4px; color: var(--text-secondary); font-size: 12px; }
.type-stream, .type-live { background: var(--accent-soft); color: var(--accent-strong); }
.cost { color: var(--success) !important; }
.table-loading { display: grid; flex: 1; gap: 7px; padding: 10px 12px; }
.table-loading i { height: 42px; background: linear-gradient(105deg, #e8edf4 30%, #f5f8fc 47%, #e8edf4 64%); background-size: 220% 100%; border-radius: 6px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.table-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
.table-empty strong { font-size: 14px; font-weight: 600; }
.table-empty span { color: var(--text-tertiary); font-size: 13px; }
@media (max-width: 1120px) { .table-head, .table-row { grid-template-columns: 108px 92px minmax(145px,1.3fr) 48px 82px 64px 80px; gap: 8px; padding-right: 11px; padding-left: 11px; } }
@media (prefers-reduced-motion: reduce) { .table-loading i, .table-row { animation: none; transform: none; } }
</style>
