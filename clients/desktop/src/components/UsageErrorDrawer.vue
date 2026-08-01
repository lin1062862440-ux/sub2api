<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertCircle, RefreshCw, X } from '@lucide/vue'

import * as api from '@/api'
import type { UserErrorRequestDetail } from '@/api'
import { formatDateTime } from '@/lib/format'

const props = defineProps<{ openId: number | null }>()
const emit = defineEmits<{ close: [] }>()
const detail = ref<UserErrorRequestDetail | null>(null)
const loading = ref(false)
const failed = ref(false)
let sequence = 0

async function load() {
  if (!props.openId) return
  const current = ++sequence
  loading.value = true
  failed.value = false
  try {
    const value = await api.getUsageErrorDetail(props.openId)
    if (current === sequence) detail.value = value
  } catch {
    if (current === sequence) failed.value = true
  } finally {
    if (current === sequence) loading.value = false
  }
}

watch(() => props.openId, (id) => {
  detail.value = null
  failed.value = false
  if (id) void load()
}, { immediate: true })

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.openId) emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="openId" class="drawer-layer" @pointerdown.self="emit('close')">
      <aside class="error-drawer" role="dialog" aria-modal="true" aria-label="错误请求详情">
        <header><div><span>错误请求</span><h2>请求详情</h2></div><button type="button" title="关闭" aria-label="关闭" @click="emit('close')"><X :size="17" /></button></header>
        <div v-if="loading" class="drawer-loading"><i /><i /><i /><i /></div>
        <div v-else-if="failed" class="drawer-failed"><AlertCircle :size="24" /><strong>错误详情加载失败</strong><span>网络恢复后可以重新加载。</span><button data-testid="retry-error-detail" type="button" @click="load"><RefreshCw :size="14" />重新加载</button></div>
        <div v-else-if="detail" class="drawer-content">
          <section class="error-identity"><strong>{{ detail.status_code }}</strong><div><h3>{{ detail.category || 'unknown' }}</h3><p>{{ detail.message }}</p></div></section>
          <dl>
            <div><dt>时间</dt><dd>{{ formatDateTime(detail.created_at) }}</dd></div>
            <div><dt>API Key</dt><dd>{{ detail.key_name || '已删除密钥' }}</dd></div>
            <div><dt>模型</dt><dd>{{ detail.model }}</dd></div>
            <div><dt>端点</dt><dd>{{ detail.inbound_endpoint || '—' }}</dd></div>
            <div><dt>平台</dt><dd>{{ detail.platform || '—' }}</dd></div>
            <div><dt>上游状态</dt><dd>{{ detail.upstream_status_code || '—' }}</dd></div>
          </dl>
          <section class="error-body"><h3>错误响应</h3><pre>{{ detail.error_body || '未返回错误正文' }}</pre></section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-layer { position: fixed; z-index: 70; inset: 0; background: rgba(32,45,62,.18); animation: drawer-backdrop-in var(--motion-standard) ease both; }
.error-drawer { position: absolute; top: 0; right: 0; display: flex; width: min(420px, 42vw); height: 100%; flex-direction: column; background: rgba(249,251,254,.98); border-left: 1px solid var(--border-strong); box-shadow: -8px 0 20px rgba(30,48,74,.12); animation: drawer-panel-in 360ms var(--motion-ease-out) both; }
header { display: flex; min-height: 72px; align-items: center; justify-content: space-between; padding: 24px 18px 10px; border-bottom: 1px solid var(--border-subtle); }
header span { color: var(--coral); font-size: 13px; }
header h2 { margin-top: 2px; font-size: 16px; }
header button { display: grid; width: 30px; height: 30px; padding: 0; background: transparent; border: 0; border-radius: 6px; color: var(--text-secondary); place-items: center; }
header button:hover { background: var(--bg-inset); }
.drawer-content { min-height: 0; padding: 16px 18px; overflow-y: auto; }
.error-identity { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
.error-identity > strong { display: grid; width: 46px; height: 38px; background: var(--coral-soft); border-radius: 7px; color: var(--coral); font-size: 14px; place-items: center; }
.error-identity h3 { font-size: 14px; }
.error-identity p { margin-top: 3px; color: var(--text-secondary); font-size: 14px; }
dl { display: grid; gap: 0; margin: 12px 0; }
dl > div { display: grid; grid-template-columns: 82px minmax(0,1fr); gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(223,229,238,.7); }
dt { color: var(--text-tertiary); font-size: 13px; }
dd { overflow-wrap: anywhere; margin: 0; color: var(--text-secondary); font-size: 14px; text-align: right; }
.error-body h3 { margin-bottom: 7px; font-size: 14px; }
pre { min-height: 120px; margin: 0; padding: 12px; overflow-wrap: anywhere; white-space: pre-wrap; background: var(--bg-inset); border-radius: 7px; color: var(--text-secondary); font-family: var(--font-data); font-size: 13px; line-height: 1.6; user-select: text; }
.drawer-loading { display: grid; gap: 10px; padding: 18px; }
.drawer-loading i { height: 52px; background: var(--skeleton); border-radius: 7px; }
.drawer-failed { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-secondary); text-align: center; }
.drawer-failed strong { color: var(--text-primary); font-size: 14px; }
.drawer-failed span { font-size: 13px; }
.drawer-failed button { display: inline-flex; height: 34px; align-items: center; gap: 6px; margin-top: 5px; padding: 0 11px; background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-secondary); font-size: 13px; }
@keyframes drawer-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes drawer-panel-in { from { opacity: .7; transform: translateX(26px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) { .drawer-layer, .error-drawer { animation: none; transform: none; } }
</style>
