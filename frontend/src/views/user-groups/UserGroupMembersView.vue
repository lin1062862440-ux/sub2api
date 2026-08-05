<template>
  <AppLayout>
    <UserGroupDetailShell :group="group" :read-only="!canManage && !canManageQuota">
      <template #actions>
        <button
          v-if="canManage"
          data-test="manage-members"
          type="button"
          class="btn btn-primary"
          :disabled="loadingData"
          @click="openPeople('members')"
        >
          <Icon name="users" size="sm" class="mr-2" />
          {{ t('userGroups.groups.manageMembers') }}
        </button>
        <button
          v-if="canConfigureQuota"
          data-test="open-quota-settings"
          type="button"
          class="btn btn-secondary"
          :disabled="quotaLoading || !overview"
          @click="openQuotaSettings"
        >
          <Icon name="cog" size="sm" class="mr-2" />
          {{ t('userGroups.quotas.openSettings') }}
        </button>
        <button
          type="button"
          data-test="refresh-team-workspace"
          class="btn btn-secondary !min-h-11 !px-3 sm:!min-h-0 sm:!px-2.5"
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          :disabled="loadingData"
          @click="loadGroupData"
        >
          <Icon name="refresh" size="sm" :class="loadingData ? 'animate-spin' : ''" />
        </button>
      </template>

      <section v-if="groupError && !group" data-test="member-detail-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm text-red-700 dark:text-red-300">{{ groupError }}</p>
        <button class="btn btn-secondary mt-4" type="button" @click="loadGroupData">{{ t('userGroups.common.retry') }}</button>
      </section>

      <template v-else-if="group">
        <section v-if="overview" data-test="team-quota-summary" class="grid grid-cols-2 divide-x divide-y divide-gray-200 border-y border-gray-200 dark:divide-dark-700 dark:border-dark-700 sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.members') }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ group.member_count }}</p>
          </div>
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.weeklyLimit') }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatCurrency(weeklyLimit) }}</p>
          </div>
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.weeklyUsed') }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-primary-600 dark:text-primary-400">{{ formatCurrency(weeklyUsed) }}</p>
          </div>
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.allocated') }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatCurrency(draftAllocatedUSD) }}</p>
          </div>
          <div class="col-span-2 px-4 py-4 sm:col-span-1 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.unallocated') }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums" :class="draftUnallocatedUSD <= 0 && overview.policy.enabled ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">{{ formatCurrency(draftUnallocatedUSD) }}</p>
          </div>
        </section>

        <section v-if="quotaError" data-test="team-quota-error" class="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
          <span>{{ quotaError }}</span>
          <button class="btn btn-secondary min-h-11 shrink-0" type="button" @click="loadQuota">{{ t('userGroups.common.retry') }}</button>
        </section>

        <section v-if="overview" class="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.teamSubscriptions') }}</h2>
            <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.teamSubscriptionsHint') }}</p>
          </div>
          <div class="flex min-w-0 flex-wrap gap-2">
            <span v-for="teamGroup in overview.team_subscription_groups" :key="teamGroup.billing_group_id" class="inline-flex max-w-full items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span class="uppercase">{{ teamGroup.platform }}</span>
              <span class="truncate">{{ teamGroup.name }}</span>
            </span>
            <span v-if="overview.team_subscription_groups.length === 0" class="text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.noTeamSubscriptions') }}</span>
          </div>
        </section>

        <div v-if="canManage" class="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-dark-700">
          <button data-test="manage-viewers" type="button" class="btn btn-secondary min-h-11" @click="openPeople('viewers')">
            <Icon name="eye" size="sm" class="mr-2" />
            {{ t('userGroups.groups.manageViewers') }}
          </button>
          <button data-test="manage-prompt" type="button" class="btn btn-secondary min-h-11" @click="openPromptSettings">
            <Icon name="shield" size="sm" class="mr-2" />
            {{ t('userGroups.promptSettings.open') }}
          </button>
          <button data-test="edit-group" type="button" class="btn btn-secondary min-h-11" @click="editorOpen = true">
            <Icon name="edit" size="sm" class="mr-2" />
            {{ t('common.edit') }}
          </button>
          <button data-test="archive-group" type="button" class="btn btn-secondary min-h-11 text-red-600 dark:text-red-400" @click="archiveOpen = true">
            <Icon name="trash" size="sm" class="mr-2" />
            {{ t('userGroups.groups.archive') }}
          </button>
        </div>

        <section class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div class="flex flex-col gap-4 border-b border-gray-200 px-4 py-4 dark:border-dark-700 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div>
              <h2 class="text-base font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.memberAllocations') }}</h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.groups.rosterHint') }}</p>
            </div>
            <button
              v-if="canManageQuota && overview?.policy.enabled"
              class="btn btn-primary min-h-11 shrink-0"
              type="button"
              data-test="save-member-quotas"
              :disabled="savingMemberQuotas || !memberDraftDirty || memberDraftInvalid"
              @click="saveMemberQuotas"
            >
              <Icon v-if="savingMemberQuotas" name="refresh" size="sm" class="mr-2 animate-spin" />
              {{ savingMemberQuotas ? t('common.saving') : t('userGroups.quotas.saveAllocations') }}
            </button>
          </div>

          <p v-if="membersError" data-test="team-members-error" class="flex flex-col gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
            <span>{{ membersError }}</span>
            <button class="btn btn-secondary min-h-11 shrink-0" type="button" @click="loadMembers">{{ t('userGroups.common.retry') }}</button>
          </p>
          <p v-if="memberDraftInvalid" class="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            {{ t('userGroups.quotas.overAllocated') }}
          </p>

          <div v-if="membersLoading && workspaceMembers.length === 0" class="px-5 py-14 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
          <div v-else-if="workspaceMembers.length === 0" class="px-5 py-14 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.noMembers') }}</div>
          <div v-else>
            <div class="hidden grid-cols-[minmax(220px,1.15fr)_100px_minmax(210px,1fr)_170px] gap-5 bg-gray-50 px-5 py-3 text-xs font-medium text-gray-500 dark:bg-dark-800 dark:text-gray-400 xl:grid">
              <span>{{ t('userGroups.quotas.member') }}</span>
              <span>{{ t('userGroups.groups.status') }}</span>
              <span>{{ t('userGroups.quotas.usage') }}</span>
              <span>{{ t('userGroups.quotas.memberLimit') }}</span>
            </div>
            <article v-for="member in workspaceMembers" :key="member.user_id" class="grid gap-4 border-t border-gray-100 px-4 py-4 first:border-t-0 dark:border-dark-700 sm:px-5 xl:grid-cols-[minmax(220px,1.15fr)_100px_minmax(210px,1fr)_170px] xl:items-center xl:gap-5" :data-test="`team-member-${member.user_id}`">
              <div class="flex min-w-0 items-center gap-3">
                <img :src="resolveAvatarUrl(member.avatar_url)" :alt="member.username || member.email" class="h-10 w-10 shrink-0 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5 dark:bg-dark-800 dark:ring-white/10" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ member.username || member.email }}</p>
                  <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
                </div>
              </div>
              <span class="w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{{ member.status }}</span>
              <div v-if="overview" class="min-w-0">
                <div class="flex items-center justify-between gap-3 text-xs">
                  <span class="tabular-nums text-gray-700 dark:text-gray-200">{{ formatCurrency(quotaMember(member.user_id)?.weekly_usage_usd ?? 0) }} / {{ formatCurrency(memberLimit(member.user_id)) }}</span>
                  <span class="tabular-nums text-gray-500 dark:text-gray-400">{{ memberUsagePercent(member.user_id) }}%</span>
                </div>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                  <div class="h-full rounded-full transition-[width] duration-200" :class="memberUsagePercent(member.user_id) >= 100 ? 'bg-red-500' : memberUsagePercent(member.user_id) >= 80 ? 'bg-amber-500' : 'bg-primary-500'" :style="{ width: `${memberUsagePercent(member.user_id)}%` }" />
                </div>
              </div>
              <span v-else class="text-sm text-gray-500 dark:text-gray-400">-</span>
              <label v-if="overview" class="block">
                <span class="mb-1 block text-xs font-medium text-gray-500 xl:sr-only dark:text-gray-400">{{ t('userGroups.quotas.memberLimit') }}</span>
                <div v-if="canManageQuota && overview.policy.enabled" class="relative">
                  <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
                  <input v-model="memberLimitInputs[member.user_id]" class="input min-h-11 pl-7 tabular-nums" type="number" min="0" step="0.01" :data-test="`member-quota-${member.user_id}`" />
                </div>
                <span v-else class="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{{ formatCurrency(memberLimit(member.user_id)) }}</span>
              </label>
              <span v-else class="text-sm text-gray-500 dark:text-gray-400">-</span>
            </article>
          </div>
        </section>
      </template>

      <div v-else-if="loadingData" class="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
    </UserGroupDetailShell>

    <UserGroupEditorDialog :show="editorOpen" :group="group" :saving="savingGroup" @close="editorOpen = false" @save="saveGroup" />
    <UserGroupPeopleDialog
      :show="peopleOpen"
      :mode="peopleMode"
      :group-name="group?.name || ''"
      :selected-ids="peopleMode === 'members' ? members.map(item => item.user_id) : viewers.map(item => item.user_id)"
      :saving="savingPeople"
      @close="peopleOpen = false"
      @save="savePeople"
    />
    <UserGroupPeopleDialog
      :show="quotaManagersOpen"
      mode="quota-managers"
      :group-name="group?.name || ''"
      :selected-ids="overview?.managers.map(item => item.user_id) || []"
      :saving="savingQuotaManagers"
      @close="quotaManagersOpen = false"
      @save="saveQuotaManagers"
    />
    <UserGroupPromptSettingsDialog
      :show="promptSettingsOpen"
      :group-name="group?.name || ''"
      :capture-enabled="Boolean(group?.prompt_capture_enabled)"
      :selected-ids="promptViewers.map(item => item.user_id)"
      :saving="savingPromptSettings"
      @close="promptSettingsOpen = false"
      @save="savePromptSettings"
    />
    <TeamQuotaSettingsDialog
      :show="quotaSettingsOpen"
      :overview="overview"
      :saving="savingQuotaPolicy"
      :resetting="resettingUsage"
      :error="quotaSettingsError"
      @close="quotaSettingsOpen = false"
      @save="saveQuotaPolicy"
      @manage="openQuotaManagers"
      @reset="resetConfirmOpen = true"
    />
    <ConfirmDialog
      :show="archiveOpen"
      :title="t('userGroups.groups.archive')"
      :message="t('userGroups.groups.archiveConfirm')"
      danger
      @confirm="archiveGroup"
      @cancel="archiveOpen = false"
    />
    <ConfirmDialog
      :show="resetConfirmOpen"
      :title="t('userGroups.quotas.resetNow')"
      :message="t('userGroups.quotas.resetConfirm')"
      :confirm-text="t('userGroups.quotas.resetConfirmAction')"
      danger
      @confirm="resetQuotaUsage"
      @cancel="resetConfirmOpen = false"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { UserGroup, UserGroupMember, UserGroupMutation, UserGroupQuotaOverview, UserGroupViewer } from '@/types/userGroups'
