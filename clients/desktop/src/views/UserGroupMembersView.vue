<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Eye, Pencil, RefreshCw, Save, Settings2, ShieldCheck, Trash2, UsersRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import {
  archiveUserGroup, getUserGroupMembers, getUserGroupPromptViewers, getUserGroupQuotaOverview,
  getUserGroupViewers, listUserGroups, replaceUserGroupMembers, replaceUserGroupPromptViewers,
  replaceUserGroupQuotaManagers, replaceUserGroupTeamSubscriptions, replaceUserGroupViewers,
  resetUserGroupQuotaUsage, setUserGroupPromptCapture, setUserGroupQuotaPolicy,
  updateUserGroup, updateUserGroupMemberQuotas, type UserGroup, type UserGroupMember,
  type UserGroupMutation, type UserGroupQuotaMember, type UserGroupQuotaOverview, type UserGroupViewer,
} from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import TeamQuotaSettingsSheet, { type TeamQuotaPolicyDraft } from '@/components/user-groups/TeamQuotaSettingsSheet.vue'
import UserGroupDetailHeader from '@/components/user-groups/UserGroupDetailHeader.vue'
import UserGroupEditorDialog from '@/components/user-groups/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from '@/components/user-groups/UserGroupPeopleDialog.vue'
import UserGroupPromptSettingsDialog from '@/components/user-groups/UserGroupPromptSettingsDialog.vue'
import { formatCost } from '@/lib/format'
import { session } from '@/stores/session'
import { toast } from '@/stores/toast'

const route = useRoute()
const router = useRouter()
const group = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const promptViewers = ref<UserGroupViewer[]>([])
const overview = ref<UserGroupQuotaOverview | null>(null)
const memberLimits = ref<Record<number, string>>({})
const groupLoading = ref(false)
const membersLoading = ref(false)
const quotaLoading = ref(false)
const groupError = ref('')
const membersError = ref('')
const quotaError = ref('')
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const peopleSaving = ref(false)
const peopleError = ref('')
const editorOpen = ref(false)
const editorSaving = ref(false)
const editorError = ref('')
const promptSettingsOpen = ref(false)
const promptSettingsSaving = ref(false)
const promptSettingsError = ref('')
const quotaSheetOpen = ref(false)
const quotaSheetSaving = ref(false)
const quotaSheetResetting = ref(false)
const quotaSheetError = ref('')
const quotaManagerOpen = ref(false)
const quotaManagerSaving = ref(false)
const quotaManagerError = ref('')
const memberQuotasSaving = ref(false)

const groupId = computed(() => Number(route.params.id))
const isSystemAdmin = computed(() => session.user?.role === 'admin')
const canManage = computed(() => session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
const canManageQuotas = computed(() => canManage.value && overview.value?.can_manage === true)
const canConfigureQuota = computed(() => overview.value?.can_configure === true)
const selectedPeople = computed(() => peopleMode.value === 'members' ? members.value : viewers.value)
const weeklyLimit = computed(() => overview.value?.policy.weekly_limit_usd ?? 0)
const weeklyUsed = computed(() => overview.value?.policy.weekly_usage_usd ?? 0)
const allocated = computed(() => Object.values(memberLimits.value).reduce((sum, raw) => {
  const value = Number(raw)
  return sum + (Number.isFinite(value) && value >= 0 ? value : 0)
}, 0))
const unallocated = computed(() => Math.max(0, weeklyLimit.value - allocated.value))
const loading = computed(() => groupLoading.value || membersLoading.value || quotaLoading.value)
const membersValid = computed(() => Object.values(memberLimits.value).every((raw) => {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0
}) && allocated.value <= weeklyLimit.value + 0.000001)

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

function syncQuotaDrafts() {
  if (!overview.value) return
  memberLimits.value = Object.fromEntries(overview.value.members.map((member) => [member.user_id, String(member.weekly_limit_usd || 0)]))
}

async function loadQuota() {
  quotaLoading.value = true
  quotaError.value = ''
  try {
    overview.value = await getUserGroupQuotaOverview(groupId.value)
    syncQuotaDrafts()
    if (String(route.query.openQuota ?? '') === '1' && overview.value.can_configure) quotaSheetOpen.value = true
    return true
  } catch (caught) {
    quotaError.value = errorMessage(caught, '团队配额加载失败')
    return false
  } finally {
    quotaLoading.value = false
  }
}

async function loadGroup() {
  groupLoading.value = true
  groupError.value = ''
  try {
    const groups = await listUserGroups()
    group.value = groups.find((item) => item.id === groupId.value) ?? null
    if (!group.value) groupError.value = '团队不存在或无权访问'
  } catch (caught) {
    groupError.value = errorMessage(caught, '团队加载失败')
  } finally {
    groupLoading.value = false
  }
}

async function loadMembers() {
  membersLoading.value = true
  membersError.value = ''
  try {
    members.value = await getUserGroupMembers(groupId.value)
  } catch (caught) {
    membersError.value = errorMessage(caught, '团队成员加载失败')
  } finally {
    membersLoading.value = false
  }
}

async function load() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) {
    groupError.value = '团队不存在'
    return
  }
  await Promise.all([loadGroup(), loadMembers(), loadQuota()])
}

