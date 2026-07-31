<template>
  <AppLayout>
    <div class="subscriptions-page">
      <section class="subscriptions-head">
        <div class="subscriptions-head-copy">
          <ProductIcon name="subscription" tone="violet" size="sm" />
          <div class="min-w-0">
            <span>{{ t('userSubscriptions.description') }}</span>
          </div>
        </div>

        <div class="subscriptions-stat-grid">
          <div class="subscriptions-stat-card">
            <ProductIcon name="database" tone="slate" size="xs" bare />
            <span>{{ t('userSubscriptions.title') }}</span>
            <strong>{{ subscriptions.length }}</strong>
          </div>
          <div class="subscriptions-stat-card">
            <ProductIcon name="bolt" tone="emerald" size="xs" bare />
            <span>{{ t('common.active') }}</span>
            <strong>{{ activeSubscriptionCount }}</strong>
          </div>
          <div class="subscriptions-stat-card">
            <ProductIcon name="clock" tone="amber" size="xs" bare />
            <span>{{ t('userSubscriptions.expires') }}</span>
            <strong>{{ expiringSoonCount }}</strong>
          </div>
        </div>
      </section>

      <div v-if="loading" class="subscriptions-loading">
        <div v-for="index in 2" :key="index" class="subscriptions-skeleton-card" />
      </div>

      <div v-else-if="subscriptions.length === 0" class="subscriptions-empty">
        <ProductIcon name="document" tone="slate" size="lg" />
        <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          {{ t('userSubscriptions.noActiveSubscriptions') }}
        </h3>
        <p class="text-gray-500 dark:text-dark-400">
          {{ t('userSubscriptions.noActiveSubscriptionsDesc') }}
        </p>
      </div>

      <div v-else class="subscriptions-grid">
        <div
          v-for="subscription in subscriptions"
          :key="subscription.id"
          class="subscription-card"
        >
          <div class="subscription-card-header">
            <div class="flex items-center gap-3">
              <div :class="['subscription-platform-dot', platformAccentDotClass(subscription.group?.platform || '')]" />
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="subscription-title">
                    {{ subscription.group?.name || `Group #${subscription.group_id}` }}
                  </h3>
                  <span :class="['subscription-platform-badge', platformBadgeClass(subscription.group?.platform || '')]">
                    {{ platformLabel(subscription.group?.platform || '') }}
                  </span>
                </div>
                <p v-if="subscription.group?.description" class="subscription-description">
                  {{ subscription.group.description }}
                </p>
                <div class="subscription-rate-line">
                  <span>{{ t('payment.planCard.rate') }}: ×{{ subscription.group?.rate_multiplier ?? 1 }}</span>
                  <span v-if="subscriptionHasPeakRate(subscription)" class="subscription-peak-rate">
                    {{ t('payment.planCard.peakRate') }}: {{ subscriptionPeakRateLabel(subscription) }}
                  </span>
                </div>
              </div>
            </div>
            <div class="subscription-actions">
              <span
                :class="[
                  'subscription-status-pill',
                  subscription.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : subscription.status === 'expired'
                      ? 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                ]"
              >
                {{ t(`userSubscriptions.status.${subscription.status}`) }}
              </span>
              <button
                v-if="subscription.status === 'active'"
                class="subscription-renew-button"
                @click="router.push({ path: '/purchase', query: { tab: 'subscription', group: String(subscription.group_id) } })"
              >
                {{ t('payment.renewNow') }}
              </button>
            </div>
          </div>

          <div class="subscription-card-body">
            <div v-if="subscription.expires_at" class="subscription-meta-row">
              <span>{{ t('userSubscriptions.expires') }}</span>
              <span :class="getExpirationClass(subscription.expires_at)">
                {{ formatCompactExpirationDate(subscription.expires_at) }}
              </span>
            </div>
            <div v-else class="subscription-meta-row">
              <span>{{ t('userSubscriptions.expires') }}</span>
              <span class="text-gray-700 dark:text-gray-300">
                {{ t('userSubscriptions.noExpiration') }}
              </span>
            </div>

            <div v-if="subscription.group?.daily_limit_usd" class="subscription-quota-row">
              <div class="flex items-center justify-between">
                <span>
                  {{ t('userSubscriptions.daily') }}
                </span>
                <strong>
                  ${{ (subscription.daily_usage_usd || 0).toFixed(2) }} / ${{
                    subscription.group.daily_limit_usd.toFixed(2)
                  }}
                </strong>
              </div>
              <div class="subscription-progress-track">
                <div
                  class="subscription-progress-bar"
                  :class="
                    getProgressBarClass(
                      subscription.daily_usage_usd,
                      subscription.group.daily_limit_usd
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.daily_usage_usd,
                      subscription.group.daily_limit_usd
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.daily_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{ formatDailyUsageWindow(subscription) }}
              </p>
            </div>

            <!-- Weekly Usage -->
            <div v-if="subscription.group?.weekly_limit_usd" class="subscription-quota-row">
              <div class="flex items-center justify-between">
                <span>
                  {{ t('userSubscriptions.weekly') }}
                </span>
                <strong>
                  ${{ (subscription.weekly_usage_usd || 0).toFixed(2) }} / ${{
                    subscription.group.weekly_limit_usd.toFixed(2)
                  }}
                </strong>
              </div>
              <div class="subscription-progress-track">
                <div
                  class="subscription-progress-bar"
                  :class="
                    getProgressBarClass(
                      subscription.weekly_usage_usd,
                      subscription.group.weekly_limit_usd
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.weekly_usage_usd,
                      subscription.group.weekly_limit_usd
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.weekly_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{
                  t('userSubscriptions.resetIn', {
                    time: formatResetTime(subscription.weekly_window_start, 168)
                  })
                }}
              </p>
            </div>

            <!-- Monthly Usage -->
            <div v-if="subscription.group?.monthly_limit_usd" class="subscription-quota-row">
              <div class="flex items-center justify-between">
                <span>
                  {{ t('userSubscriptions.monthly') }}
                </span>
                <strong>
                  ${{ (subscription.monthly_usage_usd || 0).toFixed(2) }} / ${{
                    subscription.group.monthly_limit_usd.toFixed(2)
                  }}
                </strong>
              </div>
              <div class="subscription-progress-track">
                <div
                  class="subscription-progress-bar"
                  :class="
                    getProgressBarClass(
                      subscription.monthly_usage_usd,
                      subscription.group.monthly_limit_usd
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.monthly_usage_usd,
                      subscription.group.monthly_limit_usd
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.monthly_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{
                  t('userSubscriptions.resetIn', {
                    time: formatResetTime(subscription.monthly_window_start, 720)
                  })
                }}
              </p>
            </div>

            <div
              v-if="
                !subscription.group?.daily_limit_usd &&
                !subscription.group?.weekly_limit_usd &&
                !subscription.group?.monthly_limit_usd
              "
              class="subscription-unlimited"
            >
              <div class="flex items-center gap-3">
                <span>∞</span>
                <div>
                  <p>
                    {{ t('userSubscriptions.unlimited') }}
                  </p>
                  <small>
                    {{ t('userSubscriptions.unlimitedDesc') }}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import subscriptionsAPI from '@/api/subscriptions'
