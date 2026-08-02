<script setup lang="ts">
import {
  AlertCircle,
  Archive,
  Check,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UsersRound,
} from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

import { listAdminUsers } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'
import {
  archiveUserGroup,
  createUserGroup,
  getUserGroupMembers,
  getUserGroupViewers,
  listUserGroups,
  replaceUserGroupMembers,
  replaceUserGroupViewers,
  updateUserGroup,
  type UserGroup,
  type UserGroupMember,
  type UserGroupMutation,
  type UserGroupViewer,
} from '@/api/user-groups'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'
import { refreshUser, session } from '@/stores/session'

type PeopleMode = 'members' | 'viewers'
type GroupPerson = UserGroupMember | UserGroupViewer

const PAGE_SIZE = 10
const PEOPLE_PAGE_SIZE = 100

const groups = ref<UserGroup[]>([])
const loaded = ref(false)
const initialLoading = ref(true)
const listLoading = ref(false)
const listError = ref('')
const actionMessage = ref('')
const actionError = ref('')
const permissionRevoked = ref(false)
const permissionRecoveryLoading = ref(false)
const searchDraft = ref('')
const search = ref('')
const page = ref(1)

const editorOpen = ref(false)
const editingGroup = ref<UserGroup | null>(null)
const editorForm = reactive<UserGroupMutation>({ name: '', description: '' })
const editorSaving = ref(false)
const editorError = ref('')
const editorNameInput = ref<HTMLInputElement | null>(null)

const archiveOpen = ref(false)
const archiveTarget = ref<UserGroup | null>(null)
const archiveSaving = ref(false)
const archiveError = ref('')

const peopleOpen = ref(false)
const peopleGroup = ref<UserGroup | null>(null)
const peopleMode = ref<PeopleMode>('members')
const peopleSearch = ref('')
const peopleLoading = ref(false)
const peopleSaving = ref(false)
const peopleDataValid = ref(false)
const peopleDataError = ref('')
const peopleRetryScope = ref<'context' | 'candidates'>('context')
const peopleError = ref('')
const visibleCandidates = ref<AdminUser[]>([])
const knownPeople = ref<AdminUser[]>([])
const selectedIds = ref<number[]>([])

let mounted = false
let listGeneration = 0
let editorGeneration = 0
let peopleGeneration = 0
let peopleSearchGeneration = 0
let feedbackGeneration = 0
let editorSaveOwner = 0
let archiveSaveOwner = 0
let peopleSaveOwner = 0
let peopleLoadOwner = 0
let permissionRecoveryOwner = 0

const canManage = computed(() => (
  !permissionRevoked.value
  && (session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
))
const filteredGroups = computed(() => {
  const query = search.value.toLocaleLowerCase()
  if (!query) return groups.value
  return groups.value.filter((item) => (
    `${safeText(item.name)} ${safeText(item.description)}`.toLocaleLowerCase().includes(query)
  ))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredGroups.value.length / PAGE_SIZE)))
const visibleGroups = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredGroups.value.slice(start, start + PAGE_SIZE)
})
const busy = computed(() => (
  initialLoading.value || listLoading.value || permissionRecoveryLoading.value
  || editorSaving.value || archiveSaving.value || peopleLoading.value || peopleSaving.value
))
const peopleLabel = computed(() => peopleMode.value === 'members' ? '成员' : '查看者')
const hiddenSelectedPeople = computed(() => {
  const visibleIds = new Set(visibleCandidates.value.map((candidate) => candidate.id))
  const peopleById = new Map(knownPeople.value.map((person) => [person.id, person]))
  return selectedIds.value
    .filter((id) => !visibleIds.has(id))
    .map((id) => peopleById.get(id))
    .filter((person): person is AdminUser => Boolean(person))
})

function safeText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeName(value: unknown) {
  return safeText(value).trim() || '未命名用户组'
}

function safeDescription(value: unknown) {
  return safeText(value).trim() || '暂无说明'
}

