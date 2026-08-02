<script setup lang="ts">
import {
  AlertCircle,
  CalendarPlus,
  Check,
  CircleEllipsis,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound,
} from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

import {
  assignAdminSubscription,
  bulkAssignAdminSubscriptions,
  extendAdminSubscription,
  getAdminSubscriptionProgress,
  listAdminSubscriptions,
  resetAdminSubscriptionQuota,
  restoreAdminSubscription,
  revokeAdminSubscription,
} from '@/api/admin/subscriptions'
import type {
  AdminGroupOption,
  AdminSubscription,
  AdminSubscriptionProgress,
  AdminSubscriptionQuotaWindow,
} from '@/api/admin/types'
import { getAdminGroups } from '@/api/admin/users'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'

const PAGE_SIZE = 20
const PROGRESS_CONCURRENCY = 4
const statuses = ['active', 'expired', 'revoked', 'suspended'] as const

type AssignMode = 'single' | 'bulk'
type LifecycleAction = 'extend' | 'reset' | 'revoke' | 'restore'
type QuotaKey = 'daily' | 'weekly' | 'monthly'
type GroupStatus = 'active' | 'inactive'
type GroupSubscriptionType = 'standard' | 'subscription'

interface SubscriptionGroupOption extends AdminGroupOption {
  platform: string
  is_exclusive: boolean
  status: GroupStatus
  subscription_type: GroupSubscriptionType
}

const quotaDefinitions: Array<{ key: QuotaKey; label: string }> = [
  { key: 'daily', label: '日额度' },
  { key: 'weekly', label: '周额度' },
  { key: 'monthly', label: '月额度' },
]

const result = ref({
  items: [] as AdminSubscription[],
  total: 0,
  page: 1,
  page_size: PAGE_SIZE,
})
const groups = ref<SubscriptionGroupOption[]>([])
const groupsLoading = ref(false)
const groupsReady = ref(false)
const groupsError = ref('')
const loaded = ref(false)
const initialLoading = ref(true)
const listLoading = ref(false)
const fatalError = ref('')
const actionMessage = ref('')
const actionError = ref('')
const bulkWarning = ref('')
const syncWarning = ref('')
const searchDraft = ref('')
const search = ref('')
const status = ref('')
const groupId = ref('')
const draftStatus = ref('')
const draftGroupId = ref('')
const filterSheetOpen = ref(false)
const assignmentOpen = ref(false)
const assignmentPending = ref(false)
const assignmentError = ref('')
const assignment = reactive({
  mode: 'single' as AssignMode,
  userId: '',
  userIds: '',
  groupId: '',
  days: '30',
})
const openMenuId = ref<number | null>(null)
const progressById = ref<Record<number, AdminSubscriptionProgress>>({})
const progressLoadedById = ref<Record<number, boolean>>({})
const progressErrors = ref<Record<number, boolean>>({})
const lifecycle = reactive({
  type: null as LifecycleAction | null,
  item: null as AdminSubscription | null,
  days: '30',
  daily: true,
  weekly: true,
  monthly: true,
  error: '',
})
const mutationPending = ref('')
let mounted = false
let listGeneration = 0
let groupGeneration = 0
let progressGeneration = 0
let feedbackGeneration = 0

const pageCount = computed(() =>
  Math.max(1, Math.ceil(safeNonNegative(result.value.total) / PAGE_SIZE)),
)
const busy = computed(
  () =>
    initialLoading.value ||
    listLoading.value ||
    assignmentPending.value ||
    Boolean(mutationPending.value),
)
const activeFilterCount = computed(
  () => Number(Boolean(status.value)) + Number(Boolean(groupId.value)),
)
const assignmentGroups = computed(() =>
  groups.value.filter(
    (group) =>
      group.status === 'active' && group.subscription_type === 'subscription',
  ),
)
const lifecycleTitle = computed(() => {
  if (lifecycle.type === 'extend') return '延长订阅期限'
  if (lifecycle.type === 'reset') return '重置订阅额度'
  if (lifecycle.type === 'revoke') return '撤销订阅'
  return '恢复订阅'
})

function safeId(value: unknown): number | null {
  const parsed =
    typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null
}

function strictId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

function strictNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Number.isFinite(new Date(value).getTime())
  )
}

