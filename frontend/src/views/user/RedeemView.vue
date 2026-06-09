<template>
  <AppLayout>
    <div class="redeem-page">
      <div class="redeem-workspace">
        <section class="redeem-panel redeem-form-panel">
          <form @submit.prevent="handleRedeem" class="redeem-form">
            <div class="redeem-form-heading">
              <ProductIcon name="key" tone="teal" size="sm" />
              <div>
                <h2>{{ t('redeem.redeemCodeLabel') }}</h2>
              </div>
            </div>

            <div>
              <label for="code" class="input-label">
                {{ t('redeem.redeemCodeLabel') }}
              </label>
              <div class="redeem-input-shell">
                <Icon name="gift" size="md" class="redeem-input-icon" />
                <input
                  id="code"
                  v-model="redeemCode"
                  type="text"
                  required
                  :placeholder="t('redeem.redeemCodePlaceholder')"
                  :disabled="submitting"
                  class="input redeem-code-input"
                />
              </div>
            </div>

            <button
              type="submit"
              :disabled="!redeemCode || submitting"
              class="btn btn-primary redeem-submit-button"
            >
              <svg
                v-if="submitting"
                class="-ml-1 mr-2 h-5 w-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <Icon v-else name="checkCircle" size="md" class="mr-2" />
              {{ submitting ? t('redeem.redeeming') : t('redeem.redeemButton') }}
            </button>
          </form>

          <transition name="fade">
            <div v-if="redeemResult" class="redeem-alert redeem-alert-success">
              <Icon name="checkCircle" size="md" class="text-emerald-600 dark:text-emerald-400" />
              <div class="min-w-0 flex-1">
                <h3>{{ t('redeem.redeemSuccess') }}</h3>
                <p>{{ redeemResult.message }}</p>
                <dl class="redeem-result-list">
                  <div v-if="redeemResult.type === 'balance'">
                    <dt>{{ t('redeem.added') }}</dt>
                    <dd>${{ redeemResult.value.toFixed(2) }}</dd>
                  </div>
                  <div v-else-if="redeemResult.type === 'concurrency'">
                    <dt>{{ t('redeem.added') }}</dt>
                    <dd>{{ redeemResult.value }} {{ t('redeem.concurrentRequests') }}</dd>
                  </div>
                  <div v-else-if="redeemResult.type === 'subscription'">
                    <dt>{{ t('redeem.subscriptionAssigned') }}</dt>
                    <dd>
                      <span v-if="redeemResult.group_name">{{ redeemResult.group_name }}</span>
                      <span v-if="redeemResult.validity_days">
                        {{ t('redeem.subscriptionDays', { days: redeemResult.validity_days }) }}
                      </span>
                    </dd>
                  </div>
                  <div v-if="redeemResult.new_balance !== undefined">
                    <dt>{{ t('redeem.newBalance') }}</dt>
                    <dd>${{ redeemResult.new_balance.toFixed(2) }}</dd>
                  </div>
                  <div v-if="redeemResult.new_concurrency !== undefined">
                    <dt>{{ t('redeem.newConcurrency') }}</dt>
                    <dd>{{ redeemResult.new_concurrency }} {{ t('redeem.requests') }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </transition>

          <transition name="fade">
            <div v-if="errorMessage" class="redeem-alert redeem-alert-error">
              <Icon
                name="exclamationCircle"
                size="md"
                class="text-red-600 dark:text-red-400"
              />
              <div class="min-w-0 flex-1">
                <h3>{{ t('redeem.redeemFailed') }}</h3>
                <p>{{ errorMessage }}</p>
              </div>
            </div>
          </transition>
        </section>

        <aside class="redeem-panel redeem-info-panel">
          <div class="redeem-account-status">
            <div class="redeem-side-heading">
              <ProductIcon name="wallet" tone="emerald" size="sm" />
              <div>
                <h2>{{ t('redeem.currentBalance') }}</h2>
                <p>{{ t('redeem.concurrency') }}</p>
              </div>
            </div>

            <div class="redeem-status-grid">
              <div>
                <span>{{ t('redeem.currentBalance') }}</span>
                <strong>${{ user?.balance?.toFixed(2) || '0.00' }}</strong>
              </div>
              <div>
                <span>{{ t('redeem.concurrency') }}</span>
                <strong>{{ user?.concurrency || 0 }} {{ t('redeem.requests') }}</strong>
              </div>
            </div>
          </div>

          <div class="redeem-code-notes">
            <div class="redeem-side-heading">
              <ProductIcon name="document" tone="blue" size="sm" />
              <div>
                <h2>
                  {{ t('redeem.aboutCodes') }}
                </h2>
              </div>
            </div>
            <ul class="redeem-rules-list">
              <li>{{ t('redeem.codeRule1') }}</li>
              <li>{{ t('redeem.codeRule2') }}</li>
              <li>
                {{ t('redeem.codeRule3') }}
                <span v-if="contactInfo" class="redeem-contact-pill">
                  {{ contactInfo }}
                </span>
              </li>
              <li>{{ t('redeem.codeRule4') }}</li>
            </ul>
          </div>
        </aside>
      </div>

      <section class="redeem-panel redeem-history-panel">
        <div class="redeem-history-header">
          <div class="redeem-side-heading">
            <ProductIcon name="clock" tone="slate" size="sm" />
            <div>
              <h2>
                {{ t('redeem.recentActivity') }}
              </h2>
              <p>{{ t('redeem.historyWillAppear') }}</p>
            </div>
          </div>
        </div>

        <div class="redeem-history-body">
          <div v-if="loadingHistory" class="redeem-history-skeleton" aria-hidden="true">
            <div v-for="index in 3" :key="index" class="redeem-skeleton-row">
              <span />
              <div>
                <i />
                <i />
              </div>
              <strong />
            </div>
          </div>

          <div v-else-if="history.length > 0" class="redeem-history-list">
            <div
              v-for="item in history"
              :key="item.id"
              class="redeem-history-row"
            >
              <div class="redeem-history-main">
                <ProductIcon
                  v-if="isBalanceType(item.type)"
                  name="wallet"
                  :tone="item.value >= 0 ? 'emerald' : 'rose'"
                  size="sm"
                />
                <ProductIcon
                  v-else-if="isSubscriptionType(item.type)"
                  name="document"
                  tone="violet"
                  size="sm"
                />
                <ProductIcon
                  v-else
                  name="bolt"
                  :tone="item.value >= 0 ? 'blue' : 'amber'"
                  size="sm"
                />
                <div class="min-w-0">
                  <p class="redeem-history-title">
                    {{ getHistoryItemTitle(item) }}
                  </p>
                  <p class="redeem-history-time">
                    {{ formatDateTime(item.used_at) }}
                  </p>
                </div>
              </div>

              <div class="redeem-history-meta">
                <p
                  :class="[
                    'redeem-history-value',
                    isBalanceType(item.type)
                      ? item.value >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                      : isSubscriptionType(item.type)
                        ? 'text-purple-600 dark:text-purple-400'
                        : item.value >= 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-orange-600 dark:text-orange-400'
                  ]"
                >
                  {{ formatHistoryValue(item) }}
                </p>
                <p
                  v-if="!isAdminAdjustment(item.type)"
                  class="redeem-history-code"
                >
                  {{ item.code.slice(0, 8) }}...
                </p>
                <p v-else class="redeem-history-code">
                  {{ t('redeem.adminAdjustment') }}
                </p>
                <p
                  v-if="item.notes"
                  class="redeem-history-notes"
                  :title="item.notes"
                >
                  {{ item.notes }}
                </p>
              </div>
            </div>
          </div>

          <div v-else class="redeem-empty-state">
            <ProductIcon name="clock" tone="slate" size="lg" />
            <p class="text-sm text-gray-500 dark:text-dark-400">
              {{ t('redeem.historyWillAppear') }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useSubscriptionStore } from '@/stores/subscriptions'