import UserGroupDetailShell from './components/UserGroupDetailShell.vue'
import UserGroupEditorDialog from './components/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from './components/UserGroupPeopleDialog.vue'
import UserGroupPromptSettingsDialog from './components/UserGroupPromptSettingsDialog.vue'
import TeamQuotaSettingsDialog, { type TeamQuotaPolicyDraft } from './components/TeamQuotaSettingsDialog.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)
const groupId = computed(() => Number(route.params.id))
const group = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const promptViewers = ref<UserGroupViewer[]>([])
const overview = ref<UserGroupQuotaOverview | null>(null)
const memberLimitInputs = ref<Record<number, string>>({})
const groupLoading = ref(false)
const membersLoading = ref(false)
const quotaLoading = ref(false)
const groupError = ref('')
const membersError = ref('')
const quotaError = ref('')
const editorOpen = ref(false)
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const promptSettingsOpen = ref(false)
const quotaSettingsOpen = ref(false)
const quotaManagersOpen = ref(false)
const archiveOpen = ref(false)
const resetConfirmOpen = ref(false)
const savingGroup = ref(false)
const savingPeople = ref(false)
const savingPromptSettings = ref(false)
const savingMemberQuotas = ref(false)
const savingQuotaPolicy = ref(false)
const savingQuotaManagers = ref(false)
const resettingUsage = ref(false)
const quotaSettingsError = ref('')
const legacyQuotaHandled = ref(false)