function safeNonNegative(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  try {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

function safeMoney(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return '—'
  if (parsed === 0) return '$0.00'
  return Math.abs(parsed) < 0.01
    ? `$${parsed.toFixed(4)}`
    : `$${parsed.toFixed(2)}`
}

function safePercentage(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0
}

function percentageLabel(value: unknown) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(
    safePercentage(value),
  )
}

function statusLabel(value: unknown) {
  if (value === 'active') return '有效'
  if (value === 'revoked') return '已撤销'
  if (value === 'expired') return '已过期'
  if (value === 'suspended') return '已暂停'
  return '未知状态'
}

function userLabel(item: AdminSubscription) {
  return safeText(
    item.user?.email,
    safeText(item.user?.username, `用户 #${item.user_id}`),
  )
}

function groupLabel(item: AdminSubscription) {
  return safeText(item.group?.name, `分组 #${item.group_id}`)
}

function decodeSubscription(value: unknown): AdminSubscription | null {
  const item = plainRecord(value)
  if (!item) return null
  const id = strictId(item.id)
  const userId = strictId(item.user_id)
  const itemGroupId = strictId(item.group_id)
  if (id === null || userId === null || itemGroupId === null) return null
  if (!statuses.includes(item.status as (typeof statuses)[number])) return null
  if (
    !validDate(item.starts_at) ||
    (item.expires_at !== null && !validDate(item.expires_at))
  )
    return null
  if (!validDate(item.created_at) || !validDate(item.updated_at)) return null
  const usage = [
    item.daily_usage_usd,
    item.weekly_usage_usd,
    item.monthly_usage_usd,
  ]
  if (
    usage.some(
      (entry) =>
        typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0,
    )
  )
    return null
  if (
    item.revoked_at !== undefined &&
    item.revoked_at !== null &&
    !validDate(item.revoked_at)
  )
    return null

  let user: AdminSubscription['user']
  if (item.user !== undefined && item.user !== null) {
    const candidate = plainRecord(item.user)
    if (
      !candidate ||
      strictId(candidate.id) !== userId ||
      typeof candidate.email !== 'string' ||
      typeof candidate.username !== 'string'
    )
      return null
    user = { id: userId, email: candidate.email, username: candidate.username }
  }

  let group: AdminSubscription['group']
  if (item.group !== undefined && item.group !== null) {
    const candidate = plainRecord(item.group)
    if (
      !candidate ||
      strictId(candidate.id) !== itemGroupId ||
      typeof candidate.name !== 'string'
    )
      return null
    const limits = [
      candidate.daily_limit_usd,
      candidate.weekly_limit_usd,
      candidate.monthly_limit_usd,
    ]
    if (
      limits.some(
        (entry) =>
          entry !== undefined &&
          entry !== null &&
          (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0),
      )
    )
      return null
    if (
      candidate.platform !== undefined &&
      typeof candidate.platform !== 'string'
    )
      return null
    group = {
      id: itemGroupId,
      name: candidate.name,
      ...(typeof candidate.platform === 'string'
        ? { platform: candidate.platform }
        : {}),
      ...(candidate.daily_limit_usd !== undefined
        ? { daily_limit_usd: candidate.daily_limit_usd as number | null }
        : {}),
      ...(candidate.weekly_limit_usd !== undefined
        ? { weekly_limit_usd: candidate.weekly_limit_usd as number | null }
        : {}),
      ...(candidate.monthly_limit_usd !== undefined
        ? { monthly_limit_usd: candidate.monthly_limit_usd as number | null }
        : {}),
    }
  }

  return {
    id,
    user_id: userId,
    group_id: itemGroupId,
    status: item.status as AdminSubscription['status'],
    starts_at: item.starts_at,
    expires_at: item.expires_at as string | null,
    daily_usage_usd: item.daily_usage_usd as number,
    weekly_usage_usd: item.weekly_usage_usd as number,
    monthly_usage_usd: item.monthly_usage_usd as number,
    created_at: item.created_at,
    updated_at: item.updated_at,
    ...(item.revoked_at !== undefined
      ? { revoked_at: item.revoked_at as string | null }
      : {}),
    ...(user ? { user } : {}),
    ...(group ? { group } : {}),
  }
}

function decodeSubscriptions(value: unknown): AdminSubscription[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<number>()
  const subscriptions: AdminSubscription[] = []
  for (const item of value) {
    const decoded = decodeSubscription(item)
    if (!decoded || seen.has(decoded.id)) return null
    seen.add(decoded.id)
    subscriptions.push(decoded)
  }
  return subscriptions
}

function decodeGroups(value: unknown): SubscriptionGroupOption[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<number>()
  const options: SubscriptionGroupOption[] = []
  for (const item of value) {
    const option = plainRecord(item)
    if (!option) return null
    const id = strictId(option.id)
    if (
      id === null ||
      seen.has(id) ||
      typeof option.name !== 'string' ||
      !option.name.trim() ||
      typeof option.platform !== 'string' ||
      !option.platform.trim() ||
      typeof option.is_exclusive !== 'boolean' ||
      (option.status !== 'active' && option.status !== 'inactive') ||
      (option.subscription_type !== 'standard' &&
        option.subscription_type !== 'subscription')
    )
      return null
    seen.add(id)
    options.push({
      id,
      name: option.name.trim(),
      platform: option.platform,
      is_exclusive: option.is_exclusive,
      status: option.status,
      subscription_type: option.subscription_type,
    })
  }
  return options
}

function decodeListResponse(value: unknown, requestedPage: number) {
  const response = plainRecord(value)
  if (!response) return null
  const total = strictNonNegativeInteger(response.total)
  const page = strictId(response.page)
  const pageSize = strictId(response.page_size)
  const pages = strictNonNegativeInteger(response.pages)
  const items = decodeSubscriptions(response.items)
  if (
    total === null ||
    page !== requestedPage ||
    pageSize !== PAGE_SIZE ||
    pages === null ||
    !items
  )
    return null
  if (total === 0) {
    if (page !== 1 || pages !== 0 || items.length !== 0) return null
    return { items, total, page, page_size: PAGE_SIZE, pages }
  }
  const expectedPages = Math.ceil(total / PAGE_SIZE)
  if (
    pages === 0 ||
    pages !== expectedPages ||
    items.length > PAGE_SIZE ||
    total < items.length
  )
    return null
  return { items, total, page, page_size: PAGE_SIZE, pages }
}

function listParams(page: number) {
  return {
    page,
    page_size: PAGE_SIZE,
    ...(search.value ? { search: search.value } : {}),
    ...(status.value ? { status: status.value } : {}),
    ...(safeId(groupId.value) !== null
      ? { group_id: safeId(groupId.value)! }
      : {}),
  }
}

function claimFeedback() {
  const token = ++feedbackGeneration
  actionMessage.value = ''
  actionError.value = ''
  bulkWarning.value = ''
  syncWarning.value = ''
  return token
}

function ownsFeedback(token: number) {
  return mounted && token === feedbackGeneration
}

function decodeProgressWindow(
  value: unknown,
): AdminSubscriptionQuotaWindow | null {
  const window = plainRecord(value)
  if (!window) return null
  const amounts = [window.limit_usd, window.used_usd, window.remaining_usd]
  if (
    amounts.some(
      (amount) =>
        typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0,
    ) ||
    window.limit_usd === 0 ||
    typeof window.percentage !== 'number' ||
    !Number.isFinite(window.percentage) ||
    window.percentage < 0 ||
    window.percentage > 100 ||
    !validDate(window.window_start) ||
    !validDate(window.resets_at) ||
    strictNonNegativeInteger(window.resets_in_seconds) === null
  )
    return null
  return {
    limit_usd: window.limit_usd as number,
    used_usd: window.used_usd as number,
    remaining_usd: window.remaining_usd as number,
    percentage: window.percentage,
    window_start: window.window_start,
    resets_at: window.resets_at,
    resets_in_seconds: window.resets_in_seconds as number,
  }
}

function decodeProgress(
  value: unknown,
  expectedId: number,
): AdminSubscriptionProgress | null {
  const detail = plainRecord(value)
  if (
    !detail ||
    strictId(detail.id) !== expectedId ||
    typeof detail.group_name !== 'string' ||
    !detail.group_name.trim() ||
    (detail.expires_at !== null && !validDate(detail.expires_at)) ||
    typeof detail.expires_in_days !== 'number' ||
    !Number.isSafeInteger(detail.expires_in_days)
  )
    return null

  const decoded: AdminSubscriptionProgress = {
    id: expectedId,
    group_name: detail.group_name.trim(),
    expires_at: detail.expires_at as string | null,
    expires_in_days: detail.expires_in_days as number,
  }
  for (const key of ['daily', 'weekly', 'monthly'] as const) {
    const window = detail[key]
    if (window === undefined || window === null) {
      decoded[key] = window
      continue
    }
    const decodedWindow = decodeProgressWindow(window)
    if (!decodedWindow) return null
    decoded[key] = decodedWindow
  }
  return decoded
}

async function loadProgressItem(item: AdminSubscription, generation: number) {
  if (!mounted || generation !== progressGeneration) return
  const { [item.id]: _previousProgress, ...remainingProgress } =
    progressById.value
  progressById.value = remainingProgress
  progressLoadedById.value = {
    ...progressLoadedById.value,
    [item.id]: false,
  }
  progressErrors.value = { ...progressErrors.value, [item.id]: false }
  try {
    if (!mounted || generation !== progressGeneration) return
    const detail = decodeProgress(
      await getAdminSubscriptionProgress(item.id),
      item.id,
    )
    if (!mounted || generation !== progressGeneration || !detail) {
      if (mounted && generation === progressGeneration)
        progressErrors.value = { ...progressErrors.value, [item.id]: true }
      return
    }
    progressById.value = { ...progressById.value, [item.id]: detail }
    progressLoadedById.value = {
      ...progressLoadedById.value,
      [item.id]: true,
    }
  } catch {
    if (mounted && generation === progressGeneration)
      progressErrors.value = { ...progressErrors.value, [item.id]: true }
  }
}

async function loadProgress(items: AdminSubscription[]) {
  const generation = ++progressGeneration
  progressById.value = {}
  progressLoadedById.value = {}
  progressErrors.value = {}
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      if (!mounted || generation !== progressGeneration) return
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (!item) return
      await loadProgressItem(item, generation)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PROGRESS_CONCURRENCY, items.length) }, () =>
      worker(),
    ),
  )
}

