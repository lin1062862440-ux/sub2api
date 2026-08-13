<script setup lang="ts">
import { ArrowLeft, RefreshCw, Save, Settings2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getUserGroupMembers,
  getUserGroupQuotaOverview,
  listUserGroups,
  replaceUserGroupQuotaManagers,
  replaceUserGroupTeamSubscriptions,
  resetUserGroupQuotaUsage,
  setUserGroupQuotaPolicy,
  updateUserGroupMemberQuotas,
  type UserGroup,
  type UserGroupMember,
  type UserGroupQuotaOverview,
} from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import TeamQuotaSettingsSheet, { type TeamQuotaPolicyDraft } from '@/components/user-groups/TeamQuotaSettingsSheet.vue'
import UserGroupPeopleDialog from '@/components/user-groups/UserGroupPeopleDialog.vue'
import { formatCost } from '@/lib/format'
import MobilePage from '@/mobile/components/MobilePage.vue'
import { session } from '@/stores/session'
import { toast } from '@/stores/toast'

const route = useRoute()
const router = useRouter()
const groupId = computed(() => Number(route.params.id))
const group = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const overview = ref<UserGroupQuotaOverview | null>(null)
const memberLimits = ref<Record<number, string>>({})
const groupLoading = ref(false)
const membersLoading = ref(false)
const quotaLoading = ref(false)
const groupError = ref('')
const membersError = ref('')
const quotaError = ref('')
const savingMembers = ref(false)
const settingsOpen = ref(false)
const settingsSaving = ref(false)
const settingsResetting = ref(false)
const settingsError = ref('')
const managersOpen = ref(false)
const managersSaving = ref(false)
const managersError = ref('')

const canManage = computed(() => (
  (session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
  && overview.value?.can_manage === true
))
const canConfigure = computed(() => overview.value?.can_configure === true)
const weeklyLimit = computed(() => overview.value?.policy.weekly_limit_usd ?? 0)
const weeklyUsed = computed(() => overview.value?.policy.weekly_usage_usd ?? 0)
const weeklyCumulativeUsed = computed(() => overview.value?.policy.weekly_cumulative_usage_usd ?? overview.value?.policy.weekly_usage_usd ?? 0)
const allocated = computed(() => Object.values(memberLimits.value).reduce((sum, raw) => {
  const value = Number(raw)
  return sum + (Number.isFinite(value) && value >= 0 ? value : 0)
}, 0))
const unallocated = computed(() => Math.max(0, weeklyLimit.value - allocated.value))
const allocationsValid = computed(() => Object.values(memberLimits.value).every((raw) => {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0
}) && allocated.value <= weeklyLimit.value + 0.000001)

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

function syncDrafts() {
  if (!overview.value) return
  memberLimits.value = Object.fromEntries(overview.value.members.map((member) => [member.user_id, String(member.weekly_limit_usd || 0)]))
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

function quotaMember(userId: number) {
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

function cumulativeUsage(userId: number) {
  const quota = quotaMember(userId)
  return quota?.weekly_cumulative_usage_usd ?? quota?.weekly_usage_usd ?? 0
}

async function refreshQuota() {
  quotaLoading.value = true
  quotaError.value = ''
  try {
    overview.value = await getUserGroupQuotaOverview(groupId.value)
    syncDrafts()
    return true
  } catch (caught) {
    quotaError.value = errorMessage(caught, '团队配额加载失败')
    return false
  } finally {
    quotaLoading.value = false
  }
}

async function load() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) {
    groupError.value = '团队不存在'
    return
  }
  await Promise.all([loadGroup(), loadMembers(), refreshQuota()])
}

async function syncQuotaAfterMutation(successTitle: string) {
  if (await refreshQuota()) return
  toast.warning(`${successTitle}，但最新数据同步失败`, {
    detail: quotaError.value || '请稍后手动刷新。',
  })
}

async function saveMemberQuotas() {
  if (!overview.value || !canManage.value || !allocationsValid.value) return
  savingMembers.value = true
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
    savingMembers.value = false
  }
}

async function saveSettings(draft: TeamQuotaPolicyDraft) {
  if (!canConfigure.value) return
  settingsSaving.value = true
  settingsError.value = ''
  try {
    await replaceUserGroupTeamSubscriptions(groupId.value, draft.teamSubscriptionIds)
    await setUserGroupQuotaPolicy(groupId.value, { enabled: draft.enabled, weekly_limit_usd: draft.weeklyLimit })
    settingsOpen.value = false
    toast.success('团队周配额已保存')
    await syncQuotaAfterMutation('团队周配额已保存')
  } catch (caught) {
    settingsError.value = errorMessage(caught, '配额策略保存失败')
    toast.error('团队周配额保存失败', { detail: settingsError.value })
  } finally {
    settingsSaving.value = false
  }
}

function manageQuotaManagers() {
  settingsOpen.value = false
  managersError.value = ''
  managersOpen.value = true
}

