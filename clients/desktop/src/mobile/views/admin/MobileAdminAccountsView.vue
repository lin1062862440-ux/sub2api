<script setup lang="ts">
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleEllipsis,
  Filter,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  TestTube2,
  X,
} from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

import {
  clearAdminAccountError,
  getAdminAccountModels,
  listAdminAccounts,
  recoverAdminAccount,
  refreshAdminAccountCredentials,
  setAdminAccountSchedulable,
  testAdminAccount,
} from '@/api/admin/accounts'
import type {
  AdminAccount,
  AdminAccountListParams,
  AdminAccountListResponse,
  AdminAccountModel,
  AdminAccountPlatform,
  AdminAccountStatus,
} from '@/api/admin/types'
import AccountDetailDrawer from '@/components/admin/AccountDetailDrawer.vue'
import AccountEditorDialog from '@/components/admin/AccountEditorDialog.vue'
import ProviderIcon from '@/components/ProviderIcon.vue'
import { formatDateTime, formatPlatform } from '@/lib/format'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'

const PAGE_SIZE = 20
const accountPlatforms: AdminAccountPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok']
const accountTypes: AdminAccount['type'][] = ['oauth', 'setup-token', 'apikey', 'upstream', 'bedrock', 'service_account']
const accountStatuses: AdminAccountStatus[] = ['active', 'inactive', 'error']

const result = ref<AdminAccountListResponse>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE })
const loaded = ref(false)
const initialLoading = ref(true)
const listLoading = ref(false)
const fatalError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const searchDraft = ref('')
const search = ref('')
const platform = ref<'' | AdminAccountPlatform>('')
const status = ref<'' | AdminAccountStatus>('')
const draftPlatform = ref<'' | AdminAccountPlatform>('')
const draftStatus = ref<'' | AdminAccountStatus>('')
const filterSheetOpen = ref(false)
const openMenuId = ref<number | null>(null)
const pendingByAccount = reactive<Record<number, string>>({})
const schedulableTarget = ref<AdminAccount | null>(null)
const detailAccount = ref<AdminAccount | null>(null)
const editorAccount = ref<AdminAccount | null>(null)
const editorOpen = ref(false)
const testAccount = ref<AdminAccount | null>(null)
const testModels = ref<AdminAccountModel[]>([])
const selectedModel = ref('')
const testModelsLoading = ref(false)
const testError = ref('')
const schedulableDialog = ref<HTMLElement | null>(null)
const testDialog = ref<HTMLElement | null>(null)
let mounted = false
let loadGeneration = 0
let feedbackGeneration = 0
let viewDialogPreviousFocus: HTMLElement | null = null

const pageCount = computed(() => Math.max(1, Math.ceil(safeNumber(result.value.total) / PAGE_SIZE)))
const busy = computed(() => initialLoading.value || listLoading.value || Object.keys(pendingByAccount).length > 0)
const activeFilterCount = computed(() => Number(Boolean(platform.value)) + Number(Boolean(status.value)))

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function safeMultiplier(value: unknown) {
  const parsed = Number(value)
  return `${Number.isFinite(parsed) && parsed >= 0 ? parsed : 1}x`
}

function safeName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '未命名账号'
}

