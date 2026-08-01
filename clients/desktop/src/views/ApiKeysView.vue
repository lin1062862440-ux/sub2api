<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Copy,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
  TriangleAlert,
  WalletCards,
  X,
} from '@lucide/vue'

import * as api from '@/api'
import type {
  ApiKey,
  ApiKeyGroup,
  ApiKeyStatus,
  ApiKeyUsageStat,
  CreateApiKeyRequest,
  DashboardStats,
  UpdateApiKeyRequest,
} from '@/api'
import ProviderIcon from '@/components/ProviderIcon.vue'
import UseApiKeyDialog from '@/components/keys/UseApiKeyDialog.vue'
import { BACKEND_ORIGIN } from '@/config'
import { routeApiKeyClient } from '@/lib/client-config'
import { formatCost } from '@/lib/format'
import { session } from '@/stores/session'

type ExpiryMode = 'never' | '7d' | '30d' | '90d' | 'custom'
type DialogMode = 'create' | 'edit'

const PAGE_SIZE = 8

const keys = ref<ApiKey[]>([])
const groups = ref<ApiKeyGroup[]>([])
const usage = ref<Record<string, ApiKeyUsageStat>>({})
const dashboard = ref<DashboardStats | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const page = ref(1)
const total = ref(0)
const pages = ref(1)
const search = ref('')
const statusFilter = ref('')
const groupFilter = ref('')
const expandedIds = ref(new Set<number>())
const busyKeyId = ref<number | null>(null)
const groupPickerKeyId = ref<number | null>(null)
const groupUpdatingKeyId = ref<number | null>(null)
const copiedKeyId = ref<number | null>(null)
const endpointCopied = ref(false)

const dialogOpen = ref(false)
const dialogMode = ref<DialogMode>('create')
const selectedKey = ref<ApiKey | null>(null)
const submitting = ref(false)
const formError = ref('')
const customExpiryMin = ref('')
const deleteTarget = ref<ApiKey | null>(null)
const deleting = ref(false)
const useTarget = ref<ApiKey | null>(null)

const toastMessage = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

function emptyForm() {
  return {
    name: '',
    group_id: null as number | null,
    quota: null as number | null,
    expiry: 'never' as ExpiryMode,
    custom_expiry: '',
    rate_limit_5h: null as number | null,
    rate_limit_1d: null as number | null,
    rate_limit_7d: null as number | null,
    ip_whitelist: '',
    ip_blacklist: '',
    custom_key: '',
  }
}

const form = reactive(emptyForm())

const activeCount = computed(() => dashboard.value?.active_api_keys ?? keys.value.filter((key) => key.status === 'active').length)
const totalCount = computed(() => dashboard.value?.total_api_keys ?? total.value)
const todayCost = computed(() => dashboard.value?.today_actual_cost ?? Object.values(usage.value).reduce((sum, item) => sum + item.today_actual_cost, 0))
const limitedCount = computed(() => keys.value.filter(hasConfiguredLimit).length)
const apiEndpoint = computed(() => session.settings?.api_base_url?.replace(/\/$/, '') || `${BACKEND_ORIGIN.replace(/\/$/, '')}/v1`)

function showToast(message: string) {
  toastMessage.value = message
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 1800)
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function maskKey(value: string) {
  if (!value) return 'sk-lin-••••••••'
  if (value.length <= 12) return `${value.slice(0, 4)}••••${value.slice(-3)}`
  return `${value.slice(0, 9)}••••••••${value.slice(-4)}`
}

function formatLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatTime(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: ApiKeyStatus) {
  if (status === 'active') return '正在使用'
  if (status === 'inactive') return '已停用'
  if (status === 'quota_exhausted') return '配额用尽'
  return '已过期'
}

function statusTone(status: ApiKeyStatus) {
  if (status === 'active') return 'active'
  if (status === 'quota_exhausted') return 'warning'
  if (status === 'expired') return 'expired'
  return 'inactive'
}

function groupName(key: ApiKey) {
  return key.group?.name || '未分组'
}

function groupPlatform(key: ApiKey) {
  return key.group?.platform || 'unknown'
}

function hasConfiguredLimit(key: ApiKey) {
  return key.quota > 0 || key.rate_limit_5h > 0 || key.rate_limit_1d > 0 || key.rate_limit_7d > 0
}

function quotaPercent(key: ApiKey) {
  if (!key.quota) return 0
  return Math.min(100, Math.max(0, (key.quota_used / key.quota) * 100))
}

function keyUsage(key: ApiKey) {
  return usage.value[String(key.id)]
}

function rateLimits(key: ApiKey) {
  return [
    { label: '5 小时', used: key.usage_5h || 0, limit: key.rate_limit_5h || 0 },
    { label: '1 天', used: key.usage_1d || 0, limit: key.rate_limit_1d || 0 },
    { label: '7 天', used: key.usage_7d || 0, limit: key.rate_limit_7d || 0 },
  ].filter((item) => item.limit > 0)
}

function ratePercent(used: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
}

async function copyKey(key: ApiKey) {
  await copyText(key.key)
  copiedKeyId.value = key.id
  showToast('API 密钥已复制')
  setTimeout(() => { if (copiedKeyId.value === key.id) copiedKeyId.value = null }, 1200)
}

async function copyEndpoint() {
  await copyText(apiEndpoint.value)
  endpointCopied.value = true
  showToast('API 地址已复制')
  setTimeout(() => { endpointCopied.value = false }, 1200)
}

async function load(showRefresh = false) {
  if (showRefresh) refreshing.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.getApiKeys({
      page: page.value,
      page_size: PAGE_SIZE,
      search: search.value.trim() || undefined,
      status: statusFilter.value || undefined,
      group_id: groupFilter.value ? Number(groupFilter.value) : undefined,
      sort_by: 'created_at',
      sort_order: 'desc',
    })
    keys.value = response.items
    total.value = response.total
    pages.value = Math.max(1, response.pages ?? response.total_pages ?? Math.ceil(response.total / PAGE_SIZE))
    const [statsResult, usageResult] = await Promise.allSettled([
      api.getDashboardStats(),
      keys.value.length ? api.getApiKeyUsage(keys.value.map((key) => key.id)) : Promise.resolve({ stats: {} }),
    ])
    dashboard.value = statsResult.status === 'fulfilled' ? statsResult.value : null
    usage.value = usageResult.status === 'fulfilled' ? usageResult.value.stats : {}
  } catch (error) {
    errorMessage.value = errorText(error, '无法读取 API 密钥，请稍后重试')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function loadGroups() {
  try {
    groups.value = await api.getApiKeyGroups()
  } catch (error) {
    errorMessage.value = errorText(error, '无法读取可用分组')
  }
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void load()
  }, 260)
}