const loadingData = computed(() => groupLoading.value || membersLoading.value || quotaLoading.value)
const canManageQuota = computed(() => overview.value?.can_manage === true)
const canConfigureQuota = computed(() => overview.value?.can_configure === true)
const weeklyLimit = computed(() => overview.value?.policy.weekly_limit_usd ?? 0)
const weeklyUsed = computed(() => overview.value?.policy.weekly_usage_usd ?? 0)
const draftAllocatedUSD = computed(() => Object.values(memberLimitInputs.value).reduce((sum, raw) => {
  const value = Number(raw)
  return sum + (Number.isFinite(value) && value >= 0 ? value : 0)
}, 0))
const draftUnallocatedUSD = computed(() => Math.max(0, weeklyLimit.value - draftAllocatedUSD.value))
const memberDraftInvalid = computed(() => Object.values(memberLimitInputs.value).some(raw => !Number.isFinite(Number(raw)) || Number(raw) < 0)
  || draftAllocatedUSD.value > weeklyLimit.value + 0.00000001)
const memberDraftDirty = computed(() => overview.value?.members.some(member => Math.abs(memberLimit(member.user_id) - member.weekly_limit_usd) > 0.00000001) ?? false)
const workspaceMembers = computed<UserGroupMember[]>(() => {
  const rows = new Map(members.value.map(member => [member.user_id, member]))
  for (const quotaRow of overview.value?.members ?? []) {
    if (!rows.has(quotaRow.user_id)) {
      rows.set(quotaRow.user_id, { ...quotaRow, joined_at: '' })
    }
  }
  return Array.from(rows.values())
})

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : t('userGroups.common.loadFailed')
}

