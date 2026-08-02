<script setup lang="ts">
import { AlertCircle, Check, Filter, Pencil, Plus, Power, Search } from '@lucide/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'

import {
  createAdminGroup,
  listAdminGroups,
  updateAdminGroup,
  updateAdminGroupStatus,
} from '@/api/admin/groups'
import type {
  AdminGroup,
  AdminGroupListParams,
  AdminGroupListResponse,
  AdminGroupPlatform,
  CreateAdminGroupRequest,
} from '@/api/admin/types'
import GroupEditorDialog from '@/components/admin/GroupEditorDialog.vue'
import MobileBottomSheet from '@/mobile/components/MobileBottomSheet.vue'
import MobilePage from '@/mobile/components/MobilePage.vue'
import MobilePagination from '@/mobile/components/MobilePagination.vue'

const PAGE_SIZE = 20
const platformLabels: Record<AdminGroupPlatform, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  composite: '聚合平台',
}

const result = ref<AdminGroupListResponse>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE })
const loaded = ref(false)
const initialLoading = ref(true)
const listLoading = ref(false)
const fatalError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const searchDraft = ref('')
const search = ref('')
const platform = ref<'' | AdminGroupPlatform>('')
const status = ref<'' | AdminGroup['status']>('')
const draftPlatform = ref<'' | AdminGroupPlatform>('')
const draftStatus = ref<'' | AdminGroup['status']>('')
const filterSheetOpen = ref(false)
const editorOpen = ref(false)
const editingGroup = ref<AdminGroup | null>(null)
const saving = ref(false)
const savingGroupId = ref<number | null>(null)
const editorError = ref('')
const statusTarget = ref<AdminGroup | null>(null)
const statusDialog = ref<HTMLElement | null>(null)
const pendingByGroup = reactive<Record<number, string>>({})
let mounted = false
let loadGeneration = 0
let feedbackGeneration = 0
let statusPreviousFocus: HTMLElement | null = null

const pageCount = computed(() => Math.max(1, Math.ceil(safeNumber(result.value.total) / PAGE_SIZE)))
const busy = computed(() => initialLoading.value || listLoading.value || saving.value || Object.keys(pendingByGroup).length > 0)
const activeFilterCount = computed(() => Number(Boolean(platform.value)) + Number(Boolean(status.value)))

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function safeInteger(value: unknown) {
  return Math.round(safeNumber(value))
}

function safeName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '未命名分组'
}

function safeMultiplier(value: unknown) {
  const parsed = Number(value)
  return `${Number.isFinite(parsed) && parsed >= 0 ? parsed : 1}x`
}

function safeRpm(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed).toLocaleString() : '不限'
}

function safeQuota(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? `$${parsed.toFixed(2)}` : '不限'
}

function listParams(page: number): AdminGroupListParams {
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

async function loadGroups(
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
    const response = await listAdminGroups(listParams(requestedPage))
    if (!mounted || generation !== loadGeneration) return
    const total = safeNumber(response.total)
    const availablePages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (requestedPage > availablePages) {
      await loadGroups(availablePages, true, feedbackToken, reportFailure)
      return
    }
    result.value = {
      items: Array.isArray(response.items) ? response.items : [],
      total,
      page: requestedPage,
      page_size: PAGE_SIZE,
    }
    loaded.value = true
  } catch {
    if (!mounted || generation !== loadGeneration) return
    if (!loaded.value) fatalError.value = '分组列表加载失败，请检查网络后重试。'
    else if (reportFailure && (feedbackToken === undefined || ownsFeedback(feedbackToken))) {
      actionMessage.value = ''
      actionError.value = '分组列表刷新失败，已保留当前数据。'
    }
  } finally {
    if (mounted && generation === loadGeneration) {
      initialLoading.value = false
      listLoading.value = false
    }
  }
}

function requestGroupsLoad(targetPage: number, background: boolean) {
  const feedbackToken = claimFeedback()
  void loadGroups(targetPage, background, feedbackToken, true)
}

function retryGroups() {
  requestGroupsLoad(1, false)
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  requestGroupsLoad(1, loaded.value)
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
  requestGroupsLoad(1, loaded.value)
}

function resetFilters() {
  draftPlatform.value = ''
  draftStatus.value = ''
  platform.value = ''
  status.value = ''
  filterSheetOpen.value = false
  requestGroupsLoad(1, loaded.value)
}

function openCreate() {
  editingGroup.value = null
  editorError.value = ''
  editorOpen.value = true
}

