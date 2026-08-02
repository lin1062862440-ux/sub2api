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
            <label class="block w-full sm:w-44">
              <span class="sr-only">{{ t('userGroups.subscriptions.statusFilter') }}</span>
              <select v-model="status" class="input" @change="applyStatus">
                <option value="">{{ t('common.all') }}</option>
                <option value="active">{{ t('userGroups.groups.active') }}</option>
                <option value="expired">{{ t('userGroups.subscriptions.expired') }}</option>
                <option value="none">{{ t('userGroups.subscriptions.noSubscription') }}</option>
              </select>
            </label>
            <button
              data-test="refresh-subscriptions"
              type="button"
              class="btn btn-secondary !px-2.5"
              :aria-label="t('common.refresh')"
              :title="t('common.refresh')"
              :disabled="loadingData"
              @click="loadSubscriptions"
            >
              <Icon name="refresh" size="sm" :class="loadingData ? 'animate-spin' : ''" />
            </button>
          </template>
        </GroupContextRail>

        <section v-if="result" data-test="subscription-summary-band" class="grid grid-cols-2 divide-x divide-y divide-gray-200 border-y border-gray-200 dark:divide-dark-700 dark:border-dark-700 sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0">
          <div class="px-5 py-4">
            <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.members') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ result.summary.member_count }}</p>
          </div>
          <div class="px-5 py-4">
            <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.subscriptions.activeSubscriptions') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ result.summary.active_subscription_count }}</p>
          </div>
          <div class="px-5 py-4">
            <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.subscriptions.totalBalance') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ formatCurrency(result.summary.total_balance) }}</p>
          </div>
          <div class="px-5 py-4">
            <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ t('userGroups.subscriptions.subscriptionUsage') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-primary-600 dark:text-primary-400">{{ formatCurrency(result.summary.active_subscription_usage) }}</p>
          </div>
        </section>

        <section v-if="dataError" data-test="subscription-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
          <p class="text-sm text-red-700 dark:text-red-300">{{ dataError }}</p>
          <button class="btn btn-secondary mt-4" type="button" @click="loadSubscriptions">{{ t('userGroups.common.retry') }}</button>
        </section>

        <section v-else class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div v-if="loadingData" class="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
          <div v-else-if="!result || result.items.length === 0" class="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.subscriptions.noRows') }}</div>
          <div v-else>
            <div class="hidden grid-cols-[minmax(190px,1.15fr)_minmax(150px,0.9fr)_minmax(310px,1.5fr)_120px] gap-5 bg-gray-50 px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:bg-dark-800 dark:text-gray-400 xl:grid">
              <span>{{ t('userGroups.subscriptions.member') }}</span>
              <span>{{ t('userGroups.subscriptions.plan') }}</span>
              <span>{{ t('userGroups.subscriptions.quota') }}</span>
              <span class="text-right">{{ t('userGroups.subscriptions.balance') }}</span>
            </div>
            <article
              v-for="row in result.items"
              :key="`${row.member.user_id}-${row.subscription_id ?? 'none'}`"
              class="grid gap-4 border-t border-gray-100 px-5 py-5 first:border-t-0 dark:border-dark-700 xl:grid-cols-[minmax(190px,1.15fr)_minmax(150px,0.9fr)_minmax(310px,1.5fr)_120px] xl:items-center xl:gap-5"
            >
              <div class="flex min-w-0 items-center gap-3">
                <img
                  data-test="subscription-member-avatar"
                  :src="resolveAvatarUrl(row.member.avatar_url)"
                  :alt="row.member.username || row.member.email"
                  class="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5 dark:bg-dark-800 dark:ring-white/10"
                />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ row.member.username || row.member.email }}</p>
                  <p class="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">{{ row.member.email }}</p>
                </div>
              </div>
              <div v-if="row.subscription_id" class="min-w-0">
                <p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ row.billing_group }}</p>
                <div class="mt-0.5 flex flex-wrap items-center gap-2">
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ row.platform || '-' }}</span>
                  <span
                    :data-test="`subscription-status-${row.subscription_id}`"
                    class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="row.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : row.status === 'expired'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300'"
                  >
                    {{ subscriptionStatusLabel(row.status) }}
                  </span>
                </div>
                <p v-if="row.expires_at" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ formatDate(row.expires_at) }}</p>
              </div>
              <span v-else class="w-fit rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-dark-700 dark:text-gray-300">{{ t('userGroups.subscriptions.noSubscription') }}</span>
              <div v-if="row.subscription_id" class="space-y-2.5">
                <QuotaProgress :label="t('userGroups.subscriptions.daily')" :used="row.daily_used" :limit="row.daily_limit" />
                <QuotaProgress :label="t('userGroups.subscriptions.weekly')" :used="row.weekly_used" :limit="row.weekly_limit" />
                <QuotaProgress :label="t('userGroups.subscriptions.monthly')" :used="row.monthly_used" :limit="row.monthly_limit" />
              </div>
              <span v-else class="text-sm text-gray-400">-</span>
              <div class="text-left xl:text-right">
                <span class="text-xs text-gray-500 xl:hidden">{{ t('userGroups.subscriptions.balance') }} · </span>
                <span class="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{{ formatCurrency(row.member.balance) }}</span>
              </div>
            </article>
          </div>
          <Pagination
            v-if="result && result.total > 0"
            :page="page"
            :total="result.total"
            :page-size="pageSize"
            @update:page="changePage"
            @update:page-size="changePageSize"
          />
        </section>
      </template>
    </UserGroupWorkspaceShell>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import Pagination from '@/components/common/Pagination.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAuthStore } from '@/stores/auth'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { UserGroup, UserGroupSubscriptionResult } from '@/types/userGroups'
import GroupContextRail from './components/GroupContextRail.vue'
import QuotaProgress from './components/QuotaProgress.vue'
import UserGroupWorkspaceShell from './components/UserGroupWorkspaceShell.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)
const groups = ref<UserGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const loadingGroups = ref(false)
const groupsError = ref('')
const loadingData = ref(false)
const dataError = ref('')
const result = ref<UserGroupSubscriptionResult | null>(null)
const status = ref('')
const page = ref(1)
const pageSize = ref(20)

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
      await loadSubscriptions()
    }
  } catch (error) {
    groups.value = []
    selectedGroupId.value = null
    groupsError.value = errorMessage(error)
  } finally {
    loadingGroups.value = false
  }
}

async function loadSubscriptions() {
  if (!selectedGroupId.value) return
  loadingData.value = true
  dataError.value = ''
  try {
    result.value = await userGroupAPI.getSubscriptions(selectedGroupId.value, {
      status: status.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
  } catch (error) {
    result.value = null
    dataError.value = errorMessage(error)
  } finally {
    loadingData.value = false
  }
}

async function handleGroupChange(groupId: number) {
  selectedGroupId.value = groupId
  page.value = 1
  await syncGroupQuery(groupId)
  await loadSubscriptions()
}

function applyStatus() {
  page.value = 1
  void loadSubscriptions()
}

function changePage(nextPage: number) {
  page.value = nextPage
  void loadSubscriptions()
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  void loadSubscriptions()
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(value || 0)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function subscriptionStatusLabel(status: string) {
  if (status === 'active') return t('userGroups.groups.active')
  if (status === 'expired') return t('userGroups.subscriptions.expired')
  return status || '-'
}

onMounted(loadGroups)
</script>