async function loadGroup() {
  groupLoading.value = true
  groupError.value = ''
  try {
    const groups = await userGroupAPI.list()
    group.value = groups.find(item => item.id === groupId.value) ?? null
    if (!group.value) groupError.value = t('userGroups.detail.notFound')
  } catch (error) {
    groupError.value = errorMessage(error)
  } finally {
    groupLoading.value = false
  }
}

async function loadMembers() {
  membersLoading.value = true
  membersError.value = ''
  try {
    members.value = await userGroupAPI.getMembers(groupId.value)
  } catch (error) {
    membersError.value = errorMessage(error)
  } finally {
    membersLoading.value = false
  }
}

async function loadQuota() {
  quotaLoading.value = true
  quotaError.value = ''
  try {
    overview.value = await userGroupAPI.getQuotaOverview(groupId.value)
    memberLimitInputs.value = Object.fromEntries(overview.value.members.map(member => [member.user_id, String(member.weekly_limit_usd || 0)]))
    if (!legacyQuotaHandled.value && route.query.openQuota === '1') {
      legacyQuotaHandled.value = true
      if (overview.value.can_configure) quotaSettingsOpen.value = true
    }
  } catch (error) {
    quotaError.value = errorMessage(error)
  } finally {
    quotaLoading.value = false
  }
}

async function loadGroupData() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) {
    groupError.value = t('userGroups.detail.notFound')
    return
  }
  await Promise.all([loadGroup(), loadMembers(), loadQuota()])
}

function quotaMember(userId: number) {
  return overview.value?.members.find(member => member.user_id === userId)
}