function safeGroups(account: AdminAccount) {
  return (account.groups ?? []).slice(0, 3).filter((group) => group && Number.isFinite(group.id) && group.name)
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function strictId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function strictNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function validOptionalAccountGroups(value: unknown) {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  const seen = new Set<number>()
  return value.every((rawGroup) => {
    const group = plainRecord(rawGroup)
    const id = strictId(group?.id)
    if (!group || id === null || seen.has(id) || typeof group.name !== 'string') return false
    seen.add(id)
    return group.platform === undefined || typeof group.platform === 'string'
  })
}

function validAdminAccountRow(value: unknown): value is AdminAccount {
  const account = plainRecord(value)
  if (!account) return false
  return strictId(account.id) !== null
    && typeof account.name === 'string'
    && accountPlatforms.includes(account.platform as AdminAccountPlatform)
    && accountTypes.includes(account.type as AdminAccount['type'])
    && accountStatuses.includes(account.status as AdminAccountStatus)
    && typeof account.concurrency === 'number'
    && typeof account.priority === 'number'
    && typeof account.schedulable === 'boolean'
    && (account.proxy_id === null || strictId(account.proxy_id) !== null)
    && (account.error_message === null || typeof account.error_message === 'string')
    && typeof account.created_at === 'string'
    && typeof account.updated_at === 'string'
    && (account.current_concurrency === undefined || typeof account.current_concurrency === 'number')
    && (account.rate_multiplier === undefined || typeof account.rate_multiplier === 'number')
    && (account.last_used_at === null || typeof account.last_used_at === 'string')
    && (account.expires_at === null || typeof account.expires_at === 'number')
    && validOptionalAccountGroups(account.groups)
}

function decodeAccountListResponse(value: unknown, requestedPage: number): AdminAccountListResponse | null {
  const response = plainRecord(value)
  if (!response || !Array.isArray(response.items)) return null
  const total = strictNonNegativeInteger(response.total)
  if (
    total === null
    || response.page !== requestedPage
    || response.page_size !== PAGE_SIZE
    || response.items.length > PAGE_SIZE
    || total < response.items.length
  ) return null
  const seen = new Set<number>()
  const items: AdminAccount[] = []
  for (const item of response.items) {
    if (!validAdminAccountRow(item) || seen.has(item.id)) return null
    seen.add(item.id)
    items.push(item)
  }
  return { items, total, page: requestedPage, page_size: PAGE_SIZE }
}

function isCompleteAdminAccount(value: unknown): value is AdminAccount {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdminAccount>
  return Number.isFinite(candidate.id)
    && typeof candidate.name === 'string'
    && ['anthropic', 'openai', 'gemini', 'antigravity', 'grok'].includes(candidate.platform ?? '')
    && typeof candidate.type === 'string'
    && Number.isFinite(candidate.concurrency)
    && Number.isFinite(candidate.priority)
    && ['active', 'inactive', 'error'].includes(candidate.status ?? '')
    && typeof candidate.schedulable === 'boolean'
    && (candidate.error_message === null || typeof candidate.error_message === 'string')
    && typeof candidate.created_at === 'string'
    && typeof candidate.updated_at === 'string'
}

function isMissingProjectWarning(value: unknown) {
  return Boolean(value && typeof value === 'object'
    && (value as { warning?: unknown }).warning === 'missing_project_id_temporary')
}

function listParams(page: number): AdminAccountListParams {
  return {
    page,
    page_size: PAGE_SIZE,
    ...(search.value ? { search: search.value } : {}),
    ...(platform.value ? { platform: platform.value } : {}),
    ...(status.value ? { status: status.value } : {}),
  }
}

function claimFeedback() {
  const token = ++feedbackGeneration
  actionError.value = ''
  actionMessage.value = ''
  return token
}

function ownsFeedback(token: number) {
  return mounted && token === feedbackGeneration
}

async function loadAccounts(
  targetPage = result.value.page,
  background = loaded.value,
  feedbackToken?: number,
  reportFailure = true,
) {
  const generation = ++loadGeneration
  const requestedPage = Math.min(pageCount.value, Math.max(1, Math.floor(targetPage) || 1))
  if (!loaded.value && !background) initialLoading.value = true
  else listLoading.value = true
  fatalError.value = ''

  try {
    const response = decodeAccountListResponse(
      await listAdminAccounts(listParams(requestedPage)),
      requestedPage,
    )
    if (!mounted || generation !== loadGeneration) return
    if (!response) throw new Error('invalid accounts response')
    const total = safeNumber(response.total)
    const availablePages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (requestedPage > availablePages) {
      await loadAccounts(availablePages, true, feedbackToken, reportFailure)
      return
    }
    result.value = {
      items: response.items,
      total,
      page: requestedPage,
      page_size: PAGE_SIZE,
    }
    loaded.value = true
  } catch {
    if (!mounted || generation !== loadGeneration) return
    if (!loaded.value) fatalError.value = '账号列表加载失败，请检查网络后重试。'
    else if (reportFailure && (feedbackToken === undefined || ownsFeedback(feedbackToken))) {
      actionMessage.value = ''
      actionError.value = '账号列表刷新失败，已保留当前数据。'
    }
  } finally {
    if (mounted && generation === loadGeneration) {
      initialLoading.value = false
      listLoading.value = false
    }
  }
}

function requestAccountsLoad(targetPage: number, background: boolean) {
  const feedbackToken = claimFeedback()
  void loadAccounts(targetPage, background, feedbackToken, true)
}

function retryAccounts() {
  requestAccountsLoad(1, false)
}

function refreshAccounts() {
  requestAccountsLoad(result.value.page, true)
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  requestAccountsLoad(1, loaded.value)
}

function openFilters() {
  draftPlatform.value = platform.value
  draftStatus.value = status.value
  filterSheetOpen.value = true
}

function applyFilters() {
  platform.value = draftPlatform.value
  status.value = draftStatus.value
  filterSheetOpen.value = false
  requestAccountsLoad(1, loaded.value)
}

function resetFilters() {
  draftPlatform.value = ''
  draftStatus.value = ''
  platform.value = ''
  status.value = ''
  filterSheetOpen.value = false
  requestAccountsLoad(1, loaded.value)
}

function replaceAccount(updated: AdminAccount) {
  result.value = {
    ...result.value,
    items: result.value.items.map((item) => item.id === updated.id ? { ...item, ...updated } : item),
  }
  if (detailAccount.value?.id === updated.id) detailAccount.value = { ...detailAccount.value, ...updated }
}

async function mutateAccount(
  account: AdminAccount,
  action: string,
  operation: () => Promise<AdminAccount>,
  successMessage: string,
) {
  if (pendingByAccount[account.id]) return
  const feedbackToken = claimFeedback()
  pendingByAccount[account.id] = action
  try {
    const updated = await operation()
    if (!mounted) return
    replaceAccount(updated)
    if (ownsFeedback(feedbackToken)) actionMessage.value = successMessage
    await loadAccounts(result.value.page, true, feedbackToken, false)
  } catch {
    if (ownsFeedback(feedbackToken)) {
      actionMessage.value = ''
      actionError.value = '操作失败，请稍后重试。当前账号列表未更改。'
    }
  } finally {
    if (mounted) delete pendingByAccount[account.id]
  }
}

function requestSchedulableChange(account: AdminAccount) {
  if (pendingByAccount[account.id]) return
  viewDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  schedulableTarget.value = account
  void focusViewDialog('schedulable')
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusViewDialog(kind: 'schedulable' | 'test') {
  await nextTick()
  focusableElements(kind === 'schedulable' ? schedulableDialog.value : testDialog.value)[0]?.focus()
}

function restoreViewDialogFocus() {
  if (viewDialogPreviousFocus?.isConnected) viewDialogPreviousFocus.focus()
  viewDialogPreviousFocus = null
}

function closeSchedulableDialog() {
  const account = schedulableTarget.value
  if (account && pendingByAccount[account.id]) return
  schedulableTarget.value = null
  restoreViewDialogFocus()
}

function closeTestDialog() {
  const account = testAccount.value
  if (account && pendingByAccount[account.id]) return
  testAccount.value = null
  restoreViewDialogFocus()
}

function closeTestDialogAfterSuccess() {
  testAccount.value = null
  restoreViewDialogFocus()
}

async function confirmSchedulableChange() {
  const account = schedulableTarget.value
  if (!account) return
  const nextValue = !account.schedulable
  await mutateAccount(
    account,
    'schedulable',
    () => setAdminAccountSchedulable(account.id, nextValue),
    `${safeName(account.name)} 已${nextValue ? '加入' : '暂停'}调度`,
  )
  if (mounted) closeSchedulableDialog()
}

function toggleMenu(accountId: number) {
  openMenuId.value = openMenuId.value === accountId ? null : accountId
  if (openMenuId.value !== null) {
    void nextTick(() => {
      document.querySelector<HTMLElement>(`[data-testid="account-menu-${accountId}"] button`)?.focus()
    })
  }
}

function closeMenu() {
  openMenuId.value = null
}

function editAccount(account: AdminAccount) {
  document.querySelector<HTMLElement>(`[data-testid="account-menu-trigger-${account.id}"]`)?.focus()
  closeMenu()
  editorAccount.value = account
  editorOpen.value = true
}

function handleSaved(updated: AdminAccount) {
  replaceAccount(updated)
  void loadAccounts(result.value.page, true, undefined, false)
}

async function refreshAccount(account: AdminAccount) {
  if (pendingByAccount[account.id]) return
  const feedbackToken = claimFeedback()
  pendingByAccount[account.id] = 'refresh'
  let warningMessage = ''
  try {
    const response: unknown = await refreshAdminAccountCredentials(account.id)
    if (!mounted) return
    if (isCompleteAdminAccount(response) && response.id === account.id) {
      replaceAccount(response)
      if (ownsFeedback(feedbackToken)) actionMessage.value = `${safeName(account.name)} 已刷新凭据`
    } else if (isMissingProjectWarning(response)) {
      warningMessage = '凭据已刷新，但项目 ID 暂未获取，系统将自动重试。'
      if (ownsFeedback(feedbackToken)) actionMessage.value = warningMessage
    } else {
      throw new Error('invalid refresh response')
    }
    await loadAccounts(result.value.page, true, feedbackToken, false)
    if (ownsFeedback(feedbackToken) && warningMessage) {
      actionError.value = ''
      actionMessage.value = warningMessage
    }
  } catch {
    if (ownsFeedback(feedbackToken)) {
      actionMessage.value = ''
      actionError.value = '操作失败，请稍后重试。当前账号列表未更改。'
    }
  } finally {
    if (mounted) delete pendingByAccount[account.id]
  }
}

function runMenuAction(account: AdminAccount, action: 'recover' | 'clear' | 'refresh') {
  closeMenu()
  if (action === 'refresh') {
    void refreshAccount(account)
    return
  }
  const contract = {
    recover: {
      operation: () => recoverAdminAccount(account.id),
      message: `${safeName(account.name)} 已恢复运行状态`,
    },
    clear: {
      operation: () => clearAdminAccountError(account.id),
      message: `${safeName(account.name)} 已清除错误状态`,
    },
  }[action]
  void mutateAccount(account, action, contract.operation, contract.message)
}

async function openTest(account: AdminAccount) {
  viewDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  testAccount.value = account
  testModels.value = []
  selectedModel.value = ''
  testError.value = ''
  testModelsLoading.value = true
  void focusViewDialog('test')
  try {
    const models = await getAdminAccountModels(account.id)
    if (!mounted || testAccount.value?.id !== account.id) return
    testModels.value = Array.isArray(models) ? models : []
    selectedModel.value = testModels.value[0]?.id ?? ''
    if (!selectedModel.value) testError.value = '该账号没有可测试的模型。'
  } catch {
    if (mounted && testAccount.value?.id === account.id) testError.value = '模型列表加载失败，请稍后重试。'
  } finally {
    if (mounted && testAccount.value?.id === account.id) testModelsLoading.value = false
  }
}

async function submitTest() {
  const account = testAccount.value
  const modelId = selectedModel.value
  if (!account || !modelId || pendingByAccount[account.id]) return
  const feedbackToken = claimFeedback()
  pendingByAccount[account.id] = 'test'
  testError.value = ''
  try {
    const response = await testAdminAccount(account.id, { model_id: modelId, prompt: '' })
    if (!mounted) return
    if (ownsFeedback(feedbackToken)) actionMessage.value = `${safeName(account.name)}：${response.message || '连接测试通过'}`
    closeTestDialogAfterSuccess()
    await loadAccounts(result.value.page, true, feedbackToken, false)
  } catch {
    if (mounted) testError.value = '连接测试失败，请检查账号状态后重试。'
  } finally {
    if (mounted) delete pendingByAccount[account.id]
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  const container = schedulableTarget.value ? schedulableDialog.value : testAccount.value ? testDialog.value : null
  if (container) {
    const account = schedulableTarget.value ?? testAccount.value
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!account || !pendingByAccount[account.id]) {
        if (schedulableTarget.value) closeSchedulableDialog()
        else closeTestDialog()
      }
      return
    }
    if (event.key === 'Tab') {
      const elements = focusableElements(container)
      const first = elements[0]
      const last = elements[elements.length - 1]
      const active = document.activeElement
      const outside = !container.contains(active)
      if (!first || !last) {
        event.preventDefault()
        container.focus()
      } else if (event.shiftKey ? active === first || outside : active === last || outside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
      return
    }
  }
  if (event.key === 'Escape') closeMenu()
}

function handleDocumentPointer(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('[data-account-menu-owner]')) closeMenu()
}

function changePage(page: number) {
  if (busy.value || page < 1 || page > pageCount.value || page === result.value.page) return
  requestAccountsLoad(page, true)
}

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('mousedown', handleDocumentPointer)
  void loadAccounts(1, false)
})

