<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, Save, UsersRound } from '@lucide/vue'
import { useRoute } from 'vue-router'
import {
  getUserGroupQuotaOverview, listUserGroups, replaceUserGroupQuotaManagers,
  replaceUserGroupTeamSubscriptions, resetUserGroupQuotaUsage, setUserGroupQuotaPolicy,
  updateUserGroupMemberQuotas, type UserGroup, type UserGroupQuotaMember,
  type UserGroupQuotaOverview,
} from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import UserGroupDetailHeader from '@/components/user-groups/UserGroupDetailHeader.vue'
import UserGroupPeopleDialog from '@/components/user-groups/UserGroupPeopleDialog.vue'
import { formatCost, formatDateTime } from '@/lib/format'

const route = useRoute()
const groupId = computed(() => Number(route.params.id))
const group = ref<UserGroup | null>(null)
const overview = ref<UserGroupQuotaOverview | null>(null)
const loading = ref(true)
const error = ref('')
const message = ref('')
const policyEnabled = ref(false)
const policyLimit = ref('0')
const memberLimits = ref<Record<number, string>>({})
const teamSelections = ref<Record<string, string>>({ openai: '', anthropic: '' })
const savingPolicy = ref(false)
const savingMembers = ref(false)
const savingManagers = ref(false)
const managerOpen = ref(false)
const managerError = ref('')
const platforms = ['openai', 'anthropic'] as const

const weeklyLimit = computed(() => overview.value?.policy.weekly_limit_usd ?? 0)
const weeklyUsed = computed(() => overview.value?.policy.weekly_usage_usd ?? 0)
const weeklyRemaining = computed(() => Math.max(0, weeklyLimit.value - weeklyUsed.value))
const allocated = computed(() => Object.values(memberLimits.value).reduce((sum, raw) => sum + (Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : 0), 0))
const unallocated = computed(() => Math.max(0, weeklyLimit.value - allocated.value))
const selectedTeamIds = computed(() => Object.values(teamSelections.value).filter(Boolean).map(Number))
const policyValid = computed(() => !policyEnabled.value || (Number(policyLimit.value) > 0 && selectedTeamIds.value.length > 0))
const membersValid = computed(() => Object.values(memberLimits.value).every((value) => Number.isFinite(Number(value)) && Number(value) >= 0) && allocated.value <= weeklyLimit.value + 0.000001)

function errorMessage(caught: unknown, fallback: string) { return caught instanceof Error && caught.message ? caught.message : fallback }

function syncDrafts() {
  if (!overview.value) return
  policyEnabled.value = overview.value.policy.enabled
  policyLimit.value = String(overview.value.policy.weekly_limit_usd || 0)
  memberLimits.value = Object.fromEntries(overview.value.members.map((member) => [member.user_id, String(member.weekly_limit_usd || 0)]))
  teamSelections.value = { openai: '', anthropic: '' }
  for (const item of overview.value.team_subscription_groups) teamSelections.value[item.platform] = String(item.billing_group_id)
}

async function load() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) { error.value = '团队不存在'; return }
  loading.value = true
  error.value = ''
  try {
    const [groups, quota] = await Promise.all([listUserGroups(), getUserGroupQuotaOverview(groupId.value)])
    group.value = groups.find((item) => item.id === groupId.value) ?? null
    overview.value = quota
    if (!group.value) error.value = '团队不存在或无权访问'
    syncDrafts()
  } catch (caught) { overview.value = null; error.value = errorMessage(caught, '团队配额加载失败') }
  finally { loading.value = false }
}

function available(platform: string) { return (overview.value?.available_team_subscription_groups ?? []).filter((item) => item.platform === platform) }
function memberLimit(id: number) { const value = Number(memberLimits.value[id]); return Number.isFinite(value) && value >= 0 ? value : 0 }
function usagePercent(member: UserGroupQuotaMember) { const limit = memberLimit(member.user_id); return limit > 0 ? Math.min(100, Math.round(member.weekly_usage_usd / limit * 100)) : member.weekly_usage_usd > 0 ? 100 : 0 }

async function savePolicy() {
  if (!overview.value?.can_configure || !policyValid.value) return
  savingPolicy.value = true
  try {
    await replaceUserGroupTeamSubscriptions(groupId.value, selectedTeamIds.value)
    await setUserGroupQuotaPolicy(groupId.value, { enabled: policyEnabled.value, weekly_limit_usd: Math.max(0, Number(policyLimit.value) || 0) })
    message.value = '团队套餐与总配额已保存'
    await load()
  } catch (caught) { message.value = errorMessage(caught, '配额策略保存失败') }
  finally { savingPolicy.value = false }
}

async function saveMembers() {
  if (!overview.value?.can_manage || !membersValid.value) return
  savingMembers.value = true
  try {
    await updateUserGroupMemberQuotas(groupId.value, overview.value.members.map((member) => ({ user_id: member.user_id, weekly_limit_usd: memberLimit(member.user_id) })))
    message.value = '成员配额已保存'
    await load()
  } catch (caught) { message.value = errorMessage(caught, '成员配额保存失败') }
  finally { savingMembers.value = false }
}

