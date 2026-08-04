<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Boxes,
  CheckCircle2,
  Gauge,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from '@lucide/vue'

import {
  createAdminGroup,
  listAdminGroups,
  updateAdminGroup,
  updateAdminGroupStatus,
} from '@/api/admin/groups'
import type {
  AdminGroup,
  AdminGroupPlatform,
  CreateAdminGroupRequest,
} from '@/api/admin/types'
import GroupEditorDialog from '@/components/admin/GroupEditorDialog.vue'
import { toast } from '@/stores/toast'

const groups = ref<AdminGroup[]>([])
const loading = ref(true)
const error = ref('')
const editorError = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const editorOpen = ref(false)
const editingGroup = ref<AdminGroup | null>(null)
const saving = ref(false)
const statusTarget = ref<AdminGroup | null>(null)
const statusPending = ref(false)

const filters = reactive<{
  search: string
  platform: '' | AdminGroupPlatform
  status: '' | 'active' | 'inactive'
}>({ search: '', platform: '', status: '' })

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageNumbers = computed(() => {
  const start = Math.max(1, Math.min(page.value - 2, pageCount.value - 4))
  const end = Math.min(pageCount.value, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
const activeOnPage = computed(() => groups.value.filter((group) => group.status === 'active').length)
const subscriptionOnPage = computed(() => groups.value.filter((group) => group.subscription_type === 'subscription').length)

const platformLabels: Record<AdminGroupPlatform, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  composite: '聚合平台',
}

async function loadGroups() {
  loading.value = true
  error.value = ''
  try {
    const response = await listAdminGroups({
      page: page.value,
      page_size: pageSize.value,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    })
    groups.value = response.items
    total.value = response.total
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取分组列表'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  void loadGroups()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return
  page.value = nextPage
  void loadGroups()
}

function changePageSize() {
  page.value = 1
  void loadGroups()
}

function openCreate() {
  editingGroup.value = null
  editorError.value = ''
  editorOpen.value = true
}

function openEdit(group: AdminGroup) {
  editingGroup.value = group
  editorError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editingGroup.value = null
}

async function saveGroup(payload: CreateAdminGroupRequest) {
  saving.value = true
  editorError.value = ''
  try {
    if (editingGroup.value) {
      await updateAdminGroup(editingGroup.value.id, payload)
      toast.success(`已更新分组“${payload.name}”`)
    } else {
      await createAdminGroup(payload)
      toast.success(`已创建分组“${payload.name}”`)
    }
    editorOpen.value = false
    editingGroup.value = null
    await loadGroups()
  } catch (cause) {
    editorError.value = cause instanceof Error ? cause.message : '保存分组失败'
  } finally {
    saving.value = false
  }
}

function requestStatusChange(group: AdminGroup) {
  statusTarget.value = group
}

async function confirmStatusChange() {
  const group = statusTarget.value
  if (!group) return
  const nextStatus = group.status === 'active' ? 'inactive' : 'active'
  statusPending.value = true
  try {
    await updateAdminGroupStatus(group.id, nextStatus)
    toast.success(nextStatus === 'active' ? `已启用分组“${group.name}”` : `已停用分组“${group.name}”`)
    statusTarget.value = null
    await loadGroups()
  } catch (cause) {
    toast.error('更新分组状态失败', { detail: cause instanceof Error ? cause.message : undefined })
  } finally {
    statusPending.value = false
  }
}

function formatQuota(value: number | null) {
  return value == null ? '不限' : `$${value.toFixed(2)}`
}

onMounted(loadGroups)
</script>

<template>
  <div class="groups-page">
    <header class="page-header">
      <div>
        <span>ACCESS & BILLING</span>
        <h1>分组管理</h1>
        <p>维护平台分组、计费策略和订阅额度</p>
      </div>
      <button class="primary" type="button" data-testid="create-group" @click="openCreate"><Plus :size="16" />新增分组</button>
    </header>

    <section class="summary" aria-label="分组概览">
      <div><span>分组总数</span><strong>{{ total }}</strong><Boxes :size="17" /></div>
      <div><span>本页启用</span><strong>{{ activeOnPage }}</strong><CheckCircle2 :size="17" /></div>
      <div><span>本页订阅组</span><strong>{{ subscriptionOnPage }}</strong><ShieldCheck :size="17" /></div>
    </section>

    <form class="toolbar" data-testid="group-filters" @submit.prevent="applyFilters">
      <label class="search-field"><Search :size="15" /><input v-model="filters.search" data-testid="group-search" placeholder="搜索分组名称或描述" /></label>
      <select v-model="filters.platform" data-testid="group-platform-filter" aria-label="平台">
        <option value="">全部平台</option>
        <option v-for="(label, value) in platformLabels" :key="value" :value="value">{{ label }}</option>
      </select>
      <select v-model="filters.status" data-testid="group-status-filter" aria-label="状态">
        <option value="">全部状态</option><option value="active">已启用</option><option value="inactive">已停用</option>
      </select>
      <button type="submit">筛选</button>
      <button class="refresh" type="button" data-testid="refresh-groups" title="刷新" aria-label="刷新" @click="loadGroups"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
    </form>


    <div v-if="loading" class="loading" aria-label="正在加载"><i v-for="index in 4" :key="index" /></div>
    <section v-else-if="error" class="empty error-state">
      <X :size="22" /><strong>分组列表加载失败</strong><span>{{ error }}</span>
      <button type="button" data-testid="retry-groups" @click="loadGroups">重新加载</button>
    </section>
    <section v-else-if="groups.length === 0" class="empty">
      <Boxes :size="24" /><strong>暂无分组</strong><span>调整筛选条件或创建第一个分组</span>
      <button type="button" @click="openCreate">新增分组</button>
    </section>

    <section v-else class="group-grid" aria-label="分组列表">
      <article v-for="group in groups" :key="group.id" class="group-card" :data-platform="group.platform">
        <header>
          <div class="identity">
            <span class="platform-mark">{{ platformLabels[group.platform] }}</span>
            <strong>{{ group.name }}</strong>
            <p>{{ group.description || '暂无描述' }}</p>
          </div>
          <span class="status" :class="group.status">{{ group.status === 'active' ? '已启用' : '已停用' }}</span>
        </header>

        <div class="policy-row">
          <span>{{ group.subscription_type === 'subscription' ? '订阅额度' : '余额消费' }}</span>
          <span v-if="group.is_exclusive">专属</span>
          <span>倍率 {{ group.rate_multiplier.toFixed(2) }}x</span>
          <span>RPM {{ group.rpm_limit || '不限' }}</span>
        </div>

        <div class="quota-row" aria-label="额度窗口">
          <div><span>日额度</span><strong>{{ formatQuota(group.daily_limit_usd) }}</strong></div>
          <div><span>周额度</span><strong>{{ formatQuota(group.weekly_limit_usd) }}</strong></div>
          <div><span>月额度</span><strong>{{ formatQuota(group.monthly_limit_usd) }}</strong></div>
        </div>

        <footer>
          <span><Gauge :size="13" />{{ group.active_account_count ?? 0 }} / {{ group.account_count ?? 0 }} 个账号可用</span>
          <div>
            <button type="button" :data-testid="`edit-group-${group.id}`" title="编辑分组" aria-label="编辑分组" @click="openEdit(group)"><Pencil :size="15" /></button>
            <button type="button" :data-testid="`toggle-group-${group.id}`" :title="group.status === 'active' ? '停用分组' : '启用分组'" :aria-label="group.status === 'active' ? '停用分组' : '启用分组'" @click="requestStatusChange(group)"><Power :size="15" /></button>
          </div>
        </footer>
      </article>
    </section>

    <footer v-if="!loading && !error && total > 0" class="pagination">
      <div><span>共 {{ total }} 条</span><select v-model.number="pageSize" data-testid="group-page-size" aria-label="每页条数" @change="changePageSize"><option :value="20">20 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select></div>
      <nav aria-label="分页">
        <button type="button" :disabled="page === 1" @click="changePage(page - 1)">上一页</button>
        <button v-for="number in pageNumbers" :key="number" type="button" :class="{ current: number === page }" :data-testid="`group-page-${number}`" @click="changePage(number)">{{ number }}</button>
        <button type="button" :disabled="page === pageCount" @click="changePage(page + 1)">下一页</button>
      </nav>
    </footer>

    <GroupEditorDialog :model-value="editorOpen" :group="editingGroup" :pending="saving" :error="editorError" @close="closeEditor" @save="saveGroup" />

    <Transition name="fade">
      <div v-if="statusTarget" class="dialog-backdrop" @mousedown.self="statusTarget = null">
        <section class="status-dialog" data-testid="group-status-dialog" role="dialog" aria-modal="true">
          <header><span><Power :size="19" /></span><div><h2>{{ statusTarget.status === 'active' ? '停用分组' : '启用分组' }}</h2><p>{{ statusTarget.name }}</p></div></header>
          <p v-if="statusTarget.status === 'active'">停用后，该分组将不再参与新的请求调度。已有配置会被保留。</p>
          <p v-else>启用后，该分组将恢复参与请求调度。</p>
          <footer><button type="button" @click="statusTarget = null">取消</button><button class="confirm" type="button" data-testid="confirm-group-status" :disabled="statusPending" @click="confirmStatusChange">{{ statusPending ? '处理中' : '确认操作' }}</button></footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.groups-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.page-header h1{font-size:25px}.page-header p{margin-top:7px;color:var(--text-secondary);font-size:14px}.primary,.toolbar button{display:flex;height:36px;align-items:center;justify-content:center;gap:7px;padding:0 13px;border:0;border-radius:7px;background:var(--accent);color:#fff}.summary{display:grid;grid-template-columns:repeat(3,1fr);margin-top:20px;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle)}.summary>div{display:grid;grid-template-columns:1fr auto 20px;min-height:62px;align-items:center;gap:9px;padding:0 18px;border-right:1px solid var(--border-subtle)}.summary>div:last-child{border:0}.summary span{color:var(--text-secondary);font-size:11px}.summary strong{font-family:var(--font-data);font-size:19px}.summary svg{color:var(--text-tertiary)}.toolbar{display:flex;gap:8px;margin-top:14px}.search-field{display:flex;min-width:260px;flex:1;align-items:center;gap:8px;height:38px;padding:0 11px;border:1px solid var(--border-subtle);border-radius:7px;background:#fff;color:var(--text-tertiary)}.search-field input{width:100%;border:0;outline:0;background:transparent;font-size:12px}.toolbar select{height:38px;min-width:128px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:7px;background:#fff}.toolbar .refresh{width:38px;padding:0;border:1px solid var(--border-subtle);background:#fff;color:var(--text-secondary)}.message{margin-top:10px;padding:8px 11px;border:1px solid #d3e3f8;border-radius:7px;background:#edf5ff;color:#3f67a2;font-size:12px}.group-grid,.loading{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:13px}.group-card{position:relative;display:flex;min-height:238px;overflow:hidden;flex-direction:column;padding:17px 18px;background:rgba(255,255,255,.86);border:1px solid var(--border-subtle);border-radius:8px;box-shadow:0 6px 18px rgba(31,51,78,.035)}.group-card::before{position:absolute;top:0;bottom:0;left:0;width:3px;background:#8093ad;content:""}.group-card[data-platform=openai]::before{background:#4d8375}.group-card[data-platform=anthropic]::before{background:#b56a55}.group-card[data-platform=gemini]::before{background:#557bc2}.group-card[data-platform=antigravity]::before{background:#7a6bad}.group-card[data-platform=grok]::before{background:#515a67}.group-card>header{display:flex;justify-content:space-between;gap:12px}.identity{display:grid;min-width:0;gap:4px}.platform-mark{color:var(--accent);font-size:9px;font-weight:740;text-transform:uppercase}.identity strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.identity p{overflow:hidden;color:var(--text-tertiary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.status{height:max-content;padding:4px 7px;border-radius:5px;background:#eaf8f1;color:#277a58;font-size:10px}.status.inactive{background:#eef1f5;color:#737d89}.policy-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:15px}.policy-row span{padding:4px 7px;border:1px solid #e1e6ed;border-radius:5px;background:#f8fafc;color:var(--text-secondary);font-size:9px}.quota-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:13px}.quota-row>div{display:grid;gap:5px;padding:10px;background:var(--bg-base);border-radius:7px}.quota-row span{color:var(--text-tertiary);font-size:9px}.quota-row strong{font-family:var(--font-data);font-size:11px}.group-card>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:15px}.group-card footer>span{display:flex;align-items:center;gap:5px;color:var(--text-tertiary);font-size:9px}.group-card footer>div{display:flex;gap:5px}.group-card footer button{display:grid;width:30px;height:30px;border:1px solid var(--border-subtle);border-radius:6px;background:#fff;color:var(--text-secondary);place-items:center}.loading i{height:238px;border-radius:8px;background:linear-gradient(90deg,#edf1f5 25%,#fafbfd 45%,#edf1f5 65%);background-size:240% 100%;animation:shimmer 1.15s linear infinite}.empty{display:grid;min-height:280px;margin-top:13px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:8px}.empty strong{color:var(--text-primary)}.empty span{font-size:11px}.empty button{height:34px;padding:0 12px;border:0;border-radius:7px;background:var(--accent);color:#fff}.pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px}.pagination>div,.pagination nav{display:flex;align-items:center;gap:6px;color:var(--text-tertiary);font-size:11px}.pagination select{height:31px;padding:0 7px;border:1px solid var(--border-subtle);border-radius:6px;background:#fff}.pagination nav button{min-width:31px;height:31px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:#fff;color:var(--text-secondary);font-size:11px}.pagination nav button.current{border-color:var(--accent);background:var(--accent);color:#fff}.pagination nav button:disabled{opacity:.45}.dialog-backdrop{position:fixed;z-index:145;inset:0;display:grid;padding:24px;background:rgba(25,37,54,.25);backdrop-filter:blur(10px);place-items:center}.status-dialog{width:min(420px,100%);overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:#fff;box-shadow:0 28px 76px rgba(29,44,65,.25)}.status-dialog>header{display:grid;grid-template-columns:42px 1fr;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}.status-dialog header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e9f0ff;color:var(--accent);place-items:center}.status-dialog h2{font-size:17px}.status-dialog header p{margin-top:3px;color:var(--text-tertiary);font-size:11px}.status-dialog>p{padding:18px;color:var(--text-secondary);font-size:12px;line-height:1.6}.status-dialog>footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border-subtle);background:#f7f9fc}.status-dialog footer button{height:35px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:#fff;color:var(--text-secondary)}.status-dialog footer .confirm{border-color:var(--accent);background:var(--accent);color:#fff}.spinning{animation:spin .75s linear infinite}.fade-enter-active,.fade-leave-active{transition:opacity 160ms}.fade-enter-from,.fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-240% 0}}@container app-content (max-width:980px){.groups-page{padding:24px}.group-grid,.loading{grid-template-columns:1fr}.toolbar{flex-wrap:wrap}.search-field{flex-basis:100%}.pagination{align-items:flex-start;flex-direction:column}.pagination nav{flex-wrap:wrap}}@container app-content (max-width:760px){.page-header{align-items:flex-start;flex-direction:column}.primary{width:100%}.summary{grid-template-columns:1fr}.summary>div{border-right:0;border-bottom:1px solid var(--border-subtle)}.toolbar select{flex:1}.quota-row{grid-template-columns:1fr}}
</style>
