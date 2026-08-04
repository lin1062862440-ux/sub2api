<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  CirclePlus,
  Coins,
  Layers3,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRound,
  UsersRound,
} from '@lucide/vue'

import { getAdminGroups, getAdminUser, listAdminUsers, updateAdminUser } from '@/api/admin/users'
import type { AdminGroupOption, AdminUser, AdminUserListResponse } from '@/api/admin/types'
import UserAvatar from '@/components/UserAvatar.vue'
import UserBalanceDialog from '@/components/admin/UserBalanceDialog.vue'
import UserDeleteDialog from '@/components/admin/UserDeleteDialog.vue'
import UserDetailDrawer from '@/components/admin/UserDetailDrawer.vue'
import UserEditorDialog from '@/components/admin/UserEditorDialog.vue'
import UserGroupsDialog from '@/components/admin/UserGroupsDialog.vue'
import { formatCost, formatDateTime } from '@/lib/format'
import { toast } from '@/stores/toast'

const result = ref<AdminUserListResponse>({ items: [], total: 0, page: 1, page_size: 20 })
const groups = ref<AdminGroupOption[]>([])
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const pending = ref(0)
const filters = reactive({ search: '', status: '' as '' | 'active' | 'disabled', role: '' as '' | 'admin' | 'user' })
const editorOpen = ref(false)
const editingUser = ref<AdminUser | null>(null)
const selectedUser = ref<AdminUser | null>(null)
const deletingUser = ref<AdminUser | null>(null)
const balanceUser = ref<AdminUser | null>(null)
const groupsUser = ref<AdminUser | null>(null)

const activeCount = computed(() => result.value.items.filter(user => user.status === 'active').length)
const adminCount = computed(() => result.value.items.filter(user => user.role === 'admin').length)
const subscribedCount = computed(() => result.value.items.filter(user => user.subscriptions?.some(item => item.status === 'active')).length)
const pageCount = computed(() => Math.max(1, Math.ceil(result.value.total / result.value.page_size)))
const visiblePages = computed(() => {
  if (pageCount.value <= 7) return Array.from({ length: pageCount.value }, (_, index) => index + 1)
  const pages = new Set([1, pageCount.value])
  for (let page = result.value.page - 2; page <= result.value.page + 2; page += 1) {
    if (page > 1 && page < pageCount.value) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
})

async function load(background = false) {
  if (background) refreshing.value = true
  else loading.value = true
  loadError.value = ''
  const [usersResult, groupsResult] = await Promise.allSettled([
    listAdminUsers({
      page: result.value.page,
      page_size: result.value.page_size,
      search: filters.search.trim() || undefined,
      status: filters.status || undefined,
      role: filters.role || undefined,
    }),
    getAdminGroups(),
  ])
  if (usersResult.status === 'fulfilled') result.value = usersResult.value
  else loadError.value = usersResult.reason instanceof Error ? usersResult.reason.message : '用户列表加载失败'
  if (groupsResult.status === 'fulfilled') groups.value = groupsResult.value
  loading.value = false
  refreshing.value = false
}

function submitFilters() {
  result.value.page = 1
  void load(true)
}

function replaceUser(user: AdminUser) {
  result.value.items = result.value.items.map(item => item.id === user.id ? { ...item, ...user } : item)
  if (selectedUser.value?.id === user.id) selectedUser.value = { ...selectedUser.value, ...user }
  if (balanceUser.value?.id === user.id) balanceUser.value = { ...balanceUser.value, ...user }
  if (groupsUser.value?.id === user.id) groupsUser.value = { ...groupsUser.value, ...user }
}

async function toggleStatus(user: AdminUser) {
  if (pending.value) return
  pending.value = user.id
  try {
    replaceUser(await updateAdminUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }))
    toast.success(`${user.username} 状态已更新`)
  } catch (caught) {
    toast.error('状态更新失败', { detail: caught instanceof Error ? caught.message : undefined })
  } finally {
    pending.value = 0
  }
}

async function openDetail(user: AdminUser) {
  selectedUser.value = user
  try {
    selectedUser.value = await getAdminUser(user.id)
  } catch {
    toast.warning('用户详情暂时无法更新', { detail: '已展示列表中的缓存数据。' })
  }
}