function safeCount(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function safeId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isPermissionError(caught: unknown) {
  if (!caught || typeof caught !== 'object') return false
  const error = caught as { status?: unknown; code?: unknown }
  return Number(error.status) === 403 || Number(error.code) === 403 || Number(error.code) === 40301
}

function claimFeedback() {
  const token = ++feedbackGeneration
  actionMessage.value = ''
  actionError.value = ''
  return token
}

function ownsFeedback(token: number) {
  return mounted && token === feedbackGeneration
}

function closeAllEditors() {
  editorGeneration += 1
  peopleGeneration += 1
  peopleSearchGeneration += 1
  editorOpen.value = false
  archiveOpen.value = false
  peopleOpen.value = false
  editingGroup.value = null
  archiveTarget.value = null
  peopleGroup.value = null
}

function revokePermission() {
  permissionRevoked.value = true
  permissionRecoveryOwner += 1
  permissionRecoveryLoading.value = false
  listGeneration += 1
  editorSaveOwner += 1
  archiveSaveOwner += 1
  peopleSaveOwner += 1
  peopleLoadOwner += 1
  closeAllEditors()
  initialLoading.value = false
  listLoading.value = false
  editorSaving.value = false
  archiveSaving.value = false
  peopleLoading.value = false
  peopleSaving.value = false
  actionMessage.value = ''
  actionError.value = ''
}

function normalizeGroup(payload: unknown): UserGroup | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = payload as Partial<UserGroup>
  if (!safeId(value.id) || (value.status !== 'active' && value.status !== 'archived')) return null
  return {
    id: value.id,
    name: safeText(value.name),
    description: safeText(value.description),
    status: value.status,
    member_count: safeCount(value.member_count),
    viewer_count: safeCount(value.viewer_count),
    ...(value.created_by === null || safeId(value.created_by) ? { created_by: value.created_by } : {}),
    created_at: safeText(value.created_at),
    updated_at: safeText(value.updated_at),
  }
}

function normalizeList(payload: unknown): UserGroup[] {
  if (!Array.isArray(payload)) throw new Error('INVALID_GROUP_LIST')
  const byId = new Map<number, UserGroup>()
  payload.forEach((item) => {
    const normalized = normalizeGroup(item)
    if (normalized && !byId.has(normalized.id)) byId.set(normalized.id, normalized)
  })
  return [...byId.values()]
}

async function loadGroups(
  background = loaded.value,
  feedbackToken?: number,
  reportFailure = true,
  failureMessage = '用户组列表刷新失败，已保留当前数据。',
) {
  const generation = ++listGeneration
  if (!loaded.value && !background) initialLoading.value = true
  else listLoading.value = true
  listError.value = ''

  try {
    const response = await listUserGroups()
    if (!mounted || generation !== listGeneration) return
    groups.value = normalizeList(response)
    loaded.value = true
    page.value = Math.min(page.value, Math.max(1, Math.ceil(filteredGroups.value.length / PAGE_SIZE)))
  } catch (caught) {
    if (!mounted || generation !== listGeneration) return
    if (isPermissionError(caught)) revokePermission()
    if (!loaded.value) listError.value = isPermissionError(caught)
      ? '用户组访问权限已失效，请刷新后重试。'
      : '用户组列表加载失败，请检查网络后重试。'
    else if (reportFailure && (feedbackToken === undefined || ownsFeedback(feedbackToken))) {
      actionError.value = isPermissionError(caught) ? '用户组访问权限已失效，请刷新后重试。' : failureMessage
    }
  } finally {
    if (mounted && generation === listGeneration) {
      initialLoading.value = false
      listLoading.value = false
    }
  }
}

async function refreshGroups() {
  if (permissionRecoveryLoading.value) return
  const token = claimFeedback()
  if (permissionRevoked.value) {
    const recoveryOwner = ++permissionRecoveryOwner
    let trusted = false
    permissionRecoveryLoading.value = true
    try {
      await refreshUser()
      trusted = true
    } catch {
      // Keep management revoked until an authoritative session refresh succeeds.
    } finally {
      if (mounted && recoveryOwner === permissionRecoveryOwner) permissionRecoveryLoading.value = false
    }
    if (!mounted || recoveryOwner !== permissionRecoveryOwner) return
    if (trusted && (session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)) {
      permissionRevoked.value = false
    }
  }
  if (mounted) await loadGroups(loaded.value, token, true)
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  page.value = 1
}

function changePage(target: number) {
  if (busy.value || target < 1 || target > pageCount.value) return
  page.value = target
}

async function focusEditorName() {
  await nextTick()
  await nextTick()
  editorNameInput.value?.focus()
}

function openCreate() {
  if (!canManage.value) return
  editorGeneration += 1
  editingGroup.value = null
  editorForm.name = ''
  editorForm.description = ''
  editorError.value = ''
  editorOpen.value = true
  void focusEditorName()
}

function openEdit(target: UserGroup) {
  if (!canManage.value || !safeId(target.id)) return
  editorGeneration += 1
  editingGroup.value = target
  editorForm.name = safeText(target.name)
  editorForm.description = safeText(target.description)
  editorError.value = ''
  editorOpen.value = true
  void focusEditorName()
}

function closeEditor() {
  if (editorSaving.value) return
  editorGeneration += 1
  editorOpen.value = false
  editingGroup.value = null
  editorError.value = ''
}

