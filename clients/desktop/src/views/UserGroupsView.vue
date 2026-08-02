<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CirclePlus, Eye, Pencil, RefreshCw, Search, Trash2, UsersRound } from '@lucide/vue'

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
import UserGroupEditorDialog from '@/components/user-groups/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from '@/components/user-groups/UserGroupPeopleDialog.vue'
import UserGroupWorkspaceTabs from '@/components/user-groups/UserGroupWorkspaceTabs.vue'
import { formatDateTime } from '@/lib/format'
import { session } from '@/stores/session'

const groups = ref<UserGroup[]>([])
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const message = ref('')
const search = ref('')
const editorOpen = ref(false)
const editingGroup = ref<UserGroup | null>(null)
const saving = ref(false)
const editorError = ref('')
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const peopleGroup = ref<UserGroup | null>(null)
const selectedPeople = ref<Array<UserGroupMember | UserGroupViewer>>([])
const peopleSaving = ref(false)
const peopleError = ref('')

const canManage = computed(() => session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return groups.value
  return groups.value.filter((group) => `${group.name} ${group.description}`.toLocaleLowerCase().includes(query))
})

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

async function load(background = false) {
  if (background) refreshing.value = true
  else loading.value = true
  loadError.value = ''
  try {
    groups.value = await listUserGroups()
  } catch (caught) {
    loadError.value = errorMessage(caught, '用户组加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function openCreate() {
  editingGroup.value = null
  editorError.value = ''
  editorOpen.value = true
}

function openEdit(group: UserGroup) {
  editingGroup.value = group
  editorError.value = ''
  editorOpen.value = true
}

async function saveGroup(payload: UserGroupMutation) {
  saving.value = true
  editorError.value = ''
  try {
    if (editingGroup.value) await updateUserGroup(editingGroup.value.id, payload)
    else await createUserGroup(payload)
    editorOpen.value = false
    message.value = editingGroup.value ? '用户组已更新' : '用户组已创建'
    await load(true)
  } catch (caught) {
    editorError.value = errorMessage(caught, '用户组保存失败')
  } finally {
    saving.value = false
  }
}

async function openPeople(group: UserGroup, mode: 'members' | 'viewers') {
  peopleGroup.value = group
  peopleMode.value = mode
  peopleError.value = ''
  try {
    selectedPeople.value = mode === 'members'
      ? await getUserGroupMembers(group.id)
      : await getUserGroupViewers(group.id)
    peopleOpen.value = true
  } catch (caught) {
    message.value = errorMessage(caught, `${mode === 'members' ? '成员' : '查看者'}加载失败`)
  }
}

async function savePeople(ids: number[]) {
  if (!peopleGroup.value) return
  peopleSaving.value = true
  peopleError.value = ''
  try {
    if (peopleMode.value === 'members') await replaceUserGroupMembers(peopleGroup.value.id, ids)
    else await replaceUserGroupViewers(peopleGroup.value.id, ids)
    peopleOpen.value = false
    message.value = `${peopleMode.value === 'members' ? '成员' : '查看者'}已更新`
    await load(true)
  } catch (caught) {
    peopleError.value = errorMessage(caught, '人员保存失败')
  } finally {
    peopleSaving.value = false
  }
}

async function archive(group: UserGroup) {
  if (!window.confirm(`确认归档用户组“${group.name}”？历史数据会保留。`)) return
  try {
    await archiveUserGroup(group.id)
    message.value = '用户组已归档'
    await load(true)
  } catch (caught) {
    message.value = errorMessage(caught, '用户组归档失败')
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="user-group-page">
    <header class="ug-page-header drag-region">
      <div><span>USER GROUP WORKSPACE</span><h1>用户组</h1><p>组织成员并集中查看组内订阅与使用情况。</p></div>
      <button v-if="canManage" class="ug-primary no-drag" data-testid="create-user-group" type="button" @click="openCreate"><CirclePlus :size="17" />新建用户组</button>
    </header>
    <UserGroupWorkspaceTabs />

    <section class="ug-access-band">
      <div><strong>{{ canManage ? '管理员权限' : '只读访问' }}</strong><span>{{ canManage ? '可创建用户组、维护成员与查看者，并归档不再使用的组。' : '可以查看获授权用户组的订阅和用量。' }}</span></div>
      <dl><div><dt>可访问用户组</dt><dd>{{ groups.length }}</dd></div><div><dt>访问模式</dt><dd>{{ canManage ? '管理' : '只读' }}</dd></div></dl>
    </section>

    <div class="ug-directory-toolbar"><label><Search :size="16" /><input v-model="search" data-testid="user-group-search" placeholder="搜索用户组名称或描述" /></label><span>共 {{ filtered.length }} 个用户组</span><button type="button" title="刷新" :disabled="refreshing" @click="load(true)"><RefreshCw :size="16" :class="{ spinning: refreshing }" /></button></div>
    <p v-if="message" class="ug-message" role="status">{{ message }}</p>

    <section class="ug-directory">
      <div v-if="loading" class="ug-loading"><i v-for="n in 5" :key="n" /></div>
      <div v-else-if="loadError" class="ug-empty"><strong>用户组加载失败</strong><span>{{ loadError }}</span><button type="button" @click="load()">重新加载</button></div>
      <div v-else-if="!filtered.length" class="ug-empty"><strong>{{ groups.length ? '没有匹配的用户组' : '暂无可访问的用户组' }}</strong><span>{{ groups.length ? '调整搜索条件后重试。' : canManage ? '创建第一个用户组并添加成员。' : '请联系管理员授予查看权限。' }}</span></div>
      <template v-else>
        <div class="ug-directory-row head"><span>用户组</span><span>成员</span><span>查看者</span><span>最近更新</span><span>操作</span></div>
        <article v-for="group in filtered" :key="group.id" class="ug-directory-row">
          <div class="ug-group-identity"><i>{{ group.name.trim().slice(0, 1) || '#' }}</i><div><strong>{{ group.name }}</strong><span>{{ group.description || '暂无说明' }}</span></div></div>
          <strong class="ug-number">{{ group.member_count }}</strong>
          <strong class="ug-number">{{ group.viewer_count }}</strong>
          <span class="ug-date">{{ formatDateTime(group.updated_at) }}</span>
          <div class="ug-row-actions">
            <RouterLink :to="{ name: 'user-group-subscriptions', query: { group_id: String(group.id) } }">订阅</RouterLink>
            <RouterLink :to="{ name: 'user-group-usage', query: { group_id: String(group.id) } }">用量</RouterLink>
            <button v-if="canManage" type="button" title="管理成员" :data-testid="`group-members-${group.id}`" @click="openPeople(group, 'members')"><UsersRound :size="15" /></button>
            <button v-if="canManage" type="button" title="管理查看者" :data-testid="`group-viewers-${group.id}`" @click="openPeople(group, 'viewers')"><Eye :size="15" /></button>
            <button v-if="canManage" type="button" title="编辑用户组" :data-testid="`edit-user-group-${group.id}`" @click="openEdit(group)"><Pencil :size="15" /></button>
            <button v-if="canManage" class="danger" type="button" title="归档用户组" :data-testid="`archive-user-group-${group.id}`" @click="archive(group)"><Trash2 :size="15" /></button>
          </div>
        </article>
      </template>
    </section>

    <UserGroupEditorDialog v-model="editorOpen" :group="editingGroup" :saving="saving" :error="editorError" @save="saveGroup" />
    <UserGroupPeopleDialog v-model="peopleOpen" :mode="peopleMode" :group-name="peopleGroup?.name || ''" :selected-people="selectedPeople" :saving="peopleSaving" :error="peopleError" @save="savePeople" />
  </div>
</template>

<style scoped>
.user-group-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.ug-page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.ug-page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.ug-page-header h1{margin:0;font-size:25px}.ug-page-header p{margin:7px 0 0;color:var(--text-secondary);font-size:14px}.ug-primary{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:0;border-radius:7px;background:var(--accent);color:white;font-weight:650}.ug-access-band{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:14px;padding:12px 15px;background:rgba(255,255,255,.8);border:1px solid var(--border-subtle);border-radius:8px}.ug-access-band>div{display:grid;gap:3px}.ug-access-band strong{font-size:12px}.ug-access-band span{color:var(--text-tertiary);font-size:11px}.ug-access-band dl{display:flex;gap:28px;margin:0}.ug-access-band dl div{display:grid;gap:3px}.ug-access-band dt{color:var(--text-tertiary);font-size:9px}.ug-access-band dd{margin:0;font-family:var(--font-data);font-size:13px;font-weight:700}.ug-directory-toolbar{display:flex;align-items:center;gap:8px;margin-top:12px}.ug-directory-toolbar label{display:flex;height:38px;min-width:220px;flex:1;align-items:center;gap:8px;padding:0 11px;background:white;border:1px solid var(--border-subtle);border-radius:7px;color:var(--text-tertiary)}.ug-directory-toolbar input{width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:13px}.ug-directory-toolbar>span{color:var(--text-tertiary);font-size:11px}.ug-directory-toolbar>button{display:grid;width:38px;height:38px;padding:0;background:white;border:1px solid var(--border-subtle);border-radius:7px;color:var(--text-secondary);place-items:center}.ug-message{margin:10px 0 -1px;padding:8px 11px;background:#edf5ff;border:1px solid #d3e3f8;border-radius:7px;color:#3f67a2;font-size:12px}.ug-directory{min-height:300px;margin-top:11px;overflow:hidden;background:rgba(255,255,255,.82);border:1px solid var(--border-subtle);border-radius:8px}.ug-directory-row{display:grid;min-height:72px;grid-template-columns:minmax(190px,1.5fr) 64px 68px 120px minmax(260px,1fr);align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--border-subtle);font-size:11px}.ug-directory-row:last-child{border-bottom:0}.ug-directory-row.head{min-height:40px;background:rgba(244,247,251,.88);color:var(--text-tertiary);font-size:10px;font-weight:650}.ug-group-identity{display:grid;min-width:0;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:10px}.ug-group-identity>i{display:grid;width:36px;height:36px;background:#eaf1fd;border-radius:8px;color:var(--accent-strong);font-style:normal;font-weight:760;place-items:center}.ug-group-identity>div{display:grid;min-width:0;gap:3px}.ug-group-identity strong,.ug-group-identity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ug-group-identity strong{font-size:12px}.ug-group-identity span,.ug-date{color:var(--text-tertiary);font-size:10px}.ug-number{font-family:var(--font-data);font-size:12px}.ug-row-actions{display:flex;justify-content:flex-end;gap:5px}.ug-row-actions a,.ug-row-actions button{display:grid;height:30px;min-width:30px;padding:0 8px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:10px;place-items:center}.ug-row-actions button.danger{color:var(--danger)}.ug-loading{display:grid;gap:1px}.ug-loading i{height:72px;background:var(--skeleton);animation:pulse 1.2s ease-in-out infinite}.ug-empty{display:grid;min-height:280px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.ug-empty strong{color:var(--text-primary)}.ug-empty button{height:34px;padding:0 12px;border:0;border-radius:7px;background:var(--accent);color:white}@container app-content (max-width: 900px){.user-group-page{padding:24px}.ug-directory-row{grid-template-columns:minmax(180px,1.5fr) 56px 64px minmax(220px,1fr)}.ug-directory-row>*:nth-child(4){display:none}.ug-access-band dl{display:none}}@container app-content (max-width: 690px){.ug-page-header{align-items:flex-start;flex-direction:column}.ug-primary{width:100%;justify-content:center}.ug-directory-row{grid-template-columns:minmax(160px,1fr) minmax(170px,.8fr)}.ug-directory-row>*:nth-child(2),.ug-directory-row>*:nth-child(3){display:none}.ug-row-actions a{display:none}.ug-access-band{align-items:flex-start}.ug-directory-toolbar>span{display:none}}
</style>
