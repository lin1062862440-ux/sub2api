<template>
  <AppLayout>
    <UserGroupDetailShell :group="selectedGroup" :read-only="Boolean(overview && !overview.can_manage)">
      <template #actions>
        <button
          v-if="overview?.can_configure"
          type="button"
          class="btn btn-secondary border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
          data-test="reset-team-quota"
          :disabled="resettingUsage || !overview.policy.enabled"
          @click="resetConfirmOpen = true"
        >
          <Icon name="refresh" size="sm" />
          {{ t('userGroups.quotas.resetNow') }}
        </button>
        <button
          v-if="overview?.can_configure"
          type="button"
          class="btn btn-secondary"
          data-test="manage-quota-managers"
          @click="managerDialogOpen = true"
        >
          <Icon name="users" size="sm" />
          {{ t('userGroups.quotas.manageManagers') }}
        </button>
        <button
          type="button"
          class="btn btn-secondary !px-2.5"
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          :disabled="loadingData"
          @click="loadOverview"
        >
          <Icon name="refresh" size="sm" :class="loadingData ? 'animate-spin' : ''" />
        </button>
      </template>

      <section v-if="groupsError" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm text-red-700 dark:text-red-300">{{ groupsError }}</p>
        <button class="btn btn-secondary mt-4" type="button" @click="loadGroups">{{ t('userGroups.common.retry') }}</button>
      </section>

      <template v-else>
        <div v-if="loadingData && !overview" class="space-y-4" aria-busy="true">
          <div class="grid grid-cols-2 gap-px overflow-hidden border-y border-gray-200 bg-gray-200 dark:border-dark-700 dark:bg-dark-700 lg:grid-cols-4">
            <div v-for="index in 4" :key="index" class="h-24 animate-pulse bg-white dark:bg-dark-900" />
          </div>
          <div class="h-56 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-800" />
        </div>

        <section v-else-if="dataError" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
          <p class="text-sm text-red-700 dark:text-red-300">{{ dataError }}</p>
          <button class="btn btn-secondary mt-4" type="button" @click="loadOverview">{{ t('userGroups.common.retry') }}</button>
        </section>

        <template v-else-if="overview">
          <section data-test="quota-summary" class="grid grid-cols-2 divide-x divide-y divide-gray-200 border-y border-gray-200 dark:divide-dark-700 dark:border-dark-700 lg:grid-cols-4 lg:divide-y-0">
            <div class="px-5 py-4">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.weeklyLimit') }}</p>
              <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatCurrency(overview.policy.weekly_limit_usd) }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.weeklyUsed') }}</p>
              <p class="mt-1 text-2xl font-semibold tabular-nums text-primary-600 dark:text-primary-400">{{ formatCurrency(overview.policy.weekly_usage_usd) }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.weeklyRemaining') }}</p>
              <p class="mt-1 text-2xl font-semibold tabular-nums" :class="remainingUSD <= 0 && overview.policy.enabled ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                {{ formatCurrency(remainingUSD) }}
              </p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.resetAt') }}</p>
              <p class="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{{ resetLabel }}</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.resetRule') }}</p>
            </div>
          </section>

          <section class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-200 px-1 pb-4 dark:border-dark-700">
            <div>
              <h2 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.teamSubscriptions') }}</h2>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.teamSubscriptionsHint') }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="teamGroup in overview.team_subscription_groups"
                :key="teamGroup.billing_group_id"
                class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                <span class="uppercase">{{ teamGroup.platform }}</span>
                {{ teamGroup.name }}
              </span>
              <span v-if="overview.team_subscription_groups.length === 0" class="text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.noTeamSubscriptions') }}</span>
            </div>
          </section>

          <section v-if="overview.can_configure" class="rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-dark-700">
              <div>
                <h2 class="text-base font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.policy') }}</h2>
                <p class="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.enabledHint') }}</p>
              </div>
              <button class="btn btn-primary" type="button" :disabled="savingPolicy || !policyValid" data-test="save-quota-policy" @click="savePolicy">
                {{ savingPolicy ? t('common.saving') : t('common.save') }}
              </button>
            </div>
            <div class="grid gap-5 px-5 py-5 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
              <div class="md:col-span-2">
                <span class="input-label">{{ t('userGroups.quotas.assignedTeamSubscriptions') }}</span>
                <div class="mt-2 grid gap-3 sm:grid-cols-2">
                  <label v-for="platform in teamPlatforms" :key="platform" class="block">
                    <span class="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ platform }}</span>
                    <select v-model="selectedTeamGroupIDs[platform]" class="input" :data-test="`team-group-${platform}`">
                      <option value="">{{ t('userGroups.quotas.noTeamSubscriptionForPlatform') }}</option>
                      <option v-for="teamGroup in availableTeamGroups(platform)" :key="teamGroup.billing_group_id" :value="String(teamGroup.billing_group_id)">{{ teamGroup.name }}</option>
                    </select>
                  </label>
                </div>
              </div>
              <label class="flex cursor-pointer items-start gap-3">
                <input v-model="policyEnabled" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-800" />
                <span>
                  <span class="block text-sm font-medium text-gray-900 dark:text-white">{{ t('userGroups.quotas.enabled') }}</span>
                  <span class="mt-1 block text-xs text-gray-500 dark:text-gray-400">{{ overview.managers.length ? t('userGroups.quotas.managerCount', { count: overview.managers.length }) : t('userGroups.quotas.managerCount', { count: 0 }) }}</span>
                </span>
              </label>
              <label class="block">
                <span class="input-label">{{ t('userGroups.quotas.weeklyLimit') }}</span>
                <div class="relative mt-1">
                  <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
                  <input v-model="policyLimitInput" class="input pl-7" type="number" min="0" step="0.01" :disabled="!policyEnabled" data-test="quota-policy-limit" />
                </div>
              </label>
            </div>
          </section>

          <section v-if="!overview.policy.enabled" class="rounded-lg border border-dashed border-gray-300 px-6 py-14 text-center dark:border-dark-600">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('userGroups.quotas.disabledTitle') }}</h2>
            <p class="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.disabledHint') }}</p>
          </section>

          <section v-else class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-dark-700">
              <div>
                <h2 class="text-base font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.memberAllocations') }}</h2>
                <p class="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.memberAllocationsHint') }}</p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  <span>{{ t('userGroups.quotas.allocated') }}: {{ formatCurrency(draftAllocatedUSD) }}</span>
                  <span>{{ t('userGroups.quotas.unallocated') }}: {{ formatCurrency(draftUnallocatedUSD) }}</span>
                </div>
              </div>
              <button
                v-if="overview.can_manage"
                class="btn btn-primary"
                type="button"
                :disabled="savingMembers || !memberDraftDirty || memberDraftInvalid"
                data-test="save-member-quotas"
                @click="saveMemberQuotas"
              >
                {{ savingMembers ? t('common.saving') : t('userGroups.quotas.saveAllocations') }}
              </button>
            </div>

            <p v-if="memberDraftInvalid" class="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {{ t('userGroups.quotas.overAllocated') }}
            </p>

            <div v-if="overview.members.length === 0" class="px-5 py-14 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.noMembers') }}</div>
            <div v-else>
              <div class="hidden grid-cols-[minmax(210px,1.1fr)_minmax(190px,0.9fr)_minmax(240px,1.2fr)_180px] gap-5 bg-gray-50 px-5 py-3 text-xs font-medium text-gray-500 dark:bg-dark-800 dark:text-gray-400 xl:grid">
                <span>{{ t('userGroups.quotas.member') }}</span>
                <span>{{ t('userGroups.quotas.memberPlan') }}</span>
                <span>{{ t('userGroups.quotas.usage') }}</span>
                <span>{{ t('userGroups.quotas.memberLimit') }}</span>
              </div>
              <article v-for="member in overview.members" :key="member.user_id" class="grid gap-4 border-t border-gray-100 px-5 py-4 first:border-t-0 dark:border-dark-700 xl:grid-cols-[minmax(210px,1.1fr)_minmax(190px,0.9fr)_minmax(240px,1.2fr)_180px] xl:items-center xl:gap-5">
                <div class="flex min-w-0 items-center gap-3">
                  <img :src="resolveAvatarUrl(member.avatar_url)" :alt="member.username || member.email" class="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5 dark:bg-dark-800 dark:ring-white/10" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ member.username || member.email }}</p>
                    <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <template v-if="memberLimit(member.user_id) > 0 && overview.team_subscription_groups.length > 0">
                    <span v-for="teamGroup in overview.team_subscription_groups" :key="teamGroup.billing_group_id" class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <span class="uppercase">{{ teamGroup.platform }}</span>
                      {{ teamGroup.name }}
                    </span>
                  </template>
                  <span v-else class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                    {{ t('userGroups.subscriptions.noSubscription') }}
                  </span>
                </div>
                <div>
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <span class="tabular-nums text-gray-700 dark:text-gray-200">{{ formatCurrency(member.weekly_usage_usd) }} / {{ formatCurrency(memberLimit(member.user_id)) }}</span>
                    <span class="tabular-nums text-gray-500 dark:text-gray-400">{{ memberUsagePercent(member) }}%</span>
                  </div>
                  <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                    <div class="h-full rounded-full transition-[width] duration-200" :class="memberUsagePercent(member) >= 100 ? 'bg-red-500' : memberUsagePercent(member) >= 80 ? 'bg-amber-500' : 'bg-primary-500'" :style="{ width: `${memberUsagePercent(member)}%` }" />
                  </div>
                </div>
                <label class="block">
                  <span class="sr-only">{{ t('userGroups.quotas.memberLimit') }}</span>
                  <div class="relative">
                    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
                    <input
                      v-model="memberLimitInputs[member.user_id]"
                      class="input pl-7 tabular-nums"
                      type="number"
                      min="0"
                      step="0.01"
                      :disabled="!overview.can_manage"
                      :data-test="`member-quota-${member.user_id}`"
                    />
                  </div>
                </label>
              </article>
            </div>
          </section>
        </template>
      </template>
    </UserGroupDetailShell>

    <UserGroupPeopleDialog
      :show="managerDialogOpen"
      mode="quota-managers"
      :group-name="selectedGroup?.name || ''"
      :selected-ids="overview?.managers.map(manager => manager.user_id) || []"
      :saving="savingManagers"
      @close="managerDialogOpen = false"
      @save="saveManagers"
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
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAppStore } from '@/stores/app'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { UserGroup, UserGroupQuotaMember, UserGroupQuotaOverview } from '@/types/userGroups'
import UserGroupDetailShell from './components/UserGroupDetailShell.vue'
import UserGroupPeopleDialog from './components/UserGroupPeopleDialog.vue'