import { redeemAPI, authAPI, type RedeemHistoryItem } from '@/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import ProductIcon from '@/components/common/ProductIcon.vue'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()
const subscriptionStore = useSubscriptionStore()

const user = computed(() => authStore.user)

const redeemCode = ref('')
const submitting = ref(false)
const redeemResult = ref<{
  message: string
  type: string
  value: number
  new_balance?: number
  new_concurrency?: number
  group_name?: string
  validity_days?: number
} | null>(null)
const errorMessage = ref('')

// History data
const history = ref<RedeemHistoryItem[]>([])
const loadingHistory = ref(false)
const contactInfo = ref('')

// Helper functions for history display
const isBalanceType = (type: string) => {
  return type === 'balance' || type === 'admin_balance'
}

const isSubscriptionType = (type: string) => {
  return type === 'subscription'
}

const isAdminAdjustment = (type: string) => {
  return type === 'admin_balance' || type === 'admin_concurrency'
}

const getHistoryItemTitle = (item: RedeemHistoryItem) => {
  if (item.type === 'balance') {
    return t('redeem.balanceAddedRedeem')
  } else if (item.type === 'admin_balance') {
    return item.value >= 0 ? t('redeem.balanceAddedAdmin') : t('redeem.balanceDeductedAdmin')
  } else if (item.type === 'concurrency') {
    return t('redeem.concurrencyAddedRedeem')
  } else if (item.type === 'admin_concurrency') {
    return item.value >= 0 ? t('redeem.concurrencyAddedAdmin') : t('redeem.concurrencyReducedAdmin')
  } else if (item.type === 'subscription') {
    return t('redeem.subscriptionAssigned')
  }
  return t('common.unknown')
}

