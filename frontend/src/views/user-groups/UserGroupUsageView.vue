<template>
  <AppLayout>
    <UserGroupWorkspaceShell>
      <section v-if="groupsError" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm text-red-700 dark:text-red-300">{{ groupsError }}</p>
        <button class="btn btn-secondary mt-4" type="button" @click="loadGroups">{{ t('userGroups.common.retry') }}</button>
      </section>

      <section v-else-if="!loadingGroups && groups.length === 0" class="rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-dark-600">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('userGroups.common.noAccessibleGroups') }}</h2>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.common.noAccessibleGroupsHint') }}</p>
      </section>

      <template v-else>
        <GroupContextRail
          v-model="selectedGroupId"
          :groups="groups"
          :can-manage="canManage"
          :loading="loadingGroups"
          @update:model-value="handleGroupChange"
        >
          <template #controls>
            <label class="block min-w-[132px] flex-1 sm:w-36 sm:flex-none">
              <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.startDate') }}</span>
              <input v-model="startDate" type="date" class="input" :max="endDate" />
            </label>
            <label class="block min-w-[132px] flex-1 sm:w-36 sm:flex-none">
              <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.endDate') }}</span>
              <input v-model="endDate" type="date" class="input" :min="startDate" />
            </label>
            <button
              data-test="toggle-usage-filters"
              type="button"
              class="btn btn-secondary self-end"
              :aria-expanded="showAdvancedFilters"
              @click="showAdvancedFilters = !showAdvancedFilters"
            >
              <Icon name="filter" size="sm" class="mr-2" />
              {{ t('userGroups.usage.moreFilters') }}
              <span
                v-if="activeAdvancedFilterCount"
                class="ml-1 rounded-full bg-primary-100 px-1.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                :title="t('userGroups.usage.activeFilters', { count: activeAdvancedFilterCount })"
              >
                {{ activeAdvancedFilterCount }}
              </span>
            </button>
            <button data-test="apply-usage-filters" type="button" class="btn btn-primary self-end" :disabled="loadingData" @click="applyFilters">
              <Icon name="search" size="sm" class="mr-2" />
              {{ t('userGroups.usage.query') }}
            </button>
          </template>
        </GroupContextRail>

        <section v-if="showAdvancedFilters" data-test="advanced-usage-filters" class="grid gap-3 border-b border-gray-200 pb-4 dark:border-dark-700 sm:grid-cols-2 lg:grid-cols-3">
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.member') }}</span>
              <select v-model="memberFilter" data-test="member-filter" class="input">
                <option value="">{{ t('userGroups.common.allMembers') }}</option>
                <option v-for="member in members" :key="member.user_id" :value="member.user_id">{{ member.username || member.email }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.model') }}</span>
              <input v-model="modelFilter" data-test="model-filter" class="input" :placeholder="t('userGroups.usage.modelPlaceholder')" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('userGroups.usage.billingType') }}</span>
              <select v-model="billingFilter" data-test="billing-filter" class="input">
                <option value="">{{ t('userGroups.usage.allBillingTypes') }}</option>
                <option value="0">{{ t('userGroups.usage.balanceBilling') }}</option>
                <option value="1">{{ t('userGroups.usage.subscriptionBilling') }}</option>
              </select>
            </label>
        </section>

        <section v-if="dataError" data-test="usage-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
          <p class="text-sm text-red-700 dark:text-red-300">{{ dataError }}</p>
          <button class="btn btn-secondary mt-4" type="button" @click="loadUsage">{{ t('userGroups.common.retry') }}</button>
        </section>

        <template v-else-if="result">
          <GroupUsageSummary :summary="result.summary" />

          <div class="flex" role="tablist" :aria-label="t('userGroups.usage.resultView')">
            <div class="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-dark-800">
              <button
                data-test="usage-view-members"
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                :class="resultView === 'members' ? 'bg-white text-gray-950 shadow-sm dark:bg-dark-700 dark:text-white' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'"
                :aria-selected="resultView === 'members'"
                role="tab"
                @click="resultView = 'members'"
              >
                {{ t('userGroups.usage.memberView') }}
              </button>
              <button
                data-test="usage-view-details"
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                :class="resultView === 'details' ? 'bg-white text-gray-950 shadow-sm dark:bg-dark-700 dark:text-white' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'"
                :aria-selected="resultView === 'details'"
                role="tab"
                @click="resultView = 'details'"
              >
                {{ t('userGroups.usage.detailView') }}
              </button>
            </div>
          </div>

          <section v-if="resultView === 'members'" data-test="usage-member-table">
            <div class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
              <div v-if="result.by_user.length === 0" class="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.noUsage') }}</div>
              <template v-else>
                <div class="hidden grid-cols-[minmax(180px,1fr)_110px_130px_130px_130px] gap-4 bg-gray-50 px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:bg-dark-800 dark:text-gray-400 xl:grid">
                  <span>{{ t('userGroups.usage.member') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.requests') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.totalTokens') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.balanceConsumption') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.subscriptionConsumption') }}</span>
                </div>
                <div
                  v-for="item in result.by_user"
                  :key="item.user_id"
                  class="grid gap-3 border-t border-gray-100 px-5 py-4 first:border-t-0 dark:border-dark-700 xl:grid-cols-[minmax(180px,1fr)_110px_130px_130px_130px] xl:items-center xl:gap-4"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ item.username || item.email }}</p>
                    <p class="truncate text-xs text-gray-500 dark:text-gray-400">{{ item.email }}</p>
                  </div>
                  <MetricPair :label="t('userGroups.usage.requests')" :value="formatNumber(item.total_requests)" />
                  <MetricPair :label="t('userGroups.usage.totalTokens')" :value="formatNumber(item.total_tokens)" />
                  <MetricPair :label="t('userGroups.usage.balanceConsumption')" :value="formatCurrency(item.balance_consumption)" />
                  <MetricPair :label="t('userGroups.usage.subscriptionConsumption')" :value="formatCurrency(item.subscription_consumption)" />
                </div>
              </template>
            </div>
          </section>

          <section v-else data-test="usage-detail-table">
            <div class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
              <div v-if="loadingData" class="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
              <div v-else-if="result.items.length === 0" class="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.usage.noUsage') }}</div>
              <template v-else>
                <div class="hidden grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_100px_100px_140px_44px] gap-4 bg-gray-50 px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:bg-dark-800 dark:text-gray-400 xl:grid">
                  <span>{{ t('userGroups.usage.member') }}</span>
                  <span>{{ t('userGroups.usage.modelName') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.tokens') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.cost') }}</span>
                  <span class="text-right">{{ t('userGroups.usage.time') }}</span>
                  <span class="sr-only">{{ t('userGroups.usage.viewPrompt') }}</span>
                </div>
                <article
                  v-for="item in result.items"
                  :key="item.id"
                  class="grid gap-3 border-t border-gray-100 px-5 py-4 first:border-t-0 dark:border-dark-700 xl:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_100px_100px_140px_44px] xl:items-center xl:gap-4"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ item.username || item.email }}</p>
                    <p class="break-all text-xs text-gray-500 dark:text-gray-400">{{ item.request_id }}</p>
                  </div>
                  <div class="min-w-0">
                    <p class="break-words text-sm text-gray-800 dark:text-gray-100">{{ item.model }}</p>
                    <span class="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs" :class="item.billing_type === 1 ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'">
                      {{ item.billing_type === 1 ? t('userGroups.usage.subscriptionBilling') : t('userGroups.usage.balanceBilling') }}
                    </span>
                  </div>
                  <MetricPair :label="t('userGroups.usage.tokens')" :value="formatNumber(item.total_tokens)" />
                  <MetricPair :label="t('userGroups.usage.cost')" :value="formatCurrency(item.actual_cost)" />
                  <MetricPair :label="t('userGroups.usage.time')" :value="formatDateTime(item.created_at)" />
                  <div class="flex justify-end">
                    <button
                      v-if="selectedGroup?.can_view_prompt && item.prompt_available"
                      :data-test="`prompt-details-${item.id}`"
                      type="button"
                      class="btn btn-ghost btn-sm !px-2 text-primary-700 dark:text-primary-300"
                      :title="t('userGroups.usage.viewPrompt')"
                      :aria-label="t('userGroups.usage.viewPrompt')"
                      @click="openPromptDetails(item.id)"
                    >
                      <Icon name="eye" size="sm" />
                    </button>
                  </div>
                </article>
              </template>
              <Pagination
                v-if="result.total > 0"
                :page="page"
                :total="result.total"
                :page-size="pageSize"
                @update:page="changePage"
                @update:page-size="changePageSize"
              />
            </div>
          </section>
        </template>

        <div v-else-if="loadingData" class="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
      </template>
    </UserGroupWorkspaceShell>
    <UserGroupPromptDetailDialog
      :show="promptDialogOpen"
      :prompts="promptDetails"
      :loading="loadingPromptDetails"
      :error="promptDetailError"
      :forbidden="promptDetailForbidden"
      @close="promptDialogOpen = false"
      @retry="retryPromptDetails"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import Pagination from '@/components/common/Pagination.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAuthStore } from '@/stores/auth'
