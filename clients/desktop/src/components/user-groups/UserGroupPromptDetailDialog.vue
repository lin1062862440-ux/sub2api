<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { Eye, LockKeyhole, RefreshCw, X } from '@lucide/vue'

import type { UserGroupPromptDetail } from '@/api/user-groups'
import { formatDateTime } from '@/lib/format'

const props = defineProps<{
  modelValue: boolean
  prompts: UserGroupPromptDetail[]
  loading?: boolean
  error?: string
  forbidden?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; retry: [] }>()

function close() { emit('update:modelValue', false) }
function keydown(event: KeyboardEvent) { if (event.key === 'Escape' && props.modelValue) close() }
onMounted(() => document.addEventListener('keydown', keydown))
onBeforeUnmount(() => document.removeEventListener('keydown', keydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="prompt-detail">
      <div v-if="modelValue" class="detail-backdrop" data-testid="prompt-detail-dialog" @mousedown.self="close">
        <section class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-detail-title">
          <header><span><Eye :size="20" /></span><div><h2 id="prompt-detail-title">Prompt 详情</h2><p>仅展示服务端脱敏后的留存内容</p></div><button type="button" aria-label="关闭" @click="close"><X :size="18" /></button></header>
          <div class="detail-body">
            <div v-if="loading" class="detail-state"><RefreshCw :size="21" class="spinning" /><span>正在加载 Prompt</span></div>
            <div v-else-if="forbidden" class="detail-state forbidden"><LockKeyhole :size="22" /><strong>无权查看 Prompt</strong><span>该团队尚未授予你 Prompt 查看权限。</span></div>
            <div v-else-if="error" class="detail-state error"><strong>Prompt 加载失败</strong><span>{{ error }}</span><button type="button" @click="emit('retry')">重试</button></div>
            <div v-else-if="!prompts.length" class="detail-state"><strong>没有可用的 Prompt</strong><span>内容可能未采集、已过期或已按策略删除。</span></div>
            <div v-else class="prompt-list">
              <article v-for="(prompt, index) in prompts" :key="prompt.id">
                <header><div><i>{{ index + 1 }}</i><strong>{{ prompt.model || '-' }}</strong></div><div><span>{{ prompt.protocol || '-' }}</span><span>{{ prompt.stage || '-' }}</span><span class="redacted">已脱敏</span><span v-if="prompt.truncated" class="truncated">已截断</span></div></header>
                <pre>{{ prompt.redacted_prompt }}</pre>
                <footer><span>采集于 {{ formatDateTime(prompt.captured_at) }}</span><span>到期于 {{ formatDateTime(prompt.expires_at) }}</span></footer>
              </article>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.detail-backdrop{position:fixed;z-index:155;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.28);backdrop-filter:blur(10px);place-items:center}.detail-dialog{display:flex;width:min(760px,100%);max-height:min(780px,calc(100vh - 48px));flex-direction:column;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:white;box-shadow:0 25px 70px rgba(28,42,62,.25)}.detail-dialog>header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px 20px;border-bottom:1px solid var(--border-subtle)}.detail-dialog>header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e9f0ff;color:var(--accent);place-items:center}.detail-dialog h2{margin:0;font-size:17px}.detail-dialog>header p{margin:3px 0 0;color:var(--text-tertiary);font-size:11px}.detail-dialog>header button{border:0;background:transparent;color:var(--text-tertiary)}.detail-body{min-height:300px;overflow:auto;padding:18px 20px}.detail-state{display:grid;min-height:280px;align-content:center;justify-items:center;gap:8px;color:var(--text-tertiary);font-size:11px;text-align:center}.detail-state strong{color:var(--text-primary);font-size:13px}.detail-state.forbidden svg{color:var(--danger)}.detail-state.error span{color:var(--danger)}.detail-state button{height:33px;padding:0 11px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--accent)}.prompt-list{display:grid;gap:12px}.prompt-list>article{overflow:hidden;border:1px solid var(--border-subtle);border-radius:7px}.prompt-list article>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border-subtle);background:#f7f9fc}.prompt-list header>div{display:flex;min-width:0;align-items:center;gap:6px}.prompt-list header i{display:grid;width:24px;height:24px;flex:none;border-radius:5px;background:#e6efff;color:var(--accent);font-size:10px;font-style:normal;font-weight:700;place-items:center}.prompt-list header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.prompt-list header span{padding:3px 5px;border-radius:4px;background:white;color:var(--text-tertiary);font-size:9px}.prompt-list header .redacted{background:#eaf8f1;color:#277a58}.prompt-list header .truncated{background:#fff4df;color:#8a6220}.prompt-list pre{min-height:88px;margin:0;padding:14px;overflow-wrap:anywhere;white-space:pre-wrap;color:var(--text-primary);font:11px/1.65 var(--font-sans);letter-spacing:0}.prompt-list article>footer{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-top:1px solid var(--border-subtle);color:var(--text-tertiary);font-size:9px}.prompt-detail-enter-active,.prompt-detail-leave-active{transition:opacity 180ms}.prompt-detail-enter-from,.prompt-detail-leave-to{opacity:0}@media(max-width:600px){.detail-backdrop{padding:12px}.detail-dialog{max-height:calc(100vh - 24px)}.prompt-list article>header,.prompt-list article>footer{align-items:flex-start;flex-direction:column}.prompt-list header>div:last-child{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