const formatHistoryValue = (item: RedeemHistoryItem) => {
  if (isBalanceType(item.type)) {
    const sign = item.value >= 0 ? '+' : ''
    return `${sign}$${item.value.toFixed(2)}`
  } else if (isSubscriptionType(item.type)) {
    // 订阅类型显示有效天数和分组名称
    const days = item.validity_days || Math.round(item.value)
    const groupName = item.group?.name || ''
    return groupName ? `${days}${t('redeem.days')} - ${groupName}` : `${days}${t('redeem.days')}`
  } else {
    const sign = item.value >= 0 ? '+' : ''
    return `${sign}${item.value} ${t('redeem.requests')}`
  }
}

const fetchHistory = async () => {
  loadingHistory.value = true
  try {
    history.value = await redeemAPI.getHistory()
  } catch (error) {
    console.error('Failed to fetch history:', error)
  } finally {
    loadingHistory.value = false
  }
}

const handleRedeem = async () => {
  if (!redeemCode.value.trim()) {
    appStore.showError(t('redeem.pleaseEnterCode'))
    return
  }

  submitting.value = true
  errorMessage.value = ''
  redeemResult.value = null

  try {
    const result = await redeemAPI.redeem(redeemCode.value.trim())

    redeemResult.value = result

    // Refresh user data to get updated balance/concurrency
    await authStore.refreshUser()

    // If subscription type, immediately refresh subscription status
    if (result.type === 'subscription') {
      try {
        await subscriptionStore.fetchActiveSubscriptions(true) // force refresh
      } catch (error) {
        console.error('Failed to refresh subscriptions after redeem:', error)
        appStore.showWarning(t('redeem.subscriptionRefreshFailed'))
      }
    }

    // Clear the input
    redeemCode.value = ''

    // Refresh history
    await fetchHistory()

    // Show success toast
    appStore.showSuccess(t('redeem.codeRedeemSuccess'))
  } catch (error: any) {
    errorMessage.value = error.response?.data?.detail || t('redeem.failedToRedeem')

    appStore.showError(t('redeem.redeemFailed'))
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  fetchHistory()
  try {
    const settings = await authAPI.getPublicSettings()
    contactInfo.value = settings.contact_info || ''
  } catch (error) {
    console.error('Failed to load contact info:', error)
  }
})
</script>

<style scoped>
.redeem-page {
  margin: 0 auto;
  display: flex;
  max-width: 74rem;
  flex-direction: column;
  gap: 1rem;
}

.redeem-panel {
  border: 1px solid rgb(17 24 39 / 0.06);
  border-radius: 1rem;
  background: rgb(255 255 255);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04), 0 1px 2px rgb(15 23 42 / 0.03);
}

.redeem-concurrency-chip,
.redeem-contact-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
}

.redeem-concurrency-chip {
  border: 1px solid rgb(254 215 170);
  background: rgb(255 251 235);
  padding: 0.375rem 0.625rem;
  color: rgb(146 64 14);
}

.redeem-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.8fr);
  gap: 1rem;
}