async function loadSubscriptions(
  targetPage = result.value.page,
  background = loaded.value,
  feedbackToken?: number,
  reportFailure = true,
  refreshProgress = true,
) {
  const generation = ++listGeneration
  const requestedPage = Math.min(
    pageCount.value,
    Math.max(1, Math.floor(targetPage) || 1),
  )
  if (!loaded.value && !background) initialLoading.value = true
  else listLoading.value = true
  fatalError.value = ''
  try {
    const response = decodeListResponse(
      await listAdminSubscriptions(listParams(requestedPage)),
      requestedPage,
    )
    if (!mounted || generation !== listGeneration) return false
    if (!response) throw new Error('invalid subscriptions response')
    const total = response.total
    const availablePages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (requestedPage > availablePages)
      return await loadSubscriptions(
        availablePages,
        true,
        feedbackToken,
        reportFailure,
        refreshProgress,
      )
    const items = response.items
    result.value = { items, total, page: requestedPage, page_size: PAGE_SIZE }
    loaded.value = true
    if (refreshProgress) void loadProgress(items)
    return true
  } catch {
    if (!mounted || generation !== listGeneration) return false
    if (!loaded.value) fatalError.value = '订阅列表加载失败，请检查网络后重试。'
    else if (
      reportFailure &&
      (feedbackToken === undefined || ownsFeedback(feedbackToken))
    ) {
      actionError.value = '订阅列表刷新失败，已保留当前数据。'
    }
    return false
  } finally {
    if (mounted && generation === listGeneration) {
      initialLoading.value = false
      listLoading.value = false
    }
  }
}

async function loadGroups() {
  const generation = ++groupGeneration
  groupsLoading.value = true
  groupsReady.value = false
  groupsError.value = ''
  try {
    const response = await getAdminGroups()
    if (!mounted || generation !== groupGeneration) return
    const options = decodeGroups(response)
    if (!options) throw new Error('invalid groups response')
    groups.value = options
    groupsReady.value = true
  } catch {
    if (mounted && generation === groupGeneration) {
      groups.value = []
      groupsReady.value = false
      groupsError.value = '订阅分组加载失败，请重试。'
    }
  } finally {
    if (mounted && generation === groupGeneration) groupsLoading.value = false
  }
}

function requestLoad(page: number, background: boolean) {
  const token = claimFeedback()
  void loadSubscriptions(page, background, token, true)
}

function retryList() {
  requestLoad(1, false)
}

function refreshList() {
  requestLoad(result.value.page, loaded.value)
  void loadGroups()
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  requestLoad(1, loaded.value)
}

function openFilters() {
  draftStatus.value = status.value
  draftGroupId.value = groupId.value
  filterSheetOpen.value = true
}

function applyFilters() {
  status.value = statuses.includes(
    draftStatus.value as (typeof statuses)[number],
  )
    ? draftStatus.value
    : ''
  groupId.value = groups.value.some(
    (group) => group.id === safeId(draftGroupId.value),
  )
    ? draftGroupId.value
    : ''
  filterSheetOpen.value = false
  search.value = searchDraft.value.trim()
  requestLoad(1, loaded.value)
}

function resetFilters() {
  draftStatus.value = ''
  draftGroupId.value = ''
  status.value = ''
  groupId.value = ''
  filterSheetOpen.value = false
  requestLoad(1, loaded.value)
}

function openAssignment() {
  assignment.mode = 'single'
  assignment.userId = ''
  assignment.userIds = ''
  assignment.groupId = ''
  assignment.days = '30'
  assignmentError.value = ''
  assignmentOpen.value = true
}

function closeAssignment() {
  if (assignmentPending.value) return
  assignmentOpen.value = false
  assignmentError.value = ''
}

function parseUserIds(value: string): number[] | null {
  const trimmed = value.trim()
  if (
    !trimmed ||
    /^[,;]/.test(trimmed) ||
    /[,;]\s*$/.test(trimmed) ||
    /[,;]\s*[,;]/.test(trimmed)
  )
    return null
  const tokens = trimmed.replace(/\s*([,;])\s*/g, '$1').split(/[\s,;]/)
  if (!tokens.length || tokens.some((token) => !/^\d+$/.test(token)))
    return null
  const ids = tokens.map((token) => Number(token))
  if (
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  )
    return null
  return ids
}

function validDays(value: string) {
  const parsed = safeId(value)
  return parsed !== null && parsed <= 36_500 ? parsed : null
}

function matchesCurrentFilters(item: AdminSubscription) {
  if (status.value && item.status !== status.value) return false
  if (safeId(groupId.value) !== null && item.group_id !== safeId(groupId.value))
    return false
  if (!search.value) return true
  const haystack = [
    item.user?.email,
    item.user?.username,
    item.group?.name,
    item.user_id,
    item.group_id,
  ]
    .map((value) => String(value ?? '').toLocaleLowerCase())
    .join(' ')
  return haystack.includes(search.value.toLocaleLowerCase())
}

function mergeAssignedSubscriptions(
  candidates: AdminSubscription[],
  insertIds: Set<number>,
) {
  if (!candidates.length) return []
  const candidateById = new Map(candidates.map((item) => [item.id, item]))
  const updatedCurrent = result.value.items.map(
    (item) => candidateById.get(item.id) ?? item,
  )
  if (result.value.page !== 1) {
    result.value = { ...result.value, items: updatedCurrent }
    return []
  }
  const currentIds = new Set(updatedCurrent.map((item) => item.id))
  const additions = candidates.filter(
    (item) =>
      insertIds.has(item.id) &&
      !currentIds.has(item.id) &&
      matchesCurrentFilters(item),
  )
  result.value = {
    ...result.value,
    items: [...additions, ...updatedCurrent].slice(0, PAGE_SIZE),
    total:
      Math.max(result.value.total, updatedCurrent.length) + additions.length,
  }
  return additions
}