function openEdit(group: AdminGroup) {
  editingGroup.value = group
  editorError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editingGroup.value = null
  editorError.value = ''
}

async function saveGroup(payload: CreateAdminGroupRequest) {
  if (saving.value) return
  const feedbackToken = claimFeedback()
  const target = editingGroup.value
  saving.value = true
  savingGroupId.value = target?.id ?? null
  if (target) pendingByGroup[target.id] = 'save'
  editorError.value = ''
  try {
    if (target) {
      await updateAdminGroup(target.id, payload)
      if (ownsFeedback(feedbackToken)) actionMessage.value = `已更新分组“${safeName(payload.name)}”`
    } else {
      await createAdminGroup(payload)
      if (ownsFeedback(feedbackToken)) actionMessage.value = `已创建分组“${safeName(payload.name)}”`
    }
    if (!mounted) return
    editorOpen.value = false
    editingGroup.value = null
    await loadGroups(result.value.page, true, feedbackToken, false)
  } catch {
    if (mounted) editorError.value = '分组保存失败，请稍后重试。'
  } finally {
    if (mounted) {
      if (target) delete pendingByGroup[target.id]
      saving.value = false
      savingGroupId.value = null
    }
  }
}

function requestStatusChange(group: AdminGroup) {
  if (pendingByGroup[group.id]) return
  statusPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  statusTarget.value = group
  void focusStatusDialog()
}

function statusFocusableElements() {
  if (!statusDialog.value) return []
  return Array.from(statusDialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

async function focusStatusDialog() {
  await nextTick()
  statusFocusableElements()[0]?.focus()
}

function restoreStatusFocus() {
  const target = statusPreviousFocus
  statusPreviousFocus = null
  if (target) {
    void nextTick(() => {
      if (target.isConnected) target.focus()
    })
  }
}

function closeStatusDialog() {
  const group = statusTarget.value
  if (group && pendingByGroup[group.id]) return
  statusTarget.value = null
  restoreStatusFocus()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  const group = statusTarget.value
  if (!group || !statusDialog.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeStatusDialog()
    return
  }
  if (event.key !== 'Tab') return
  const elements = statusFocusableElements()
  const first = elements[0]
  const last = elements[elements.length - 1]
  const active = document.activeElement
  const outside = !statusDialog.value.contains(active)
  if (!first || !last) {
    event.preventDefault()
    statusDialog.value.focus()
  } else if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

async function confirmStatusChange() {
  const group = statusTarget.value
  if (!group || pendingByGroup[group.id]) return
  const feedbackToken = claimFeedback()
  const nextStatus: AdminGroup['status'] = group.status === 'active' ? 'inactive' : 'active'
  pendingByGroup[group.id] = 'status'
  try {
    await updateAdminGroupStatus(group.id, nextStatus)
    if (!mounted) return
    result.value = {
      ...result.value,
      items: result.value.items.map((item) => item.id === group.id ? { ...item, status: nextStatus } : item),
    }
    if (ownsFeedback(feedbackToken)) actionMessage.value = `已${nextStatus === 'active' ? '启用' : '停用'}分组“${safeName(group.name)}”`
    await loadGroups(result.value.page, true, feedbackToken, false)
  } catch {
    if (ownsFeedback(feedbackToken)) {
      actionMessage.value = ''
      actionError.value = '操作失败，请稍后重试。当前分组列表未更改。'
    }
  } finally {
    if (mounted) {
      delete pendingByGroup[group.id]
      closeStatusDialog()
    }
  }
}

function changePage(page: number) {
  if (busy.value || page < 1 || page > pageCount.value || page === result.value.page) return
  requestGroupsLoad(page, true)
}

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleDocumentKeydown)
  void loadGroups(1, false)
})