async function saveManagers(ids: number[]) {
  savingManagers.value = true; managerError.value = ''
  try { await replaceUserGroupQuotaManagers(groupId.value, ids); managerOpen.value = false; message.value = '配额管理员已更新'; await load() }
  catch (caught) { managerError.value = errorMessage(caught, '配额管理员保存失败') }
  finally { savingManagers.value = false }
}

async function resetUsage() {
  if (!overview.value?.can_configure || !window.confirm('确认立即清零本周团队及成员配额用量？')) return
  try { await resetUserGroupQuotaUsage(groupId.value); message.value = '团队配额用量已重置'; await load() }
  catch (caught) { message.value = errorMessage(caught, '配额重置失败') }
}

onMounted(() => void load())
</script>

<template>
  <div class="quota-page">
    <UserGroupDetailHeader :group="group" :read-only="Boolean(overview && !overview.can_manage)">
      <template #actions>
        <button v-if="overview?.can_configure" @click="managerOpen = true"><UsersRound :size="15" />配额管理员</button>
        <button v-if="overview?.can_configure" class="danger" :disabled="!overview.policy.enabled" @click="resetUsage"><RefreshCw :size="15" />重置用量</button>
        <button title="刷新" :disabled="loading" @click="load"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
      </template>
    </UserGroupDetailHeader>
    <p v-if="message" class="ug-message">{{ message }}</p>
    <div v-if="loading && !overview" class="quota-loading"><i v-for="n in 5" :key="n" /></div>
    <div v-else-if="error" class="quota-error"><strong>无法加载团队配额</strong><span>{{ error }}</span><button @click="load">重试</button></div>
    <template v-else-if="overview">
      <section class="quota-summary" data-testid="team-quota-summary">
        <div><span>团队周配额</span><strong>{{ formatCost(weeklyLimit) }}</strong></div>
        <div><span>本周已用</span><strong class="used">{{ formatCost(weeklyUsed) }}</strong><small>{{ weeklyLimit > 0 ? Math.min(100, Math.round(weeklyUsed / weeklyLimit * 100)) : 0 }}%</small></div>
        <div><span>本周剩余</span><strong :class="{ exhausted: overview.policy.enabled && weeklyRemaining <= 0 }">{{ formatCost(weeklyRemaining) }}</strong></div>
        <div><span>下次重置</span><strong class="date">{{ overview.policy.weekly_reset_at ? formatDateTime(overview.policy.weekly_reset_at) : '-' }}</strong></div>
      </section>
      <section class="team-sources"><div><h2>团队订阅来源</h2><p>团队配额实际使用以下订阅分组。</p></div><div><span v-for="item in overview.team_subscription_groups" :key="item.billing_group_id"><b>{{ item.platform }}</b>{{ item.name }}</span><em v-if="!overview.team_subscription_groups.length">尚未绑定团队订阅</em></div></section>
      <section v-if="overview.can_configure" class="quota-panel policy-panel">
        <header><div><h2>套餐与总配额</h2><p>启用后，团队成员共享周配额并按成员额度控制。</p></div><button class="primary" :disabled="savingPolicy || !policyValid" data-testid="save-team-policy" @click="savePolicy"><Save :size="15" />{{ savingPolicy ? '保存中' : '保存策略' }}</button></header>
        <div class="policy-grid"><label class="toggle"><input v-model="policyEnabled" type="checkbox" /><span><strong>启用团队配额</strong><small>{{ overview.managers.length }} 位配额管理员</small></span></label><label><span>团队周配额 (USD)</span><input v-model="policyLimit" type="number" min="0" step="0.01" :disabled="!policyEnabled" /></label><label v-for="platform in platforms" :key="platform"><span>{{ platform.toUpperCase() }} 团队订阅</span><select v-model="teamSelections[platform]"><option value="">不绑定</option><option v-for="item in available(platform)" :key="item.billing_group_id" :value="String(item.billing_group_id)">{{ item.name }}</option></select></label></div>
        <p v-if="!policyValid" class="validation">启用团队配额时，周配额必须大于 0，且至少绑定一个团队订阅。</p>
      </section>
      <section class="quota-panel member-panel">
        <header><div><h2>成员配额与使用情况</h2><p>已分配 {{ formatCost(allocated) }}，未分配 {{ formatCost(unallocated) }}。</p></div><button v-if="overview.can_manage" class="primary" :disabled="savingMembers || !membersValid" data-testid="save-member-quotas" @click="saveMembers"><Save :size="15" />{{ savingMembers ? '保存中' : '保存成员额度' }}</button></header>
        <div v-if="!overview.members.length" class="member-empty">团队暂无成员</div>
        <template v-else><div class="member-row head"><span>成员</span><span>本周用量</span><span>使用进度</span><span>周配额</span></div><article v-for="member in overview.members" :key="member.user_id" class="member-row"><div><UserAvatar :name="member.username || member.email" :src="member.avatar_url" /><span><strong>{{ member.username || member.email }}</strong><small>{{ member.email }}</small></span></div><strong>{{ formatCost(member.weekly_usage_usd) }}</strong><div class="progress"><i><b :style="{ width: `${usagePercent(member)}%` }" :class="{ full: usagePercent(member) >= 100 }" /></i><small>{{ usagePercent(member) }}%</small></div><label><span>$</span><input v-model="memberLimits[member.user_id]" type="number" min="0" step="0.01" :disabled="!overview.can_manage" :data-testid="`member-quota-${member.user_id}`" /></label></article></template>
        <p v-if="!membersValid" class="validation">成员配额必须为非负数，且总分配不能超过团队周配额。</p>
      </section>
    </template>
    <UserGroupPeopleDialog v-model="managerOpen" mode="quota-managers" :group-name="group?.name || ''" :selected-people="overview?.managers || []" :saving="savingManagers" :error="managerError" @save="saveManagers" />
  </div>