import type { UserSubscription } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import ProductIcon from '@/components/common/ProductIcon.vue'
import { formatDateTimeToMinute } from '@/utils/format'
import { hasPeakRate, formatPeakRateWindow, serverTimezoneLabel } from '@/utils/peak-rate'
import { platformBadgeClass, platformLabel } from '@/utils/platformColors'
import {
  getExpirationDateRelation,
  getRemainingDurationParts,
  isOneTimeDailyQuota,
  type RemainingDurationParts
} from '@/utils/subscriptionQuota'

function platformAccentDotClass(p: string): string {
  switch (p) {
    case 'anthropic': return 'bg-orange-500'
    case 'openai': return 'bg-emerald-500'
    case 'antigravity': return 'bg-purple-500'
    case 'gemini': return 'bg-blue-500'
    default: return 'bg-gray-400'
  }
}

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const subscriptions = ref<UserSubscription[]>([])
const loading = ref(true)

const activeSubscriptionCount = computed(() =>
  subscriptions.value.filter((subscription) => subscription.status === 'active').length
)

const expiringSoonCount = computed(() =>
  subscriptions.value.filter((subscription) => {
    if (!subscription.expires_at || subscription.status !== 'active') return false
    const days = Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).length
)

function subscriptionHasPeakRate(subscription: UserSubscription): boolean {
  return hasPeakRate(subscription.group)
}

function subscriptionPeakRateLabel(subscription: UserSubscription): string {
  return formatPeakRateWindow(
    subscription.group,
    serverTimezoneLabel(appStore.cachedPublicSettings?.server_utc_offset)
  )
}

async function loadSubscriptions() {
  try {
    loading.value = true
    subscriptions.value = await subscriptionsAPI.getMySubscriptions()
  } catch (error) {
    console.error('Failed to load subscriptions:', error)
    appStore.showError(t('userSubscriptions.failedToLoad'))
  } finally {
    loading.value = false
  }
}

function getProgressWidth(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return '0%'
  const percentage = Math.min(((used || 0) / limit) * 100, 100)
  return `${percentage}%`
}

function getProgressBarClass(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return 'bg-gray-400'
  const percentage = ((used || 0) / limit) * 100
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function formatCompactExpirationDate(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  const relation = getExpirationDateRelation(expires, now)

  if (relation === null) return ''

  if (relation === 'expired') {
    return t('userSubscriptions.status.expired')
  }

  const dateStr = formatDateTimeToMinute(expires)

  if (relation === 'today') {
    return `${dateStr} (${t('common.today')})`
  }
  if (relation === 'tomorrow') {
    return `${dateStr} (${t('common.tomorrow')})`
  }

  return t('userSubscriptions.daysRemaining', { days }) + ` (${dateStr})`
}

function getExpirationClass(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (diff <= 0) return 'text-red-600 dark:text-red-400 font-medium'
  if (days <= 3) return 'text-red-600 dark:text-red-400'
  if (days <= 7) return 'text-orange-600 dark:text-orange-400'
  return 'text-gray-700 dark:text-gray-300'
}

function formatDurationParts(parts: RemainingDurationParts): string {
  if (parts.days > 0) {
    return `${parts.days}d ${parts.hours}h`
  }

  if (parts.hours > 0) {
    return `${parts.hours}h ${parts.minutes}m`
  }

  return `${parts.minutes}m`
}

function formatDailyUsageWindow(subscription: UserSubscription): string {
  if (isOneTimeDailyQuota(subscription) && subscription.expires_at) {
    const parts = getRemainingDurationParts(subscription.expires_at)
    if (!parts) return t('userSubscriptions.windowNotActive')
    return t('userSubscriptions.quotaEndsIn', { time: formatDurationParts(parts) })
  }

  return t('userSubscriptions.resetIn', {
    time: formatResetTime(subscription.daily_window_start, 24)
  })
}

function formatResetTime(windowStart: string | null, windowHours: number): string {
  if (!windowStart) return t('userSubscriptions.windowNotActive')

  const start = new Date(windowStart)
  const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000)
  const parts = getRemainingDurationParts(end)

  return parts ? formatDurationParts(parts) : t('userSubscriptions.windowNotActive')
}

onMounted(() => {
  loadSubscriptions()
})
</script>

<style scoped>
.subscriptions-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.subscriptions-head {
  display: grid;
  grid-template-columns: minmax(16rem, 0.9fr) minmax(20rem, 1fr);
  align-items: stretch;
  gap: 0.875rem;
}

.subscriptions-head-copy,
.subscriptions-stat-card,
.subscription-card,
.subscriptions-empty {
  border: 1px solid rgb(17 24 39 / 0.06);
  border-radius: 1rem;
  background: rgb(255 255 255);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04), 0 1px 2px rgb(15 23 42 / 0.03);
}