function openCreate() {
  editingUser.value = null
  editorOpen.value = true
}

function openEdit(user: AdminUser) {
  editingUser.value = user
  editorOpen.value = true
}

function handleSaved(user: AdminUser) {
  if (result.value.items.some(item => item.id === user.id)) replaceUser(user)
  else void load(true)
}

function handleBalanceUpdated(user: AdminUser) {
  replaceUser(user)
  toast.success(`${user.username} 的余额已更新`)
}

function handleGroupsUpdated(user: AdminUser) {
  replaceUser(user)
  toast.success(`${user.username} 的分组已更新`)
}

function handleDeleted(id: number) {
  result.value.items = result.value.items.filter(item => item.id !== id)
  result.value.total = Math.max(0, result.value.total - 1)
  if (selectedUser.value?.id === id) selectedUser.value = null
}

function groupNames(user: AdminUser) {
  if (user.allowed_groups === null) return ['全部公共分组']
  const names = user.allowed_groups.map(id => groups.value.find(group => group.id === id)?.name).filter(Boolean) as string[]
  return names.length ? names : ['无专属分组']
}

function changePage(page: number) {
  if (page < 1 || page > pageCount.value || page === result.value.page) return
  result.value.page = page
  void load(true)
}

function changePageSize(event: Event) {
  result.value.page_size = Number((event.target as HTMLSelectElement).value)
  result.value.page = 1
  void load(true)
}

onMounted(() => void load())
</script>