async function syncQuotaAfterMutation(successTitle: string) {
  if (await loadQuota()) return
  toast.warning(`${successTitle}，但最新数据同步失败`, {
    detail: quotaError.value || '请稍后手动刷新。',
  })
}

function quotaMember(userId: number): UserGroupQuotaMember | undefined {
  return overview.value?.members.find((member) => member.user_id === userId)
}

function memberLimit(userId: number) {
  const value = Number(memberLimits.value[userId])
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function usagePercent(userId: number) {
  const used = quotaMember(userId)?.weekly_usage_usd ?? 0
  const limit = memberLimit(userId)
  return limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : used > 0 ? 100 : 0
}

async function openPeople(mode: 'members' | 'viewers') {
  peopleMode.value = mode
  peopleError.value = ''
  if (mode === 'viewers') {
    try { viewers.value = await getUserGroupViewers(groupId.value) }
    catch (caught) { toast.error('查看者加载失败', { detail: errorMessage(caught, '请稍后重试。') }); return }
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
    toast.success(`${peopleMode.value === 'members' ? '成员' : '查看者'}已更新`)
    await load()
  } catch (caught) { peopleError.value = errorMessage(caught, '人员保存失败') }
  finally { peopleSaving.value = false }
}

async function openPromptSettings() {
  promptSettingsError.value = ''
  try {
    promptViewers.value = await getUserGroupPromptViewers(groupId.value)
    promptSettingsOpen.value = true
  } catch (caught) {
    toast.error('Prompt 查看者加载失败', { detail: errorMessage(caught, '请稍后重试。') })
  }
}

async function savePromptSettings(payload: { enabled: boolean; userIds: number[] }) {
  promptSettingsSaving.value = true
  promptSettingsError.value = ''
  try {
    await Promise.all([
      setUserGroupPromptCapture(groupId.value, payload.enabled),
      replaceUserGroupPromptViewers(groupId.value, payload.userIds),
    ])
    promptSettingsOpen.value = false
    toast.success('Prompt 设置已更新')
    await load()
  } catch (caught) {
    promptSettingsError.value = errorMessage(caught, 'Prompt 设置保存失败')
  } finally {
    promptSettingsSaving.value = false
  }
}

async function saveGroup(payload: UserGroupMutation) {
  editorSaving.value = true
  editorError.value = ''
  try { await updateUserGroup(groupId.value, payload); editorOpen.value = false; toast.success('团队信息已更新'); await load() }
  catch (caught) { editorError.value = errorMessage(caught, '团队保存失败') }
  finally { editorSaving.value = false }
}

async function archive() {
  if (!group.value || !window.confirm(`确认归档团队“${group.value.name}”？历史数据会保留。`)) return
  try { await archiveUserGroup(group.value.id); await router.replace({ name: 'user-groups' }) }
  catch (caught) { toast.error('团队归档失败', { detail: errorMessage(caught, '请稍后重试。') }) }
}

async function saveMemberQuotas() {
  if (!overview.value || !canManageQuotas.value || !membersValid.value) return
  memberQuotasSaving.value = true
  try {
    await updateUserGroupMemberQuotas(groupId.value, overview.value.members.map((member) => ({
      user_id: member.user_id,
      weekly_limit_usd: memberLimit(member.user_id),
    })))
    toast.success('成员配额已保存')
    await syncQuotaAfterMutation('成员配额已保存')
  } catch (caught) {
    toast.error('成员配额保存失败', { detail: errorMessage(caught, '请稍后重试。') })
  } finally {
    memberQuotasSaving.value = false
  }
}

async function saveQuotaPolicy(draft: TeamQuotaPolicyDraft) {
  if (!canConfigureQuota.value) return
  quotaSheetSaving.value = true
  quotaSheetError.value = ''
  try {
    await replaceUserGroupTeamSubscriptions(groupId.value, draft.teamSubscriptionIds)
    await setUserGroupQuotaPolicy(groupId.value, {
      enabled: draft.enabled,
      weekly_limit_usd: draft.weeklyLimit,
    })
    toast.success('团队周配额已保存')
    quotaSheetOpen.value = false
    await syncQuotaAfterMutation('团队周配额已保存')
  } catch (caught) {
    quotaSheetError.value = errorMessage(caught, '配额策略保存失败')
    toast.error('团队周配额保存失败', { detail: quotaSheetError.value })
  } finally {
    quotaSheetSaving.value = false
  }
}

function openQuotaManagers() {
  quotaSheetOpen.value = false
  quotaManagerError.value = ''
  quotaManagerOpen.value = true
}

async function saveQuotaManagers(ids: number[]) {
  quotaManagerSaving.value = true
  quotaManagerError.value = ''
  try {
    await replaceUserGroupQuotaManagers(groupId.value, ids)
    quotaManagerOpen.value = false
    toast.success('配额管理员已更新')
    await syncQuotaAfterMutation('配额管理员已更新')
  } catch (caught) {
    quotaManagerError.value = errorMessage(caught, '配额管理员保存失败')
  } finally {
    quotaManagerSaving.value = false
  }
}

async function resetQuotaUsage() {
  if (!canConfigureQuota.value) return
  quotaSheetResetting.value = true
  quotaSheetError.value = ''
  try {
    await resetUserGroupQuotaUsage(groupId.value)
    toast.success('团队配额用量已重置')
    await syncQuotaAfterMutation('团队配额用量已重置')
  } catch (caught) {
    quotaSheetError.value = errorMessage(caught, '配额重置失败')
    toast.error('团队配额重置失败', { detail: quotaSheetError.value })
  } finally {
    quotaSheetResetting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="team-detail-page">
    <UserGroupDetailHeader :group="group" :read-only="!canManage">
      <template #actions>
        <button v-if="canConfigureQuota" data-testid="open-team-quota-settings" @click="quotaSheetOpen = true"><Settings2 :size="15" />设置周配额</button>
        <button v-if="canManage" class="primary" data-testid="manage-team-members" @click="openPeople('members')"><UsersRound :size="15" />管理成员</button>
        <button title="刷新" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
      </template>
    </UserGroupDetailHeader>
    <div v-if="groupError && !group" class="team-error"><strong>无法加载团队</strong><span>{{ groupError }}</span><button @click="loadGroup">重试</button></div>
    <template v-else-if="group">
      <section v-if="overview" class="team-summary" data-testid="team-quota-summary">
        <div><span>成员数量</span><strong>{{ group.member_count }} 人</strong></div>
        <div><span>团队周配额</span><strong>{{ formatCost(weeklyLimit) }}</strong></div>
        <div><span>本周用量</span><strong class="used">{{ formatCost(weeklyUsed) }}</strong></div>
        <div><span>已分配成员额度</span><strong>{{ formatCost(allocated) }}</strong></div>
        <div><span>未分配额度</span><strong :class="{ exhausted: overview.policy.enabled && unallocated <= 0 }">{{ formatCost(unallocated) }}</strong></div>
      </section>
      <p v-if="quotaError" class="quota-inline-error" data-testid="team-quota-error" role="alert"><span>{{ quotaError }}</span><button type="button" data-testid="retry-team-quota" @click="loadQuota">重新加载配额</button></p>
      <section v-if="overview" class="team-sources">
        <div><h2>团队订阅来源</h2><p>成员配额通过下列团队订阅结算。</p></div>
        <div><span v-for="item in overview.team_subscription_groups" :key="item.billing_group_id"><b>{{ item.platform }}</b>{{ item.name }}</span><em v-if="!overview.team_subscription_groups.length">尚未绑定团队订阅</em></div>
      </section>
      <div v-if="canManage" class="team-toolbar">
        <button data-testid="manage-team-viewers" @click="openPeople('viewers')"><Eye :size="15" />管理查看者</button>
        <button v-if="isSystemAdmin" data-testid="manage-team-prompts" @click="openPromptSettings"><ShieldCheck :size="15" />Prompt 设置</button>
        <button @click="editorOpen = true"><Pencil :size="15" />编辑团队</button>
        <button class="danger" @click="archive"><Trash2 :size="15" />归档</button>
      </div>
      <section class="roster">
        <header>
          <div><h2>成员与配额</h2><p>成员身份、本周用量和分配额度集中维护。</p></div>
          <div class="roster-actions">
            <span>{{ members.length }} 人<span v-if="overview"> · 已分配 {{ formatCost(allocated) }}</span></span>
            <button v-if="canManageQuotas" class="save-quotas" data-testid="save-member-quotas" :disabled="memberQuotasSaving || !membersValid" @click="saveMemberQuotas"><Save :size="15" />{{ memberQuotasSaving ? '保存中' : '保存成员额度' }}</button>
          </div>
        </header>
        <p v-if="membersError" class="quota-inline-error" data-testid="team-members-error" role="alert"><span>{{ membersError }}</span><button type="button" data-testid="retry-team-members" @click="loadMembers">重新加载成员</button></p>
        <div v-if="membersLoading && !members.length" class="roster-loading"><i v-for="n in 5" :key="n" /></div>
        <div v-else-if="!members.length && !membersError" class="roster-empty">暂无成员</div>
        <template v-else>
          <div class="roster-row head"><span>成员</span><span>访问状态</span><span>本周用量</span><span>使用进度</span><span>成员周配额</span></div>
          <article v-for="member in members" :key="member.user_id" class="roster-row" :data-testid="`team-member-row-${member.user_id}`">
            <div><UserAvatar :name="member.username || member.email" :src="member.avatar_url" /><span><strong>{{ member.username || member.email }}</strong><small>{{ member.email }}</small></span></div>
            <em>{{ member.status === 'active' ? '可访问' : member.status }}</em>
            <strong class="member-usage">{{ formatCost(quotaMember(member.user_id)?.weekly_usage_usd ?? 0) }}</strong>
            <div class="member-progress"><i><b :style="{ width: `${usagePercent(member.user_id)}%` }" :class="{ full: usagePercent(member.user_id) >= 100 }" /></i><small>{{ usagePercent(member.user_id) }}%</small></div>
            <label class="member-quota-input"><span>$</span><input v-model="memberLimits[member.user_id]" type="number" min="0" step="0.01" :disabled="!canManageQuotas" :data-testid="`member-quota-${member.user_id}`" /></label>
          </article>
        </template>
        <p v-if="overview && !membersValid" class="member-quota-validation" role="alert">成员配额必须为非负数，且总分配不能超过团队周配额。</p>
      </section>
    </template>
    <UserGroupEditorDialog v-model="editorOpen" :group="group" :saving="editorSaving" :error="editorError" @save="saveGroup" />
    <UserGroupPeopleDialog v-model="peopleOpen" :mode="peopleMode" :group-name="group?.name || ''" :selected-people="selectedPeople" :saving="peopleSaving" :error="peopleError" @save="savePeople" />
    <UserGroupPeopleDialog v-model="quotaManagerOpen" mode="quota-managers" :group-name="group?.name || ''" :selected-people="overview?.managers || []" :saving="quotaManagerSaving" :error="quotaManagerError" @save="saveQuotaManagers" />
    <UserGroupPromptSettingsDialog v-model="promptSettingsOpen" :group-name="group?.name || ''" :capture-enabled="Boolean(group?.prompt_capture_enabled)" :selected-people="promptViewers" :saving="promptSettingsSaving" :error="promptSettingsError" @save="savePromptSettings" />
    <TeamQuotaSettingsSheet v-model="quotaSheetOpen" :overview="overview" :saving="quotaSheetSaving" :resetting="quotaSheetResetting" :error="quotaSheetError" @save="saveQuotaPolicy" @manage="openQuotaManagers" @reset="resetQuotaUsage" />
  </div>
</template>

<style scoped>
.team-detail-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.ug-message{margin-top:12px}.team-error{display:grid;min-height:280px;margin-top:14px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.team-error strong{color:var(--text-primary)}.team-error button{height:34px;padding:0 12px;border:0;border-radius:6px;background:var(--accent);color:white}.team-summary{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.82)}.team-summary>div{display:grid;min-height:72px;align-content:center;gap:5px;padding:0 16px;border-right:1px solid var(--border-subtle)}.team-summary>div:last-child{border:0}.team-summary span{color:var(--text-tertiary);font-size:10px}.team-summary strong{font-family:var(--font-data);font-size:17px}.team-toolbar{display:flex;gap:7px;margin-top:12px}.team-toolbar button{display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.team-toolbar .danger{color:var(--danger)}.roster{margin-top:12px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.84)}.roster>header{display:flex;min-height:64px;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--border-subtle)}.roster h2{margin:0;font-size:14px}.roster p{margin:3px 0 0;color:var(--text-tertiary);font-size:10px}.roster>header>span{color:var(--text-tertiary);font-size:11px}.roster-row{display:grid;min-height:62px;grid-template-columns:minmax(220px,1fr) 110px 150px;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--border-subtle);font-size:11px}.roster-row:last-child{border:0}.roster-row.head{min-height:38px;background:var(--bg-base);color:var(--text-tertiary);font-size:10px}.roster-row>div{display:flex;min-width:0;align-items:center;gap:9px}.roster-row :deep(.user-avatar){width:34px;height:34px}.roster-row>div>span{display:grid;min-width:0;gap:2px}.roster-row strong,.roster-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-row small,.roster-row time{color:var(--text-tertiary)}.roster-row em{width:max-content;padding:4px 7px;border-radius:5px;background:#eaf8f1;color:#277a58;font-style:normal}.roster-loading{display:grid;gap:1px}.roster-loading i{height:62px;background:var(--skeleton);animation:pulse 1.2s infinite}.roster-empty{display:grid;min-height:220px;color:var(--text-tertiary);place-items:center}@container app-content (max-width:700px){.team-detail-page{padding:24px}.roster-row{grid-template-columns:minmax(180px,1fr) 90px}.roster-row>*:last-child{display:none}}
.team-summary{grid-template-columns:repeat(5,minmax(0,1fr))}.team-summary .used{color:var(--accent-strong)}.team-summary .exhausted{color:var(--danger)}
.quota-inline-error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 0;padding:10px 12px;border:1px solid var(--coral-border);border-radius:7px;background:var(--coral-soft);color:var(--danger);font-size:11px}.quota-inline-error button{height:30px;padding:0 9px;border:1px solid var(--coral-border);border-radius:6px;background:white;color:var(--danger)}
.team-sources{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:10px;padding:12px 15px;border-bottom:1px solid var(--border-subtle)}.team-sources h2{font-size:13px}.team-sources p{margin-top:3px;color:var(--text-tertiary);font-size:10px}.team-sources>div:last-child{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.team-sources>div:last-child span{display:flex;gap:5px;padding:5px 8px;border-radius:6px;background:#eaf8f1;color:#277a58;font-size:9px}.team-sources b{text-transform:uppercase}.team-sources em{color:var(--text-tertiary);font-size:11px;font-style:normal}
.roster>header{gap:14px}.roster-actions{display:flex;align-items:center;gap:12px}.roster-actions>span{color:var(--text-tertiary);font-size:11px}.roster-actions .save-quotas{display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:0;border-radius:6px;background:var(--accent);color:white;font-size:11px;font-weight:650}.roster-actions .save-quotas:disabled{opacity:.5}
.roster-row{grid-template-columns:minmax(190px,1.4fr) 82px 82px minmax(110px,.75fr) 105px}.member-usage{font-family:var(--font-data)}.member-progress{display:flex!important;align-items:center;gap:7px}.member-progress i{display:block;height:6px;flex:1;overflow:hidden;border-radius:6px;background:#dfe5ed}.member-progress b{display:block;height:100%;border-radius:inherit;background:var(--accent)}.member-progress b.full{background:var(--danger)}.member-progress small{font-size:9px}.member-quota-input{position:relative}.member-quota-input span{position:absolute;top:10px;left:8px;color:var(--text-tertiary);font-size:10px}.member-quota-input input{width:100%;height:34px;padding:0 8px 0 19px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary)}.member-quota-input input:disabled{background:var(--bg-base);color:var(--text-secondary)}.member-quota-validation{margin:10px 15px 13px;padding:8px 10px;border:1px solid var(--warning-border);border-radius:6px;background:var(--warning-soft);color:var(--warning);font-size:10px}
@container app-content (max-width:900px){.team-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.team-summary>div:last-child{grid-column:1/-1}.roster-row{grid-template-columns:minmax(180px,1.3fr) 74px 76px 100px}.roster-row>*:nth-child(4){display:none}}
@container app-content (max-width:650px){.team-sources{align-items:flex-start;flex-direction:column}.team-sources>div:last-child{justify-content:flex-start}.roster>header{align-items:flex-start;flex-direction:column;padding:12px 16px}.roster-actions{width:100%;justify-content:space-between}.roster-row{grid-template-columns:minmax(160px,1fr) 76px 96px}.roster-row>*:nth-child(2),.roster-row>*:nth-child(4){display:none}}
</style>
