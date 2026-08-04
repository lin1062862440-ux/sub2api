<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, LoaderCircle, Search, ShieldCheck, X } from '@lucide/vue'

import { listAdminUsers } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'
import type { UserGroupViewer } from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'

const props = defineProps<{
  modelValue: boolean
  groupName: string
  captureEnabled: boolean
  selectedPeople: UserGroupViewer[]
  saving?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [payload: { enabled: boolean; userIds: number[] }]
}>()

const users = ref<AdminUser[]>([])
const selected = ref<number[]>([])
const enabled = ref(false)
const search = ref('')
const loading = ref(false)
const loadError = ref('')
const candidates = computed(() => {
  const rows = new Map<number, AdminUser>()
  props.selectedPeople.forEach(person => rows.set(person.user_id, {
    id: person.user_id,
    username: person.username,
    email: person.email,
    avatar_url: person.avatar_url,
    role: 'user',
    balance: 0,
    concurrency: 0,
    status: person.status === 'disabled' ? 'disabled' : 'active',
    allowed_groups: [],
    notes: '',
    created_at: '',
    updated_at: '',
  }))
  users.value.forEach(user => rows.set(user.id, user))
  return [...rows.values()]
})

async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await listAdminUsers({ page: 1, page_size: 100, search: search.value.trim() || undefined })
    users.value = result.items
  } catch (caught) {
    loadError.value = caught instanceof Error && caught.message ? caught.message : '用户列表加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  enabled.value = props.captureEnabled
  selected.value = props.selectedPeople.map(person => person.user_id)
  search.value = ''
  void loadUsers()
}, { immediate: true })

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

function toggle(userId: number) {
  selected.value = selected.value.includes(userId)
    ? selected.value.filter(id => id !== userId)
    : [...selected.value, userId]
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
}