async function saveManagers(ids: number[]) {
  managersSaving.value = true
  managersError.value = ''
  try {
    await replaceUserGroupQuotaManagers(groupId.value, ids)
    managersOpen.value = false
    toast.success('配额管理员已更新')
    await syncQuotaAfterMutation('配额管理员已更新')
  } catch (caught) {
    managersError.value = errorMessage(caught, '配额管理员保存失败')
  } finally {
    managersSaving.value = false
  }
}

async function resetUsage() {
  settingsResetting.value = true
  settingsError.value = ''
  try {
    await resetUserGroupQuotaUsage(groupId.value)
    toast.success('团队配额用量已重置')
    await syncQuotaAfterMutation('团队配额用量已重置')
  } catch (caught) {
    settingsError.value = errorMessage(caught, '配额重置失败')
    toast.error('团队配额重置失败', { detail: settingsError.value })
  } finally {
    settingsResetting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <MobilePage
    :title="group?.name || '成员与配额'"
    subtitle="成员身份、额度窗口与本周累计消费"
    :loading="groupLoading && !group"
    :error="groupError && !group ? groupError : ''"
    loading-label="正在加载团队"
    @retry="load"
  >
    <template #action>
      <button v-if="canConfigure" class="mobile-icon-action" type="button" data-testid="open-mobile-team-quota-settings" aria-label="设置周配额" @click="settingsOpen = true"><Settings2 :size="19" /></button>
    </template>

    <button class="mobile-team-back" type="button" @click="router.back()"><ArrowLeft :size="17" />团队管理</button>

    <section v-if="overview" class="mobile-quota-summary" data-testid="mobile-team-quota-summary">
      <div><span>成员数量</span><strong>{{ group?.member_count ?? members.length }} 人</strong></div>
      <div><span>团队周配额</span><strong>{{ formatCost(weeklyLimit) }}</strong></div>
      <div><span>当前窗口已用</span><strong>{{ formatCost(weeklyUsed) }}</strong></div>
      <div><span>本周累计消费</span><strong>{{ formatCost(weeklyCumulativeUsed) }}</strong></div>
      <div><span>已分配成员额度</span><strong>{{ formatCost(allocated) }}</strong></div>
      <div><span>未分配额度</span><strong>{{ formatCost(unallocated) }}</strong></div>
    </section>

    <p v-if="quotaError" class="mobile-data-error" data-testid="mobile-team-quota-error" role="alert"><span>{{ quotaError }}</span><button type="button" data-testid="retry-mobile-team-quota" @click="refreshQuota">重新加载配额</button></p>

    <section v-if="overview" class="mobile-team-sources">
      <span>订阅来源</span>
      <div><b v-for="source in overview.team_subscription_groups" :key="source.billing_group_id">{{ source.platform.toUpperCase() }} · {{ source.name }}</b><em v-if="!overview.team_subscription_groups.length">尚未绑定</em></div>
    </section>

    <section class="mobile-member-list">
      <header><div><h2>成员与配额</h2><p>共 {{ members.length }} 人</p></div><button type="button" aria-label="刷新" @click="load"><RefreshCw :size="17" /></button></header>
      <p v-if="membersError" class="mobile-data-error" data-testid="mobile-team-members-error" role="alert"><span>{{ membersError }}</span><button type="button" data-testid="retry-mobile-team-members" @click="loadMembers">重新加载成员</button></p>
      <div v-if="membersLoading && !members.length" class="mobile-member-empty">正在加载成员</div>
      <div v-else-if="!members.length && !membersError" class="mobile-member-empty">暂无成员</div>
      <article v-for="member in members" :key="member.user_id" class="mobile-member-row" :data-testid="`mobile-team-member-${member.user_id}`">
        <header>
          <UserAvatar :name="member.username || member.email" :src="member.avatar_url" />
          <div><strong>{{ member.username || member.email }}</strong><small>{{ member.email }}</small></div>
          <em>{{ member.status === 'active' ? '可访问' : member.status }}</em>
        </header>
        <div class="mobile-member-metrics"><span><small>当前窗口</small><strong>{{ formatCost(quotaMember(member.user_id)?.weekly_usage_usd ?? 0) }}</strong></span><span><small>本周累计</small><strong>{{ formatCost(cumulativeUsage(member.user_id)) }}</strong></span><span><small>使用进度</small><strong>{{ usagePercent(member.user_id) }}%</strong></span></div>
        <i class="mobile-member-progress"><b :style="{ width: `${usagePercent(member.user_id)}%` }" :class="{ full: usagePercent(member.user_id) >= 100 }" /></i>
        <label><span>成员周配额</span><div><b>$</b><input v-model="memberLimits[member.user_id]" type="number" min="0" step="0.01" :disabled="!canManage" :data-testid="`mobile-member-quota-${member.user_id}`" /></div></label>
      </article>
      <p v-if="overview && !allocationsValid" class="mobile-quota-validation" role="alert">成员额度总和不能超过团队周配额。</p>
      <button v-if="canManage" class="mobile-save-quotas" type="button" data-testid="save-mobile-member-quotas" :disabled="savingMembers || !allocationsValid" @click="saveMemberQuotas"><Save :size="17" />{{ savingMembers ? '保存中' : '保存成员额度' }}</button>
    </section>

    <TeamQuotaSettingsSheet v-model="settingsOpen" :overview="overview" mobile :saving="settingsSaving" :resetting="settingsResetting" :error="settingsError" @save="saveSettings" @manage="manageQuotaManagers" @reset="resetUsage" />
    <UserGroupPeopleDialog v-model="managersOpen" mode="quota-managers" :group-name="group?.name || ''" :selected-people="overview?.managers || []" :saving="managersSaving" :error="managersError" @save="saveManagers" />
  </MobilePage>
</template>

<style scoped>
.mobile-icon-action{display:grid;width:44px;height:44px;padding:0;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--accent-strong);place-items:center}.mobile-team-back{display:flex;min-height:40px;align-items:center;gap:6px;margin:-6px 0 10px;padding:0;border:0;background:transparent;color:var(--accent-strong);font:inherit;font-size:13px;font-weight:650}.mobile-quota-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface)}.mobile-quota-summary>div{display:grid;min-width:0;gap:4px;padding:12px;border-right:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle)}.mobile-quota-summary>div:nth-child(2n){border-right:0}.mobile-quota-summary>div:nth-last-child(-n+2){border-bottom:0}.mobile-quota-summary span{color:var(--text-tertiary);font-size:11px}.mobile-quota-summary strong{overflow-wrap:anywhere;font-family:var(--font-data);font-size:16px}.mobile-team-sources{display:grid;gap:7px;margin-top:10px;padding:11px 0;border-bottom:1px solid var(--border-subtle)}.mobile-team-sources>span{color:var(--text-tertiary);font-size:11px}.mobile-team-sources>div{display:flex;min-width:0;flex-wrap:wrap;gap:6px}.mobile-team-sources b{max-width:100%;padding:5px 7px;overflow:hidden;border-radius:5px;background:#eaf8f1;color:#277a58;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.mobile-team-sources em{color:var(--text-tertiary);font-size:12px;font-style:normal}.mobile-member-list{display:grid;min-width:0;gap:9px;margin-top:12px}.mobile-member-list>header{display:flex;align-items:center;justify-content:space-between;gap:10px}.mobile-member-list h2{font-size:16px}.mobile-member-list header p{margin-top:2px;color:var(--text-tertiary);font-size:11px}.mobile-member-list>header button{display:grid;width:40px;height:40px;padding:0;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-surface);place-items:center}.mobile-member-row{display:grid;min-width:0;gap:11px;padding:12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface)}.mobile-member-row>header{display:grid;min-width:0;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:9px}.mobile-member-row :deep(.user-avatar){width:36px;height:36px}.mobile-member-row>header>div{display:grid;min-width:0;gap:2px}.mobile-member-row strong,.mobile-member-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobile-member-row small{color:var(--text-tertiary);font-size:10px}.mobile-member-row em{padding:4px 6px;border-radius:5px;background:#eaf8f1;color:#277a58;font-size:10px;font-style:normal}.mobile-member-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mobile-member-metrics span{display:grid;gap:2px}.mobile-member-metrics strong{font-family:var(--font-data);font-size:13px}.mobile-member-progress{display:block;height:6px;overflow:hidden;border-radius:6px;background:#dfe5ed}.mobile-member-progress b{display:block;height:100%;border-radius:inherit;background:var(--accent)}.mobile-member-progress b.full{background:var(--danger)}.mobile-member-row>label{display:grid;gap:5px;color:var(--text-secondary);font-size:11px}.mobile-member-row>label>div{position:relative}.mobile-member-row>label b{position:absolute;top:11px;left:10px;color:var(--text-tertiary)}.mobile-member-row input{width:100%;height:42px;padding:0 10px 0 23px;border:1px solid var(--border-strong);border-radius:6px;background:white;color:var(--text-primary);font:inherit}.mobile-member-row input:disabled{background:var(--bg-base)}.mobile-save-quotas{display:flex;min-height:44px;align-items:center;justify-content:center;gap:7px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:white;font:inherit;font-weight:650}.mobile-save-quotas:disabled{opacity:.5}.mobile-quota-validation{margin:0;padding:9px 10px;border:1px solid var(--warning-border);border-radius:6px;background:var(--warning-soft);color:var(--warning);font-size:12px}.mobile-member-empty{padding:36px 12px;color:var(--text-tertiary);text-align:center}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<style scoped>
.mobile-quota-summary > div:nth-child(4) {
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-quota-summary > div:last-child {
  grid-column: 1 / -1;
  border-right: 0;
  border-bottom: 0;
}

.mobile-data-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0 0;
  padding: 9px 10px;
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
}

.mobile-data-error span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mobile-data-error button {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid currentColor;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 650;
}
</style>