import type { UserGroup, UserGroupMember, UserGroupPromptDetail, UserGroupUsageParams, UserGroupUsageResult } from '@/types/userGroups'
import GroupContextRail from './components/GroupContextRail.vue'
import GroupUsageSummary from './components/GroupUsageSummary.vue'
import UserGroupWorkspaceShell from './components/UserGroupWorkspaceShell.vue'
import UserGroupPromptDetailDialog from './components/UserGroupPromptDetailDialog.vue'

const MetricPair = defineComponent({
  props: { label: { type: String, required: true }, value: { type: String, required: true } },
  setup(props) {
    return () => h('div', { class: 'flex items-baseline justify-between gap-3 text-right xl:block' }, [
      h('span', { class: 'text-xs text-gray-500 xl:hidden' }, props.label),
      h('span', { class: 'text-sm tabular-nums text-gray-800 dark:text-gray-100' }, props.value),
    ])
  },
})

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)
const groups = ref<UserGroup[]>([])
const members = ref<UserGroupMember[]>([])
const selectedGroupId = ref<number | null>(null)
const loadingGroups = ref(false)
const groupsError = ref('')
const loadingData = ref(false)
const dataError = ref('')
const result = ref<UserGroupUsageResult | null>(null)
const selectedGroup = computed(() => groups.value.find(group => group.id === selectedGroupId.value) ?? null)
const promptDialogOpen = ref(false)
const promptDetails = ref<UserGroupPromptDetail[]>([])
const loadingPromptDetails = ref(false)
const promptDetailError = ref('')
const promptDetailForbidden = ref(false)
const promptTargetUsageId = ref<number | null>(null)

