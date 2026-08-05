<template>
  <BaseDialog
    :show="show"
    :title="t('userGroups.quotas.openSettings')"
    width="wide"
    :close-on-click-outside="false"
    @close="requestClose"
  >
    <div class="space-y-5">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        {{ t('userGroups.quotas.settingsDescription') }}
      </p>

      <label class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-dark-700">
        <input v-model="policyEnabled" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-800" />
        <span>
          <span class="block text-sm font-medium text-gray-950 dark:text-white">{{ t('userGroups.quotas.enabled') }}</span>
          <span class="mt-1 block text-xs text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.enabledHint') }}</span>
        </span>
      </label>

      <div class="grid gap-5 md:grid-cols-2">
        <label class="block">
          <span class="input-label">{{ t('userGroups.quotas.weeklyLimit') }}</span>
          <div class="relative mt-1">
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
            <input v-model="policyLimitInput" class="input pl-7 tabular-nums" type="number" min="0" step="0.01" :disabled="!policyEnabled" data-test="quota-policy-limit" />
          </div>
        </label>

        <div>
          <span class="input-label">{{ t('userGroups.quotas.resetAt') }}</span>
          <p class="mt-2 text-sm font-medium text-gray-950 dark:text-white">{{ resetLabel }}</p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ t('userGroups.quotas.resetRule') }}</p>
        </div>
      </div>

      <section class="border-t border-gray-200 pt-5 dark:border-dark-700">
        <div>
          <h3 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.assignedTeamSubscriptions') }}</h3>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.teamSubscriptionsHint') }}</p>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label v-for="platform in teamPlatforms" :key="platform" class="block">
            <span class="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ platform }}</span>
            <select v-model="selectedTeamGroupIDs[platform]" class="input" :disabled="!policyEnabled" :data-test="`team-group-${platform}`">
              <option value="">{{ t('userGroups.quotas.noTeamSubscriptionForPlatform') }}</option>
              <option v-for="teamGroup in availableTeamGroups(platform)" :key="teamGroup.billing_group_id" :value="String(teamGroup.billing_group_id)">{{ teamGroup.name }}</option>
            </select>
          </label>
        </div>
      </section>

      <p v-if="!policyValid" data-test="quota-policy-validation" role="alert" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        {{ t('userGroups.quotas.policyValidation') }}
      </p>
      <p v-if="error" role="alert" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{{ error }}</p>

      <section class="flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.managers') }}</h3>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.managerCount', { count: overview?.managers.length || 0 }) }}</p>
        </div>
        <button type="button" class="btn btn-secondary min-h-11" data-test="manage-quota-managers" :disabled="saving || resetting" @click="requestManage">
          <Icon name="users" size="sm" class="mr-2" />
          {{ t('userGroups.quotas.manageManagers') }}
        </button>
      </section>

      <section class="flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.quotas.resetNow') }}</h3>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ t('userGroups.quotas.resetConfirm') }}</p>
        </div>
        <button type="button" class="btn btn-secondary min-h-11 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300" data-test="reset-team-quota" :disabled="resetting || !overview?.policy.enabled" @click="requestReset">
          <Icon name="refresh" size="sm" class="mr-2" :class="resetting ? 'animate-spin' : ''" />
          {{ resetting ? t('common.loading') : t('userGroups.quotas.resetNow') }}
        </button>
      </section>
    </div>

    <template #footer>
      <div class="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" class="btn btn-secondary min-h-11" :disabled="saving || resetting" @click="requestClose">{{ t('common.cancel') }}</button>
        <button type="button" class="btn btn-primary min-h-11" data-test="save-quota-policy" :disabled="saving || resetting || !policyValid" @click="save">
          <Icon v-if="saving" name="refresh" size="sm" class="mr-2 animate-spin" />
          {{ saving ? t('common.saving') : t('userGroups.quotas.saveSettings') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import type { UserGroupQuotaOverview } from '@/types/userGroups'

export interface TeamQuotaPolicyDraft {
  enabled: boolean
  weeklyLimit: number
  teamSubscriptionIds: number[]
}

const props = withDefaults(defineProps<{
  show: boolean
  overview: UserGroupQuotaOverview | null
  saving?: boolean
  resetting?: boolean
  error?: string
}>(), {
  saving: false,
  resetting: false,
  error: '',
})

const emit = defineEmits<{
  close: []
  save: [draft: TeamQuotaPolicyDraft]
  manage: []
  reset: []
}>()

const { t, locale } = useI18n()
const teamPlatforms = ['openai', 'anthropic'] as const
const policyEnabled = ref(false)
const policyLimitInput = ref('0')
const selectedTeamGroupIDs = reactive<Record<(typeof teamPlatforms)[number], string>>({ openai: '', anthropic: '' })
const initialSnapshot = ref('')

const selectedTeamIDs = computed(() => teamPlatforms.map(platform => selectedTeamGroupIDs[platform]).filter(Boolean).map(Number))
const policyLimit = computed(() => Number(policyLimitInput.value))
const policyValid = computed(() => !policyEnabled.value || (
  Number.isFinite(policyLimit.value)
  && policyLimit.value > 0
  && selectedTeamIDs.value.length > 0
))
const snapshot = computed(() => JSON.stringify({
  enabled: policyEnabled.value,
  limit: policyLimitInput.value,
  groups: teamPlatforms.map(platform => selectedTeamGroupIDs[platform]),
}))
const dirty = computed(() => snapshot.value !== initialSnapshot.value)
const resetLabel = computed(() => {
  const value = props.overview?.policy.weekly_reset_at
  if (!value) return '-'
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
})

function availableTeamGroups(platform: string) {
  return (props.overview?.available_team_subscription_groups ?? []).filter(group => group.platform === platform)
}

function hydrate() {
  if (!props.overview) return
  policyEnabled.value = props.overview.policy.enabled
  policyLimitInput.value = String(props.overview.policy.weekly_limit_usd || 0)
  selectedTeamGroupIDs.openai = ''
  selectedTeamGroupIDs.anthropic = ''
  for (const group of props.overview.team_subscription_groups) {
    if (group.platform === 'openai' || group.platform === 'anthropic') {
      selectedTeamGroupIDs[group.platform] = String(group.billing_group_id)
    }
  }
  initialSnapshot.value = snapshot.value
}

function requestClose() {
  if (props.saving || props.resetting) return
  if (dirty.value && !window.confirm(t('userGroups.quotas.discardConfirm'))) return
  emit('close')
}

function confirmDraftLoss() {
  return !dirty.value || window.confirm(t('userGroups.quotas.discardConfirm'))
}

function requestManage() {
  if (props.saving || props.resetting || !confirmDraftLoss()) return
  emit('manage')
}

function requestReset() {
  if (props.saving || props.resetting || !confirmDraftLoss()) return
  emit('reset')
}

function save() {
  if (!policyValid.value || props.saving || props.resetting) return
  emit('save', {
    enabled: policyEnabled.value,
    weeklyLimit: Math.max(0, policyLimit.value || 0),
    teamSubscriptionIds: selectedTeamIDs.value,
  })
}

watch(() => [props.show, props.overview] as const, ([show]) => {
  if (show) hydrate()
}, { immediate: true })
</script>
