<script setup lang="ts">
import { ArrowLeft, ShieldCheck } from '@lucide/vue'
import type { UserGroup } from '@/api/user-groups'

defineProps<{ group: UserGroup | null; readOnly?: boolean }>()
</script>

<template>
  <header class="ug-detail-head drag-region">
    <RouterLink :to="{ name: 'user-groups' }" class="ug-back no-drag" title="返回团队列表"><ArrowLeft :size="17" /></RouterLink>
    <div class="ug-detail-mark">{{ group?.name.trim().slice(0, 1) || '#' }}</div>
    <div class="ug-detail-copy"><span>TEAM MANAGEMENT</span><h1>{{ group?.name || '团队管理' }}</h1><p>{{ group?.description || '管理团队成员、套餐配额与使用情况。' }}</p></div>
    <div class="ug-detail-access"><ShieldCheck :size="15" />{{ readOnly ? '只读访问' : '管理权限' }}</div>
    <div class="ug-detail-actions no-drag"><slot name="actions" /></div>
  </header>
  <nav class="ug-tabs ug-detail-tabs" aria-label="团队详情">
    <RouterLink :to="{ name: 'user-group-members', params: { id: group?.id } }">成员与配额</RouterLink>
    <RouterLink :to="{ name: 'user-group-usage', params: { id: group?.id } }">用量分析</RouterLink>
  </nav>
</template>

<style scoped>
.ug-detail-head{display:grid;grid-template-columns:34px 44px minmax(0,1fr) auto auto;align-items:center;gap:11px}.ug-back{display:grid;width:34px;height:34px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-secondary);place-items:center}.ug-detail-mark{display:grid;width:44px;height:44px;border-radius:8px;background:#eaf1fd;color:var(--accent-strong);font-size:16px;font-weight:760;place-items:center}.ug-detail-copy{min-width:0}.ug-detail-copy>span{display:block;margin-bottom:2px;color:var(--accent);font-size:9px;font-weight:720}.ug-detail-copy h1,.ug-detail-copy p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ug-detail-copy h1{margin:0;font-size:21px}.ug-detail-copy p{margin:3px 0 0;color:var(--text-tertiary);font-size:11px}.ug-detail-access{display:flex;align-items:center;gap:5px;color:var(--success);font-size:10px}.ug-detail-actions{display:flex;gap:7px}.ug-detail-actions :deep(button){display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.ug-detail-actions :deep(button.primary){border-color:var(--accent);background:var(--accent);color:white}@container app-content (max-width:760px){.ug-detail-head{grid-template-columns:34px 40px minmax(0,1fr)}.ug-detail-access,.ug-detail-actions{grid-column:3}.ug-detail-actions{flex-wrap:wrap}}
</style>