const { t, locale } = useI18n()
const route = useRoute()
const appStore = useAppStore()

const groups = ref<UserGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const overview = ref<UserGroupQuotaOverview | null>(null)
const loadingGroups = ref(false)
const loadingData = ref(false)
const groupsError = ref('')
const dataError = ref('')
const policyEnabled = ref(false)
const policyLimitInput = ref('0')
const memberLimitInputs = ref<Record<number, string>>({})
const savingPolicy = ref(false)
const savingMembers = ref(false)
const savingManagers = ref(false)
const managerDialogOpen = ref(false)
const resetConfirmOpen = ref(false)
const resettingUsage = ref(false)
const selectedTeamGroupIDs = ref<Record<string, string>>({ openai: '', anthropic: '' })
const teamPlatforms = ['openai', 'anthropic'] as const

const selectedGroup = computed(() => groups.value.find(group => group.id === selectedGroupId.value) ?? null)
const remainingUSD = computed(() => Math.max(0, (overview.value?.policy.weekly_limit_usd ?? 0) - (overview.value?.policy.weekly_usage_usd ?? 0)))
const resetLabel = computed(() => overview.value?.policy.weekly_reset_at ? formatDateTime(overview.value.policy.weekly_reset_at) : '-')
const policyLimit = computed(() => Number(policyLimitInput.value))
const selectedTeamIDs = computed(() => Object.values(selectedTeamGroupIDs.value).filter(Boolean).map(Number))
const policyValid = computed(() => !policyEnabled.value || (
  Number.isFinite(policyLimit.value)
  && policyLimit.value > 0
  && selectedTeamIDs.value.length > 0
))
const draftAllocatedUSD = computed(() => Object.values(memberLimitInputs.value).reduce((sum, value) => {
  const amount = Number(value)
  return sum + (Number.isFinite(amount) && amount >= 0 ? amount : 0)
}, 0))
const draftUnallocatedUSD = computed(() => Math.max(0, (overview.value?.policy.weekly_limit_usd ?? 0) - draftAllocatedUSD.value))
const memberDraftInvalid = computed(() => {
  if (!overview.value) return false
  const hasInvalid = Object.values(memberLimitInputs.value).some(value => !Number.isFinite(Number(value)) || Number(value) < 0)
  return hasInvalid || draftAllocatedUSD.value > overview.value.policy.weekly_limit_usd + 0.00000001
})
const memberDraftDirty = computed(() => overview.value?.members.some(member => Math.abs(memberLimit(member.user_id) - member.weekly_limit_usd) > 0.00000001) ?? false)

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : t('userGroups.common.loadFailed')
}