function validMutationResult(value: unknown, expectedId?: number) {
  if (!value || typeof value !== 'object') return false
  const id = (value as { id?: unknown }).id
  return safeId(id) && (expectedId === undefined || id === expectedId)
}

async function saveGroup() {
  if (editorSaving.value || !canManage.value) return
  const payload = { name: editorForm.name.trim(), description: editorForm.description.trim() }
  if (!payload.name) return
  const generation = editorGeneration
  const targetId = editingGroup.value?.id
  if (targetId !== undefined && !safeId(targetId)) return
  const token = claimFeedback()
  const saveOwner = ++editorSaveOwner
  editorSaving.value = true
  editorError.value = ''
  try {
    const response = targetId === undefined
      ? await createUserGroup(payload)
      : await updateUserGroup(targetId, payload)
    if (!mounted || generation !== editorGeneration) return
    if (!validMutationResult(response, targetId)) throw new Error('INVALID_GROUP_MUTATION_RESPONSE')
    const normalized = normalizeGroup(response)
    if (normalized) {
      const existingIndex = groups.value.findIndex((group) => group.id === normalized.id)
      if (existingIndex >= 0) groups.value = groups.value.map((group) => group.id === normalized.id ? normalized : group)
      else groups.value = [normalized, ...groups.value]
      page.value = Math.min(page.value, pageCount.value)
    }
    if (saveOwner === editorSaveOwner) editorSaving.value = false
    editorOpen.value = false
    editingGroup.value = null
    if (ownsFeedback(token)) actionMessage.value = targetId === undefined ? '用户组已创建' : '用户组已更新'
    await loadGroups(true, token, true, '用户组列表同步失败，请手动刷新。')
  } catch (caught) {
    if (!mounted || generation !== editorGeneration) return
    if (isPermissionError(caught)) {
      revokePermission()
      return
    }
    editorError.value = '用户组保存失败，请稍后重试。'
  } finally {
    if (mounted && saveOwner === editorSaveOwner) editorSaving.value = false
  }
}

function requestArchive(target: UserGroup) {
  if (!canManage.value || !safeId(target.id)) return
  archiveTarget.value = target
  archiveError.value = ''
  archiveOpen.value = true
}

function closeArchive() {
  if (archiveSaving.value) return
  archiveOpen.value = false
  archiveTarget.value = null
  archiveError.value = ''
}

async function confirmArchive() {
  const target = archiveTarget.value
  if (!target || !safeId(target.id) || archiveSaving.value || !canManage.value) return
  const targetId = target.id
  const token = claimFeedback()
  const saveOwner = ++archiveSaveOwner
  archiveSaving.value = true
  archiveError.value = ''
  try {
    await archiveUserGroup(targetId)
    if (!mounted || archiveTarget.value?.id !== targetId) return
    groups.value = groups.value.filter((group) => group.id !== targetId)
    page.value = Math.min(page.value, pageCount.value)
    if (saveOwner === archiveSaveOwner) archiveSaving.value = false
    archiveOpen.value = false
    archiveTarget.value = null
    if (ownsFeedback(token)) actionMessage.value = '用户组已归档'
    await loadGroups(true, token, true, '用户组列表同步失败，请手动刷新。')
  } catch (caught) {
    if (!mounted || archiveTarget.value?.id !== targetId) return
    if (isPermissionError(caught)) {
      revokePermission()
      return
    }
    archiveError.value = '用户组归档失败，请稍后重试。'
  } finally {
    if (mounted && saveOwner === archiveSaveOwner) archiveSaving.value = false
  }
}

function validPerson(person: unknown): person is GroupPerson {
  if (!person || typeof person !== 'object') return false
  const value = person as Partial<GroupPerson>
  return safeId(value.user_id) && typeof value.username === 'string' && typeof value.email === 'string'
}

function validUser(candidate: unknown): candidate is AdminUser {
  if (!candidate || typeof candidate !== 'object') return false
  const value = candidate as Partial<AdminUser>
  return safeId(value.id) && typeof value.username === 'string' && typeof value.email === 'string'
}

function selectedPersonAsUser(person: GroupPerson): AdminUser {
  return {
    id: person.user_id,
    username: person.username,
    email: person.email,
    avatar_url: person.avatar_url,
    role: 'user',
    balance: 'balance' in person && Number.isFinite(person.balance) ? person.balance : 0,
    concurrency: 0,
    status: person.status === 'disabled' ? 'disabled' : 'active',
    allowed_groups: [],
    notes: '',
    created_at: '',
    updated_at: '',
  }
}