function decodeBulkAssignmentResponse(
  value: unknown,
  requestedUserIds: number[],
  requestedGroupId: number,
) {
  const response = plainRecord(value)
  if (!response) return null
  const successCount = strictNonNegativeInteger(response.success_count)
  const createdCount = strictNonNegativeInteger(response.created_count)
  const reusedCount = strictNonNegativeInteger(response.reused_count)
  const failedCount = strictNonNegativeInteger(response.failed_count)
  const subscriptions = decodeSubscriptions(response.subscriptions)
  const statuses = plainRecord(response.statuses)
  if (
    successCount === null ||
    createdCount === null ||
    reusedCount === null ||
    failedCount === null ||
    !subscriptions ||
    !Array.isArray(response.errors) ||
    response.errors.some((error) => typeof error !== 'string') ||
    !statuses ||
    successCount + failedCount !== requestedUserIds.length ||
    createdCount + reusedCount !== successCount ||
    subscriptions.length !== successCount ||
    response.errors.length !== failedCount
  )
    return null

  const requestedKeys = requestedUserIds.map(String).sort()
  const statusKeys = Object.keys(statuses).sort()
  if (
    requestedKeys.length !== statusKeys.length ||
    requestedKeys.some((key, index) => key !== statusKeys[index])
  )
    return null

  const createdUserIds = new Set<number>()
  const reusedUserIds = new Set<number>()
  const failedUserIds = new Set<number>()
  for (const userId of requestedUserIds) {
    const value = statuses[String(userId)]
    if (value === 'created') createdUserIds.add(userId)
    else if (value === 'reused') reusedUserIds.add(userId)
    else if (value === 'failed') failedUserIds.add(userId)
    else return null
  }
  if (
    createdUserIds.size !== createdCount ||
    reusedUserIds.size !== reusedCount ||
    failedUserIds.size !== failedCount
  )
    return null

  const successfulUserIds = new Set([...createdUserIds, ...reusedUserIds])
  const subscriptionUserIds = new Set<number>()
  for (const subscription of subscriptions) {
    if (
      subscription.group_id !== requestedGroupId ||
      !successfulUserIds.has(subscription.user_id) ||
      subscriptionUserIds.has(subscription.user_id)
    )
      return null
    subscriptionUserIds.add(subscription.user_id)
  }
  if (
    successfulUserIds.size !== subscriptionUserIds.size ||
    [...successfulUserIds].some((id) => !subscriptionUserIds.has(id))
  )
    return null

  return {
    successCount,
    failedCount,
    subscriptions,
    createdUserIds,
    failedUserIds,
  }
}

async function submitAssignment() {
  if (assignmentPending.value) return
  const selectedGroupId = safeId(assignment.groupId)
  const days = validDays(assignment.days)
  if (
    selectedGroupId === null ||
    !assignmentGroups.value.some((group) => group.id === selectedGroupId)
  ) {
    assignmentError.value = '请选择有效的订阅分组。'
    return
  }
  if (days === null) {
    assignmentError.value = '有效天数必须是大于 0 的整数。'
    return
  }
  const userId = safeId(assignment.userId)
  const userIds = parseUserIds(assignment.userIds)
  if (assignment.mode === 'single' && userId === null) {
    assignmentError.value = '请输入有效的用户 ID。'
    return
  }
  if (assignment.mode === 'bulk' && userIds === null) {
    assignmentError.value =
      '用户 ID 列表格式无效，请检查空项、重复项或非法 ID。'
    return
  }

  const token = claimFeedback()
  assignmentPending.value = true
  assignmentError.value = ''
  let ambiguousSingleResult: { id: number; wasVisible: boolean } | null = null
  try {
    if (assignment.mode === 'single') {
      const response = await assignAdminSubscription({
        user_id: userId!,
        group_id: selectedGroupId,
        validity_days: days,
      })
      if (!mounted) return
      const decoded = decodeSubscription(response)
      if (
        !decoded ||
        decoded.user_id !== userId ||
        decoded.group_id !== selectedGroupId
      ) {
        assignmentError.value = '订阅分配结果无法确认，请重试。'
        return
      }
      const wasVisible = result.value.items.some(
        (item) => item.id === decoded.id,
      )
      mergeAssignedSubscriptions([decoded], new Set())
      ambiguousSingleResult = { id: decoded.id, wasVisible }
      if (ownsFeedback(token))
        actionMessage.value = `已为用户 #${userId} 分配订阅`
    } else {
      const response = await bulkAssignAdminSubscriptions({
        user_ids: userIds!,
        group_id: selectedGroupId,
        validity_days: days,
      })
      if (!mounted) return
      const decoded = decodeBulkAssignmentResponse(
        response,
        userIds!,
        selectedGroupId,
      )
      if (!decoded) {
        assignmentError.value = '批量分配结果无法确认，请重试。'
        return
      }
      const createdSubscriptionIds = new Set(
        decoded.subscriptions
          .filter((item) => decoded.createdUserIds.has(item.user_id))
          .map((item) => item.id),
      )
      const additions = mergeAssignedSubscriptions(
        decoded.subscriptions,
        createdSubscriptionIds,
      )
      additions.forEach((item) => {
        void loadProgressItem(item, progressGeneration)
      })
      if (ownsFeedback(token)) {
        if (decoded.failedCount) {
          const failedIds = [...decoded.failedUserIds]
            .map((id) => `#${id}`)
            .join('、')
          bulkWarning.value = `${decoded.successCount ? '部分用户分配失败' : '批量分配失败'}：${failedIds}`
        } else {
          actionMessage.value = `批量分配完成：成功 ${decoded.successCount} 个，失败 0 个`
        }
      }
    }
    if (!mounted) return
    assignmentPending.value = false
    closeAssignment()
    const synced = await loadSubscriptions(
      result.value.page,
      true,
      token,
      false,
      false,
    )
    if (synced && ambiguousSingleResult && !ambiguousSingleResult.wasVisible) {
      const refreshed = result.value.items.find(
        (item) => item.id === ambiguousSingleResult!.id,
      )
      if (refreshed) void loadProgressItem(refreshed, progressGeneration)
    }
    if (!synced && ownsFeedback(token))
      syncWarning.value = '订阅已分配，但列表同步失败，请刷新重试。'
  } catch {
    if (mounted) assignmentError.value = '订阅分配失败，请稍后重试。'
  } finally {
    if (mounted) assignmentPending.value = false
  }
}

function focusMenuTrigger(id: number) {
  document
    .querySelector<HTMLElement>(
      `[data-testid="subscription-menu-trigger-${id}"]`,
    )
    ?.focus()
}