function routeGroupId(): number | null {
  const value = Number(route.params.id)
  return Number.isInteger(value) && value > 0 ? value : null
}

function resolveSelectedGroupId(): number | null {
  const requested = routeGroupId()
  return groups.value.some(group => group.id === requested) ? requested : null
}

async function loadGroups() {
  loadingGroups.value = true
  groupsError.value = ''
  try {
    groups.value = await userGroupAPI.list()
    selectedGroupId.value = resolveSelectedGroupId()
    if (selectedGroupId.value) {
      await loadOverview()
    } else {
      groupsError.value = t('userGroups.detail.notFound')
    }
  } catch (error) {
    groups.value = []
    selectedGroupId.value = null
    groupsError.value = errorMessage(error)
  } finally {
    loadingGroups.value = false
  }
}

async function loadOverview() {
  if (!selectedGroupId.value) return
  loadingData.value = true
  dataError.value = ''
  try {
    overview.value = await userGroupAPI.getQuotaOverview(selectedGroupId.value)
    syncDrafts()
  } catch (error) {
    overview.value = null
    dataError.value = errorMessage(error)
  } finally {
    loadingData.value = false
  }
}

function syncDrafts() {
  if (!overview.value) return
  policyEnabled.value = overview.value.policy.enabled
  policyLimitInput.value = String(overview.value.policy.weekly_limit_usd || 0)
  memberLimitInputs.value = Object.fromEntries(overview.value.members.map(member => [member.user_id, String(member.weekly_limit_usd || 0)]))
  selectedTeamGroupIDs.value = { openai: '', anthropic: '' }
  for (const teamGroup of overview.value.team_subscription_groups) {
    selectedTeamGroupIDs.value[teamGroup.platform] = String(teamGroup.billing_group_id)
  }
}

