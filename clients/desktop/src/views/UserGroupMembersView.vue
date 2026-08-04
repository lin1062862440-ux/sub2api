<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Eye, Pencil, RefreshCw, Trash2, UsersRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import {
  archiveUserGroup, getUserGroupMembers, getUserGroupViewers, listUserGroups,
  replaceUserGroupMembers, replaceUserGroupViewers, updateUserGroup,
  type UserGroup, type UserGroupMember, type UserGroupMutation, type UserGroupViewer,
} from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import UserGroupDetailHeader from '@/components/user-groups/UserGroupDetailHeader.vue'
import UserGroupEditorDialog from '@/components/user-groups/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from '@/components/user-groups/UserGroupPeopleDialog.vue'
import { formatDateTime } from '@/lib/format'
import { session } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const group = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const loading = ref(true)
const error = ref('')
const message = ref('')
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const peopleSaving = ref(false)
const peopleError = ref('')
const editorOpen = ref(false)
const editorSaving = ref(false)
const editorError = ref('')
const groupId = computed(() => Number(route.params.id))
const canManage = computed(() => session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
const selectedPeople = computed(() => peopleMode.value === 'members' ? members.value : viewers.value)

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

async function load() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) { error.value = '团队不存在'; return }
  loading.value = true
  error.value = ''
  try {
    const [groups, roster] = await Promise.all([listUserGroups(), getUserGroupMembers(groupId.value)])
    group.value = groups.find((item) => item.id === groupId.value) ?? null
    members.value = roster
    if (!group.value) error.value = '团队不存在或无权访问'
  } catch (caught) {
    error.value = errorMessage(caught, '团队成员加载失败')
  } finally { loading.value = false }
}

async function openPeople(mode: 'members' | 'viewers') {
  peopleMode.value = mode
  peopleError.value = ''
  if (mode === 'viewers') {
    try { viewers.value = await getUserGroupViewers(groupId.value) }
    catch (caught) { message.value = errorMessage(caught, '查看者加载失败'); return }
  }
  peopleOpen.value = true
}

async function savePeople(ids: number[]) {
  peopleSaving.value = true
  peopleError.value = ''
  try {
    if (peopleMode.value === 'members') await replaceUserGroupMembers(groupId.value, ids)
    else await replaceUserGroupViewers(groupId.value, ids)
    peopleOpen.value = false
    message.value = `${peopleMode.value === 'members' ? '成员' : '查看者'}已更新`
    await load()
  } catch (caught) { peopleError.value = errorMessage(caught, '人员保存失败') }
  finally { peopleSaving.value = false }
}

async function saveGroup(payload: UserGroupMutation) {
  editorSaving.value = true
  editorError.value = ''
  try { await updateUserGroup(groupId.value, payload); editorOpen.value = false; message.value = '团队信息已更新'; await load() }
  catch (caught) { editorError.value = errorMessage(caught, '团队保存失败') }
  finally { editorSaving.value = false }
}

async function archive() {
  if (!group.value || !window.confirm(`确认归档团队“${group.value.name}”？历史数据会保留。`)) return
  try { await archiveUserGroup(group.value.id); await router.replace({ name: 'user-groups' }) }
  catch (caught) { message.value = errorMessage(caught, '团队归档失败') }
}

onMounted(() => void load())
</script>