function applyFilter() {
  page.value = 1
  void load()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pages.value || nextPage === page.value) return
  page.value = nextPage
  void load()
}

function toggleDetails(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function resetForm() {
  Object.assign(form, emptyForm())
  formError.value = ''
}

function openCreate() {
  resetForm()
  dialogMode.value = 'create'
  selectedKey.value = null
  customExpiryMin.value = formatLocalInput(new Date())
  dialogOpen.value = true
}

function openEdit(key: ApiKey) {
  resetForm()
  dialogMode.value = 'edit'
  selectedKey.value = key
  form.name = key.name
  form.group_id = key.group_id
  form.quota = key.quota > 0 ? key.quota : null
  form.rate_limit_5h = key.rate_limit_5h > 0 ? key.rate_limit_5h : null
  form.rate_limit_1d = key.rate_limit_1d > 0 ? key.rate_limit_1d : null
  form.rate_limit_7d = key.rate_limit_7d > 0 ? key.rate_limit_7d : null
  form.ip_whitelist = (key.ip_whitelist || []).join('\n')
  form.ip_blacklist = (key.ip_blacklist || []).join('\n')
  form.expiry = key.expires_at ? 'custom' : 'never'
  form.custom_expiry = key.expires_at ? formatLocalInput(new Date(key.expires_at)) : ''
  customExpiryMin.value = formatLocalInput(new Date())
  dialogOpen.value = true
}

function openUseKey(key: ApiKey) {
  const route = routeApiKeyClient(key.group?.platform)
  if (route.kind === 'unsupported') {
    showToast(route.message)
    return
  }
  useTarget.value = key
}

function closeUseKey() {
  useTarget.value = null
}

function closeDialog() {
  if (submitting.value) return
  dialogOpen.value = false
  selectedKey.value = null
  formError.value = ''
}

function handleExpiryChange() {
  if (form.expiry !== 'custom' || form.custom_expiry) return
  const defaultExpiry = new Date()
  defaultExpiry.setDate(defaultExpiry.getDate() + 30)
  defaultExpiry.setMinutes(0, 0, 0)
  form.custom_expiry = formatLocalInput(defaultExpiry)
}

function parseList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}

function presetDays() {
  if (form.expiry === '7d') return 7
  if (form.expiry === '30d') return 30
  if (form.expiry === '90d') return 90
  return undefined
}

function expirationIso() {
  if (form.expiry === 'never') return ''
  if (form.expiry === 'custom') return new Date(form.custom_expiry).toISOString()
  const date = new Date()
  date.setDate(date.getDate() + (presetDays() || 0))
  return date.toISOString()
}

function validateForm() {
  if (!form.name.trim()) return '请输入密钥名称'
  if (form.group_id === null) return '请选择所属分组'
  if (form.expiry === 'custom') {
    if (!form.custom_expiry) return '请选择自定义到期时间'
    if (new Date(form.custom_expiry).getTime() <= Date.now()) return '到期时间必须晚于当前时间'
  }
  if (dialogMode.value === 'create' && form.custom_key) {
    if (form.custom_key.length < 16) return '自定义密钥至少需要 16 位'
    if (!/^[a-zA-Z0-9_-]+$/.test(form.custom_key)) return '自定义密钥只能包含字母、数字、下划线和连字符'
  }
  return ''
}

async function submitForm() {
  const validation = validateForm()
  if (validation) {
    formError.value = validation
    return
  }
  formError.value = ''
  submitting.value = true
  const limits = {
    rate_limit_5h: form.rate_limit_5h && form.rate_limit_5h > 0 ? form.rate_limit_5h : 0,
    rate_limit_1d: form.rate_limit_1d && form.rate_limit_1d > 0 ? form.rate_limit_1d : 0,
    rate_limit_7d: form.rate_limit_7d && form.rate_limit_7d > 0 ? form.rate_limit_7d : 0,
  }
  try {
    if (dialogMode.value === 'edit' && selectedKey.value) {
      const payload: UpdateApiKeyRequest = {
        name: form.name.trim(),
        group_id: form.group_id,
        quota: form.quota && form.quota > 0 ? form.quota : 0,
        ip_whitelist: parseList(form.ip_whitelist),
        ip_blacklist: parseList(form.ip_blacklist),
        expires_at: expirationIso(),
        ...limits,
      }
      await api.updateApiKey(selectedKey.value.id, payload)
      showToast('密钥配置已更新')
    } else {
      const payload: CreateApiKeyRequest = {
        name: form.name.trim(),
        group_id: form.group_id as number,
        custom_key: form.custom_key.trim() || undefined,
        quota: form.quota && form.quota > 0 ? form.quota : undefined,
        ip_whitelist: parseList(form.ip_whitelist),
        ip_blacklist: parseList(form.ip_blacklist),
        expires_in_days: form.expiry === 'custom'
          ? Math.max(1, Math.ceil((new Date(form.custom_expiry).getTime() - Date.now()) / 86_400_000))
          : presetDays(),
        ...limits,
      }
      const created = await api.createApiKey(payload)
      if (form.expiry === 'custom') {
        await api.updateApiKey(created.id, { expires_at: new Date(form.custom_expiry).toISOString() })
      }
      showToast('API 密钥已创建')
    }
    dialogOpen.value = false
    selectedKey.value = null
    formError.value = ''
    await load(true)
  } catch (error) {
    formError.value = errorText(error, '保存失败，请检查配置后重试')
  } finally {
    submitting.value = false
  }
}

async function toggleStatus(key: ApiKey) {
  busyKeyId.value = key.id
  try {
    const status = key.status === 'active' ? 'inactive' : 'active'
    await api.updateApiKey(key.id, { status })
    showToast(status === 'active' ? '密钥已启用' : '密钥已停用')
    await load(true)
  } catch (error) {
    showToast(errorText(error, '状态更新失败'))
  } finally {
    busyKeyId.value = null
  }
}

function toggleGroupPicker(keyId: number) {
  groupPickerKeyId.value = groupPickerKeyId.value === keyId ? null : keyId
}

async function changeGroup(key: ApiKey, groupId: number | null) {
  if (key.group_id === groupId) {
    groupPickerKeyId.value = null
    return
  }
  groupUpdatingKeyId.value = key.id
  try {
    await api.updateApiKey(key.id, { group_id: groupId })
    groupPickerKeyId.value = null
    showToast('密钥分组已更新')
    await load(true)
  } catch (error) {
    showToast(errorText(error, '分组更新失败'))
  } finally {
    groupUpdatingKeyId.value = null
  }
}

