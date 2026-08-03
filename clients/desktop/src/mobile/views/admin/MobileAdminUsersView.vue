<script setup lang="ts">
import {
  AlertCircle,
  Check,
  CircleEllipsis,
  Coins,
  Eye,
  Filter,
  Layers3,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
} from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

import { getAdminGroups, getAdminUser, listAdminUsers, updateAdminUser } from '@/api/admin/users'
import type { AdminGroupOption, AdminUser, AdminUserListParams, AdminUserListResponse } from '@/api/admin/types'
import UserAvatar from '@/components/UserAvatar.vue'
import UserBalanceDialog from '@/components/admin/UserBalanceDialog.vue'
import UserDeleteDialog from '@/components/admin/UserDeleteDialog.vue'
import UserDetailDrawer from '@/components/admin/UserDetailDrawer.vue'
import UserEditorDialog from '@/components/admin/UserEditorDialog.vue'
import UserGroupsDialog from '@/components/admin/UserGroupsDialog.vue'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'

const PAGE_SIZE = 20

const result = ref<AdminUserListResponse>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE })
const groups = ref<AdminGroupOption[]>([])
const groupsLoading = ref(false)
const groupsError = ref('')
const loaded = ref(false)
const initialLoading = ref(true)
const listLoading = ref(false)
const fatalError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const syncRetryPage = ref<number | null>(null)
const searchDraft = ref('')
const search = ref('')
const status = ref<'' | AdminUser['status']>('')
const role = ref<'' | AdminUser['role']>('')
const draftStatus = ref<'' | AdminUser['status']>('')
const draftRole = ref<'' | AdminUser['role']>('')
const filterSheetOpen = ref(false)
const openMenuId = ref<number | null>(null)
const editorOpen = ref(false)
const editingUser = ref<AdminUser | null>(null)
const detailUser = ref<AdminUser | null>(null)
const balanceUser = ref<AdminUser | null>(null)
const groupsUser = ref<AdminUser | null>(null)
const deletingUser = ref<AdminUser | null>(null)
const statusTarget = ref<AdminUser | null>(null)
const statusDialog = ref<HTMLElement | null>(null)
const pendingByUser = reactive<Record<number, string>>({})
let mounted = false
let loadGeneration = 0
let groupGeneration = 0
let detailGeneration = 0
let feedbackGeneration = 0
let statusPreviousFocus: HTMLElement | null = null

const pageCount = computed(() => Math.max(1, Math.ceil(safeNonNegative(result.value.total) / PAGE_SIZE)))
const busy = computed(() => initialLoading.value || listLoading.value || Object.keys(pendingByUser).length > 0)
const activeFilterCount = computed(() => Number(Boolean(status.value)) + Number(Boolean(role.value)))

function safeNonNegative(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function safeInteger(value: unknown, minimum = 0) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= minimum ? parsed : null
}