function availableTeamGroups(platform: string) {
  return (overview.value?.available_team_subscription_groups ?? []).filter(group => group.platform === platform)
}

async function savePolicy() {
  if (!selectedGroupId.value || !policyValid.value) return
  savingPolicy.value = true
  try {
    await userGroupAPI.replaceTeamSubscriptionGroups(selectedGroupId.value, selectedTeamIDs.value)
    await userGroupAPI.setQuotaPolicy(selectedGroupId.value, { enabled: policyEnabled.value, weekly_limit_usd: policyEnabled.value ? policyLimit.value : Math.max(0, policyLimit.value || 0) })
    appStore.showSuccess(t('userGroups.quotas.policySaved'))
    await loadOverview()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPolicy.value = false
  }
}

async function resetQuotaUsage() {
  if (!selectedGroupId.value) return
  resettingUsage.value = true
  try {
    await userGroupAPI.resetQuotaUsage(selectedGroupId.value)
    resetConfirmOpen.value = false
    appStore.showSuccess(t('userGroups.quotas.resetSuccess'))
    await loadOverview()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    resettingUsage.value = false
  }
}

async function saveMemberQuotas() {
  if (!selectedGroupId.value || !overview.value || memberDraftInvalid.value) return
  savingMembers.value = true
  try {
    await userGroupAPI.updateMemberQuotas(selectedGroupId.value, overview.value.members.map(member => ({ user_id: member.user_id, weekly_limit_usd: memberLimit(member.user_id) })))
    appStore.showSuccess(t('userGroups.quotas.allocationsSaved'))
    await loadOverview()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingMembers.value = false
  }
}

async function saveManagers(userIds: number[]) {
  if (!selectedGroupId.value) return
  savingManagers.value = true
  try {
    await userGroupAPI.replaceQuotaManagers(selectedGroupId.value, userIds)
    managerDialogOpen.value = false
    appStore.showSuccess(t('userGroups.quotas.managersSaved'))
    await loadOverview()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingManagers.value = false
  }
}

function memberLimit(userId: number) {
  const value = Number(memberLimitInputs.value[userId])
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function memberUsagePercent(member: UserGroupQuotaMember) {
  const limit = memberLimit(member.user_id)
  if (limit <= 0) return member.weekly_usage_usd > 0 ? 100 : 0
  return Math.min(100, Math.round((member.weekly_usage_usd / limit) * 100))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

onMounted(loadGroups)
</script>