onUnmounted(() => {
  mounted = false
  loadGeneration += 1
  restoreViewDialogFocus()
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('mousedown', handleDocumentPointer)
})
</script>

<template>
  <MobilePage
    title="账号管理"
    subtitle="账号健康与调度"
    :loading="initialLoading && !loaded"
    :error="fatalError"
    :empty="loaded && !result.items.length"
    :aria-busy="busy"
    loading-label="正在加载账号"
    empty-title="暂无账号"
    empty-message="当前筛选范围内没有账号。"
    @retry="retryAccounts"
    @refresh="retryAccounts"
  >
    <template #action>
      <button class="icon-button" type="button" data-testid="account-refresh" aria-label="刷新账号" :disabled="busy" @click="refreshAccounts">
        <RefreshCw :size="18" :class="{ spinning: listLoading }" />
      </button>
    </template>

    <div class="accounts-content">
      <form class="search-row" data-testid="account-search-form" @submit.prevent="submitSearch">
        <label><Search :size="17" /><input v-model="searchDraft" data-testid="account-search" autocomplete="off" placeholder="搜索账号" /></label>
        <button type="submit" :disabled="listLoading">搜索</button>
        <button class="filter-button" type="button" data-testid="account-filter-trigger" @click="openFilters">
          <Filter :size="17" /><span v-if="activeFilterCount">{{ activeFilterCount }}</span>
        </button>
      </form>

      <p v-if="actionMessage" class="action-message" data-testid="account-action-message" role="status"><Check :size="17" />{{ actionMessage }}</p>
      <p v-if="actionError" class="action-error" data-testid="account-action-error" role="alert"><AlertCircle :size="17" />{{ actionError }}</p>
      <div v-if="listLoading" class="list-busy" role="status">正在刷新账号</div>

      <section class="account-list" aria-label="账号列表">
        <article v-for="account in result.items" :key="account.id" class="account-card" data-testid="mobile-account-card">
          <header>
            <span class="provider-mark"><ProviderIcon :provider="account.platform" :size="20" /></span>
            <button class="identity" type="button" :data-testid="`account-detail-trigger-${account.id}`" @click="detailAccount = account">
              <strong>{{ safeName(account.name) }}</strong>
              <span>{{ formatPlatform(account.platform) }} · {{ account.type || '未知类型' }}</span>
            </button>
            <div class="menu-owner" data-account-menu-owner>
              <button
                class="menu-trigger"
                type="button"
                :data-testid="`account-menu-trigger-${account.id}`"
                :aria-expanded="openMenuId === account.id"
                :aria-label="`更多操作：${safeName(account.name)}`"
                @click.stop="toggleMenu(account.id)"
              ><CircleEllipsis :size="20" /></button>
              <div v-if="openMenuId === account.id" class="account-menu" role="menu" :data-testid="`account-menu-${account.id}`">
                <button type="button" role="menuitem" :data-testid="`edit-account-${account.id}`" @click="editAccount(account)"><Pencil :size="16" />编辑账号</button>
                <button type="button" role="menuitem" :data-testid="`refresh-account-credentials-${account.id}`" :disabled="Boolean(pendingByAccount[account.id])" @click="runMenuAction(account, 'refresh')"><RefreshCw :size="16" />刷新凭据</button>
                <button v-if="account.error_message" type="button" role="menuitem" :data-testid="`clear-account-error-${account.id}`" :disabled="Boolean(pendingByAccount[account.id])" @click="runMenuAction(account, 'clear')"><X :size="16" />清除错误</button>
                <button v-if="account.status !== 'active' || !account.schedulable" type="button" role="menuitem" :data-testid="`recover-account-${account.id}`" :disabled="Boolean(pendingByAccount[account.id])" @click="runMenuAction(account, 'recover')"><RotateCcw :size="16" />恢复状态</button>
              </div>
            </div>
          </header>

          <div class="status-row">
            <span class="status" :class="account.status">{{ account.status === 'active' ? '运行中' : account.status === 'error' ? '异常' : '已停用' }}</span>
            <span>{{ account.schedulable ? '参与调度' : '暂停调度' }}</span>
          </div>
          <p v-if="account.error_message" class="health-warning"><AlertCircle :size="15" />凭据或上游状态异常</p>
          <dl>
            <div><dt>并发</dt><dd>{{ safeNumber(account.current_concurrency) }} / {{ safeNumber(account.concurrency) }}</dd></div>
            <div><dt>倍率</dt><dd>{{ safeMultiplier(account.rate_multiplier) }}</dd></div>
            <div><dt>最近使用</dt><dd>{{ formatDateTime(account.last_used_at) }}</dd></div>
          </dl>
          <div class="group-row"><span v-for="group in safeGroups(account)" :key="group.id">{{ group.name }}</span><em v-if="!safeGroups(account).length">未绑定分组</em></div>
          <footer>
            <button class="test-button" type="button" :data-testid="`test-account-${account.id}`" :disabled="Boolean(pendingByAccount[account.id])" @click="openTest(account)"><TestTube2 :size="17" />测试连接</button>
            <button class="schedule-button" type="button" :data-testid="`account-schedulable-${account.id}`" :aria-pressed="account.schedulable" :disabled="Boolean(pendingByAccount[account.id])" @click="requestSchedulableChange(account)">
              {{ account.schedulable ? '暂停调度' : '加入调度' }}<ChevronDown :size="15" />
            </button>
          </footer>
        </article>
      </section>

      <MobilePagination v-if="result.total > PAGE_SIZE" :page="result.page" :page-count="pageCount" @change="changePage" />
    </div>

    <MobileBottomSheet v-model="filterSheetOpen" title="账号筛选">
      <div class="filter-fields">
        <label><span>平台</span><select v-model="draftPlatform" data-testid="account-platform-filter"><option value="">全部平台</option><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="antigravity">Antigravity</option><option value="grok">Grok</option></select></label>
        <label><span>状态</span><select v-model="draftStatus" data-testid="account-status-filter"><option value="">全部状态</option><option value="active">运行中</option><option value="inactive">已停用</option><option value="error">异常</option></select></label>
      </div>
      <template #footer><button class="sheet-secondary" type="button" @click="resetFilters">重置</button><button class="sheet-primary" type="button" data-testid="account-filter-apply" @click="applyFilters">应用</button></template>
    </MobileBottomSheet>

    <div v-if="schedulableTarget" class="confirm-backdrop" @mousedown.self="closeSchedulableDialog">
      <section ref="schedulableDialog" class="confirm-dialog" data-testid="account-schedulable-dialog" role="dialog" aria-modal="true" aria-label="确认调度状态" tabindex="-1">
        <h2>{{ schedulableTarget.schedulable ? '暂停调度' : '加入调度' }}</h2>
        <p>确认{{ schedulableTarget.schedulable ? '暂停' : '恢复' }}“{{ safeName(schedulableTarget.name) }}”的请求调度？</p>
        <footer><button type="button" data-testid="cancel-account-schedulable" :disabled="Boolean(pendingByAccount[schedulableTarget.id])" @click="closeSchedulableDialog">取消</button><button class="danger" type="button" data-testid="confirm-account-schedulable" :disabled="Boolean(pendingByAccount[schedulableTarget.id])" @click="confirmSchedulableChange">确认</button></footer>
      </section>
    </div>

    <div v-if="testAccount" class="confirm-backdrop" @mousedown.self="closeTestDialog">
      <section ref="testDialog" class="test-dialog" role="dialog" aria-modal="true" aria-label="测试账号连接" tabindex="-1">
        <h2>测试连接</h2><p>{{ safeName(testAccount.name) }}</p>
        <label><span>测试模型</span><select v-model="selectedModel" data-testid="account-test-model" :disabled="testModelsLoading || Boolean(pendingByAccount[testAccount.id])"><option value="" disabled>{{ testModelsLoading ? '正在读取模型' : '请选择模型' }}</option><option v-for="model in testModels" :key="model.id" :value="model.id">{{ model.display_name || model.id }}</option></select></label>
        <p v-if="testError" class="test-error" role="alert">{{ testError }}</p>
        <footer><button type="button" :disabled="Boolean(pendingByAccount[testAccount.id])" @click="closeTestDialog">取消</button><button class="primary" type="button" data-testid="account-test-submit" :disabled="!selectedModel || testModelsLoading || Boolean(pendingByAccount[testAccount.id])" @click="submitTest">开始测试</button></footer>
      </section>
    </div>

    <AccountDetailDrawer :account="detailAccount" mobile @close="detailAccount = null" />
    <AccountEditorDialog v-model="editorOpen" :account="editorAccount" mobile @saved="handleSaved" />
  </MobilePage>