function closeMenu(restoreFocus = false) {
  const id = openMenuId.value
  openMenuId.value = null
  if (restoreFocus && id !== null) void nextTick(() => focusMenuTrigger(id))
}

function toggleMenu(id: number) {
  openMenuId.value = openMenuId.value === id ? null : id
  if (openMenuId.value !== null) {
    void nextTick(() =>
      document
        .querySelector<HTMLElement>(
          `[data-testid="subscription-menu-${id}"] button`,
        )
        ?.focus(),
    )
  }
}

function openLifecycle(type: LifecycleAction, item: AdminSubscription) {
  if (mutationPending.value) return
  focusMenuTrigger(item.id)
  closeMenu()
  lifecycle.type = type
  lifecycle.item = item
  lifecycle.days = '30'
  lifecycle.daily = true
  lifecycle.weekly = true
  lifecycle.monthly = true
  lifecycle.error = ''
}

function closeLifecycle() {
  if (mutationPending.value) return
  lifecycle.type = null
  lifecycle.item = null
  lifecycle.error = ''
}

function replaceSubscription(id: number, update: Partial<AdminSubscription>) {
  result.value = {
    ...result.value,
    items: result.value.items.map((item) =>
      item.id === id ? { ...item, ...update, id } : item,
    ),
  }
}

function reduceSubscription(item: AdminSubscription) {
  if (!matchesCurrentFilters(item)) {
    result.value = {
      ...result.value,
      items: result.value.items.filter((candidate) => candidate.id !== item.id),
      total: Math.max(
        0,
        result.value.total -
          Number(
            result.value.items.some((candidate) => candidate.id === item.id),
          ),
      ),
    }
    return
  }
  replaceSubscription(item.id, item)
}

function decodeLifecycleResponse(
  response: unknown,
  target: AdminSubscription,
  allowedStatuses: ReadonlySet<AdminSubscription['status']>,
) {
  const value = decodeSubscription(response)
  if (
    !value ||
    value.id !== target.id ||
    value.user_id !== target.user_id ||
    value.group_id !== target.group_id ||
    !allowedStatuses.has(value.status)
  )
    return null
  return value
}

function validRevokeResponse(response: unknown) {
  const value = plainRecord(response)
  return Boolean(
    value && typeof value.message === 'string' && value.message.trim(),
  )
}

function reportUnconfirmedLifecycleResult() {
  lifecycle.error = '订阅操作结果无法确认，请刷新后重试。'
  syncWarning.value = '订阅操作结果无法确认，列表同步失败，请刷新重试。'
}

async function confirmLifecycle() {
  const item = lifecycle.item
  const type = lifecycle.type
  if (!item || !type || mutationPending.value) return
  if (
    (type === 'revoke' && item.status !== 'active') ||
    (type === 'restore' && item.status !== 'revoked')
  )
    return
  const days = validDays(lifecycle.days)
  if (type === 'extend' && days === null) {
    lifecycle.error = '延长天数必须是大于 0 的整数。'
    return
  }
  if (
    type === 'reset' &&
    !lifecycle.daily &&
    !lifecycle.weekly &&
    !lifecycle.monthly
  ) {
    lifecycle.error = '请至少选择一个额度窗口。'
    return
  }

  const token = claimFeedback()
  mutationPending.value = `${type}-${item.id}`
  lifecycle.error = ''
  try {
    let updatedItem: AdminSubscription
    let refreshTargetProgress = false
    if (type === 'extend') {
      const response = await extendAdminSubscription(item.id, days!)
      if (!mounted) return
      const decoded = decodeLifecycleResponse(
        response,
        item,
        item.status === 'expired'
          ? new Set(['expired', 'active'])
          : new Set([item.status]),
      )
      if (!decoded) {
        reportUnconfirmedLifecycleResult()
        return
      }
      updatedItem = decoded
      reduceSubscription(updatedItem)
      if (ownsFeedback(token)) actionMessage.value = `订阅已延长 ${days} 天`
    } else if (type === 'reset') {
      const resetWindows = {
        daily: lifecycle.daily,
        weekly: lifecycle.weekly,
        monthly: lifecycle.monthly,
      }
      const response = await resetAdminSubscriptionQuota(item.id, {
        daily: resetWindows.daily,
        weekly: resetWindows.weekly,
        monthly: resetWindows.monthly,
      })
      if (!mounted) return
      const decoded = decodeLifecycleResponse(
        response,
        item,
        new Set([item.status]),
      )
      if (
        !decoded ||
        (resetWindows.daily && decoded.daily_usage_usd !== 0) ||
        (resetWindows.weekly && decoded.weekly_usage_usd !== 0) ||
        (resetWindows.monthly && decoded.monthly_usage_usd !== 0)
      ) {
        reportUnconfirmedLifecycleResult()
        return
      }
      updatedItem = decoded
      reduceSubscription(updatedItem)
      refreshTargetProgress = true
      if (ownsFeedback(token)) actionMessage.value = '订阅额度已重置'
    } else if (type === 'revoke') {
      const response = await revokeAdminSubscription(item.id)
      if (!mounted) return
      if (!validRevokeResponse(response)) {
        reportUnconfirmedLifecycleResult()
        return
      }
      updatedItem = { ...item, status: 'revoked' }
      reduceSubscription(updatedItem)
      if (ownsFeedback(token)) actionMessage.value = '订阅已撤销'
    } else {
      const response = await restoreAdminSubscription(item.id)
      if (!mounted) return
      const decoded = decodeLifecycleResponse(
        response,
        item,
        new Set(['active', 'expired']),
      )
      if (!decoded) {
        reportUnconfirmedLifecycleResult()
        return
      }
      updatedItem = decoded
      reduceSubscription(updatedItem)
      if (ownsFeedback(token)) actionMessage.value = '订阅已恢复'
    }
    mutationPending.value = ''
    closeLifecycle()
    if (refreshTargetProgress)
      void loadProgressItem(updatedItem!, progressGeneration)
    const synced = await loadSubscriptions(
      result.value.page,
      true,
      token,
      false,
      !refreshTargetProgress,
    )
    if (!synced && ownsFeedback(token))
      syncWarning.value = '订阅操作已完成，但列表同步失败，请刷新重试。'
  } catch {
    if (mounted) lifecycle.error = '订阅操作失败，请稍后重试。'
  } finally {
    if (mounted) mutationPending.value = ''
  }
}

function quotaWindows(id: number): Array<{
  key: QuotaKey
  label: string
  value: AdminSubscriptionQuotaWindow
}> {
  const detail = progressById.value[id]
  if (!detail) return []
  return quotaDefinitions.flatMap(({ key, label }) => {
    const value = detail[key]
    return value && typeof value === 'object' ? [{ key, label, value }] : []
  })
}

