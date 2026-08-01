<script setup lang="ts">
import type { UserErrorRequest } from '@/api'
import { formatDateTime } from '@/lib/format'

withDefaults(defineProps<{ rows: UserErrorRequest[]; loading: boolean; filtered?: boolean }>(), { filtered: false })
const emit = defineEmits<{ select: [id: number] }>()
</script>

<template>
  <div class="errors-table">
    <div class="error-head" aria-hidden="true"><span>时间</span><span>状态</span><span>分类</span><span>API Key</span><span>模型</span><span>错误摘要</span></div>
    <div v-if="loading" class="error-loading"><i v-for="index in 5" :key="index" /></div>
    <div v-else-if="rows.length === 0" class="error-empty"><strong>{{ filtered ? '没有匹配当前筛选的错误' : '当前时间范围内没有错误请求' }}</strong><span>请求异常会显示在这里，方便定位失败原因。</span></div>
    <div v-else class="error-body">
      <button v-for="row in rows" :key="row.id" class="error-row" type="button" @click="emit('select', row.id)">
        <span class="time">{{ formatDateTime(row.created_at) }}</span>
        <strong class="status">{{ row.status_code }}</strong>
        <span class="category">{{ row.category || 'unknown' }}</span>
        <strong>{{ row.key_name || '已删除密钥' }}</strong>
        <span class="model" :title="row.model">{{ row.model }}</span>
        <span class="message" :title="row.message">{{ row.message }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.errors-table { display: flex; min-height: 0; flex: 1; flex-direction: column; }
.error-head, .error-row { display: grid; grid-template-columns: 126px 52px 92px 112px minmax(145px,.8fr) minmax(180px,1.2fr); align-items: center; gap: 11px; padding: 0 16px; }
.error-head { min-height: 34px; flex: 0 0 auto; background: rgba(237,242,247,.72); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 12px; }
.error-body { min-height: 0; overflow-y: visible; }
.error-row { width: 100%; min-height: 52px; background: transparent; border: 0; border-bottom: 1px solid rgba(223,229,238,.78); color: var(--text-secondary); font-size: 13px; text-align: left; animation: linai-surface-enter 360ms var(--motion-ease-out) both; }
.error-row:nth-child(2) { animation-delay: 35ms; }
.error-row:nth-child(3) { animation-delay: 70ms; }
.error-row:nth-child(4) { animation-delay: 105ms; }
.error-row:hover { background: rgba(247,249,252,.82); }
.error-row > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.error-row strong { font-weight: 600; }
.time { color: var(--text-tertiary); font-size: 12px; }
.status { justify-self: start; padding: 2px 5px; background: var(--coral-soft); border-radius: 4px; color: var(--coral); }
.category { color: var(--coral); }
.model { color: var(--text-primary); }
.error-loading { display: grid; flex: 1; gap: 7px; padding: 10px 12px; }
.error-loading i { height: 42px; background: linear-gradient(105deg, #e8edf4 30%, #f5f8fc 47%, #e8edf4 64%); background-size: 220% 100%; border-radius: 6px; animation: linai-skeleton-shimmer 1.35s linear infinite; }
.error-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
.error-empty strong { font-size: 14px; font-weight: 600; }
.error-empty span { color: var(--text-tertiary); font-size: 13px; }
@media (max-width: 1120px) { .error-head, .error-row { grid-template-columns: 108px 46px 78px 92px minmax(125px,.8fr) minmax(145px,1.2fr); gap: 8px; padding-right: 11px; padding-left: 11px; } }
@media (prefers-reduced-motion: reduce) { .error-loading i, .error-row { animation: none; transform: none; } }
</style>