.redeem-form-panel,
.redeem-info-panel,
.redeem-history-panel {
  padding: 1.25rem;
}

.redeem-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.redeem-form-heading,
.redeem-side-heading,
.redeem-history-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.redeem-form-heading h2,
.redeem-side-heading h2 {
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.25rem;
  color: rgb(15 23 42);
}

.redeem-form-heading p,
.redeem-side-heading p {
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: rgb(100 116 139);
}

.redeem-input-shell {
  position: relative;
  margin-top: 0.5rem;
}

.redeem-input-icon {
  pointer-events: none;
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(100 116 139);
}

.redeem-code-input {
  min-height: 3.25rem;
  padding-left: 3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.redeem-submit-button {
  min-height: 3rem;
  width: 100%;
  border: 1px solid rgb(191 219 254);
  background: rgb(219 234 254);
  color: rgb(29 78 216);
  box-shadow: 0 1px 2px rgb(29 78 216 / 0.08);
}

.redeem-submit-button:hover:not(:disabled) {
  border-color: rgb(147 197 253);
  background: rgb(191 219 254);
  color: rgb(30 64 175);
  box-shadow: 0 6px 14px rgb(29 78 216 / 0.12);
}

.redeem-alert {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.75rem;
  border-radius: 0.875rem;
  border: 1px solid;
  padding: 1rem;
}

.redeem-alert h3 {
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
}

.redeem-alert p,
.redeem-result-list {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.redeem-alert-success {
  border-color: rgb(167 243 208);
  background: rgb(236 253 245);
  color: rgb(6 95 70);
}

.redeem-alert-error {
  border-color: rgb(254 202 202);
  background: rgb(254 242 242);
  color: rgb(153 27 27);
}

.redeem-result-list {
  display: grid;
  gap: 0.25rem;
}

.redeem-result-list div {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
}

.redeem-result-list dt {
  color: currentColor;
  opacity: 0.78;
}

.redeem-result-list dd {
  font-weight: 700;
}

.redeem-info-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.redeem-status-grid {
  margin-top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.redeem-status-grid div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 0.75rem;
  background: rgb(248 250 252);
  padding: 0.75rem;
}

.redeem-status-grid span {
  font-size: 0.8125rem;
  color: rgb(100 116 139);
}

.redeem-status-grid strong {
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  color: rgb(15 23 42);
}

.redeem-code-notes {
  border-top: 1px solid rgb(226 232 240);
  padding-top: 1.25rem;
}

.redeem-rules-list {
  margin-top: 1rem;
  display: grid;
  gap: 0.625rem;
  color: rgb(71 85 105);
  font-size: 0.875rem;
  line-height: 1.5rem;
}

.redeem-rules-list li {
  position: relative;
  padding-left: 1rem;
}

.redeem-rules-list li::before {
  position: absolute;
  left: 0;
  top: 0.64rem;
  height: 0.25rem;
  width: 0.25rem;
  border-radius: 999px;
  background: rgb(14 165 233);
  content: "";
}

.redeem-contact-pill {
  margin-left: 0.375rem;
  border: 1px solid rgb(186 230 253);
  background: rgb(240 249 255);
  padding: 0.125rem 0.5rem;
  color: rgb(3 105 161);
}

.redeem-history-panel {
  padding: 0;
  overflow: hidden;
}

.redeem-history-header {
  border-bottom: 1px solid rgb(226 232 240);
  padding: 1rem 1.25rem;
}

.redeem-history-body {
  padding: 1rem;
}

.redeem-history-list {
  display: grid;
  gap: 0.75rem;
}

.redeem-history-row,
.redeem-skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 0.875rem;
  border: 1px solid rgb(226 232 240 / 0.72);
  background: rgb(248 250 252 / 0.8);
  padding: 0.875rem;
}

.redeem-history-title {
  overflow: hidden;
  color: rgb(15 23 42);
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.25rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.redeem-history-time,
.redeem-history-code,
.redeem-history-notes {
  font-size: 0.75rem;
  line-height: 1rem;
  color: rgb(100 116 139);
}

.redeem-history-meta {
  min-width: 7.5rem;
  text-align: right;
}

.redeem-history-value {
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  font-weight: 750;
  line-height: 1.25rem;
}

.redeem-history-code {
  margin-top: 0.125rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.redeem-history-notes {
  margin-top: 0.25rem;
  max-width: 12.5rem;
  overflow: hidden;
  font-style: italic;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.redeem-empty-state {
  display: flex;
  min-height: 11rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
}

.redeem-history-skeleton {
  display: grid;
  gap: 0.75rem;
}

.redeem-skeleton-row span,
.redeem-skeleton-row i,
.redeem-skeleton-row strong {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(226 232 240), rgb(241 245 249), rgb(226 232 240));
  background-size: 200% 100%;
  animation: redeem-skeleton 1.1s ease-in-out infinite;
}

.redeem-skeleton-row span {
  height: 2.25rem;
  width: 2.25rem;
}

.redeem-skeleton-row div {
  flex: 1;
}

.redeem-skeleton-row i:first-child {
  height: 0.875rem;
  width: 45%;
}

.redeem-skeleton-row i:last-child {
  margin-top: 0.5rem;
  height: 0.75rem;
  width: 30%;
}

.redeem-skeleton-row strong {
  height: 1rem;
  width: 5rem;
}

@keyframes redeem-skeleton {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: -100% 50%;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

:global(.dark) .redeem-panel {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.52);
  box-shadow: none;
}

:global(.dark) .redeem-form-heading p,
:global(.dark) .redeem-side-heading p,
:global(.dark) .redeem-history-time,
:global(.dark) .redeem-history-code,
:global(.dark) .redeem-history-notes,
:global(.dark) .redeem-status-grid span,
:global(.dark) .redeem-rules-list {
  color: rgb(148 163 184);
}

:global(.dark) .redeem-form-heading h2,
:global(.dark) .redeem-side-heading h2,
:global(.dark) .redeem-status-grid strong,
:global(.dark) .redeem-history-title {
  color: rgb(255 255 255);
}

:global(.dark) .redeem-status-grid div,
:global(.dark) .redeem-history-row,
:global(.dark) .redeem-skeleton-row {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(15 23 42 / 0.72);
}

:global(.dark) .redeem-concurrency-chip {
  border-color: rgb(245 158 11 / 0.24);
  background: rgb(245 158 11 / 0.14);
  color: rgb(252 211 77);
}

:global(.dark) .redeem-code-notes,
:global(.dark) .redeem-history-header {
  border-color: rgb(51 65 85);
}

:global(.dark) .redeem-contact-pill {
  border-color: rgb(14 165 233 / 0.24);
  background: rgb(14 165 233 / 0.14);
  color: rgb(125 211 252);
}

:global(.dark) .redeem-alert-success {
  border-color: rgb(16 185 129 / 0.28);
  background: rgb(16 185 129 / 0.14);
  color: rgb(167 243 208);
}

:global(.dark) .redeem-alert-error {
  border-color: rgb(248 113 113 / 0.28);
  background: rgb(248 113 113 / 0.14);
  color: rgb(254 202 202);
}

:global(.dark) .redeem-submit-button {
  border-color: rgb(59 130 246 / 0.28);
  background: rgb(59 130 246 / 0.16);
  color: rgb(147 197 253);
  box-shadow: none;
}

:global(.dark) .redeem-submit-button:hover:not(:disabled) {
  border-color: rgb(96 165 250 / 0.42);
  background: rgb(59 130 246 / 0.24);
  color: rgb(191 219 254);
}

:global(.dark) .redeem-skeleton-row span,
:global(.dark) .redeem-skeleton-row i,
:global(.dark) .redeem-skeleton-row strong {
  background: linear-gradient(90deg, rgb(30 41 59), rgb(51 65 85), rgb(30 41 59));
  background-size: 200% 100%;
}

@media (max-width: 900px) {
  .redeem-workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .redeem-page {
    gap: 0.875rem;
  }

  .redeem-form-panel,
  .redeem-info-panel {
    padding: 1rem;
  }

  .redeem-history-row,
  .redeem-skeleton-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .redeem-history-meta {
    min-width: 0;
    width: 100%;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .redeem-skeleton-row span,
  .redeem-skeleton-row i,
  .redeem-skeleton-row strong {
    animation: none;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.12s ease;
  }
}
</style>