function resetLabel(seconds: unknown) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return ''
  const days = Math.floor(value / 86_400)
  const hours = Math.floor((value % 86_400) / 3_600)
  const minutes = Math.floor((value % 3_600) / 60)
  if (days) return `${days} 天${hours ? ` ${hours} 小时` : ''}后重置`
  if (hours) return `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}后重置`
  return `${Math.max(1, minutes)} 分钟后重置`
}

function changePage(page: number) {
  if (
    busy.value ||
    page < 1 ||
    page > pageCount.value ||
    page === result.value.page
  )
    return
  requestLoad(page, true)
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && openMenuId.value !== null) closeMenu(true)
}

function handleDocumentPointer(event: PointerEvent) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('.subscription-menu-owner')
  )
    closeMenu()
}

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('pointerdown', handleDocumentPointer)
  void loadSubscriptions(1, false)
  void loadGroups()
})

onUnmounted(() => {
  mounted = false
  listGeneration += 1
  groupGeneration += 1
  progressGeneration += 1
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointer)
})
</script>

<template>
  <MobilePage
    title="订阅管理"
    subtitle="分配、额度与生命周期"
    :aria-busy="busy"
  >
    <template #action>
      <button
        class="refresh-button"
        type="button"
        data-testid="refresh-subscriptions"
        aria-label="刷新订阅"
        :disabled="listLoading"
        @click="refreshList"
      >
        <RefreshCw :size="18" :class="{ spinning: listLoading }" />
      </button>
      <button
        class="assign-button"
        type="button"
        data-testid="assign-subscription"
        @click="openAssignment"
      >
        <Plus :size="18" />分配
      </button>
    </template>

    <div class="subscriptions-content">
      <form
        class="search-row"
        data-testid="subscription-search-form"
        @submit.prevent="submitSearch"
      >
        <label
          ><Search :size="17" /><input
            v-model="searchDraft"
            data-testid="subscription-search"
            autocomplete="off"
            placeholder="搜索用户、邮箱或分组"
        /></label>
        <button type="submit" :disabled="listLoading">搜索</button>
        <button
          class="filter-button"
          type="button"
          data-testid="subscription-filter-trigger"
          aria-label="筛选订阅"
          @click="openFilters"
        >
          <Filter :size="17" /><span v-if="activeFilterCount">{{
            activeFilterCount
          }}</span>
        </button>
      </form>

      <p
        v-if="actionMessage"
        class="feedback success"
        data-testid="subscription-action-message"
        role="status"
      >
        <Check :size="17" />{{ actionMessage }}
      </p>
      <p
        v-if="actionError"
        class="feedback error"
        data-testid="subscription-action-error"
        role="alert"
      >
        <AlertCircle :size="17" />{{ actionError }}
      </p>
      <p
        v-if="bulkWarning"
        class="feedback warning"
        data-testid="subscription-bulk-warning"
        role="alert"
      >
        <AlertCircle :size="17" />{{ bulkWarning }}
      </p>
      <p
        v-if="syncWarning"
        class="feedback warning"
        data-testid="subscription-sync-warning"
        role="alert"
      >
        <AlertCircle :size="17" />{{ syncWarning }}
      </p>
      <div v-if="listLoading" class="list-busy" role="status">正在刷新订阅</div>

      <div
        v-if="initialLoading && !loaded"
        class="list-state"
        data-testid="subscription-list-loading"
        role="status"
      >
        正在加载订阅
      </div>
      <div
        v-else-if="fatalError"
        class="list-state error-state"
        data-testid="subscription-list-error"
        role="alert"
      >
        <AlertCircle :size="21" /><strong>订阅列表加载失败</strong>
        <p>{{ fatalError }}</p>
        <button
          type="button"
          data-testid="subscription-list-retry"
          @click="retryList"
        >
          <RefreshCw :size="16" />重试
        </button>
      </div>
      <div
        v-else-if="loaded && !result.items.length"
        class="list-state"
        data-testid="subscription-list-empty"
        role="status"
      >
        <strong>暂无订阅</strong>
        <p>当前筛选范围内没有订阅，可以直接分配新订阅。</p>
      </div>

      <section v-else class="subscription-list" aria-label="订阅列表">
        <article
          v-for="item in result.items"
          :key="item.id"
          class="subscription-card"
          data-testid="mobile-subscription-card"
        >
          <header>
            <div class="identity">
              <strong>{{ userLabel(item) }}</strong
              ><span
                >{{ safeText(item.user?.username, '未设置用户名') }} ·
                {{ groupLabel(item) }}</span
              >
            </div>
            <span
              class="status"
              :class="item.status"
              :data-testid="`subscription-status-${item.id}`"
              >{{ statusLabel(item.status) }}</span
            >
            <div class="subscription-menu-owner">
              <button
                class="menu-trigger"
                type="button"
                :data-testid="`subscription-menu-trigger-${item.id}`"
                :aria-expanded="openMenuId === item.id"
                aria-label="更多订阅操作"
                @click="toggleMenu(item.id)"
              >
                <CircleEllipsis :size="20" />
              </button>
              <div
                v-if="openMenuId === item.id"
                class="subscription-menu"
                :data-testid="`subscription-menu-${item.id}`"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  :data-testid="`extend-subscription-${item.id}`"
                  @click="openLifecycle('extend', item)"
                >
                  <CalendarPlus :size="17" />延长期限
                </button>
                <button
                  type="button"
                  role="menuitem"
                  :data-testid="`reset-subscription-${item.id}`"
                  @click="openLifecycle('reset', item)"
                >
                  <RotateCcw :size="17" />重置额度
                </button>
                <button
                  v-if="item.status === 'active'"
                  class="danger"
                  type="button"
                  role="menuitem"
                  :data-testid="`revoke-subscription-${item.id}`"
                  @click="openLifecycle('revoke', item)"
                >
                  <ShieldOff :size="17" />撤销订阅
                </button>
                <button
                  v-if="item.status === 'revoked'"
                  type="button"
                  role="menuitem"
                  :data-testid="`restore-subscription-${item.id}`"
                  @click="openLifecycle('restore', item)"
                >
                  <ShieldCheck :size="17" />恢复订阅
                </button>
              </div>
            </div>
          </header>

          <div
            v-if="progressErrors[item.id]"
            class="progress-error"
            :data-testid="`subscription-progress-error-${item.id}`"
          >
            <AlertCircle :size="15" /><span>额度暂时无法加载</span
            ><button
              type="button"
              :data-testid="`retry-subscription-progress-${item.id}`"
              @click="loadProgressItem(item, progressGeneration)"
            >
              重试
            </button>
          </div>
          <div v-else-if="quotaWindows(item.id).length" class="quota-list">
            <div
              v-for="window in quotaWindows(item.id)"
              :key="window.key"
              class="quota-window"
              :data-testid="`subscription-quota-${window.key}-${item.id}`"
            >
              <div>
                <span>{{ window.label }}</span
                ><strong
                  >{{ percentageLabel(window.value.percentage) }}%</strong
                >
              </div>
              <p>
                {{ safeMoney(window.value.used_usd) }} /
                {{ safeMoney(window.value.limit_usd) }}
              </p>
              <i
                ><b
                  :class="{
                    full: safePercentage(window.value.percentage) >= 100,
                  }"
                  :style="{
                    width: `${safePercentage(window.value.percentage)}%`,
                  }"
              /></i>
              <small v-if="resetLabel(window.value.resets_in_seconds)">{{
                resetLabel(window.value.resets_in_seconds)
              }}</small>
            </div>
          </div>
          <div
            v-else-if="progressLoadedById[item.id]"
            class="progress-empty"
            :data-testid="`subscription-progress-empty-${item.id}`"
          >
            未设置周期额度
          </div>
          <div v-else class="progress-loading" role="status">正在加载额度</div>

          <footer>
            <span>开始 {{ safeDate(item.starts_at) }}</span
            ><span>到期 {{ safeDate(item.expires_at) }}</span>
          </footer>
        </article>
      </section>

      <MobilePagination
        v-if="result.total > PAGE_SIZE"
        :page="result.page"
        :page-count="pageCount"
        @change="changePage"
      />
    </div>

    <MobileBottomSheet v-model="filterSheetOpen" title="订阅筛选">
      <div class="sheet-fields">
        <label
          ><span>状态</span
          ><select
            v-model="draftStatus"
            data-testid="subscription-status-filter"
          >
            <option value="">全部状态</option>
            <option value="active">有效</option>
            <option value="expired">已过期</option>
            <option value="revoked">已撤销</option>
            <option value="suspended">已暂停</option>
          </select></label
        >
        <label
          ><span>订阅分组</span
          ><select
            v-model="draftGroupId"
            data-testid="subscription-group-filter"
            :disabled="groupsLoading"
          >
            <option value="">全部分组</option>
            <option
              v-for="group in groups"
              :key="group.id"
              :value="String(group.id)"
            >
              {{ group.name }}
            </option>
          </select></label
        >
        <div
          v-if="groupsError"
          class="sheet-error"
          data-testid="subscription-groups-error"
          role="alert"
        >
          <span>{{ groupsError }}</span
          ><button
            type="button"
            data-testid="retry-subscription-groups"
            :disabled="groupsLoading"
            @click="loadGroups"
          >
            重试
          </button>
        </div>
      </div>
      <template #footer
        ><button class="sheet-secondary" type="button" @click="resetFilters">
          重置</button
        ><button
          class="sheet-primary"
          type="button"
          data-testid="subscription-filter-apply"
          @click="applyFilters"
        >
          应用
        </button></template
      >
    </MobileBottomSheet>

    <MobileBottomSheet
      :model-value="assignmentOpen"
      title="分配订阅"
      :close-disabled="assignmentPending"
      @update:model-value="
        (value) => {
          if (!value) closeAssignment()
        }
      "
      @close="closeAssignment"
    >
      <form
        data-testid="subscription-assignment-sheet"
        @submit.prevent="submitAssignment"
      >
        <div class="mode-switch" aria-label="分配方式">
          <button
            type="button"
            :aria-pressed="assignment.mode === 'single'"
            @click="assignment.mode = 'single'"
          >
            单个用户</button
          ><button
            type="button"
            data-testid="subscription-mode-bulk"
            :aria-pressed="assignment.mode === 'bulk'"
            @click="assignment.mode = 'bulk'"
          >
            <UsersRound :size="16" />批量用户
          </button>
        </div>
        <div class="sheet-fields">
          <label v-if="assignment.mode === 'single'"
            ><span>用户 ID</span
            ><input
              v-model="assignment.userId"
              data-testid="subscription-user-id"
              inputmode="numeric"
              autocomplete="off"
          /></label>
          <label v-else
            ><span>用户 ID 列表</span
            ><textarea
              v-model="assignment.userIds"
              data-testid="subscription-user-ids"
              rows="4"
              placeholder="支持逗号、空格或换行"
            />
          </label>
          <label
            ><span>订阅分组</span
            ><select
              v-model="assignment.groupId"
              data-testid="subscription-assignment-group-id"
              :disabled="groupsLoading || !groupsReady"
            >
              <option value="">请选择</option>
              <option
                v-for="group in assignmentGroups"
                :key="group.id"
                :value="String(group.id)"
              >
                {{ group.name }}
              </option>
            </select></label
          >
          <label
            ><span>有效天数</span
            ><input
              v-model="assignment.days"
              data-testid="subscription-validity-days"
              type="number"
              min="1"
              max="36500"
              inputmode="numeric"
          /></label>
          <div
            v-if="groupsError"
            class="sheet-error"
            data-testid="subscription-groups-error"
            role="alert"
          >
            <span>{{ groupsError }}</span
            ><button
              type="button"
              data-testid="retry-subscription-groups"
              :disabled="groupsLoading"
              @click="loadGroups"
            >
              重试
            </button>
          </div>
          <p
            v-if="assignmentError"
            class="sheet-error"
            data-testid="subscription-assignment-error"
            role="alert"
          >
            {{ assignmentError }}
          </p>
        </div>
      </form>
      <template #footer
        ><button
          class="sheet-secondary"
          type="button"
          :disabled="assignmentPending"
          @click="closeAssignment"
        >
          取消</button
        ><button
          class="sheet-primary"
          type="button"
          data-testid="confirm-subscription-assignment"
          :disabled="
            assignmentPending ||
            groupsLoading ||
            !groupsReady ||
            !assignmentGroups.length
          "
          @click="submitAssignment"
        >
          <LoaderCircle
            v-if="assignmentPending"
            :size="17"
            class="spinning"
          /><Check v-else :size="17" />{{
            assignmentPending ? '分配中' : '确认分配'
          }}
        </button></template
      >
    </MobileBottomSheet>

    <MobileBottomSheet
      :model-value="Boolean(lifecycle.item)"
      :title="lifecycleTitle"
      :close-disabled="Boolean(mutationPending)"
      @update:model-value="
        (value) => {
          if (!value) closeLifecycle()
        }
      "
      @close="closeLifecycle"
    >
      <div
        v-if="lifecycle.item"
        class="lifecycle-sheet"
        data-testid="subscription-action-sheet"
      >
        <p>
          {{ userLabel(lifecycle.item) }} · {{ groupLabel(lifecycle.item) }}
        </p>
        <label v-if="lifecycle.type === 'extend'"
          ><span>延长天数</span
          ><input
            v-model="lifecycle.days"
            data-testid="subscription-extend-days"
            type="number"
            min="1"
            max="36500"
        /></label>
        <fieldset v-else-if="lifecycle.type === 'reset'">
          <legend>选择重置窗口</legend>
          <label
            ><input
              v-model="lifecycle.daily"
              data-testid="subscription-reset-daily"
              type="checkbox"
            />日额度</label
          ><label
            ><input
              v-model="lifecycle.weekly"
              data-testid="subscription-reset-weekly"
              type="checkbox"
            />周额度</label
          ><label
            ><input
              v-model="lifecycle.monthly"
              data-testid="subscription-reset-monthly"
              type="checkbox"
            />月额度</label
          >
        </fieldset>
        <p v-else-if="lifecycle.type === 'revoke'" class="danger-copy">
          撤销后用户会立即失去该订阅分组的使用权限，之后仍可恢复。
        </p>
        <p v-else>恢复后，订阅将按原有效期与额度规则继续生效。</p>
        <p
          v-if="lifecycle.error"
          class="sheet-error"
          data-testid="subscription-action-error"
          role="alert"
        >
          {{ lifecycle.error }}
        </p>
      </div>
      <template #footer
        ><button
          class="sheet-secondary"
          type="button"
          :disabled="Boolean(mutationPending)"
          @click="closeLifecycle"
        >
          取消</button
        ><button
          class="sheet-primary"
          :class="{ danger: lifecycle.type === 'revoke' }"
          type="button"
          data-testid="confirm-subscription-action"
          :disabled="Boolean(mutationPending)"
          @click="confirmLifecycle"
        >
          <LoaderCircle v-if="mutationPending" :size="17" class="spinning" />{{
            mutationPending ? '处理中' : '确认操作'
          }}
        </button></template
      >
    </MobileBottomSheet>
  </MobilePage>