</template>

<style scoped>
.quota-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.quota-loading{display:grid;gap:8px;margin-top:14px}.quota-loading i{height:72px;border-radius:8px;background:var(--skeleton);animation:pulse 1.2s infinite}.quota-error{display:grid;min-height:280px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.quota-error strong{color:var(--text-primary)}.quota-error button{height:34px;padding:0 12px;border:0;border-radius:6px;background:var(--accent);color:white}.quota-summary{display:grid;grid-template-columns:repeat(4,1fr);margin-top:14px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.84)}.quota-summary>div{display:grid;min-height:82px;align-content:center;gap:5px;padding:0 15px;border-right:1px solid var(--border-subtle)}.quota-summary>div:last-child{border:0}.quota-summary span,.quota-summary small{color:var(--text-tertiary);font-size:10px}.quota-summary strong{font-family:var(--font-data);font-size:18px}.quota-summary .used{color:var(--accent-strong)}.quota-summary .exhausted{color:var(--danger)}.quota-summary .date{font-size:11px}.team-sources{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:10px;padding:12px 15px;border-bottom:1px solid var(--border-subtle)}.team-sources h2,.quota-panel h2{margin:0;font-size:13px}.team-sources p,.quota-panel header p{margin:3px 0 0;color:var(--text-tertiary);font-size:10px}.team-sources>div:last-child{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.team-sources>div:last-child span{display:flex;gap:5px;padding:5px 8px;border-radius:12px;background:#eaf8f1;color:#277a58;font-size:9px}.team-sources b{text-transform:uppercase}.team-sources em{color:var(--text-tertiary);font-size:11px;font-style:normal}.quota-panel{margin-top:12px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:8px;background:rgba(255,255,255,.84)}.quota-panel>header{display:flex;min-height:64px;align-items:center;justify-content:space-between;gap:14px;padding:0 15px;border-bottom:1px solid var(--border-subtle)}.quota-panel header button{display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:0;border-radius:6px;background:var(--accent);color:white}.policy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:15px}.policy-grid>label{display:grid;gap:5px}.policy-grid label>span,.member-row label>span{color:var(--text-tertiary);font-size:10px}.policy-grid input:not([type=checkbox]),.policy-grid select,.member-row input{box-sizing:border-box;width:100%;height:36px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary)}.policy-grid .toggle{display:flex;align-items:center;gap:9px}.toggle>span{display:grid;gap:3px}.toggle strong{color:var(--text-primary);font-size:11px}.toggle small{font-size:9px}.member-row{display:grid;min-height:64px;grid-template-columns:minmax(210px,1.2fr) 90px minmax(120px,.8fr) 100px;align-items:center;gap:12px;padding:0 15px;border-bottom:1px solid var(--border-subtle);font-size:11px}.member-row:last-of-type{border:0}.member-row.head{min-height:38px;background:var(--bg-base);color:var(--text-tertiary);font-size:10px}.member-row>div:first-child{display:flex;min-width:0;align-items:center;gap:9px}.member-row :deep(.user-avatar){width:34px;height:34px}.member-row>div:first-child>span{display:grid;min-width:0;gap:2px}.member-row strong,.member-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-row small{color:var(--text-tertiary);font-size:9px}.progress{display:flex;align-items:center;gap:7px}.progress i{display:block;height:6px;flex:1;overflow:hidden;border-radius:6px;background:#dfe5ed}.progress b{display:block;height:100%;border-radius:inherit;background:var(--accent)}.progress b.full{background:var(--danger)}.member-row label{position:relative}.member-row label span{position:absolute;top:11px;left:8px}.member-row label input{padding-left:20px}.validation{margin:0 15px 13px;padding:8px 10px;border-radius:6px;background:#fff4df;color:#8a6220;font-size:10px}.member-empty{display:grid;min-height:180px;color:var(--text-tertiary);place-items:center}@container app-content (max-width:850px){.quota-summary{grid-template-columns:repeat(2,1fr)}.quota-summary>div:nth-child(2){border-right:0}.member-row{grid-template-columns:minmax(180px,1fr) 80px 100px}.member-row>*:nth-child(3){display:none}}@container app-content (max-width:650px){.quota-page{padding:24px}.policy-grid{grid-template-columns:1fr}.team-sources{align-items:flex-start;flex-direction:column}.team-sources>div:last-child{justify-content:flex-start}}
</style>