<template>
  <div class="users-page">
    <header class="page-header drag-region"><div><span>USER OPERATIONS</span><h1>用户管理</h1><p>身份资料、余额与分组权限分别管理，操作边界更清晰。</p></div><button class="primary no-drag" type="button" data-testid="create-user" @click="openCreate"><CirclePlus :size="17" />新增用户</button></header>
    <section class="summary"><div data-testid="user-total"><UsersRound :size="18" /><span>用户总数</span><strong>{{ result.total }}</strong></div><div data-testid="user-active"><UserCheck :size="18" /><span>当前页启用</span><strong>{{ activeCount }}</strong></div><div><ShieldCheck :size="18" /><span>管理员</span><strong>{{ adminCount }}</strong></div><div><UserRound :size="18" /><span>有效订阅</span><strong>{{ subscribedCount }}</strong></div></section>
    <form class="filters" data-testid="user-filters" @submit.prevent="submitFilters"><label class="search"><Search :size="16" /><input v-model="filters.search" data-testid="user-search" placeholder="搜索用户名或邮箱" /></label><select v-model="filters.status" data-testid="user-status-filter"><option value="">全部状态</option><option value="active">启用</option><option value="disabled">停用</option></select><select v-model="filters.role"><option value="">全部角色</option><option value="user">普通用户</option><option value="admin">管理员</option></select><button type="submit">应用筛选</button><button class="refresh" type="button" title="刷新用户" :disabled="refreshing" @click="load(true)"><RefreshCw :size="16" :class="{ spinning: refreshing }" /></button></form>
    <section class="table-wrap">
      <div v-if="loading" class="loading"><i v-for="n in 7" :key="n" /></div>
      <div v-else-if="loadError" class="empty"><strong>用户列表加载失败</strong><span>{{ loadError }}</span><button type="button" @click="load()">重试</button></div>
      <div v-else-if="!result.items.length" class="empty"><strong>没有符合条件的用户</strong><span>调整筛选条件或新增用户。</span></div>
      <div v-else class="table">
        <div class="row head"><span>用户</span><span>余额</span><span>分组</span><span>订阅</span><span>状态</span><span>最近活跃</span><span>操作</span></div>
        <article v-for="user in result.items" :key="user.id" class="row">
          <div class="identity"><UserAvatar :name="user.username" :src="user.avatar_url" /><button type="button" :data-testid="`user-name-${user.id}`" @click="openDetail(user)"><strong>{{ user.username }}</strong><span>{{ user.email }} · 并发 {{ user.current_concurrency ?? 0 }} / {{ user.concurrency }}</span></button></div>
          <div class="balance"><strong>{{ formatCost(user.balance) }}</strong><span v-if="user.frozen_balance">冻结 {{ formatCost(user.frozen_balance) }}</span></div>
          <div class="groups"><span v-for="name in groupNames(user).slice(0, 2)" :key="name">{{ name }}</span></div>
          <span class="subscription" :class="{ active: user.subscriptions?.some(item => item.status === 'active') }">{{ user.subscriptions?.some(item => item.status === 'active') ? '有效订阅' : '无订阅' }}</span>
          <button class="status" :class="user.status" type="button" :data-testid="`toggle-user-${user.id}`" :disabled="pending === user.id" @click="toggleStatus(user)"><i />{{ user.status === 'active' ? '启用' : '停用' }}</button>
          <span class="date">{{ formatDateTime(user.last_active_at ?? user.last_used_at) }}</span>
          <div class="actions"><button type="button" title="调整余额" :data-testid="`balance-user-${user.id}`" @click="balanceUser = user"><Coins :size="15" /></button><button type="button" title="用户分组" :data-testid="`groups-user-${user.id}`" @click="groupsUser = user"><Layers3 :size="15" /></button><button type="button" title="编辑用户" @click="openEdit(user)"><Pencil :size="15" /></button><button class="danger" type="button" title="删除用户" :data-testid="`delete-user-${user.id}`" @click="deletingUser = user"><Trash2 :size="15" /></button></div>
        </article>
      </div>
    </section>

    <footer v-if="result.total > result.page_size" class="pagination">
      <div class="page-size"><span>每页</span><select :value="result.page_size" data-testid="user-page-size" @change="changePageSize"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><span>条，共 {{ result.total }} 条</span></div>
      <nav aria-label="用户分页"><button type="button" title="上一页" :disabled="result.page <= 1" @click="changePage(result.page - 1)">上一页</button><template v-for="(page, index) in visiblePages" :key="page"><span v-if="index > 0 && page - visiblePages[index - 1]! > 1">...</span><button type="button" :class="{ current: page === result.page }" :data-testid="`user-page-${page}`" :aria-current="page === result.page ? 'page' : undefined" @click="changePage(page)">{{ page }}</button></template><button type="button" title="下一页" :disabled="result.page >= pageCount" @click="changePage(result.page + 1)">下一页</button></nav>
    </footer>

    <UserEditorDialog v-model="editorOpen" :user="editingUser" @saved="handleSaved" />
    <UserBalanceDialog :user="balanceUser" @close="balanceUser = null" @updated="handleBalanceUpdated" />
    <UserGroupsDialog :user="groupsUser" :groups="groups" @close="groupsUser = null" @updated="handleGroupsUpdated" />
    <UserDetailDrawer :user="selectedUser" @close="selectedUser = null" @updated="replaceUser" />
    <UserDeleteDialog :user="deletingUser" @close="deletingUser = null" @deleted="handleDeleted" />
  </div>
</template>