</template>

<style scoped>
.refresh-button,
.filter-button,
.menu-trigger {
  display: grid;
  box-sizing: border-box;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  place-items: center;
}
.assign-button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font: inherit;
}
.subscriptions-content {
  display: grid;
  min-width: 0;
  gap: 13px;
}
.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px;
  gap: 8px;
}
.search-row label {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
}
.search-row input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  outline: 0;
}
.search-row > button[type='submit'] {
  min-height: 44px;
  padding: 0 13px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font: inherit;
}
.filter-button {
  position: relative;
}
.filter-button span {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #bd4d40;
  color: #fff;
  font-size: 10px;
  place-items: center;
}
.feedback {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 11px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.45;
}
.feedback.success {
  border-color: #cce6d8;
  background: #eef9f3;
  color: #287154;
}
.feedback.error {
  border-color: #eccfc9;
  background: #fff5f2;
  color: #9e493c;
}
.feedback.warning {
  border-color: #ead8a7;
  background: #fff9e9;
  color: #876923;
}
.list-busy {
  padding: 7px 10px;
  border-radius: 5px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 12px;
}
.list-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 34px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  text-align: center;
}
.list-state p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
.list-state button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: inherit;
  font: inherit;
}
.error-state {
  color: #9e493c;
}
.subscription-list {
  display: grid;
  gap: 10px;
}
.subscription-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: 0 4px 14px rgba(29, 44, 65, 0.04);
}
.subscription-card > header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px;
  align-items: start;
  gap: 8px;
}
.identity {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.identity strong,
.identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity strong {
  font-size: 14px;
}
.identity span {
  color: var(--text-tertiary);
  font-size: 11px;
}
.status {
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 11px;
}
.status.active {
  background: #eaf7f0;
  color: #287755;
}
.status.revoked,
.status.expired {
  background: #fff0ed;
  color: #a14639;
}
.subscription-menu-owner {
  position: relative;
}
.menu-trigger {
  border: 0;
}
.subscription-menu {
  position: absolute;
  z-index: 25;
  top: 46px;
  right: 0;
  display: grid;
  width: 178px;
  padding: 5px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--bg-surface);
  box-shadow: 0 12px 32px rgba(26, 40, 60, 0.18);
}
.subscription-menu button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
}
.subscription-menu button:hover,
.subscription-menu button:focus {
  background: var(--bg-base);
  outline: 0;
}
.subscription-menu .danger {
  color: #a14639;
}
.quota-list {
  display: grid;
  gap: 9px;
}
.quota-window {
  display: grid;
  gap: 5px;
}
.quota-window > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 11px;
}
.quota-window > div strong {
  color: var(--text-primary);
  font-family: var(--font-data);
}
.quota-window p {
  margin: 0;
  color: var(--text-secondary);
  font-family: var(--font-data);
  font-size: 12px;
}
.quota-window > i {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--bg-base);
}
.quota-window > i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}
.quota-window > i b.full {
  background: #bd4d40;
}
.quota-window small {
  color: var(--text-tertiary);
  font-size: 10px;
}
.progress-loading,
.progress-empty,
.progress-error {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.progress-error {
  color: #9e493c;
}
.subscription-card > footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 7px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 10px;
}
.sheet-fields {
  display: grid;
  gap: 14px;
}
.sheet-fields label,
.lifecycle-sheet > label {
  display: grid;
  gap: 6px;
}
.sheet-fields label span,
.lifecycle-sheet label span {
  color: var(--text-secondary);
  font-size: 12px;
}
.sheet-fields input,
.sheet-fields select,
.sheet-fields textarea,
.lifecycle-sheet input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 9px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
}
.sheet-fields textarea {
  min-height: 104px;
  resize: vertical;
}
.sheet-error {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid #eccfc9;
  border-radius: 6px;
  background: #fff5f2;
  color: #9e493c;
  font-size: 13px;
}
.sheet-secondary,
.sheet-primary {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
}
.sheet-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.sheet-primary.danger {
  border-color: #a14639;
  background: #a14639;
}
.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 14px;
  padding: 4px;
  border-radius: 7px;
  background: var(--bg-base);
}
.mode-switch button {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
}
.mode-switch button[aria-pressed='true'] {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(29, 44, 65, 0.09);
}
.lifecycle-sheet {
  display: grid;
  gap: 14px;
}
.lifecycle-sheet > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.lifecycle-sheet .danger-copy {
  color: #9e493c;
}
.lifecycle-sheet fieldset {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  border: 0;
}
.lifecycle-sheet legend {
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}
.lifecycle-sheet fieldset label {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
}
.lifecycle-sheet fieldset input {
  width: 20px;
  height: 20px;
}
.mobile-pagination {
  margin-top: 2px;
}
.spinning {
  animation: subscription-spin 700ms linear infinite;
}
@keyframes subscription-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 370px) {
  .search-row {
    grid-template-columns: minmax(0, 1fr) 44px;
  }
  .search-row > button[type='submit'] {
    grid-column: 1/-1;
    grid-row: 2;
  }
  .subscription-card > header {
    grid-template-columns: minmax(0, 1fr) 44px;
  }
  .subscription-card > header > .status {
    grid-column: 1;
  }
  .subscription-menu-owner {
    grid-column: 2;
    grid-row: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
  }
}
</style>