onMounted(() => document.addEventListener('keydown', keydown))
onBeforeUnmount(() => document.removeEventListener('keydown', keydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="prompt-dialog">
      <div v-if="modelValue" class="prompt-backdrop" data-testid="prompt-settings-dialog" @mousedown.self="close">
        <section class="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-settings-title">
          <header>
            <span><ShieldCheck :size="20" /></span>
            <div><h2 id="prompt-settings-title">Prompt 设置</h2><p>{{ groupName }} · 脱敏采集与查看授权</p></div>
            <button type="button" aria-label="关闭" :disabled="saving" @click="close"><X :size="18" /></button>
          </header>

          <div class="prompt-body">
            <section class="capture-setting">
              <div><strong>提示词留存</strong><p>仅采集成功使用团队套餐的请求，并保存脱敏内容。</p></div>
              <button type="button" role="switch" data-testid="prompt-capture-toggle" :aria-checked="enabled" :class="{ enabled }" @click="enabled = !enabled"><i /></button>
            </section>
            <div class="capture-rules"><span>仅最新一轮</span><span>敏感内容脱敏</span><span>按服务端策略到期删除</span></div>

            <section class="viewer-section">
              <div class="viewer-heading"><div><h3>Prompt 查看者</h3><p>管理员不会自动获得查看权限，必须在这里明确授权。</p></div><span>已选 {{ selected.length }} 人</span></div>
              <form class="viewer-search" @submit.prevent="loadUsers"><Search :size="16" /><input v-model="search" data-testid="prompt-viewer-search" placeholder="搜索用户名、邮箱或 ID" /><button type="submit" :disabled="loading">搜索</button></form>
              <p v-if="loadError || error" class="prompt-error">{{ loadError || error }}</p>
              <div v-if="loading" class="viewer-loading"><i v-for="n in 5" :key="n" /></div>
              <div v-else class="viewer-list">
                <button v-for="user in candidates" :key="user.id" type="button" :class="{ selected: selected.includes(user.id) }" :aria-pressed="selected.includes(user.id)" @click="toggle(user.id)">
                  <UserAvatar :name="user.username || user.email" :src="user.avatar_url" />
                  <span><strong>{{ user.username || user.email }}</strong><small>{{ user.email }} · #{{ user.id }}</small></span>
                  <i><Check :size="12" /></i>
                </button>
                <p v-if="!candidates.length" class="viewer-empty">没有符合条件的用户</p>
              </div>
            </section>
          </div>

          <footer><button type="button" @click="close">取消</button><button class="save" type="button" data-testid="save-prompt-settings" :disabled="saving" @click="emit('save', { enabled, userIds: [...selected].sort((a, b) => a - b) })"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Check v-else :size="16" />{{ saving ? '保存中' : '保存设置' }}</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prompt-backdrop{position:fixed;z-index:150;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.28);backdrop-filter:blur(10px);place-items:center}.prompt-dialog{display:flex;width:min(660px,100%);max-height:min(760px,calc(100vh - 48px));flex-direction:column;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:white;box-shadow:0 25px 70px rgba(28,42,62,.25)}.prompt-dialog>header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px 20px;border-bottom:1px solid var(--border-subtle)}.prompt-dialog>header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e9f0ff;color:var(--accent);place-items:center}.prompt-dialog h2{margin:0;font-size:17px}.prompt-dialog header p{margin:3px 0 0;color:var(--text-tertiary);font-size:11px}.prompt-dialog header button{border:0;background:transparent;color:var(--text-tertiary)}.prompt-body{overflow:auto;padding:18px 20px}.capture-setting{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px;border:1px solid var(--border-subtle);border-radius:7px;background:#f8faff}.capture-setting strong{font-size:13px}.capture-setting p,.viewer-heading p{margin:4px 0 0;color:var(--text-tertiary);font-size:10px;line-height:1.5}.capture-setting>button{position:relative;width:42px;height:24px;flex:none;padding:0;border:0;border-radius:14px;background:#cfd6df;transition:background 160ms}.capture-setting>button i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;box-shadow:0 1px 4px rgba(0,0,0,.18);transition:transform 160ms}.capture-setting>button.enabled{background:var(--accent)}.capture-setting>button.enabled i{transform:translateX(18px)}.capture-rules{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.capture-rules span{padding:4px 7px;border-radius:5px;background:#eef2f7;color:var(--text-secondary);font-size:9px}.viewer-section{margin-top:18px}.viewer-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.viewer-heading h3{margin:0;font-size:13px}.viewer-heading>span{color:var(--text-tertiary);font-size:10px}.viewer-search{display:flex;height:36px;align-items:center;gap:7px;margin-top:10px;padding-left:10px;border:1px solid var(--border-subtle);border-radius:6px}.viewer-search input{min-width:0;flex:1;border:0;outline:0;font:inherit;font-size:11px}.viewer-search button{align-self:stretch;padding:0 12px;border:0;border-left:1px solid var(--border-subtle);background:#f7f9fc;color:var(--accent);font-size:10px}.viewer-list{display:grid;max-height:280px;margin-top:9px;overflow:auto;border:1px solid var(--border-subtle);border-radius:7px}.viewer-list>button{display:grid;min-height:56px;grid-template-columns:34px minmax(0,1fr) 20px;align-items:center;gap:9px;padding:8px 11px;border:0;border-bottom:1px solid var(--border-subtle);background:white;text-align:left}.viewer-list>button:last-of-type{border-bottom:0}.viewer-list>button:hover{background:#f8faff}.viewer-list>button.selected{background:#f2f6ff}.viewer-list :deep(.user-avatar){width:32px;height:32px}.viewer-list button>span{display:grid;min-width:0;gap:2px}.viewer-list strong,.viewer-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.viewer-list strong{font-size:11px}.viewer-list small{color:var(--text-tertiary);font-size:9px}.viewer-list button>i{display:grid;width:18px;height:18px;border:1px solid #cfd7e2;border-radius:5px;color:transparent;place-items:center}.viewer-list button.selected>i{border-color:var(--accent);background:var(--accent);color:white}.viewer-loading{display:grid;gap:1px;margin-top:9px;overflow:hidden;border-radius:7px}.viewer-loading i{height:56px;background:var(--skeleton);animation:pulse 1.2s infinite}.viewer-empty{display:grid;min-height:100px;margin:0;color:var(--text-tertiary);font-size:11px;place-items:center}.prompt-error{margin:9px 0 0;color:var(--danger);font-size:11px}.prompt-dialog>footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border-subtle);background:#f7f9fc}.prompt-dialog>footer button{display:flex;height:35px;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.prompt-dialog>footer .save{border-color:var(--accent);background:var(--accent);color:white}.prompt-dialog button:disabled{opacity:.5}.prompt-dialog-enter-active,.prompt-dialog-leave-active{transition:opacity 180ms}.prompt-dialog-enter-from,.prompt-dialog-leave-to{opacity:0}@media(max-width:600px){.prompt-backdrop{padding:12px}.prompt-dialog{max-height:calc(100vh - 24px)}.viewer-heading{align-items:flex-start;flex-direction:column;gap:4px}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