.subscriptions-head-copy {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
}

.subscriptions-stat-card span {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
  color: rgb(100 116 139);
}

.subscriptions-head-copy span {
  display: block;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: rgb(71 85 105);
}

.subscriptions-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.subscriptions-stat-card {
  display: grid;
  align-content: center;
  gap: 0.125rem;
  min-height: 4rem;
  padding: 0.75rem 0.875rem;
}

.subscriptions-stat-card span {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.subscriptions-stat-card strong {
  color: rgb(15 23 42);
  font-variant-numeric: tabular-nums;
  font-size: 1.125rem;
  font-weight: 750;
  line-height: 1.5rem;
}

.subscriptions-loading,
.subscriptions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18.5rem, 22rem));
  gap: 0.875rem;
  justify-content: start;
}

.subscriptions-skeleton-card {
  min-height: 13rem;
  border-radius: 1rem;
  border: 1px solid rgb(17 24 39 / 0.06);
  background: linear-gradient(90deg, rgb(255 255 255), rgb(248 250 252), rgb(255 255 255));
  background-size: 200% 100%;
  animation: subscriptions-skeleton 1.1s ease-in-out infinite;
}

.subscriptions-empty {
  display: flex;
  min-height: 18rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
}

.subscription-card {
  overflow: hidden;
}

.subscription-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid rgb(226 232 240);
  padding: 0.875rem;
}

.subscription-platform-dot {
  margin-top: 0.5rem;
  height: 0.5rem;
  width: 0.5rem;
  flex-shrink: 0;
  border-radius: 999px;
}