<template>
  <div class="team-detail-page">
    <UserGroupDetailHeader :group="group" :read-only="!canManage">
      <template #actions>
        <button v-if="canManage" class="primary" data-testid="manage-team-members" @click="openPeople('members')"><UsersRound :size="15" />管理成员</button>
        <button title="刷新" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
      </template>
    </UserGroupDetailHeader>
    <p v-if="message" class="ug-message">{{ message }}</p>
    <div v-if="error" class="team-error"><strong>无法加载团队</strong><span>{{ error }}</span><button @click="load">重试</button></div>
    <template v-else-if="group">
      <section class="team-summary"><div><span>团队成员</span><strong>{{ group.member_count }}</strong></div><div><span>查看者</span><strong>{{ group.viewer_count }}</strong></div><div><span>提示词留存</span><strong>{{ group.prompt_capture_enabled ? '已启用' : '未启用' }}</strong></div></section>
      <div v-if="canManage" class="team-toolbar">
        <button data-testid="manage-team-viewers" @click="openPeople('viewers')"><Eye :size="15" />管理查看者</button>
        <button @click="editorOpen = true"><Pencil :size="15" />编辑团队</button>
        <button class="danger" @click="archive"><Trash2 :size="15" />归档</button>
      </div>
      <section class="roster">
        <header><div><h2>成员名册</h2><p>团队配额和用量均按下列成员统计。</p></div><span>{{ members.length }} 人</span></header>
        <div v-if="loading" class="roster-loading"><i v-for="n in 5" :key="n" /></div>
        <div v-else-if="!members.length" class="roster-empty">暂无成员</div>
        <template v-else><div class="roster-row head"><span>成员</span><span>状态</span><span>加入时间</span></div><article v-for="member in members" :key="member.user_id" class="roster-row"><div><UserAvatar :name="member.username || member.email" :src="member.avatar_url" /><span><strong>{{ member.username || member.email }}</strong><small>{{ member.email }}</small></span></div><em>{{ member.status }}</em><time>{{ formatDateTime(member.joined_at) }}</time></article></template>
      </section>
    </template>
    <UserGroupEditorDialog v-model="editorOpen" :group="group" :saving="editorSaving" :error="editorError" @save="saveGroup" />
    <UserGroupPeopleDialog v-model="peopleOpen" :mode="peopleMode" :group-name="group?.name || ''" :selected-people="selectedPeople" :saving="peopleSaving" :error="peopleError" @save="savePeople" />
  </div>
</template>

<style scoped>
.team-detail-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.ug-message{margin-top:12px}.team-error{display:grid;min-height:280px;margin-top:14px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.team-error strong{color:var(--text-primary)}.team-error button{height:34px;padding:0 12px;border:0;border-radius:6px;background:var(--accent);color:white}.team-summary{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.82)}.team-summary>div{display:grid;min-height:72px;align-content:center;gap:5px;padding:0 16px;border-right:1px solid var(--border-subtle)}.team-summary>div:last-child{border:0}.team-summary span{color:var(--text-tertiary);font-size:10px}.team-summary strong{font-family:var(--font-data);font-size:17px}.team-toolbar{display:flex;gap:7px;margin-top:12px}.team-toolbar button{display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.team-toolbar .danger{color:var(--danger)}.roster{margin-top:12px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.84)}.roster>header{display:flex;min-height:64px;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--border-subtle)}.roster h2{margin:0;font-size:14px}.roster p{margin:3px 0 0;color:var(--text-tertiary);font-size:10px}.roster>header>span{color:var(--text-tertiary);font-size:11px}.roster-row{display:grid;min-height:62px;grid-template-columns:minmax(220px,1fr) 110px 150px;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--border-subtle);font-size:11px}.roster-row:last-child{border:0}.roster-row.head{min-height:38px;background:var(--bg-base);color:var(--text-tertiary);font-size:10px}.roster-row>div{display:flex;min-width:0;align-items:center;gap:9px}.roster-row :deep(.user-avatar){width:34px;height:34px}.roster-row>div>span{display:grid;min-width:0;gap:2px}.roster-row strong,.roster-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-row small,.roster-row time{color:var(--text-tertiary)}.roster-row em{width:max-content;padding:4px 7px;border-radius:5px;background:#eaf8f1;color:#277a58;font-style:normal}.roster-loading{display:grid;gap:1px}.roster-loading i{height:62px;background:var(--skeleton);animation:pulse 1.2s infinite}.roster-empty{display:grid;min-height:220px;color:var(--text-tertiary);place-items:center}@container app-content (max-width:700px){.team-detail-page{padding:24px}.roster-row{grid-template-columns:minmax(180px,1fr) 90px}.roster-row>*:last-child{display:none}}
</style>