const endDate = ref(formatLocalDate(new Date()))
const startDate = ref(formatLocalDate(addDays(new Date(), -6)))
const memberFilter = ref('')
const modelFilter = ref('')
const billingFilter = ref<'' | '0' | '1'>('')
const showAdvancedFilters = ref(false)
const resultView = ref<'members' | 'details'>('members')
const page = ref(1)
const pageSize = ref(20)
const activeAdvancedFilterCount = computed(() => [
  memberFilter.value,
  modelFilter.value.trim(),
  billingFilter.value,
].filter(Boolean).length)

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : t('common.loadFailed')
}

function routeGroupId(): number | null {
  const value = Number(route.query.group_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

function resolveSelectedGroupId(): number | null {
  const requested = routeGroupId()
  return groups.value.some(group => group.id === requested)
    ? requested
    : groups.value[0]?.id ?? null
}

async function syncGroupQuery(groupId: number) {
  await router.replace({
    query: { ...route.query, group_id: String(groupId) },
  })
}

async function loadGroups() {
  loadingGroups.value = true
  groupsError.value = ''
  try {
    groups.value = await userGroupAPI.list()
    selectedGroupId.value = resolveSelectedGroupId()
    if (selectedGroupId.value) {
      if (routeGroupId() !== selectedGroupId.value) await syncGroupQuery(selectedGroupId.value)
      await loadGroupData()
    }
  } catch (error) {
    groups.value = []
    selectedGroupId.value = null
    groupsError.value = errorMessage(error)
  } finally {
    loadingGroups.value = false
  }
}

async function loadGroupData() {
  if (!selectedGroupId.value) return
  loadingData.value = true
  dataError.value = ''
  try {
    const [memberRows, usage] = await Promise.all([
      userGroupAPI.getMembers(selectedGroupId.value),
      requestUsage(selectedGroupId.value),
    ])
    members.value = memberRows
    result.value = usage
  } catch (error) {
    members.value = []
    result.value = null
    dataError.value = errorMessage(error)
  } finally {
    loadingData.value = false
  }
}

function usageParams(): UserGroupUsageParams {
  return {
    start_date: startDate.value,
    end_date: endDate.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_id: memberFilter.value ? Number(memberFilter.value) : undefined,
    model: modelFilter.value.trim() || undefined,
    billing_type: billingFilter.value === '' ? undefined : Number(billingFilter.value) as 0 | 1,
    page: page.value,
    page_size: pageSize.value,
  }
}

function requestUsage(groupId: number) {
  return userGroupAPI.getUsage(groupId, usageParams())
}

async function loadUsage() {
  if (!selectedGroupId.value) return
  loadingData.value = true
  dataError.value = ''
  try {
    result.value = await requestUsage(selectedGroupId.value)
  } catch (error) {
    result.value = null
    dataError.value = errorMessage(error)
  } finally {
    loadingData.value = false
  }
}

async function handleGroupChange(groupId: number) {
  promptDialogOpen.value = false
  selectedGroupId.value = groupId
  memberFilter.value = ''
  page.value = 1
  await syncGroupQuery(groupId)
  await loadGroupData()
}

async function openPromptDetails(usageLogId: number) {
  if (!selectedGroupId.value) return
  promptTargetUsageId.value = usageLogId
  promptDialogOpen.value = true
  promptDetails.value = []
  promptDetailError.value = ''
  promptDetailForbidden.value = false
  loadingPromptDetails.value = true
  try {
    promptDetails.value = await userGroupAPI.getUsagePrompts(selectedGroupId.value, usageLogId)
  } catch (error) {
    const status = (error as { status?: number; response?: { status?: number } })?.status
      ?? (error as { response?: { status?: number } })?.response?.status
    if (status === 403) promptDetailForbidden.value = true
    else promptDetailError.value = errorMessage(error)
  } finally {
    loadingPromptDetails.value = false
  }
}

function retryPromptDetails() {
  if (promptTargetUsageId.value) void openPromptDetails(promptTargetUsageId.value)
}

function applyFilters() {
  page.value = 1
  void loadUsage()
}

function changePage(nextPage: number) {
  page.value = nextPage
  void loadUsage()
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  void loadUsage()
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(locale.value).format(value || 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(value || 0)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

onMounted(loadGroups)
</script>