</template>

<style scoped>
.icon-button,.filter-button,.menu-trigger{display:grid;width:44px;min-height:44px;padding:0;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);place-items:center}.icon-button:disabled{opacity:.5}.spinning{animation:account-spin 700ms linear infinite}.accounts-content{display:grid;min-width:0;gap:14px}.search-row{display:grid;grid-template-columns:minmax(0,1fr) auto 44px;gap:8px}.search-row label{display:flex;min-width:0;min-height:44px;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-tertiary)}.search-row input{min-width:0;width:100%;border:0;background:transparent;color:var(--text-primary);font:inherit;outline:0}.search-row>button[type=submit]{min-height:44px;padding:0 14px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.filter-button{position:relative}.filter-button span{position:absolute;top:-5px;right:-5px;display:grid;min-width:18px;height:18px;border-radius:9px;background:#bd4d40;color:#fff;font-size:10px;place-items:center}.action-message,.action-error{display:flex;min-width:0;align-items:flex-start;gap:8px;margin:0;padding:10px 11px;border-radius:6px;font-size:13px;line-height:1.45}.action-message{border:1px solid #cce6d8;background:#eef9f3;color:#287154}.action-error{border:1px solid #eccfc9;background:#fff5f2;color:#9e493c}.list-busy{padding:7px 10px;border-radius:5px;background:var(--bg-base);color:var(--text-secondary);font-size:12px}.account-list{display:grid;gap:10px}.account-card{position:relative;display:grid;min-width:0;gap:12px;padding:14px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 4px 14px rgba(29,44,65,.04)}.account-card>header{display:grid;grid-template-columns:38px minmax(0,1fr) 44px;align-items:center;gap:9px}.provider-mark{display:grid;width:38px;height:38px;border-radius:7px;background:var(--bg-base);place-items:center}.identity{display:grid;min-width:0;min-height:44px;gap:3px;padding:3px 0;border:0;background:transparent;color:var(--text-primary);text-align:left}.identity strong,.identity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity strong{font-size:15px}.identity span{color:var(--text-tertiary);font-size:11px}.menu-owner{position:relative}.menu-trigger{border:0}.account-menu{position:absolute;z-index:25;top:46px;right:0;display:grid;width:178px;padding:5px;border:1px solid var(--border-strong);border-radius:7px;background:var(--bg-surface);box-shadow:0 12px 32px rgba(26,40,60,.18)}.account-menu button{display:flex;min-height:44px;align-items:center;gap:9px;padding:0 10px;border:0;border-radius:5px;background:transparent;color:var(--text-primary);font:inherit;text-align:left}.account-menu button:focus,.account-menu button:hover{background:var(--bg-base);outline:0}.status-row{display:flex;flex-wrap:wrap;gap:7px}.status-row span{padding:4px 7px;border-radius:5px;background:var(--bg-base);color:var(--text-secondary);font-size:11px}.status-row .status.active{background:#eaf7f0;color:#287755}.status-row .status.error{background:#fff0ed;color:#a14639}.health-warning{display:flex;align-items:center;gap:7px;margin:0;padding:8px 9px;border:1px solid #efd4ce;border-radius:6px;background:#fff7f5;color:#9c493d;font-size:12px}.account-card dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0;border-block:1px solid var(--border-subtle)}.account-card dl>div{display:grid;min-width:0;gap:4px;padding:10px 7px}.account-card dt{color:var(--text-tertiary);font-size:10px}.account-card dd{overflow:hidden;margin:0;color:var(--text-primary);font-family:var(--font-data);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.group-row{display:flex;min-width:0;flex-wrap:wrap;gap:6px}.group-row span{max-width:100%;overflow:hidden;padding:4px 7px;border:1px solid #d6e2f4;border-radius:5px;background:#eef4fc;color:#41689e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.group-row em{color:var(--text-tertiary);font-size:11px;font-style:normal}.account-card>footer{display:grid;grid-template-columns:1fr 1fr;gap:8px}.account-card>footer button{display:flex;min-width:0;min-height:44px;align-items:center;justify-content:center;gap:6px;padding:0 8px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit;font-size:13px}.account-card>footer button:disabled{opacity:.5}.schedule-button{color:var(--text-secondary)!important}.filter-fields{display:grid;gap:14px}.filter-fields label{display:grid;gap:6px}.filter-fields span,.test-dialog label span{color:var(--text-secondary);font-size:12px}.filter-fields select,.test-dialog select{width:100%;min-height:44px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-secondary,.sheet-primary{min-height:44px;padding:0 16px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-primary{border-color:var(--accent);background:var(--accent);color:#fff}.confirm-backdrop{position:fixed;z-index:170;inset:0;display:grid;padding:16px;background:rgba(24,35,50,.28);backdrop-filter:blur(8px);place-items:center}.confirm-dialog,.test-dialog{width:min(100%,420px);padding:18px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 24px 60px rgba(28,43,63,.24)}.confirm-dialog h2,.test-dialog h2{margin:0;font-size:17px}.confirm-dialog p,.test-dialog>p{margin:8px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.confirm-dialog footer,.test-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.confirm-dialog footer button,.test-dialog footer button{min-height:44px;padding:0 14px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.confirm-dialog footer .danger{border-color:#b84d40;background:#b84d40;color:#fff}.test-dialog label{display:grid;gap:6px;margin-top:15px}.test-dialog footer .primary{border-color:var(--accent);background:var(--accent);color:#fff}.test-error{color:#a14639!important}.mobile-pagination{margin-top:2px}@keyframes account-spin{to{transform:rotate(360deg)}}@media(max-width:360px){.search-row{grid-template-columns:minmax(0,1fr) 44px}.search-row>button[type=submit]{grid-column:1/-1;grid-row:2}.account-card dl{grid-template-columns:1fr}.account-card dl>div+div{border-top:1px solid var(--border-subtle)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