async function removeKey() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.deleteApiKey(deleteTarget.value.id)
    deleteTarget.value = null
    showToast('API 密钥已删除')
    if (keys.value.length === 1 && page.value > 1) page.value -= 1
    await load(true)
  } catch (error) {
    showToast(errorText(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (deleteTarget.value) deleteTarget.value = null
  else if (useTarget.value) useTarget.value = null
  else if (dialogOpen.value) closeDialog()
  else groupPickerKeyId.value = null
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.group-picker')) {
    groupPickerKeyId.value = null
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  void Promise.all([load(), loadGroups()])
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  if (searchTimer) clearTimeout(searchTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="keys-page" :class="{ 'is-refreshing': refreshing }">
    <header class="page-head">
      <div>
        <h1>API 密钥</h1>
        <p>管理应用访问凭证、调用范围和消费限制</p>
      </div>
      <button class="primary-button" type="button" @click="openCreate">
        <Plus :size="16" />
        <span>创建密钥</span>
      </button>
    </header>

    <section class="overview" aria-label="密钥概览">
      <div class="overview-item">
        <span class="overview-icon"><KeyRound :size="18" /></span>
        <small>全部密钥</small>
        <strong>{{ loading ? '--' : totalCount }}</strong>
      </div>
      <div class="overview-item">
        <span class="overview-icon success"><ShieldCheck :size="18" /></span>
        <small>正在使用</small>
        <strong>{{ loading ? '--' : activeCount }}</strong>
      </div>
      <div class="overview-item">
        <span class="overview-icon wallet"><WalletCards :size="18" /></span>
        <small>今日消费</small>
        <strong>{{ loading ? '--' : formatCost(todayCost) }}</strong>
      </div>
      <div class="overview-item">
        <span class="overview-icon limit"><Gauge :size="18" /></span>
        <small>本页已设限制</small>
        <strong>{{ loading ? '--' : limitedCount }}</strong>
      </div>
    </section>

    <section class="toolbar" aria-label="筛选工具">
      <label class="search-control">
        <Search :size="16" />
        <input v-model="search" type="search" placeholder="搜索密钥名称或前缀" @input="scheduleSearch" />
      </label>
      <select v-model="groupFilter" class="select-control" aria-label="分组筛选" @change="applyFilter">
        <option value="">全部分组</option>
        <option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option>
      </select>
      <select v-model="statusFilter" class="select-control" aria-label="状态筛选" @change="applyFilter">
        <option value="">全部状态</option>
        <option value="active">正在使用</option>
        <option value="inactive">已停用</option>
        <option value="quota_exhausted">配额用尽</option>
        <option value="expired">已过期</option>
      </select>
      <button class="secondary-button endpoint-button" type="button" :title="apiEndpoint" @click="copyEndpoint">
        <Check v-if="endpointCopied" :size="15" />
        <Globe2 v-else :size="15" />
        <span>{{ endpointCopied ? '已复制' : 'API 地址' }}</span>
      </button>
      <button class="icon-button" type="button" title="刷新密钥" aria-label="刷新密钥" :disabled="loading || refreshing" @click="load(true)">
        <RefreshCw :size="16" :class="{ spinning: refreshing }" />
      </button>
    </section>

    <div v-if="errorMessage" class="error-notice">
      <TriangleAlert :size="16" />
      <span>{{ errorMessage }}</span>
      <button type="button" @click="load()">重新加载</button>
    </div>

    <section class="key-panel" aria-label="API 密钥列表">
      <div class="list-head">
        <span>密钥</span>
        <span>分组与并发</span>
        <span>消费与配额</span>
        <span>生命周期</span>
        <span>操作</span>
      </div>

      <div v-if="loading" class="skeleton-list" aria-label="正在加载 API 密钥">
        <div v-for="index in 4" :key="index" class="skeleton-row">
          <i /><i /><i /><i /><i />
        </div>
      </div>

      <div v-else-if="keys.length" class="key-list">
        <article v-for="(key, index) in keys" :key="key.id" class="key-row" :class="{ expanded: expandedIds.has(key.id), 'group-open': groupPickerKeyId === key.id }" :style="{ '--entry-delay': `${index * 38}ms` }">
          <div class="row-main">
            <div class="identity">
              <span class="key-symbol"><KeyRound :size="19" /></span>
              <div class="name-line">
                <strong :title="key.name">{{ key.name }}</strong>
                <span class="status" :class="statusTone(key.status)"><i />{{ statusLabel(key.status) }}</span>
              </div>
              <div class="secret-line">
                <code>{{ maskKey(key.key) }}</code>
                <button class="copy-button" type="button" :title="copiedKeyId === key.id ? '已复制' : '复制密钥'" @click="copyKey(key)">
                  <Check v-if="copiedKeyId === key.id" :size="14" />
                  <Copy v-else :size="14" />
                </button>
              </div>
            </div>

            <div class="group-cell group-picker">
              <button
                class="group-badge"
                :class="[`platform-${groupPlatform(key)}`, { open: groupPickerKeyId === key.id }]"
                type="button"
                title="快捷切换分组"
                :aria-expanded="groupPickerKeyId === key.id"
                :disabled="groupUpdatingKeyId === key.id"
                @click.stop="toggleGroupPicker(key.id)"
              >
                <span class="provider-mark"><ProviderIcon :provider="groupPlatform(key)" :size="18" /></span>
                <span>{{ groupName(key) }}</span>
                <RefreshCw v-if="groupUpdatingKeyId === key.id" :size="13" class="spinning group-chevron" />
                <ChevronDown v-else :size="13" class="group-chevron" />
              </button>
              <Transition name="group-pop">
                <div v-if="groupPickerKeyId === key.id" class="group-menu" @click.stop>
                  <div class="group-menu-head">
                    <span>快捷选择分组</span>
                    <small>{{ groups.length }} 个可用分组</small>
                  </div>
                  <div class="group-options">
                    <button v-for="group in groups" :key="group.id" type="button" :class="[`platform-${group.platform}`, { selected: key.group_id === group.id }]" @click="changeGroup(key, group.id)">
                      <span class="group-option-icon"><ProviderIcon :provider="group.platform" :size="18" /></span>
                      <span><strong>{{ group.name }}</strong><small>{{ group.description || group.platform }}</small></span>
                      <Check v-if="key.group_id === group.id" :size="15" />
                    </button>
                  </div>
                </div>
              </Transition>
              <div class="group-meta">当前并发 <strong>{{ key.current_concurrency || 0 }}</strong></div>
            </div>

            <div class="usage-cell">
              <div class="usage-values">
                <span>今日<strong>{{ formatCost(keyUsage(key)?.today_actual_cost ?? 0) }}</strong></span>
                <span>累计<strong>{{ formatCost(keyUsage(key)?.total_actual_cost ?? 0) }}</strong></span>
              </div>
              <div v-if="key.quota > 0" class="quota">
                <div class="quota-copy"><span>配额 {{ formatCost(key.quota_used) }} / {{ formatCost(key.quota) }}</span><strong>{{ quotaPercent(key).toFixed(0) }}%</strong></div>
                <div class="quota-track"><i :style="{ width: `${quotaPercent(key)}%` }" /></div>
              </div>
              <div v-else class="unlimited">未设置消费配额 <strong>不限</strong></div>
            </div>

            <div class="lifecycle">
              <div><CalendarClock :size="13" /><span>{{ key.expires_at ? formatTime(key.expires_at) : '永久有效' }}</span></div>
              <div><Globe2 :size="13" /><span>{{ key.last_used_at ? formatTime(key.last_used_at) : '尚未使用' }}</span></div>
            </div>

            <div class="actions">
              <button class="action-button use-action" type="button" title="使用" aria-label="使用密钥配置本地客户端" data-testid="use-api-key" @click="openUseKey(key)">
                <Terminal :size="15" />
              </button>
              <button class="action-button" type="button" :title="expandedIds.has(key.id) ? '收起详情' : '展开详情'" @click="toggleDetails(key.id)">
                <SlidersHorizontal :size="15" />
              </button>
              <button class="action-button" type="button" :title="key.status === 'active' ? '停用' : '启用'" :disabled="busyKeyId === key.id" @click="toggleStatus(key)">
                <RefreshCw v-if="busyKeyId === key.id" :size="15" class="spinning" />
                <CirclePause v-else-if="key.status === 'active'" :size="15" />
                <CirclePlay v-else :size="15" />
              </button>
              <button class="action-button" type="button" title="编辑" @click="openEdit(key)"><Pencil :size="15" /></button>
              <button class="action-button danger" type="button" title="删除" @click="deleteTarget = key"><Trash2 :size="15" /></button>
            </div>
          </div>

          <div v-if="expandedIds.has(key.id)" class="row-detail">
            <div class="detail-block">
              <h3><Gauge :size="14" />周期消费限制</h3>
              <div v-if="rateLimits(key).length" class="rate-list">
                <div v-for="limit in rateLimits(key)" :key="limit.label" class="rate-item">
                  <div><span>{{ limit.label }}</span><strong>{{ formatCost(limit.used) }} / {{ formatCost(limit.limit) }}</strong></div>
                  <i><b :style="{ width: `${ratePercent(limit.used, limit.limit)}%` }" /></i>
                </div>
              </div>
              <p v-else>未设置周期消费限制</p>
            </div>
            <div class="detail-block">
              <h3><ShieldCheck :size="14" />访问控制</h3>
              <div class="security-line"><span>IP 白名单</span><strong>{{ key.ip_whitelist?.length ? `${key.ip_whitelist.length} 条` : '未启用' }}</strong></div>
              <div class="security-line"><span>IP 黑名单</span><strong>{{ key.ip_blacklist?.length ? `${key.ip_blacklist.length} 条` : '未启用' }}</strong></div>
              <div class="security-line"><span>最后使用 IP</span><strong>{{ key.last_used_ip || '--' }}</strong></div>
            </div>
            <div class="detail-block detail-lifecycle">
              <h3><Layers3 :size="14" />密钥信息</h3>
              <div class="security-line"><span>创建时间</span><strong>{{ formatTime(key.created_at) }}</strong></div>
              <div class="security-line"><span>密钥编号</span><strong>#{{ key.id }}</strong></div>
              <button type="button" @click="openEdit(key)">配置限制</button>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <span><KeyRound :size="25" /></span>
        <strong>{{ search || statusFilter || groupFilter ? '没有符合条件的密钥' : '还没有 API 密钥' }}</strong>
        <p>{{ search || statusFilter || groupFilter ? '调整筛选条件后再试一次。' : '创建密钥后即可通过 API 访问服务。' }}</p>
        <button v-if="!search && !statusFilter && !groupFilter" type="button" @click="openCreate"><Plus :size="15" />创建密钥</button>
      </div>

      <footer v-if="!loading && (keys.length || total)" class="pager">
        <span>共 {{ total }} 个密钥</span>
        <div>
          <button type="button" aria-label="上一页" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="14" /></button>
          <span>{{ page }} / {{ pages }}</span>
          <button type="button" aria-label="下一页" :disabled="page >= pages" @click="changePage(page + 1)"><ChevronRight :size="14" /></button>
        </div>
      </footer>
    </section>
  </div>

  <UseApiKeyDialog v-if="useTarget" :api-key="useTarget" :base-url="apiEndpoint" @close="closeUseKey" @applied="showToast('本地客户端配置已更新')" />

  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="dialogOpen" class="dialog-backdrop" @click.self="closeDialog">
        <section class="key-dialog" role="dialog" aria-modal="true" :aria-labelledby="'key-dialog-title'">
          <header class="dialog-head">
            <div>
              <h2 id="key-dialog-title">{{ dialogMode === 'edit' ? '编辑 API 密钥' : '创建 API 密钥' }}</h2>
              <p>基础信息必填，其余限制可按需配置</p>
            </div>
            <button type="button" aria-label="关闭" :disabled="submitting" @click="closeDialog"><X :size="18" /></button>
          </header>

          <form class="dialog-form" @submit.prevent="submitForm">
            <div class="dialog-body">
              <div class="form-grid">
                <label class="field">
                  <span>密钥名称</span>
                  <input v-model="form.name" type="text" maxlength="80" placeholder="例如：Production Gateway" autocomplete="off" />
                </label>
                <label class="field">
                  <span>所属分组</span>
                  <select v-model="form.group_id">
                    <option :value="null" disabled>请选择可用分组</option>
                    <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
                  </select>
                </label>
                <label class="field">
                  <span>消费配额</span>
                  <input v-model.number="form.quota" type="number" min="0" step="0.01" placeholder="0 表示不限" />
                </label>
                <label class="field">
                  <span>有效期</span>
                  <select v-model="form.expiry" @change="handleExpiryChange">
                    <option value="never">永久有效</option>
                    <option value="7d">7 天</option>
                    <option value="30d">30 天</option>
                    <option value="90d">90 天</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                <label v-if="form.expiry === 'custom'" class="field field-full custom-expiry">
                  <span>自定义到期时间</span>
                  <input v-model="form.custom_expiry" type="datetime-local" :min="customExpiryMin" required />
                  <small>按当前设备的本地时间生效，到期后密钥将自动停用</small>
                </label>
              </div>

              <details class="advanced" open>
                <summary><span>周期消费限制</span><small>5 小时、1 天和 7 天窗口</small><ChevronDown :size="16" /></summary>
                <div class="advanced-content rate-fields">
                  <label class="field"><span>5 小时限额</span><input v-model.number="form.rate_limit_5h" type="number" min="0" step="0.01" placeholder="$ 0" /></label>
                  <label class="field"><span>1 天限额</span><input v-model.number="form.rate_limit_1d" type="number" min="0" step="0.01" placeholder="$ 0" /></label>
                  <label class="field"><span>7 天限额</span><input v-model.number="form.rate_limit_7d" type="number" min="0" step="0.01" placeholder="$ 0" /></label>
                </div>
              </details>

              <details class="advanced">
                <summary><span>IP 访问限制</span><small>配置白名单或黑名单</small><ChevronDown :size="16" /></summary>
                <div class="advanced-content ip-fields">
                  <label class="field"><span>IP 白名单</span><textarea v-model="form.ip_whitelist" rows="3" placeholder="每行一个 IP" /></label>
                  <label class="field"><span>IP 黑名单</span><textarea v-model="form.ip_blacklist" rows="3" placeholder="每行一个 IP" /></label>
                </div>
              </details>

              <details v-if="dialogMode === 'create'" class="advanced">
                <summary><span>自定义密钥</span><small>可选，最少 16 位</small><ChevronDown :size="16" /></summary>
                <div class="advanced-content single-field">
                  <label class="field"><span>自定义密钥内容</span><input v-model="form.custom_key" type="text" autocomplete="off" placeholder="字母、数字、下划线或连字符" /></label>
                </div>
              </details>

              <div v-if="formError" class="form-error"><TriangleAlert :size="15" /><span>{{ formError }}</span></div>
            </div>

            <footer class="dialog-foot">
              <button class="secondary-button" type="button" :disabled="submitting" @click="closeDialog">取消</button>
              <button class="primary-button" type="submit" :disabled="submitting">
                <RefreshCw v-if="submitting" :size="16" class="spinning" />
                <Check v-else :size="16" />
                <span>{{ submitting ? '正在保存' : '保存密钥' }}</span>
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>

    <Transition name="dialog-fade">
      <div v-if="deleteTarget" class="dialog-backdrop" @click.self="deleteTarget = null">
        <section class="confirm-dialog" role="alertdialog" aria-modal="true">
          <span class="confirm-icon"><Trash2 :size="20" /></span>
          <div>
            <h2>删除 API 密钥</h2>
            <p>确定删除“{{ deleteTarget.name }}”吗？使用该密钥的应用会立即停止工作。</p>
          </div>
          <footer>
            <button class="secondary-button" type="button" :disabled="deleting" @click="deleteTarget = null">取消</button>
            <button class="danger-button" type="button" :disabled="deleting" @click="removeKey">
              <RefreshCw v-if="deleting" :size="15" class="spinning" />
              <Trash2 v-else :size="15" />
              <span>{{ deleting ? '正在删除' : '确认删除' }}</span>
            </button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="toast-pop">
      <div v-if="toastVisible" class="toast"><Check :size="15" /><span>{{ toastMessage }}</span></div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.keys-page { width: 100%; min-height: 100%; max-width: 1500px; margin: 0 auto; padding: 34px 28px 36px; }
.page-head { display: flex; min-height: 56px; align-items: flex-start; justify-content: space-between; gap: 24px; }
.page-head h1 { font-size: 26px; font-weight: 760; line-height: 1.16; }
.page-head p { margin-top: 7px; color: var(--text-secondary); font-size: 14px; }
.primary-button,.secondary-button,.icon-button,.danger-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; font-size: 14px; font-weight: 700; transition: border-color var(--motion-fast),background var(--motion-fast),color var(--motion-fast),transform var(--motion-fast); }
.primary-button { min-height: 44px; padding: 0 17px; background: var(--accent); border: 1px solid var(--accent); color: white; box-shadow: 0 7px 16px rgba(37,99,235,.16); }
.primary-button:hover:not(:disabled) { background: var(--accent-strong); transform: translateY(-1px); }
.primary-button:active:not(:disabled),.secondary-button:active:not(:disabled),.icon-button:active:not(:disabled) { transform: scale(.98); }
.primary-button:disabled,.secondary-button:disabled,.icon-button:disabled,.danger-button:disabled { opacity: .52; }
.secondary-button { min-height: 44px; padding: 0 14px; background: white; border: 1px solid var(--border-strong); color: var(--text-secondary); }
.secondary-button:hover:not(:disabled),.icon-button:hover:not(:disabled) { border-color: #9bb5dd; color: var(--accent-strong); }
.icon-button { width: 44px; height: 44px; padding: 0; background: white; border: 1px solid var(--border-strong); color: var(--text-secondary); }

.overview { display: grid; min-height: 88px; grid-template-columns: repeat(4,minmax(0,1fr)); margin-top: 22px; background: white; border: 1px solid var(--border-subtle); border-radius: 10px; animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.overview-item { display: grid; min-width: 0; grid-template-columns: 48px minmax(0,1fr); grid-template-rows: 24px 30px; align-content: center; padding: 12px 20px; border-left: 1px solid var(--border-subtle); }
.overview-item:first-child { border-left: 0; }
.overview-icon { display: grid; width: 38px; height: 38px; grid-row: 1 / 3; align-self: center; background: var(--accent-soft); border-radius: 8px; color: var(--accent-strong); place-items: center; }
.overview-icon.success { background: var(--success-soft); color: var(--success); }
.overview-icon.wallet { background: #e8f5f7; color: var(--cyan); }
.overview-icon.limit { background: var(--warning-soft); color: var(--warning); }
.overview-item small { align-self: end; color: var(--text-tertiary); font-size: 13px; }
.overview-item strong { align-self: start; margin-top: 1px; overflow: hidden; font-size: 19px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }

.toolbar { display: flex; align-items: center; gap: 9px; margin-top: 14px; }
.search-control { position: relative; flex: 1; min-width: 220px; }
.search-control svg { position: absolute; top: 50%; left: 13px; color: var(--text-tertiary); transform: translateY(-50%); }
.search-control input,.select-control { width: 100%; height: 44px; background: white; border: 1px solid var(--border-strong); border-radius: 8px; outline: 0; color: var(--text-primary); font-size: 14px; }
.search-control input { padding: 0 13px 0 39px; }
.search-control input:focus,.select-control:focus { border-color: #8db0ee; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.search-control input::placeholder { color: #94a0b0; }
.select-control { width: 132px; padding: 0 30px 0 11px; }
.endpoint-button { white-space: nowrap; }
.error-notice { display: flex; min-height: 42px; align-items: center; gap: 9px; margin-top: 12px; padding: 0 13px; background: var(--coral-soft); border: 1px solid var(--coral-border); border-radius: 8px; color: var(--danger); font-size: 14px; }
.error-notice span { flex: 1; }
.error-notice button { padding: 0; background: none; border: 0; color: inherit; font-weight: 700; }

.key-panel { margin-top: 14px; overflow: visible; background: white; border: 1px solid var(--border-subtle); border-radius: 10px; animation: linai-surface-enter var(--motion-reveal) var(--motion-ease-out) both; }
.list-head,.row-main { display: grid; grid-template-columns: minmax(260px,1.45fr) minmax(150px,.78fr) minmax(190px,1fr) minmax(165px,.85fr) 164px; align-items: center; gap: 14px; }
.list-head { min-height: 44px; padding: 0 20px; background: #f8fafc; border-bottom: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 13px; }
.list-head span:last-child { text-align: right; }
.key-row { border-bottom: 1px solid var(--border-subtle); animation: key-row-enter 420ms var(--motion-ease-out) var(--entry-delay,0ms) both; }
.key-row.group-open { position: relative; z-index: 30; }
.key-row:last-child { border-bottom: 0; }
.row-main { min-height: 104px; padding: 14px 20px; transition: background var(--motion-fast); }
.key-row:hover .row-main { background: #fbfcfe; }
.identity { display: grid; min-width: 0; grid-template-columns: 46px minmax(0,1fr); grid-template-rows: 27px 30px; column-gap: 12px; align-content: center; }
.key-symbol { display: grid; width: 42px; height: 42px; grid-row: 1 / 3; align-self: center; background: var(--accent-soft); border-radius: 9px; color: var(--accent-strong); place-items: center; }
.name-line,.secret-line { display: flex; min-width: 0; align-items: center; gap: 7px; }
.name-line strong { overflow: hidden; font-size: 15px; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 5px; padding: 3px 7px; background: #edf0f4; border-radius: 999px; color: #6f7d90; font-size: 12px; font-weight: 700; }
.status i { width: 5px; height: 5px; background: currentColor; border-radius: 50%; }
.status.active { background: var(--success-soft); color: var(--success); }
.status.warning { background: var(--warning-soft); color: var(--warning); }
.status.expired { background: var(--coral-soft); color: var(--coral); }
.secret-line code { overflow: hidden; color: var(--text-secondary); font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.copy-button { display: grid; width: 24px; height: 24px; flex: 0 0 auto; padding: 0; background: transparent; border: 0; border-radius: 5px; color: var(--text-tertiary); place-items: center; }
.copy-button:hover { background: var(--accent-soft); color: var(--accent-strong); }
.group-cell,.usage-cell,.lifecycle { min-width: 0; }
.group-cell { position: relative; }
.group-badge { --platform-bg:#f1f4f8; --platform-fg:#49586d; --platform-border:#dce3eb; display: inline-flex; min-height: 32px; max-width: 100%; align-items: center; gap: 7px; padding: 4px 8px; background: var(--platform-bg); border: 1px solid transparent; border-radius: 7px; color: var(--platform-fg); font-size: 13px; font-weight: 650; text-align: left; transition: background var(--motion-fast),border-color var(--motion-fast),box-shadow var(--motion-fast); }
.group-badge:hover:not(:disabled),.group-badge.open { background: var(--platform-bg); border-color: var(--platform-border); box-shadow: 0 2px 7px color-mix(in srgb,var(--platform-fg) 12%,transparent); color: var(--platform-fg); }
.group-badge > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-mark { display: grid; width: 20px; height: 20px; flex: 0 0 auto; place-items: center; }
.group-chevron { flex: 0 0 auto; margin-left: 1px; color: var(--text-tertiary); transition: transform var(--motion-fast); }
.group-badge.open .group-chevron { transform: rotate(180deg); }
.group-menu { position: absolute; z-index: 40; top: 39px; left: 0; width: min(304px,calc(100vw - 330px)); padding: 7px; overflow: hidden; background: rgba(250,252,255,.97); border: 1px solid rgba(197,211,230,.94); border-radius: 9px; box-shadow: 0 18px 42px rgba(31,51,78,.18),0 3px 10px rgba(31,51,78,.07); backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2); }
.group-menu-head { display: flex; min-height: 38px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 9px; color: var(--text-secondary); font-size: 13px; font-weight: 700; }
.group-menu-head small { color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
.group-options { display: grid; max-height: 265px; gap: 2px; overflow-y: auto; }
.group-options > button { --platform-bg:#f1f4f8; --platform-fg:#49586d; --platform-border:#dce3eb; display: grid; width: 100%; min-height: 52px; grid-template-columns: 34px minmax(0,1fr) 18px; align-items: center; gap: 9px; padding: 6px 9px; background: transparent; border: 1px solid transparent; border-radius: 7px; color: var(--text-secondary); text-align: left; }
.group-options > button:hover { background: white; border-color: var(--border-subtle); color: var(--text-primary); }
.group-options > button.selected { background: #edf9f6; border-color: #d0ece5; color: #137960; }
.group-option-icon { display: grid; width: 32px; height: 32px; background: var(--platform-bg); border: 1px solid var(--platform-border); border-radius: 7px; color: var(--platform-fg); place-items: center; }
.group-options > button > span:nth-child(2) { min-width: 0; }
.group-options strong,.group-options small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-options strong { width: max-content; max-width: 100%; padding: 2px 7px; background: var(--platform-bg); border-radius: 6px; color: var(--platform-fg); font-size: 13px; font-weight: 700; }
.group-options small { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
.group-options > button > svg { justify-self: end; color: #0d9274; }
.platform-anthropic { --platform-bg:#fffbeb; --platform-fg:#b45309; --platform-border:#f5dfb8; }
.platform-openai { --platform-bg:#f0fdf4; --platform-fg:#15803d; --platform-border:#ccebd7; }
.platform-gemini { --platform-bg:#f0f9ff; --platform-fg:#0369a1; --platform-border:#cce7f6; }
.platform-antigravity { --platform-bg:#fdf4ff; --platform-fg:#a21caf; --platform-border:#eed5f1; }
.platform-grok { --platform-bg:#f4f4f5; --platform-fg:#3f3f46; --platform-border:#dcdee2; }
.platform-composite { --platform-bg:#ecfeff; --platform-fg:#0e7490; --platform-border:#c7edf1; }
.group-meta { margin-top: 7px; color: var(--text-tertiary); font-size: 12px; }
.group-meta strong { color: var(--text-primary); font-size: 14px; }
.usage-values { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.usage-values span { display: block; color: var(--text-tertiary); font-size: 12px; }
.usage-values strong { display: block; margin-top: 3px; color: var(--text-primary); font-size: 15px; }
.quota { margin-top: 7px; }
.quota-copy { display: flex; justify-content: space-between; gap: 8px; color: var(--text-tertiary); font-size: 12px; }
.quota-copy strong { color: var(--text-secondary); }
.quota-track { height: 3px; margin-top: 5px; overflow: hidden; background: #e7ecf2; border-radius: 2px; }
.quota-track i { display: block; height: 100%; background: var(--accent); border-radius: inherit; transition: width 480ms var(--motion-ease-out); }
.unlimited { display: flex; justify-content: space-between; margin-top: 8px; color: var(--text-tertiary); font-size: 12px; }
.unlimited strong { color: var(--text-secondary); }
.lifecycle div { display: flex; min-width: 0; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 13px; }
.lifecycle div + div { margin-top: 7px; color: var(--text-tertiary); }
.lifecycle svg { flex: 0 0 auto; }
.lifecycle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; justify-content: flex-end; gap: 3px; }
.action-button { display: grid; width: 34px; height: 34px; padding: 0; background: transparent; border: 1px solid transparent; border-radius: 7px; color: var(--text-secondary); place-items: center; }
.action-button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent-strong); }
.action-button.use-action { color: var(--accent-strong); }
.action-button.use-action:hover:not(:disabled) { border-color: #c6d8f4; background: #edf4ff; }
.action-button.danger:hover:not(:disabled) { background: var(--coral-soft); color: var(--coral); }
.action-button:disabled { opacity: .55; }
.row-detail { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 24px; padding: 15px 72px 18px; background: #f8fafc; border-top: 1px solid var(--border-subtle); animation: detail-in 220ms ease both; }
.detail-block h3 { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
.detail-block > p { color: var(--text-tertiary); font-size: 12px; }
.rate-list { display: grid; gap: 8px; }
.rate-item > div { display: flex; justify-content: space-between; gap: 12px; color: var(--text-tertiary); font-size: 12px; }
.rate-item strong { color: var(--text-secondary); }
.rate-item > i { display: block; height: 3px; margin-top: 4px; overflow: hidden; background: #e3e9f1; border-radius: 2px; }
.rate-item b { display: block; height: 100%; background: var(--success); border-radius: inherit; }
.security-line { display: flex; min-height: 25px; align-items: center; justify-content: space-between; gap: 10px; color: var(--text-tertiary); font-size: 12px; }
.security-line strong { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.detail-lifecycle button { float: right; height: 30px; margin-top: 5px; padding: 0 10px; background: white; border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.detail-lifecycle button:hover { border-color: #9bb5dd; color: var(--accent-strong); }
.pager { display: flex; min-height: 46px; align-items: center; justify-content: space-between; padding: 0 18px; background: #fbfcfe; border-top: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 12px; }
.pager > div { display: flex; align-items: center; gap: 8px; }
.pager button { display: grid; width: 28px; height: 28px; padding: 0; background: white; border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-secondary); place-items: center; }
.pager button:disabled { opacity: .4; }
.empty-state { display: grid; min-height: 310px; place-items: center; align-content: center; gap: 8px; color: var(--text-tertiary); text-align: center; }
.empty-state > span { display: grid; width: 48px; height: 48px; background: var(--accent-soft); border-radius: 10px; color: var(--accent-strong); place-items: center; }
.empty-state strong { margin-top: 4px; color: var(--text-primary); font-size: 14px; }
.empty-state p { font-size: 13px; }
.empty-state button { display: inline-flex; height: 34px; align-items: center; gap: 6px; margin-top: 4px; padding: 0 11px; background: var(--accent); border: 0; border-radius: 7px; color: white; font-size: 13px; font-weight: 700; }

.skeleton-list { overflow: hidden; }
.skeleton-row { display: grid; min-height: 104px; grid-template-columns: 1.45fr .78fr 1fr .85fr 164px; align-items: center; gap: 28px; padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); }
.skeleton-row i { display: block; height: 12px; background: linear-gradient(90deg,#e8edf4 20%,#f6f8fb 45%,#e8edf4 70%); background-size: 240% 100%; border-radius: 5px; animation: linai-skeleton-shimmer 1.25s linear infinite; }
.skeleton-row i:first-child { height: 40px; }
.skeleton-row i:last-child { justify-self: end; width: 110px; }

.dialog-backdrop { position: fixed; z-index: 100; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(27,41,60,.27); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
.key-dialog { width: min(700px,100%); max-height: min(840px,calc(100vh - 48px)); overflow: hidden; background: rgba(255,255,255,.97); border: 1px solid rgba(255,255,255,.9); border-radius: 12px; box-shadow: 0 28px 72px rgba(27,41,60,.24); }
.dialog-head { display: flex; min-height: 74px; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--border-subtle); }
.dialog-head h2 { font-size: 18px; font-weight: 740; }
.dialog-head p { margin-top: 4px; color: var(--text-tertiary); font-size: 13px; }
.dialog-head > button { display: grid; width: 32px; height: 32px; padding: 0; background: var(--bg-surface-hover); border: 0; border-radius: 7px; color: var(--text-secondary); place-items: center; }
.dialog-form { display: flex; max-height: calc(min(840px,100vh - 48px) - 74px); flex-direction: column; }
.dialog-body { padding: 22px 24px; overflow-y: auto; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: grid; gap: 7px; color: var(--text-secondary); font-size: 13px; font-weight: 680; }
.field-full { grid-column: 1 / -1; }
.field input,.field select,.field textarea { width: 100%; background: var(--bg-surface-hover); border: 1px solid var(--border-subtle); border-radius: 8px; outline: 0; color: var(--text-primary); font-size: 14px; font-weight: 500; }
.field input,.field select { height: 44px; padding: 0 12px; }
.field textarea { min-height: 78px; padding: 10px 11px; resize: vertical; }
.field input:focus,.field select:focus,.field textarea:focus { border-color: #8db0ee; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.field input::placeholder,.field textarea::placeholder { color: #98a5b5; }
.field small { color: var(--text-tertiary); font-size: 12px; font-weight: 500; line-height: 1.5; }
.custom-expiry { padding: 12px; background: #f7faff; border: 1px solid #d9e6f8; border-radius: 9px; animation: detail-in 200ms ease both; }
.advanced { margin-top: 16px; border: 1px solid var(--border-subtle); border-radius: 9px; }
.advanced summary { display: grid; min-height: 50px; grid-template-columns: auto 1fr 16px; align-items: center; gap: 8px; padding: 0 14px; color: var(--text-primary); font-size: 14px; font-weight: 700; cursor: pointer; list-style: none; }
.advanced summary::-webkit-details-marker { display: none; }
.advanced summary small { justify-self: end; color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
.advanced summary svg { color: var(--text-tertiary); transition: transform var(--motion-fast); }
.advanced[open] summary svg { transform: rotate(180deg); }
.advanced-content { display: grid; gap: 11px; padding: 0 13px 14px; }
.rate-fields { grid-template-columns: repeat(3,1fr); }
.ip-fields { grid-template-columns: 1fr 1fr; }
.single-field { grid-template-columns: 1fr; }
.form-error { display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; padding: 10px 11px; background: var(--coral-soft); border: 1px solid var(--coral-border); border-radius: 8px; color: var(--danger); font-size: 13px; }
.form-error svg { flex: 0 0 auto; margin-top: 1px; }
.dialog-foot { display: flex; min-height: 72px; flex: 0 0 auto; align-items: center; justify-content: flex-end; gap: 9px; padding: 0 24px; background: rgba(255,255,255,.96); border-top: 1px solid var(--border-subtle); }

.confirm-dialog { display: grid; width: min(420px,100%); grid-template-columns: 44px 1fr; gap: 14px; padding: 22px; background: rgba(255,255,255,.98); border: 1px solid white; border-radius: 12px; box-shadow: 0 28px 72px rgba(27,41,60,.24); }
.confirm-icon { display: grid; width: 42px; height: 42px; background: var(--coral-soft); border-radius: 9px; color: var(--coral); place-items: center; }
.confirm-dialog h2 { font-size: 16px; font-weight: 740; }
.confirm-dialog p { margin-top: 7px; color: var(--text-secondary); font-size: 14px; line-height: 1.6; }
.confirm-dialog footer { display: flex; grid-column: 1 / -1; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.danger-button { min-height: 44px; padding: 0 15px; background: var(--coral); border: 1px solid var(--coral); color: white; }
.danger-button:hover:not(:disabled) { background: var(--danger); }
.toast { position: fixed; z-index: 130; right: 28px; bottom: 28px; display: flex; align-items: center; gap: 8px; padding: 10px 13px; background: #18334f; border-radius: 8px; box-shadow: 0 12px 30px rgba(23,43,68,.22); color: white; font-size: 13px; }
.toast svg { color: #7fe3bd; }

.dialog-fade-enter-active,.dialog-fade-leave-active { transition: opacity 180ms ease; }
.dialog-fade-enter-active .key-dialog,.dialog-fade-enter-active .confirm-dialog { animation: dialog-in 240ms var(--motion-ease-out) both; }
.dialog-fade-enter-from,.dialog-fade-leave-to { opacity: 0; }
.toast-pop-enter-active,.toast-pop-leave-active { transition: opacity 180ms ease,transform 180ms ease; }
.toast-pop-enter-from,.toast-pop-leave-to { opacity: 0; transform: translateY(7px); }
.group-pop-enter-active,.group-pop-leave-active { transition: opacity 150ms ease,transform 150ms ease; transform-origin: top left; }
.group-pop-enter-from,.group-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(.985); }
.is-refreshing .key-list { opacity: .72; transition: opacity var(--motion-fast); }
.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes detail-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dialog-in { from { opacity: 0; transform: translateY(9px) scale(.988); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes key-row-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

@container app-content (max-width: 1050px) {
  .list-head,.row-main { grid-template-columns: minmax(245px,1.35fr) minmax(145px,.8fr) minmax(180px,1fr) 154px; }
  .list-head span:nth-child(4),.row-main > .lifecycle { display: none; }
  .skeleton-row { grid-template-columns: 1.35fr .8fr 1fr 154px; }
  .skeleton-row i:nth-child(4) { display: none; }
  .overview-item { padding-right: 14px; padding-left: 14px; }
  .row-main,.list-head { padding-right: 16px; padding-left: 16px; }
}

@container app-content (max-width: 860px) {
  .keys-page { padding-right: 22px; padding-left: 22px; }
  .list-head,.row-main { grid-template-columns: minmax(205px,1.35fr) minmax(110px,.8fr) minmax(135px,1fr) 108px; gap: 6px; padding-right: 14px; padding-left: 14px; }
  .row-main { min-height: 118px; }
  .actions { width: 108px; flex-wrap: wrap; align-content: center; justify-self: end; gap: 2px; }
  .skeleton-row { min-height: 118px; grid-template-columns: 1.35fr .8fr 1fr 108px; gap: 12px; padding-right: 14px; padding-left: 14px; }
  .skeleton-row i:last-child { width: 106px; height: 70px; }
}

@container app-content (max-width: 720px) {
  .keys-page { padding-right: 16px; padding-left: 16px; }
  .page-head { align-items: center; }
  .page-head p { max-width: 420px; }
  .overview { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .overview-item:nth-child(3) { border-left: 0; }
  .overview-item:nth-child(n+3) { border-top: 1px solid var(--border-subtle); }
  .toolbar { flex-wrap: wrap; }
  .search-control { flex-basis: calc(100% - 53px); }
  .select-control { flex: 1 1 140px; }
  .endpoint-button { flex: 1 1 auto; }
  .list-head { display: none; }
  .row-main { min-height: 0; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; padding: 18px; }
  .identity { grid-column: 1 / -1; }
  .actions { width: auto; grid-column: 1 / -1; flex-wrap: nowrap; justify-content: flex-start; justify-self: stretch; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
  .row-detail { grid-template-columns: 1fr; gap: 16px; padding: 16px 18px 20px; }
  .skeleton-row { grid-template-columns: 1fr 1fr; padding: 18px; }
  .skeleton-row i:first-child,.skeleton-row i:last-child { grid-column: 1 / -1; width: 100%; }
  .group-menu { width: min(304px,calc(100cqw - 64px)); }
  .form-grid,.rate-fields,.ip-fields { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .overview,.key-panel,.key-row,.row-detail,.custom-expiry,.spinning,.dialog-fade-enter-active .key-dialog,.dialog-fade-enter-active .confirm-dialog,.skeleton-row i { animation: none; }
  .group-pop-enter-active,.group-pop-leave-active { transition: none; }
  .quota-track i,.is-refreshing .key-list { transition: none; }
}
</style>