onUnmounted(() => {
  mounted = false
  loadGeneration += 1
  restoreStatusFocus()
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <MobilePage
    title="分组管理"
    subtitle="计费、额度与账号健康"
    :loading="initialLoading && !loaded"
    :error="fatalError"
    :empty="loaded && !result.items.length"
    :aria-busy="busy"
    loading-label="正在加载分组"
    empty-title="暂无分组"
    empty-message="当前筛选范围内没有分组。"
    @retry="retryGroups"
    @refresh="retryGroups"
  >
    <template #action>
      <button class="create-button" type="button" data-testid="create-group" @click="openCreate"><Plus :size="18" />新增</button>
    </template>

    <div class="groups-content">
      <form class="search-row" data-testid="group-search-form" @submit.prevent="submitSearch">
        <label><Search :size="17" /><input v-model="searchDraft" data-testid="group-search" autocomplete="off" placeholder="搜索分组" /></label>
        <button type="submit" :disabled="listLoading">搜索</button>
        <button class="filter-button" type="button" data-testid="group-filter-trigger" @click="openFilters"><Filter :size="17" /><span v-if="activeFilterCount">{{ activeFilterCount }}</span></button>
      </form>

      <p v-if="actionMessage" class="action-message" data-testid="group-action-message" role="status"><Check :size="17" />{{ actionMessage }}</p>
      <p v-if="actionError" class="action-error" data-testid="group-action-error" role="alert"><AlertCircle :size="17" />{{ actionError }}</p>
      <div v-if="listLoading" class="list-busy" role="status">正在刷新分组</div>

      <section class="group-list" aria-label="分组列表">
        <article v-for="group in result.items" :key="group.id" class="group-card" data-testid="mobile-group-card">
          <header>
            <div class="identity"><strong>{{ safeName(group.name) }}</strong><span>{{ platformLabels[group.platform] ?? '未知平台' }} · {{ group.subscription_type === 'subscription' ? '订阅额度' : '余额消费' }}</span></div>
            <span class="status" :class="group.status">{{ group.status === 'active' ? '运行中' : '已停用' }}</span>
          </header>
          <div class="metric-strip">
            <div><span>计费倍率</span><strong>{{ safeMultiplier(group.rate_multiplier) }}</strong></div>
            <div><span>每用户 RPM</span><strong>{{ safeRpm(group.rpm_limit) }}</strong></div>
          </div>
          <div class="quota-summary" :data-testid="`group-quota-${group.id}`"><span>日 / 周 / 月额度</span><strong>{{ safeQuota(group.daily_limit_usd) }} / {{ safeQuota(group.weekly_limit_usd) }} / {{ safeQuota(group.monthly_limit_usd) }}</strong></div>
          <div class="health-summary" :data-testid="`group-health-${group.id}`"><span>健康账号</span><strong>{{ safeInteger(group.active_account_count) }} / {{ safeInteger(group.account_count) }}</strong><em v-if="safeInteger(group.rate_limited_account_count)">{{ safeInteger(group.rate_limited_account_count) }} 个限流</em></div>
          <footer>
            <button class="edit-button" type="button" :data-testid="`edit-group-${group.id}`" :disabled="Boolean(pendingByGroup[group.id])" @click="openEdit(group)"><Pencil :size="17" />编辑分组</button>
            <button class="status-button" type="button" :data-testid="`toggle-group-${group.id}`" :disabled="Boolean(pendingByGroup[group.id])" @click="requestStatusChange(group)"><Power :size="17" />{{ group.status === 'active' ? '停用' : '启用' }}</button>
          </footer>
        </article>
      </section>

      <MobilePagination v-if="result.total > PAGE_SIZE" :page="result.page" :page-count="pageCount" @change="changePage" />
    </div>

    <MobileBottomSheet v-model="filterSheetOpen" title="分组筛选">
      <div class="filter-fields">
        <label><span>平台</span><select v-model="draftPlatform" data-testid="group-platform-filter"><option value="">全部平台</option><option v-for="(label, value) in platformLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <label><span>状态</span><select v-model="draftStatus" data-testid="group-status-filter"><option value="">全部状态</option><option value="active">运行中</option><option value="inactive">已停用</option></select></label>
      </div>
      <template #footer><button class="sheet-secondary" type="button" @click="resetFilters">重置</button><button class="sheet-primary" type="button" data-testid="group-filter-apply" @click="applyFilters">应用</button></template>
    </MobileBottomSheet>

    <GroupEditorDialog :model-value="editorOpen" :group="editingGroup" :pending="saving" :error="editorError" mobile @close="closeEditor" @save="saveGroup" />

    <div v-if="statusTarget" class="confirm-backdrop" @mousedown.self="closeStatusDialog">
      <section ref="statusDialog" class="status-dialog" data-testid="group-status-dialog" role="dialog" aria-modal="true" aria-label="确认分组状态" tabindex="-1">
        <h2>{{ statusTarget.status === 'active' ? '停用分组' : '启用分组' }}</h2>
        <p>确认{{ statusTarget.status === 'active' ? '停用' : '启用' }}“{{ safeName(statusTarget.name) }}”？</p>
        <footer><button type="button" data-testid="cancel-group-status" :disabled="Boolean(pendingByGroup[statusTarget.id])" @click="closeStatusDialog">取消</button><button class="primary" type="button" data-testid="confirm-group-status" :disabled="Boolean(pendingByGroup[statusTarget.id])" @click="confirmStatusChange">确认</button></footer>
      </section>
    </div>
  </MobilePage>
</template>

<style scoped>
.create-button{display:flex;min-height:44px;align-items:center;justify-content:center;gap:6px;padding:0 13px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.groups-content{display:grid;min-width:0;gap:14px}.search-row{display:grid;grid-template-columns:minmax(0,1fr) auto 44px;gap:8px}.search-row label{display:flex;min-width:0;min-height:44px;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-tertiary)}.search-row input{min-width:0;width:100%;border:0;background:transparent;color:var(--text-primary);font:inherit;outline:0}.search-row>button[type=submit]{min-height:44px;padding:0 14px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:#fff;font:inherit}.filter-button{position:relative;display:grid;width:44px;min-height:44px;padding:0;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);place-items:center}.filter-button span{position:absolute;top:-5px;right:-5px;display:grid;min-width:18px;height:18px;border-radius:9px;background:#bd4d40;color:#fff;font-size:10px;place-items:center}.action-message,.action-error{display:flex;min-width:0;align-items:flex-start;gap:8px;margin:0;padding:10px 11px;border-radius:6px;font-size:13px;line-height:1.45}.action-message{border:1px solid #cce6d8;background:#eef9f3;color:#287154}.action-error{border:1px solid #eccfc9;background:#fff5f2;color:#9e493c}.list-busy{padding:7px 10px;border-radius:5px;background:var(--bg-base);color:var(--text-secondary);font-size:12px}.group-list{display:grid;gap:10px}.group-card{display:grid;min-width:0;gap:13px;padding:14px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 4px 14px rgba(29,44,65,.04)}.group-card>header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px}.identity{display:grid;min-width:0;gap:4px}.identity strong,.identity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity strong{font-size:15px}.identity span{color:var(--text-tertiary);font-size:11px}.status{padding:4px 7px;border-radius:5px;background:#f0f2f5;color:#687282;font-size:11px}.status.active{background:#eaf7f0;color:#287755}.metric-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden;border:1px solid var(--border-subtle);border-radius:6px}.metric-strip>div{display:grid;min-width:0;gap:4px;padding:10px 11px}.metric-strip>div+div{border-left:1px solid var(--border-subtle)}.metric-strip span,.quota-summary span,.health-summary span{color:var(--text-tertiary);font-size:10px}.metric-strip strong{overflow:hidden;font-family:var(--font-data);font-size:15px;text-overflow:ellipsis;white-space:nowrap}.quota-summary,.health-summary{display:grid;min-width:0;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px 10px}.quota-summary strong,.health-summary strong{overflow:hidden;font-family:var(--font-data);font-size:12px;text-align:right;text-overflow:ellipsis;white-space:nowrap}.health-summary em{grid-column:1/-1;color:#a0632f;font-size:10px;font-style:normal;text-align:right}.group-card>footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(92px,.45fr);gap:8px}.group-card>footer button{display:flex;min-width:0;min-height:44px;align-items:center;justify-content:center;gap:7px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit;font-size:13px}.group-card>footer button:disabled{opacity:.5}.edit-button{border-color:var(--accent)!important;color:var(--accent)!important}.status-button{color:var(--text-secondary)!important}.filter-fields{display:grid;gap:14px}.filter-fields label{display:grid;gap:6px}.filter-fields span{color:var(--text-secondary);font-size:12px}.filter-fields select{width:100%;min-height:44px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-secondary,.sheet-primary{min-height:44px;padding:0 16px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.sheet-primary{border-color:var(--accent);background:var(--accent);color:#fff}.confirm-backdrop{position:fixed;z-index:170;inset:0;display:grid;padding:16px;background:rgba(24,35,50,.28);backdrop-filter:blur(8px);place-items:center}.status-dialog{width:min(100%,420px);padding:18px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);box-shadow:0 24px 60px rgba(28,43,63,.24)}.status-dialog h2{margin:0;font-size:17px}.status-dialog p{margin:8px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.status-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.status-dialog footer button{min-height:44px;padding:0 14px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-surface);color:var(--text-primary);font:inherit}.status-dialog footer .primary{border-color:var(--accent);background:var(--accent);color:#fff}.mobile-pagination{margin-top:2px}@media(max-width:360px){.search-row{grid-template-columns:minmax(0,1fr) 44px}.search-row>button[type=submit]{grid-column:1/-1;grid-row:2}.quota-summary,.health-summary{grid-template-columns:1fr}.quota-summary strong,.health-summary strong{text-align:left}.health-summary em{text-align:left}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