.subscription-title {
  color: rgb(15 23 42);
  font-weight: 700;
  max-width: 10.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscription-platform-badge {
  border-radius: 999px;
  border-width: 1px;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 650;
  line-height: 1rem;
}

.subscription-description {
  margin-top: 0.25rem;
  color: rgb(100 116 139);
  font-size: 0.75rem;
  line-height: 1rem;
}

.subscription-rate-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  margin-top: 0.375rem;
  color: rgb(100 116 139);
  font-size: 0.6875rem;
  line-height: 1rem;
}

.subscription-peak-rate {
  color: rgb(180 83 9);
}

.subscription-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.subscription-status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 650;
  line-height: 1rem;
}

.subscription-renew-button {
  border-radius: 999px;
  border: 1px solid rgb(191 219 254);
  background: rgb(219 234 254);
  padding: 0.375rem 0.75rem;
  color: rgb(29 78 216);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1rem;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.subscription-renew-button:hover {
  border-color: rgb(147 197 253);
  background: rgb(191 219 254);
  color: rgb(30 64 175);
}

.subscription-card-body {
  display: grid;
  gap: 0.75rem;
  padding: 0.875rem;
}

.subscription-meta-row,
.subscription-quota-row > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8125rem;
}

.subscription-meta-row > span:first-child,
.subscription-quota-row span {
  color: rgb(100 116 139);
}

.subscription-quota-row {
  display: grid;
  gap: 0.375rem;
}

.subscription-quota-row strong {
  color: rgb(71 85 105);
  font-size: 0.8125rem;
  font-weight: 650;
}

.subscription-progress-track {
  position: relative;
  height: 0.375rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(226 232 240);
}

.subscription-progress-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.subscription-unlimited {
  display: flex;
  justify-content: center;
  border-radius: 0.875rem;
  border: 1px solid rgb(187 247 208);
  background: rgb(240 253 244);
  padding: 1.25rem;
}

.subscription-unlimited span {
  color: rgb(22 101 52);
  font-size: 2rem;
  line-height: 1;
}

.subscription-unlimited p {
  color: rgb(21 128 61);
  font-size: 0.875rem;
  font-weight: 700;
}

.subscription-unlimited small {
  color: rgb(22 101 52);
  font-size: 0.75rem;
}

@keyframes subscriptions-skeleton {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: -100% 50%;
  }
}

:global(.dark) .subscriptions-head-copy,
:global(.dark) .subscriptions-stat-card,
:global(.dark) .subscription-card,
:global(.dark) .subscriptions-empty {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.52);
  box-shadow: none;
}

:global(.dark) .subscriptions-head-copy span,
:global(.dark) .subscriptions-stat-card span,
:global(.dark) .subscription-description,
:global(.dark) .subscription-rate-line,
:global(.dark) .subscription-meta-row > span:first-child,
:global(.dark) .subscription-quota-row span {
  color: rgb(148 163 184);
}

:global(.dark) .subscription-peak-rate {
  color: rgb(252 211 77);
}

:global(.dark) .subscriptions-stat-card strong,
:global(.dark) .subscription-title {
  color: rgb(255 255 255);
}

:global(.dark) .subscription-card-header {
  border-color: rgb(51 65 85);
}

:global(.dark) .subscription-quota-row strong {
  color: rgb(203 213 225);
}

:global(.dark) .subscription-progress-track {
  background: rgb(51 65 85);
}

:global(.dark) .subscription-renew-button {
  border-color: rgb(59 130 246 / 0.28);
  background: rgb(59 130 246 / 0.16);
  color: rgb(147 197 253);
}

:global(.dark) .subscription-renew-button:hover {
  border-color: rgb(96 165 250 / 0.42);
  background: rgb(59 130 246 / 0.24);
  color: rgb(191 219 254);
}

:global(.dark) .subscription-unlimited {
  border-color: rgb(34 197 94 / 0.24);
  background: rgb(34 197 94 / 0.12);
}

:global(.dark) .subscription-unlimited span,
:global(.dark) .subscription-unlimited p,
:global(.dark) .subscription-unlimited small {
  color: rgb(134 239 172);
}

:global(.dark) .subscriptions-skeleton-card {
  border-color: rgb(255 255 255 / 0.1);
  background: linear-gradient(90deg, rgb(15 23 42 / 0.52), rgb(30 41 59), rgb(15 23 42 / 0.52));
  background-size: 200% 100%;
}

@media (max-width: 900px) {
  .subscriptions-head {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .subscriptions-stat-grid,
  .subscriptions-loading,
  .subscriptions-grid {
    grid-template-columns: 1fr;
  }

  .subscription-card-header {
    flex-direction: column;
  }

  .subscription-actions {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .subscriptions-skeleton-card,
  .subscription-progress-bar {
    animation: none;
    transition: none;
  }
}
</style>