<style scoped>
.users-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto;color:var(--text-primary)}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.page-header h1{font-size:25px}.page-header p{margin-top:7px;color:var(--text-secondary);font-size:14px}.primary,.filters button{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:0;border-radius:7px;background:var(--accent);color:white;font-weight:620}.summary{display:grid;grid-template-columns:repeat(4,1fr);margin-top:20px;overflow:hidden;background:rgba(255,255,255,.76);border:1px solid rgba(205,216,231,.92);border-radius:8px}.summary>div{display:grid;min-height:72px;grid-template-columns:25px 1fr auto;align-items:center;gap:7px;padding:0 17px;border-right:1px solid var(--border-subtle)}.summary>div:last-child{border-right:0}.summary svg{color:var(--accent)}.summary span{color:var(--text-secondary);font-size:12px}.summary strong{font-family:var(--font-data);font-size:20px}.filters{display:flex;gap:8px;margin-top:13px}.filters label,.filters select{height:38px;border:1px solid var(--border-subtle);border-radius:7px;background:rgba(255,255,255,.75)}.filters label{display:flex;align-items:center;gap:7px;padding:0 11px;color:var(--text-tertiary)}.filters .search{min-width:240px;flex:1}.filters input{width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:13px}.filters select{min-width:110px;padding:0 9px;color:var(--text-primary)}.filters .refresh{width:38px;padding:0;justify-content:center;background:white;border:1px solid var(--border-subtle);color:var(--text-secondary)}.message{margin:10px 0 -1px;padding:8px 11px;background:#edf5ff;border:1px solid #d3e3f8;border-radius:7px;color:#3f67a2;font-size:12px}.table-wrap{min-height:300px;margin-top:13px;overflow:hidden;background:rgba(255,255,255,.8);border:1px solid rgba(205,216,231,.92);border-radius:8px}.table{min-width:900px}.row{display:grid;min-height:68px;grid-template-columns:minmax(220px,1.45fr) 92px minmax(115px,.8fr) 70px 62px 116px 142px;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid rgba(222,228,237,.82);font-size:11px;animation:row-in 360ms var(--motion-ease-out) both}.row:last-child{border-bottom:0}.head{min-height:42px;background:rgba(245,248,252,.8);color:var(--text-tertiary);font-weight:650;animation:none}.identity{display:grid;min-width:0;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px}.identity :deep(.user-avatar){width:34px!important;height:34px!important}.identity button{display:grid;min-width:0;padding:0;border:0;background:transparent;text-align:left}.identity strong,.identity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity strong{font-size:12px}.identity span{margin-top:3px;color:var(--text-tertiary);font-size:10px}.balance{display:grid;gap:3px}.balance strong{font-family:var(--font-data);font-size:11px}.balance span{color:var(--text-tertiary);font-size:9px}.groups{display:flex;min-width:0;flex-wrap:wrap;gap:4px}.groups span{max-width:100%;padding:3px 5px;overflow:hidden;background:#edf3ff;border-radius:4px;color:#456ba6;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.subscription{width:max-content;padding:4px 6px;background:#f0f2f5;border-radius:5px;color:var(--text-tertiary);font-size:9px}.subscription.active{background:#eaf8f1;color:#277a58}.status{display:flex;width:max-content;align-items:center;gap:5px;padding:4px 7px;border:0;border-radius:5px;background:#eaf8f1;color:#277a58;font-size:9px}.status i{width:6px;height:6px;border-radius:50%;background:currentColor}.status.disabled{background:#eff2f5;color:#737d89}.date{color:var(--text-tertiary);font-family:var(--font-data);font-size:9px}.actions{display:flex;gap:4px}.actions button{display:grid;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}.actions button:hover{background:var(--bg-base);border-color:var(--border-subtle);color:var(--accent)}.actions .danger:hover{color:#b4483a}.loading{display:grid;gap:10px;padding:20px}.loading i{height:46px;background:linear-gradient(90deg,#edf1f5 25%,#fafbfd 45%,#edf1f5 65%);background-size:240% 100%;border-radius:6px;animation:shimmer 1.15s linear infinite}.empty{display:grid;min-height:300px;place-content:center;justify-items:center;gap:7px;color:var(--text-tertiary)}.empty strong{color:var(--text-primary)}.empty button{margin-top:5px;padding:7px 11px;border:0;border-radius:6px;background:var(--accent);color:white}.pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:13px}.page-size,.pagination nav{display:flex;align-items:center;gap:6px;color:var(--text-tertiary);font-size:11px}.page-size select{height:31px;padding:0 7px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary)}.pagination nav button{min-width:31px;height:31px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:11px}.pagination nav button.current{border-color:var(--accent);background:var(--accent);color:white}.pagination button:disabled{opacity:.45}.spinning{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-240% 0}}@keyframes row-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@container app-content (max-width:960px){.users-page{padding:24px}.summary{grid-template-columns:repeat(2,1fr)}.summary>div:nth-child(2){border-right:0}.summary>div:nth-child(-n+2){border-bottom:1px solid var(--border-subtle)}.filters{flex-wrap:wrap}.filters .search{flex-basis:100%}.table-wrap{overflow-x:auto}.pagination{align-items:flex-start;flex-direction:column}.pagination nav{flex-wrap:wrap}}
@container app-content (max-width:720px){.page-header{align-items:flex-start;flex-direction:column}.primary{width:100%;justify-content:center}.filters select{flex:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;transform:none!important}}
</style>