function mergeKnownPeople(people: AdminUser[], replace = false) {
  const byId = new Map<number, AdminUser>()
  if (!replace) knownPeople.value.forEach((person) => byId.set(person.id, person))
  people.forEach((person) => byId.set(person.id, person))
  knownPeople.value = [...byId.values()]
}

function closePeople() {
  if (peopleSaving.value) return
  peopleLoadOwner += 1
  peopleLoading.value = false
  peopleGeneration += 1
  peopleSearchGeneration += 1
  peopleOpen.value = false
  peopleGroup.value = null
  peopleError.value = ''
  peopleDataError.value = ''
  peopleRetryScope.value = 'context'
  peopleDataValid.value = false
}

function openPeople(target: UserGroup, mode: PeopleMode) {
  if (!canManage.value || !safeId(target.id)) return
  peopleGeneration += 1
  peopleSearchGeneration += 1
  peopleGroup.value = target
  peopleMode.value = mode
  peopleSearch.value = ''
  peopleOpen.value = true
  peopleError.value = ''
  peopleRetryScope.value = 'context'
  void loadPeople(peopleGeneration, peopleSearchGeneration)
}

async function loadPeople(generation = ++peopleGeneration, searchGeneration = ++peopleSearchGeneration) {
  const target = peopleGroup.value
  const mode = peopleMode.value
  if (!target || !safeId(target.id)) return
  const targetId = target.id
  const loadOwner = ++peopleLoadOwner
  peopleLoading.value = true
  peopleDataValid.value = false
  peopleDataError.value = ''
  peopleError.value = ''
  try {
    const params = {
      page: 1,
      page_size: PEOPLE_PAGE_SIZE,
      ...(peopleSearch.value.trim() ? { search: peopleSearch.value.trim() } : {}),
    }
    const [selectedResponse, usersResponse] = await Promise.all([
      mode === 'members' ? getUserGroupMembers(targetId) : getUserGroupViewers(targetId),
      listAdminUsers(params),
    ])
    if (!mounted || generation !== peopleGeneration || searchGeneration !== peopleSearchGeneration
      || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (!Array.isArray(selectedResponse) || selectedResponse.some((person) => !validPerson(person))) {
      throw new Error('INVALID_SELECTED_PEOPLE')
    }
    if (!usersResponse || typeof usersResponse !== 'object' || !Array.isArray(usersResponse.items)
      || usersResponse.items.some((candidate) => !validUser(candidate))) {
      throw new Error('INVALID_PEOPLE_CANDIDATES')
    }

    visibleCandidates.value = [...new Map(usersResponse.items.map((candidate) => [candidate.id, candidate])).values()]
    mergeKnownPeople([
      ...selectedResponse.map(selectedPersonAsUser),
      ...visibleCandidates.value,
    ], true)
    selectedIds.value = [...new Set(selectedResponse.map((person) => person.user_id))].filter(safeId)
    peopleDataValid.value = true
  } catch (caught) {
    if (!mounted || generation !== peopleGeneration || searchGeneration !== peopleSearchGeneration
      || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (isPermissionError(caught)) {
      revokePermission()
      return
    }
    visibleCandidates.value = []
    knownPeople.value = []
    selectedIds.value = []
    peopleRetryScope.value = 'context'
    const malformed = caught instanceof Error && caught.message.startsWith('INVALID_')
    peopleDataError.value = malformed
      ? `${mode === 'members' ? '成员' : '查看者'}数据格式异常，请重试。`
      : `${mode === 'members' ? '成员' : '查看者'}加载失败，请重试。`
  } finally {
    if (mounted && loadOwner === peopleLoadOwner) peopleLoading.value = false
  }
}

async function loadPeopleCandidates(generation: number, searchGeneration: number) {
  const target = peopleGroup.value
  const mode = peopleMode.value
  if (!target || !safeId(target.id)) return
  const targetId = target.id
  const loadOwner = ++peopleLoadOwner
  peopleLoading.value = true
  peopleDataError.value = ''
  peopleError.value = ''
  try {
    const response = await listAdminUsers({
      page: 1,
      page_size: PEOPLE_PAGE_SIZE,
      ...(peopleSearch.value.trim() ? { search: peopleSearch.value.trim() } : {}),
    })
    if (!mounted || generation !== peopleGeneration || searchGeneration !== peopleSearchGeneration
      || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (!response || typeof response !== 'object' || !Array.isArray(response.items)
      || response.items.some((candidate) => !validUser(candidate))) {
      throw new Error('INVALID_PEOPLE_CANDIDATES')
    }
    visibleCandidates.value = [...new Map(response.items.map((candidate) => [candidate.id, candidate])).values()]
    mergeKnownPeople(visibleCandidates.value)
    peopleDataValid.value = true
  } catch (caught) {
    if (!mounted || generation !== peopleGeneration || searchGeneration !== peopleSearchGeneration
      || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (isPermissionError(caught)) {
      revokePermission()
      return
    }
    visibleCandidates.value = []
    peopleDataValid.value = false
    peopleRetryScope.value = 'candidates'
    const malformed = caught instanceof Error && caught.message.startsWith('INVALID_')
    peopleDataError.value = malformed
      ? '候选用户数据格式异常，请重试。'
      : '候选用户加载失败，请重试。'
  } finally {
    if (mounted && loadOwner === peopleLoadOwner) peopleLoading.value = false
  }
}

function retryPeople() {
  if (peopleSaving.value) return
  peopleSearchGeneration += 1
  if (peopleRetryScope.value === 'candidates') {
    void loadPeopleCandidates(peopleGeneration, peopleSearchGeneration)
    return
  }
  peopleGeneration += 1
  void loadPeople(peopleGeneration, peopleSearchGeneration)
}

function submitPeopleSearch() {
  if (peopleSaving.value) return
  peopleSearchGeneration += 1
  void loadPeopleCandidates(peopleGeneration, peopleSearchGeneration)
}

function togglePerson(id: number) {
  if (!peopleDataValid.value || peopleLoading.value || peopleSaving.value || !safeId(id)) return
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((value) => value !== id)
    : [...selectedIds.value, id]
}

async function savePeople() {
  const target = peopleGroup.value
  const mode = peopleMode.value
  const generation = peopleGeneration
  if (!target || !safeId(target.id) || !peopleDataValid.value || peopleLoading.value || peopleSaving.value || !canManage.value) return
  const targetId = target.id
  const ids = [...new Set(selectedIds.value)].filter(safeId)
  const token = claimFeedback()
  const saveOwner = ++peopleSaveOwner
  peopleSaving.value = true
  peopleError.value = ''
  try {
    if (mode === 'members') await replaceUserGroupMembers(targetId, ids)
    else await replaceUserGroupViewers(targetId, ids)
    if (!mounted || generation !== peopleGeneration || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (saveOwner === peopleSaveOwner) peopleSaving.value = false
    peopleOpen.value = false
    peopleGroup.value = null
    if (ownsFeedback(token)) actionMessage.value = `${mode === 'members' ? '成员' : '查看者'}已更新`
    await loadGroups(true, token, true, '用户组列表同步失败，请手动刷新。')
  } catch (caught) {
    if (!mounted || generation !== peopleGeneration || peopleGroup.value?.id !== targetId || peopleMode.value !== mode) return
    if (isPermissionError(caught)) {
      revokePermission()
      return
    }
    peopleError.value = `${mode === 'members' ? '成员' : '查看者'}保存失败，请稍后重试。`
  } finally {
    if (mounted && saveOwner === peopleSaveOwner) peopleSaving.value = false
  }
}

onMounted(() => {
  mounted = true
  void loadGroups(false)
})

onUnmounted(() => {
  mounted = false
  permissionRecoveryOwner += 1
  listGeneration += 1
  editorGeneration += 1
  peopleGeneration += 1
  peopleSearchGeneration += 1
  peopleLoadOwner += 1
})
</script>

<template>
  <MobilePage title="用户组" subtitle="目录、成员与查看权限" :aria-busy="busy">
    <template #action>
      <button v-if="canManage" class="primary-action" type="button" data-testid="create-user-group" @click="openCreate"><Plus :size="18" />新建</button>
    </template>

    <div class="user-groups-content">
      <form class="directory-toolbar" data-testid="user-group-search-form" @submit.prevent="submitSearch">
        <label><Search :size="17" /><input v-model="searchDraft" data-testid="user-group-search" autocomplete="off" placeholder="搜索名称或说明" /></label>
        <button type="submit" :disabled="listLoading">搜索</button>
        <button class="refresh-button" type="button" data-testid="refresh-user-groups" aria-label="刷新用户组" :aria-busy="permissionRecoveryLoading" :disabled="listLoading || permissionRecoveryLoading" @click="refreshGroups"><RefreshCw :size="18" :class="{ spinning: listLoading || permissionRecoveryLoading }" /></button>
      </form>

      <div class="directory-meta"><span>共 {{ filteredGroups.length }} 个用户组</span><strong>{{ canManage ? '可管理' : '只读' }}</strong></div>
      <p v-if="permissionRevoked" class="permission-error" data-testid="user-group-permission-error" role="alert"><AlertCircle :size="17" />用户组管理权限已失效，请刷新后重试。</p>
      <p v-if="actionMessage" class="action-message" role="status"><Check :size="17" />{{ actionMessage }}</p>
      <p v-if="actionError" class="action-error" data-testid="user-group-sync-warning" role="alert"><AlertCircle :size="17" />{{ actionError }}</p>
      <p v-if="listLoading" class="list-busy" role="status">正在刷新用户组</p>

      <div v-if="initialLoading && !loaded" class="page-state" data-testid="mobile-page-loading" role="status">正在加载用户组</div>
      <div v-else-if="listError && !loaded" class="page-state" data-testid="mobile-page-error" role="alert">
        <strong>加载失败</strong><p>{{ listError }}</p><button type="button" data-testid="mobile-page-retry" @click="refreshGroups"><RefreshCw :size="17" />重试</button>
      </div>
      <div v-else-if="!visibleGroups.length" class="page-state" data-testid="mobile-page-empty" role="status">
        <strong>{{ groups.length ? '没有匹配的用户组' : '暂无可访问的用户组' }}</strong>
        <p>{{ groups.length ? '请调整搜索条件。' : canManage ? '新建用户组后可添加成员与查看者。' : '请联系管理员授予访问权限。' }}</p>
      </div>
      <section v-else class="group-list" aria-label="用户组目录">
        <article v-for="item in visibleGroups" :key="item.id" class="group-card" data-testid="mobile-user-group-card">
          <header><div><strong>{{ safeName(item.name) }}</strong><p>{{ safeDescription(item.description) }}</p></div><span :class="item.status">{{ item.status === 'archived' ? '已归档' : '使用中' }}</span></header>
          <dl><div><dt>成员</dt><dd>{{ safeCount(item.member_count) }}</dd></div><div><dt>查看者</dt><dd>{{ safeCount(item.viewer_count) }}</dd></div></dl>
          <footer v-if="canManage">
            <button type="button" :data-testid="`group-members-${item.id}`" @click="openPeople(item, 'members')"><UsersRound :size="17" />成员</button>
            <button type="button" :data-testid="`group-viewers-${item.id}`" @click="openPeople(item, 'viewers')"><Eye :size="17" />查看者</button>
            <button type="button" :data-testid="`edit-user-group-${item.id}`" @click="openEdit(item)"><Pencil :size="17" />编辑</button>
            <button v-if="item.status !== 'archived'" class="danger" type="button" :data-testid="`archive-user-group-${item.id}`" @click="requestArchive(item)"><Archive :size="17" />归档</button>
          </footer>
        </article>
      </section>
      <MobilePagination v-if="loaded && filteredGroups.length" :page="page" :page-count="pageCount" @change="changePage" />
    </div>

    <MobileBottomSheet :model-value="editorOpen" :title="editingGroup ? '编辑用户组' : '新建用户组'" :close-disabled="editorSaving" @update:model-value="value => { if (!value) closeEditor() }" @close="closeEditor">
      <form class="editor-form" data-testid="user-group-editor-form" @submit.prevent="saveGroup">
        <div data-testid="user-group-editor-sheet">
          <label><span>用户组名称</span><input ref="editorNameInput" v-model="editorForm.name" data-testid="user-group-name" maxlength="100" autocomplete="off" placeholder="例如：研发团队" /></label>
          <label><span>说明</span><textarea v-model="editorForm.description" data-testid="user-group-description" rows="4" placeholder="说明这个用户组的用途" /></label>
          <p v-if="editorError" class="sheet-error" data-testid="user-group-editor-error" role="alert">{{ editorError }}</p>
        </div>
      </form>
      <template #footer><button type="button" data-testid="cancel-user-group-editor" :disabled="editorSaving" @click="closeEditor">取消</button><button class="sheet-primary" type="button" :disabled="editorSaving || !editorForm.name.trim()" @click="saveGroup"><LoaderCircle v-if="editorSaving" :size="17" class="spinning" /><Check v-else :size="17" />{{ editorSaving ? '保存中' : '保存' }}</button></template>
    </MobileBottomSheet>

    <MobileBottomSheet :model-value="archiveOpen" title="归档用户组" :close-disabled="archiveSaving" @update:model-value="value => { if (!value) closeArchive() }" @close="closeArchive">
      <div class="archive-copy" data-testid="archive-user-group-dialog"><Archive :size="28" /><p>确认归档“{{ safeName(archiveTarget?.name) }}”？历史数据会保留。</p><p v-if="archiveError" class="sheet-error" data-testid="archive-user-group-error" role="alert">{{ archiveError }}</p></div>
      <template #footer><button type="button" data-testid="cancel-archive-user-group" :disabled="archiveSaving" @click="closeArchive">取消</button><button class="sheet-danger" type="button" data-testid="confirm-archive-user-group" :disabled="archiveSaving" @click="confirmArchive"><LoaderCircle v-if="archiveSaving" :size="17" class="spinning" /><Archive v-else :size="17" />{{ archiveSaving ? '归档中' : '确认归档' }}</button></template>
    </MobileBottomSheet>

    <MobileBottomSheet :model-value="peopleOpen" :title="`管理${peopleLabel}`" :close-disabled="peopleSaving" @update:model-value="value => { if (!value) closePeople() }" @close="closePeople">
      <div class="people-sheet" data-testid="user-group-people-sheet">
        <header><strong data-testid="user-group-people-title">{{ safeName(peopleGroup?.name) }}</strong><span>已选择 {{ selectedIds.length }} 人</span></header>
        <form class="people-search" data-testid="people-search-form" @submit.prevent="submitPeopleSearch"><Search :size="17" /><input v-model="peopleSearch" data-testid="people-search" autocomplete="off" placeholder="搜索名称或邮箱" /><button type="submit" :disabled="peopleLoading || peopleSaving">搜索</button></form>
        <div v-if="peopleLoading" class="people-loading" role="status">正在加载{{ peopleLabel }}</div>
        <div v-else-if="peopleDataError" class="people-data-error" role="alert"><p data-testid="people-data-error">{{ peopleDataError }}</p><button type="button" data-testid="retry-user-group-people" @click="retryPeople">重试</button></div>
        <template v-else>
          <section v-if="hiddenSelectedPeople.length" class="selected-people" aria-label="当前结果之外的已选用户">
            <span>已选择，不在当前结果中</span>
            <button v-for="person in hiddenSelectedPeople" :key="person.id" type="button" class="person-option selected" :data-testid="`selected-person-${person.id}`" aria-pressed="true" @click="togglePerson(person.id)">
              <span><strong>{{ safeName(person.username || person.email) }}</strong><small>{{ safeText(person.email) }} · #{{ person.id }}</small></span><i><Check :size="13" /></i>
            </button>
          </section>
          <div class="people-list" aria-label="候选用户搜索结果">
            <button v-for="candidate in visibleCandidates" :key="candidate.id" type="button" class="person-option" :class="{ selected: selectedIds.includes(candidate.id) }" :data-testid="`people-option-${candidate.id}`" :aria-pressed="selectedIds.includes(candidate.id)" @click="togglePerson(candidate.id)">
              <span><strong>{{ safeName(candidate.username || candidate.email) }}</strong><small>{{ safeText(candidate.email) }} · #{{ candidate.id }}</small></span><i><Check :size="13" /></i>
            </button>
            <p v-if="!visibleCandidates.length" class="people-empty">没有符合条件的用户</p>
          </div>
        </template>
        <p v-if="peopleError" class="sheet-error" data-testid="user-group-people-error" role="alert">{{ peopleError }}</p>
      </div>
      <template #footer><button type="button" data-testid="close-user-group-people" :disabled="peopleSaving" @click="closePeople">取消</button><button class="sheet-primary" type="button" data-testid="save-user-group-people" :disabled="peopleSaving || peopleLoading || !peopleDataValid" @click="savePeople"><LoaderCircle v-if="peopleSaving" :size="17" class="spinning" /><Check v-else :size="17" />{{ peopleSaving ? '保存中' : `保存${peopleLabel}` }}</button></template>
    </MobileBottomSheet>
  </MobilePage>
</template>

<style scoped>
.primary-action,.directory-toolbar button,.page-state button,.group-card footer button,.editor-form input,.editor-form textarea,.people-search input,.people-search button,.people-data-error button,.person-option{box-sizing:border-box;min-height:44px}.primary-action{display:flex;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.user-groups-content{display:grid;min-width:0;gap:12px}.directory-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto 44px;gap:8px}.directory-toolbar label{display:flex;min-width:0;min-height:44px;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-tertiary)}.directory-toolbar input{width:100%;min-width:0;border:0;background:transparent;color:var(--text-primary);font:inherit;outline:0}.directory-toolbar button{padding:0 13px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.directory-toolbar .refresh-button{display:grid;width:44px;padding:0;border-color:var(--border-strong);background:var(--bg-surface);color:var(--text-primary);place-items:center}.directory-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--text-tertiary);font-size:12px}.directory-meta strong{padding:4px 7px;border-radius:5px;background:#edf4ff;color:var(--accent-strong);font-size:11px}.permission-error,.action-message,.action-error{display:flex;align-items:flex-start;gap:8px;margin:0;padding:10px 11px;border-radius:6px;font-size:13px;line-height:1.45}.permission-error,.action-error{border:1px solid #eccfc9;background:#fff5f2;color:#9e493c}.action-message{border:1px solid #cce6d8;background:#eef9f3;color:#287154}.list-busy{margin:0;padding:7px 10px;border-radius:5px;background:var(--bg-base);color:var(--text-secondary);font-size:12px}.page-state{display:flex;min-height:180px;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-secondary);text-align:center}.page-state strong{color:var(--text-primary);font-size:16px}.page-state p{margin:0;font-size:14px}.page-state button{display:flex;align-items:center;gap:6px;margin-top:5px;padding:0 14px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.group-list{display:grid;gap:10px}.group-card{display:grid;min-width:0;gap:12px;padding:14px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 4px 14px rgba(29,44,65,.04)}.group-card>header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px}.group-card>header>div{display:grid;min-width:0;gap:4px}.group-card>header strong,.group-card>header p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-card>header strong{font-size:15px}.group-card>header p{margin:0;color:var(--text-tertiary);font-size:12px}.group-card>header>span{padding:4px 7px;border-radius:5px;background:#eaf7f0;color:#287755;font-size:11px}.group-card>header>span.archived{background:#f0f2f5;color:#687282}.group-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;overflow:hidden;border:1px solid var(--border-subtle);border-radius:6px}.group-card dl div{display:grid;gap:4px;padding:9px 11px}.group-card dl div+div{border-left:1px solid var(--border-subtle)}.group-card dt{color:var(--text-tertiary);font-size:10px}.group-card dd{margin:0;font-family:var(--font-data);font-size:15px;font-weight:700}.group-card footer{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.group-card footer button{display:flex;min-width:0;align-items:center;justify-content:center;gap:5px;padding:0 6px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit;font-size:12px}.group-card footer .danger{color:#a34a41}.editor-form>div{display:grid;gap:14px}.editor-form label{display:grid;gap:6px}.editor-form label span{color:var(--text-secondary);font-size:13px;font-weight:650}.editor-form input,.editor-form textarea{width:100%;padding:10px 11px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit;overflow-wrap:anywhere}.editor-form textarea{min-height:104px;resize:vertical}.archive-copy{display:grid;justify-items:center;gap:10px;padding:8px 0;text-align:center}.archive-copy p{max-width:100%;margin:0;overflow-wrap:anywhere;line-height:1.55}.sheet-error{margin:0;padding:9px 10px;border:1px solid #eccfc9;border-radius:6px;background:#fff5f2;color:#9e493c;font-size:13px}.people-sheet{display:grid;min-width:0;gap:12px}.people-sheet>header{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:10px}.people-sheet>header strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.people-sheet>header span{flex:0 0 auto;color:var(--text-tertiary);font-size:12px}.people-search{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:7px;padding-left:10px;border:1px solid var(--border-strong);border-radius:6px;color:var(--text-tertiary)}.people-search input{min-width:0;padding:0;border:0;background:transparent;color:var(--text-primary);font:inherit;outline:0}.people-search button{margin-right:4px;padding:0 12px;border:0;border-radius:5px;background:var(--accent-soft);color:var(--accent-strong);font:inherit}.people-loading,.people-empty{padding:34px 12px;color:var(--text-tertiary);text-align:center}.people-data-error{display:grid;justify-items:center;gap:8px;padding:24px 12px;color:#9e493c;text-align:center}.people-data-error p{margin:0}.people-data-error button{padding:0 14px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.selected-people,.people-list{display:grid;gap:8px}.selected-people{padding-bottom:12px;border-bottom:1px solid var(--border-subtle)}.selected-people>span{color:var(--text-tertiary);font-size:11px}.person-option{display:grid;width:100%;min-width:0;grid-template-columns:minmax(0,1fr) 24px;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);text-align:left}.person-option>span{display:grid;min-width:0;gap:3px}.person-option strong,.person-option small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.person-option small{color:var(--text-tertiary)}.person-option>i{display:grid;width:22px;height:22px;border:1px solid var(--border-strong);border-radius:5px;color:transparent;place-items:center}.person-option.selected{border-color:#abc4ec;background:#f5f9ff}.person-option.selected>i{border-color:var(--accent);background:var(--accent);color:#fff}.sheet-primary,.sheet-danger{display:flex;align-items:center;gap:6px;padding:0 14px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.sheet-danger{border-color:#a34a41;background:#a34a41}.spinning{animation:spin .75s linear infinite}.mobile-pagination{margin-top:2px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:380px){.directory-toolbar{grid-template-columns:minmax(0,1fr) 44px}.directory-toolbar>button[type=submit]{grid-column:1/-1;grid-row:2}.group-card footer{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