function memberLimit(userId: number) {
  const value = Number(memberLimitInputs.value[userId])
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function memberUsagePercent(userId: number) {
  const used = quotaMember(userId)?.weekly_usage_usd ?? 0
  const limit = memberLimit(userId)
  if (limit <= 0) return used > 0 ? 100 : 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function openQuotaSettings() {
  quotaSettingsError.value = ''
  quotaSettingsOpen.value = true
}

async function openPeople(mode: 'members' | 'viewers') {
  peopleMode.value = mode
  if (mode === 'viewers') {
    try {
      viewers.value = await userGroupAPI.getViewers(groupId.value)
    } catch (error) {
      appStore.showError(errorMessage(error))
      return
    }
  }
  peopleOpen.value = true
}

async function savePeople(userIds: number[]) {
  savingPeople.value = true
  try {
    if (peopleMode.value === 'members') await userGroupAPI.replaceMembers(groupId.value, userIds)
    else await userGroupAPI.replaceViewers(groupId.value, userIds)
    peopleOpen.value = false
    appStore.showSuccess(t('userGroups.groups.peopleSaved'))
    await loadGroupData()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPeople.value = false
  }
}

async function openPromptSettings() {
  try {
    promptViewers.value = await userGroupAPI.getPromptViewers(groupId.value)
    promptSettingsOpen.value = true
  } catch (error) {
    appStore.showError(errorMessage(error))
  }
}

async function savePromptSettings(payload: { enabled: boolean; userIds: number[] }) {
  savingPromptSettings.value = true
  try {
    await Promise.all([
      userGroupAPI.setPromptCapture(groupId.value, payload.enabled),
      userGroupAPI.replacePromptViewers(groupId.value, payload.userIds),
    ])
    promptSettingsOpen.value = false
    appStore.showSuccess(t('userGroups.promptSettings.saveSuccess'))
    await loadGroup()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPromptSettings.value = false
  }
}

async function saveMemberQuotas() {
  if (!overview.value || !canManageQuota.value || memberDraftInvalid.value) return
  savingMemberQuotas.value = true
  try {
    await userGroupAPI.updateMemberQuotas(groupId.value, overview.value.members.map(member => ({
      user_id: member.user_id,
      weekly_limit_usd: memberLimit(member.user_id),
    })))
    appStore.showSuccess(t('userGroups.quotas.allocationsSaved'))
    await loadQuota()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingMemberQuotas.value = false
  }
}

async function saveQuotaPolicy(draft: TeamQuotaPolicyDraft) {
  if (!canConfigureQuota.value) return
  savingQuotaPolicy.value = true
  quotaSettingsError.value = ''
  try {
    await userGroupAPI.replaceTeamSubscriptionGroups(groupId.value, draft.teamSubscriptionIds)
    await userGroupAPI.setQuotaPolicy(groupId.value, { enabled: draft.enabled, weekly_limit_usd: draft.weeklyLimit })
    quotaSettingsOpen.value = false
    appStore.showSuccess(t('userGroups.quotas.policySaved'))
    await loadQuota()
  } catch (error) {
    quotaSettingsError.value = errorMessage(error)
    appStore.showError(quotaSettingsError.value)
  } finally {
    savingQuotaPolicy.value = false
  }
}

function openQuotaManagers() {
  quotaSettingsOpen.value = false
  quotaManagersOpen.value = true
}

async function saveQuotaManagers(userIds: number[]) {
  savingQuotaManagers.value = true
  try {
    await userGroupAPI.replaceQuotaManagers(groupId.value, userIds)
    quotaManagersOpen.value = false
    appStore.showSuccess(t('userGroups.quotas.managersSaved'))
    await loadQuota()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingQuotaManagers.value = false
  }
}

async function resetQuotaUsage() {
  resettingUsage.value = true
  try {
    await userGroupAPI.resetQuotaUsage(groupId.value)
    resetConfirmOpen.value = false
    appStore.showSuccess(t('userGroups.quotas.resetSuccess'))
    await loadQuota()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    resettingUsage.value = false
  }
}

async function saveGroup(payload: UserGroupMutation) {
  savingGroup.value = true
  try {
    await userGroupAPI.update(groupId.value, payload)
    editorOpen.value = false
    appStore.showSuccess(t('userGroups.groups.saveSuccess'))
    await loadGroup()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingGroup.value = false
  }
}

async function archiveGroup() {
  try {
    await userGroupAPI.archive(groupId.value)
    archiveOpen.value = false
    appStore.showSuccess(t('userGroups.groups.archiveSuccess'))
    await router.push({ name: 'UserGroups' })
  } catch (error) {
    appStore.showError(errorMessage(error))
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0)
}

onMounted(loadGroupData)
</script>