function safeId(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function safeGroupOptions(value: unknown): AdminGroupOption[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<number>()
  const options: AdminGroupOption[] = []
  for (const item of value) {
    if (
      !item
      || typeof item !== 'object'
      || Array.isArray(item)
      || safeId(item.id) === null
      || typeof item.name !== 'string'
      || !item.name.trim()
      || typeof item.is_exclusive !== 'boolean'
      || (item.platform !== undefined && typeof item.platform !== 'string')
      || (item.status !== undefined && typeof item.status !== 'string')
    ) return null
    if (seen.has(item.id)) continue
    seen.add(item.id)
    options.push({
      id: item.id,
      name: item.name,
      is_exclusive: item.is_exclusive,
      ...(item.platform !== undefined ? { platform: item.platform } : {}),
      ...(item.status !== undefined ? { status: item.status } : {}),
    })
  }
  return options
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return '—'
  if (parsed === 0) return '$0.00'
  return Math.abs(parsed) < 0.01 ? `$${parsed.toFixed(4)}` : `$${parsed.toFixed(2)}`
}

function safeDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  try {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function concurrencyLabel(user: AdminUser) {
  const current = safeInteger(user.current_concurrency)
  const limit = safeInteger(user.concurrency)
  return current === null || limit === null ? '—' : `${current} / ${limit}`
}

function groupCount(user: AdminUser) {
  if (user.allowed_groups === null) return '全部'
  if (!Array.isArray(user.allowed_groups)) return '—'
  return new Set(user.allowed_groups.filter((id) => safeId(id) !== null)).size.toString()
}

function roleLabel(value: unknown) {
  return value === 'admin' ? '管理员' : value === 'user' ? '普通用户' : '未知角色'
}

function statusLabel(value: unknown) {
  return value === 'active' ? '已启用' : value === 'disabled' ? '已停用' : '未知状态'
}

function listParams(page: number): AdminUserListParams {
  return {
    page,
    page_size: PAGE_SIZE,
    ...(search.value ? { search: search.value } : {}),
    ...(status.value ? { status: status.value } : {}),
    ...(role.value ? { role: role.value } : {}),
  }
}

function claimFeedback() {
  const token = ++feedbackGeneration
  actionError.value = ''
  actionMessage.value = ''
  syncRetryPage.value = null
  return token
}

function ownsFeedback(token: number) {
  return mounted && token === feedbackGeneration
}

async function loadUsers(
  targetPage = result.value.page,
  background = loaded.value,
  feedbackToken?: number,
  reportFailure = true,
) {
  const generation = ++loadGeneration
  const requestedPage = Math.min(pageCount.value, Math.max(1, Math.floor(targetPage) || 1))
  if (!loaded.value && !background) initialLoading.value = true
  else listLoading.value = true
  fatalError.value = ''
  try {
    const response = await listAdminUsers(listParams(requestedPage))
    if (!mounted || generation !== loadGeneration) return
    const total = Math.floor(safeNonNegative(response?.total))
    const availablePages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (requestedPage > availablePages) {
      return await loadUsers(availablePages, true, feedbackToken, reportFailure)
    }
    const seen = new Set<number>()
    const items = Array.isArray(response?.items)
      ? response.items.filter((item): item is AdminUser => {
        if (!item || safeId(item.id) === null || seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      : []
    result.value = { items, total, page: requestedPage, page_size: PAGE_SIZE }
    loaded.value = true
    return true
  } catch {
    if (!mounted || generation !== loadGeneration) return
    if (!loaded.value) fatalError.value = '用户列表加载失败，请检查网络后重试。'
    else if (reportFailure && (feedbackToken === undefined || ownsFeedback(feedbackToken))) {
      actionMessage.value = ''
      actionError.value = '用户列表刷新失败，已保留当前数据。'
    }
    return false
  } finally {
    if (mounted && generation === loadGeneration) {
      initialLoading.value = false
      listLoading.value = false
    }
  }
}

async function loadGroups() {
  const generation = ++groupGeneration
  groupsLoading.value = true
  groupsError.value = ''
  try {
    const response = await getAdminGroups()
    if (!mounted || generation !== groupGeneration) return
    const options = safeGroupOptions(response)
    if (!options) throw new Error('invalid groups response')
    groups.value = options
  } catch {
    if (mounted && generation === groupGeneration) {
      groups.value = []
      groupsError.value = '分组列表加载失败，请稍后重试。'
    }
  } finally {
    if (mounted && generation === groupGeneration) groupsLoading.value = false
  }
}

function requestUsersLoad(targetPage: number, background: boolean) {
  const token = claimFeedback()
  void loadUsers(targetPage, background, token, true)
}

function retryUsers() {
  requestUsersLoad(1, false)
}

function refreshUsers() {
  requestUsersLoad(result.value.page, loaded.value)
  void loadGroups()
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  requestUsersLoad(1, loaded.value)
}

function openFilters() {
  draftStatus.value = status.value
  draftRole.value = role.value
  filterSheetOpen.value = true
}

function applyFilters() {
  status.value = draftStatus.value
  role.value = draftRole.value
  filterSheetOpen.value = false
  requestUsersLoad(1, loaded.value)
}

function resetFilters() {
  draftStatus.value = ''
  draftRole.value = ''
  status.value = ''
  role.value = ''
  filterSheetOpen.value = false
  requestUsersLoad(1, loaded.value)
}

function resetEmptyFilters() {
  searchDraft.value = ''
  search.value = ''
  resetFilters()
}

function replaceUser(updated: AdminUser) {
  const id = safeId(updated?.id)
  if (id === null) return
  result.value = {
    ...result.value,
    items: result.value.items.map((item) => item.id === id ? { ...item, ...updated } : item),
  }
  if (detailUser.value?.id === id) detailUser.value = { ...detailUser.value, ...updated }
  if (balanceUser.value?.id === id) balanceUser.value = { ...balanceUser.value, ...updated }
  if (groupsUser.value?.id === id) groupsUser.value = { ...groupsUser.value, ...updated }
}

function closeMenu() {
  openMenuId.value = null
}

function toggleMenu(userId: number) {
  openMenuId.value = openMenuId.value === userId ? null : userId
  if (openMenuId.value !== null) {
    void nextTick(() => {
      document.querySelector<HTMLElement>(`[data-testid="user-menu-${userId}"] button`)?.focus()
    })
  }
}

function focusMenuTrigger(userId: number) {
  document.querySelector<HTMLElement>(`[data-testid="user-menu-trigger-${userId}"]`)?.focus()
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
  replaceUser(user)
  const token = claimFeedback()
  actionMessage.value = `已保存用户“${safeText(user.username, safeText(user.email, '未命名用户'))}”`
  void loadUsers(result.value.page, true, token, false)
}

async function openDetail(user: AdminUser) {
  const generation = ++detailGeneration
  focusMenuTrigger(user.id)
  closeMenu()
  detailUser.value = user
  try {
    const response = await getAdminUser(user.id)
    if (mounted && generation === detailGeneration && detailUser.value?.id === user.id && response?.id === user.id) detailUser.value = response
  } catch {
    if (mounted && generation === detailGeneration && detailUser.value?.id === user.id) {
      const token = claimFeedback()
      if (ownsFeedback(token)) actionError.value = '用户详情暂时无法更新，已展示列表数据。'
    }
  }
}

function closeDetail() {
  detailGeneration += 1
  detailUser.value = null
}

function openBalance(user: AdminUser) {
  focusMenuTrigger(user.id)
  closeMenu()
  balanceUser.value = user
}

function openGroups(user: AdminUser) {
  focusMenuTrigger(user.id)
  closeMenu()
  groupsUser.value = user
}

function openDelete(user: AdminUser) {
  if (user.role === 'admin') return
  focusMenuTrigger(user.id)
  closeMenu()
  deletingUser.value = user
}

function handleBalanceUpdated(user: AdminUser) {
  replaceUser(user)
  const token = claimFeedback()
  actionMessage.value = `已更新“${safeText(user.username, '未命名用户')}”的余额`
  void loadUsers(result.value.page, true, token, false)
}

function handleGroupsUpdated(user: AdminUser) {
  replaceUser(user)
  const token = claimFeedback()
  actionMessage.value = `已更新“${safeText(user.username, '未命名用户')}”的分组`
  void loadUsers(result.value.page, true, token, false)
}

function handleDeleted(id: number) {
  const token = claimFeedback()
  const removedIndex = result.value.items.findIndex((item) => item.id === id)
  const remaining = result.value.items.filter((item) => item.id !== id)
  const focusTarget = remaining[Math.min(Math.max(removedIndex, 0), Math.max(remaining.length - 1, 0))]
  const total = removedIndex >= 0 ? Math.max(0, safeNonNegative(result.value.total) - 1) : safeNonNegative(result.value.total)
  const targetPage = Math.min(result.value.page, Math.max(1, Math.ceil(total / PAGE_SIZE)))
  result.value = {
    ...result.value,
    items: remaining,
    total,
    page: targetPage,
  }
  actionMessage.value = '用户已删除'
  void nextTick(() => {
    const target = focusTarget
      ? document.querySelector<HTMLElement>(`[data-testid="user-menu-trigger-${focusTarget.id}"]`)
      : document.querySelector<HTMLElement>('[data-testid="create-user"]')
    target?.focus()
  })
  void loadUsers(targetPage, true, token, false).then((synced) => {
    if (!synced && ownsFeedback(token)) {
      actionError.value = '用户已删除，但列表同步失败，请重试。'
      syncRetryPage.value = targetPage
    }
  })
}

async function retryDeletedSync() {
  const targetPage = syncRetryPage.value
  if (targetPage === null || listLoading.value) return
  const token = ++feedbackGeneration
  actionError.value = ''
  const synced = await loadUsers(targetPage, true, token, false)
  if (!ownsFeedback(token)) return
  if (synced) syncRetryPage.value = null
  else actionError.value = '用户已删除，但列表同步失败，请重试。'
}

function statusFocusableElements() {
  if (!statusDialog.value) return []
  return Array.from(statusDialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusStatusDialog() {
  await nextTick()
  statusFocusableElements()[0]?.focus()
}

function restoreStatusFocus() {
  const target = statusPreviousFocus
  statusPreviousFocus = null
  if (target) {
    void nextTick(() => {
      if (target.isConnected) target.focus()
    })
  }
}

function requestStatusChange(user: AdminUser) {
  if ((user.role === 'admin' && user.status === 'active') || pendingByUser[user.id]) return
  focusMenuTrigger(user.id)
  statusPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  closeMenu()
  statusTarget.value = user
  void focusStatusDialog()
}

function closeStatusDialog() {
  const user = statusTarget.value
  if (user && pendingByUser[user.id]) return
  statusTarget.value = null
  restoreStatusFocus()
}

async function confirmStatusChange() {
  const user = statusTarget.value
  if (!user || (user.role === 'admin' && user.status === 'active') || pendingByUser[user.id]) return
  const nextStatus: AdminUser['status'] = user.status === 'active' ? 'disabled' : 'active'
  const token = claimFeedback()
  pendingByUser[user.id] = 'status'
  try {
    await updateAdminUser(user.id, { status: nextStatus })
    if (!mounted) return
    replaceUser({ ...user, status: nextStatus })
    if (ownsFeedback(token)) actionMessage.value = `已${nextStatus === 'active' ? '启用' : '停用'}用户“${safeText(user.username, '未命名用户')}”`
    await loadUsers(result.value.page, true, token, false)
  } catch {
    if (ownsFeedback(token)) {
      actionMessage.value = ''
      actionError.value = '操作失败，请稍后重试。当前用户列表未更改。'
    }
  } finally {
    if (mounted) {
      delete pendingByUser[user.id]
      if (statusTarget.value?.id === user.id) closeStatusDialog()
    }
  }
}

function changePage(page: number) {
  if (busy.value || page < 1 || page > pageCount.value || page === result.value.page) return
  requestUsersLoad(page, true)
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (statusTarget.value && statusDialog.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeStatusDialog()
      return
    }
    if (event.key === 'Tab') {
      const elements = statusFocusableElements()
      const first = elements[0]
      const last = elements[elements.length - 1]
      const active = document.activeElement
      const outside = !statusDialog.value.contains(active)
      if (!first || !last) {
        event.preventDefault()
        statusDialog.value.focus()
      } else if (event.shiftKey ? active === first || outside : active === last || outside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
      return
    }
  }
  if (event.key === 'Escape') closeMenu()
}

function handleDocumentPointer(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.menu-owner')) closeMenu()
}

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('pointerdown', handleDocumentPointer)
  void loadUsers(1, false)
  void loadGroups()
})

onUnmounted(() => {
  mounted = false
  loadGeneration += 1
  groupGeneration += 1
  detailGeneration += 1
  restoreStatusFocus()
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointer)
})
</script>

<template>
  <MobilePage
    title="用户管理"
    subtitle="身份、余额与访问范围"
    :aria-busy="busy"
  >
    <template #action>
      <button class="icon-button" type="button" data-testid="refresh-users" aria-label="刷新用户" :disabled="listLoading" @click="refreshUsers"><RefreshCw :size="18" :class="{ spinning: listLoading }" /></button>
      <button class="create-button" type="button" data-testid="create-user" @click="openCreate"><Plus :size="18" />新增</button>
    </template>

    <div class="users-content">
      <form class="search-row" data-testid="user-search-form" @submit.prevent="submitSearch">
        <label><Search :size="17" /><input v-model="searchDraft" data-testid="user-search" autocomplete="off" placeholder="搜索用户名或邮箱" /></label>
        <button type="submit" :disabled="listLoading">搜索</button>
        <button class="filter-button icon-button" type="button" data-testid="user-filter-trigger" aria-label="筛选用户" @click="openFilters"><Filter :size="17" /><span v-if="activeFilterCount">{{ activeFilterCount }}</span></button>
      </form>

      <p v-if="actionMessage" class="action-message" data-testid="user-action-message" role="status"><Check :size="17" />{{ actionMessage }}</p>
      <div v-if="actionError" class="action-error" data-testid="user-action-error" role="alert"><AlertCircle :size="17" /><span>{{ actionError }}</span><button v-if="syncRetryPage !== null" type="button" data-testid="user-sync-retry" :disabled="listLoading" @click="retryDeletedSync">重试</button></div>
      <div v-if="listLoading" class="list-busy" role="status">正在刷新用户</div>

      <div v-if="initialLoading && !loaded" class="list-state" data-testid="user-list-loading" role="status">正在加载用户</div>
      <div v-else-if="fatalError" class="list-state error-state" data-testid="user-list-error" role="alert"><AlertCircle :size="20" /><strong>用户列表加载失败</strong><p>{{ fatalError }}</p><button type="button" data-testid="user-list-retry" @click="retryUsers"><RefreshCw :size="16" />重试</button></div>
      <div v-else-if="loaded && !result.items.length" class="list-state" data-testid="user-list-empty" role="status"><strong>暂无用户</strong><p>{{ search || status || role ? '当前筛选范围内没有用户。' : '当前还没有用户。' }}</p><button v-if="search || status || role" type="button" data-testid="user-empty-reset" @click="resetEmptyFilters">重置筛选</button></div>

      <section v-else class="user-list" aria-label="用户列表">
        <article v-for="user in result.items" :key="user.id" class="user-card" data-testid="mobile-user-card">
          <header>
            <UserAvatar :name="safeText(user.username, '用户')" :src="typeof user.avatar_url === 'string' ? user.avatar_url : null" />
            <div class="identity"><strong>{{ safeText(user.username, '未命名用户') }}</strong><span>{{ safeText(user.email, '未提供邮箱') }}</span><div class="identity-meta"><span class="role" :class="user.role">{{ roleLabel(user.role) }}</span><span class="status" :class="user.status">{{ statusLabel(user.status) }}</span><small>活跃 {{ safeDate(user.last_active_at ?? user.last_used_at) }}</small></div></div>
            <div class="menu-owner">
              <button class="menu-trigger" type="button" :data-testid="`user-menu-trigger-${user.id}`" :aria-expanded="openMenuId === user.id" aria-label="更多用户操作" @click="toggleMenu(user.id)"><CircleEllipsis :size="20" /></button>
              <div v-if="openMenuId === user.id" class="user-menu" :data-testid="`user-menu-${user.id}`" role="menu">
                <button type="button" role="menuitem" :data-testid="`detail-user-${user.id}`" @click="openDetail(user)"><Eye :size="17" />详情</button>
                <button type="button" role="menuitem" :data-testid="`balance-user-${user.id}`" @click="openBalance(user)"><Coins :size="17" />调整余额</button>
                <button type="button" role="menuitem" :data-testid="`groups-user-${user.id}`" @click="openGroups(user)"><Layers3 :size="17" />用户分组</button>
                <button type="button" role="menuitem" :data-testid="`toggle-user-${user.id}`" :disabled="(user.role === 'admin' && user.status === 'active') || Boolean(pendingByUser[user.id])" :title="user.role === 'admin' && user.status === 'active' ? '管理员用户不能停用' : undefined" @click="requestStatusChange(user)"><Power :size="17" />{{ user.status === 'active' ? '停用用户' : '启用用户' }}</button>
                <button class="danger" type="button" role="menuitem" :data-testid="`delete-user-${user.id}`" :disabled="user.role === 'admin' || Boolean(pendingByUser[user.id])" :title="user.role === 'admin' ? '管理员用户不能删除' : undefined" @click="openDelete(user)"><Trash2 :size="17" />删除用户</button>
              </div>
            </div>
          </header>

          <dl class="user-summary">
            <div><dt>余额</dt><dd :data-testid="`user-balance-${user.id}`">{{ safeMoney(user.balance) }}</dd></div>
            <div><dt>并发</dt><dd :data-testid="`user-concurrency-${user.id}`">{{ concurrencyLabel(user) }}</dd></div>
            <div><dt>分组</dt><dd :data-testid="`user-group-count-${user.id}`">{{ groupCount(user) }}</dd></div>
          </dl>
          <footer><button type="button" :data-testid="`edit-user-${user.id}`" :disabled="Boolean(pendingByUser[user.id])" @click="openEdit(user)"><Pencil :size="17" />编辑用户</button></footer>
        </article>
      </section>

      <MobilePagination v-if="result.total > PAGE_SIZE" :page="result.page" :page-count="pageCount" @change="changePage" />
    </div>

    <MobileBottomSheet v-model="filterSheetOpen" title="用户筛选">
      <div class="filter-fields">
        <label><span>状态</span><select v-model="draftStatus" data-testid="user-status-filter"><option value="">全部状态</option><option value="active">已启用</option><option value="disabled">已停用</option></select></label>
        <label><span>角色</span><select v-model="draftRole" data-testid="user-role-filter"><option value="">全部角色</option><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
      </div>
      <template #footer><button class="sheet-secondary" type="button" @click="resetFilters">重置</button><button class="sheet-primary" type="button" data-testid="user-filter-apply" @click="applyFilters">应用</button></template>
    </MobileBottomSheet>

    <UserEditorDialog v-model="editorOpen" :user="editingUser" mobile @saved="handleSaved" />
    <UserBalanceDialog :user="balanceUser" mobile @close="balanceUser = null" @updated="handleBalanceUpdated" />
    <UserGroupsDialog :user="groupsUser" :groups="groups" :groups-loading="groupsLoading" :groups-error="groupsError" mobile @close="groupsUser = null" @updated="handleGroupsUpdated" @retry-groups="loadGroups" />
    <UserDetailDrawer :user="detailUser" mobile @close="closeDetail" @updated="replaceUser" />
    <UserDeleteDialog :user="deletingUser" mobile @close="deletingUser = null" @deleted="handleDeleted" />

    <div v-if="statusTarget" class="confirm-backdrop" @mousedown.self="closeStatusDialog">
      <section ref="statusDialog" class="status-dialog" data-testid="user-status-dialog" role="dialog" aria-modal="true" aria-label="确认用户状态" tabindex="-1">
        <h2>{{ statusTarget.status === 'active' ? '停用用户' : '启用用户' }}</h2>
        <p>确认{{ statusTarget.status === 'active' ? '停用' : '启用' }}“{{ safeText(statusTarget.username, safeText(statusTarget.email, '未命名用户')) }}”？</p>
        <footer><button type="button" data-testid="cancel-user-status" :disabled="Boolean(pendingByUser[statusTarget.id])" @click="closeStatusDialog">取消</button><button class="primary" type="button" data-testid="confirm-user-status" :disabled="Boolean(pendingByUser[statusTarget.id])" @click="confirmStatusChange">确认{{ statusTarget.status === 'active' ? '停用' : '启用' }}</button></footer>
      </section>
    </div>
  </MobilePage>
</template>

<style scoped>
.create-button{display:flex;min-height:44px;align-items:center;gap:6px;padding:0 12px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.icon-button,.menu-trigger{display:grid;width:44px;min-height:44px;padding:0;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);place-items:center}.icon-button:disabled{opacity:.5}.spinning{animation:user-spin 700ms linear infinite}.users-content{display:grid;min-width:0;gap:12px}.search-row{display:grid;grid-template-columns:minmax(0,1fr) auto 44px;gap:8px}.search-row label{display:flex;min-width:0;min-height:44px;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-tertiary)}.search-row input{min-width:0;width:100%;border:0;background:transparent;color:var(--text-primary);font:inherit;outline:0}.search-row>button[type=submit]{min-height:44px;padding:0 14px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.filter-button{position:relative}.filter-button span{position:absolute;top:-5px;right:-5px;display:grid;min-width:18px;height:18px;border-radius:9px;background:#bd4d40;color:#fff;font-size:10px;place-items:center}.action-message,.action-error{display:flex;min-width:0;align-items:flex-start;gap:8px;margin:0;padding:10px 11px;border-radius:6px;font-size:13px;line-height:1.45}.action-message{border:1px solid #cce6d8;background:#eef9f3;color:#287154}.action-error{border:1px solid #eccfc9;background:#fff5f2;color:#9e493c}.list-busy{padding:7px 10px;border-radius:5px;background:var(--bg-base);color:var(--text-secondary);font-size:12px}.user-list{display:grid;gap:9px}.user-card{position:relative;display:grid;min-width:0;gap:9px;padding:12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 4px 14px rgba(29,44,65,.04)}.user-card>header{display:grid;grid-template-columns:40px minmax(0,1fr) 44px;align-items:center;gap:9px}.user-card>header :deep(.user-avatar){width:40px!important;height:40px!important}.identity{display:grid;min-width:0;gap:2px}.identity>strong,.identity>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity>strong{font-size:15px}.identity>span{color:var(--text-tertiary);font-size:11px}.identity-meta{display:flex;min-width:0;align-items:center;gap:5px;overflow:hidden}.identity-meta span{flex:0 0 auto;padding:2px 5px;border-radius:4px;background:var(--bg-base);color:var(--text-secondary);font-size:10px}.identity-meta .role.admin{background:#edf2fb;color:#42659b}.identity-meta .status.active{background:#eaf7f0;color:#287755}.identity-meta .status.disabled{background:#fff0ed;color:#a14639}.identity-meta small{min-width:0;overflow:hidden;color:var(--text-tertiary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.menu-owner{position:relative}.menu-trigger{border:0}.user-menu{position:absolute;z-index:25;top:46px;right:0;display:grid;width:180px;padding:5px;border:1px solid var(--border-strong);border-radius:7px;background:var(--bg-surface);box-shadow:0 12px 32px rgba(26,40,60,.18)}.user-menu button{display:flex;min-height:44px;align-items:center;gap:9px;padding:0 10px;border:0;border-radius:5px;background:transparent;color:var(--text-primary);font:inherit;text-align:left}.user-menu button:focus,.user-menu button:hover{background:var(--bg-base);outline:0}.user-menu .danger{color:#a14639}.user-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0;border:0}.user-summary>div{display:grid;min-width:0;gap:2px;padding:3px 0}.user-summary dt{color:var(--text-tertiary);font-size:10px}.user-summary dd{overflow:hidden;margin:0;color:var(--text-primary);font-family:var(--font-data);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.user-card>footer{display:grid}.user-card>footer button{display:flex;min-height:44px;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid var(--accent);border-radius:6px;background:var(--bg-surface);color:var(--accent);font:inherit}.filter-fields{display:grid;gap:14px}.filter-fields label{display:grid;gap:6px}.filter-fields span{color:var(--text-secondary);font-size:12px}.filter-fields select{width:100%;min-height:44px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-secondary,.sheet-primary{min-height:44px;padding:0 16px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-primary{border-color:var(--accent);background:var(--accent);color:#fff}.confirm-backdrop{position:fixed;z-index:170;inset:0;display:grid;padding:16px;background:rgba(24,35,50,.28);backdrop-filter:blur(8px);place-items:center}.status-dialog{width:min(100%,420px);padding:18px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 24px 60px rgba(28,43,63,.24)}.status-dialog h2{margin:0;font-size:17px}.status-dialog p{margin:8px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.status-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.status-dialog footer button{min-height:44px;padding:0 14px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.status-dialog footer .primary{border-color:var(--accent);background:var(--accent);color:#fff}.mobile-pagination{margin-top:2px}@keyframes user-spin{to{transform:rotate(360deg)}}@media(max-width:360px){.search-row{grid-template-columns:minmax(0,1fr) 44px}.search-row>button[type=submit]{grid-column:1/-1;grid-row:2}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
.action-error span{min-width:0;flex:1}.action-error button,.list-state button{display:flex;min-height:44px;align-items:center;gap:6px;padding:0 11px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:inherit}.list-state{display:grid;justify-items:center;gap:8px;padding:28px 16px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);color:var(--text-secondary);text-align:center}.list-state p{margin:0;color:var(--text-tertiary);font-size:12px}.error-state{color:#9e493c}
</style>
