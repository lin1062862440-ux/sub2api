<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Activity,
  Clock3,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TestTube2,
  X,
  Zap,
} from '@lucide/vue'

import {
  getAdminAccountModels,
  getAdminAccountUsage,
  listAdminAccounts,
  recoverAdminAccount,
  setAdminAccountSchedulable,
  testAdminAccount,
  updateAdminAccount,
} from '@/api/admin/accounts'
import type {
  AdminAccount,
  AdminAccountListResponse,
  AdminAccountModel,
  AdminAccountQuotaWindow,
  AdminAccountUsageInfo,
  AdminAccountUsageProgress,
} from '@/api/admin/types'
import ProviderIcon from '@/components/ProviderIcon.vue'
import { formatDateTime, formatPlatform } from '@/lib/format'
import { toast } from '@/stores/toast'

interface UsageWindowView {
  key: string
  label: string
  utilization: number
  resetsAt: string | null
}

const result = ref<AdminAccountListResponse>({ items: [], total: 0, page: 1, page_size: 20 })
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const pendingAction = ref('')
const filters = reactive({ search: '', platform: '', status: '' })
const usageByAccount = reactive<Record<number, AdminAccountUsageInfo | null>>({})
const usageLoading = reactive<Record<number, boolean>>({})
const usageErrors = reactive<Record<number, string>>({})

const testDialogOpen = ref(false)
const testAccount = ref<AdminAccount | null>(null)
const testModels = ref<AdminAccountModel[]>([])
const selectedModel = ref('')
const testModelsLoading = ref(false)
const testError = ref('')

const normalCount = computed(() => result.value.items.filter(item => isAccountEnabled(item)).length)
const attentionCount = computed(() => result.value.items.filter(item => !isAccountEnabled(item)).length)

function isAccountEnabled(account: AdminAccount) {
  return account.status === 'active' && account.schedulable
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function quotaUtilization(quota: AdminAccountQuotaWindow) {
  if (!quota.limit || quota.remaining === null || quota.remaining === undefined) return 0
  return clampPercent((1 - quota.remaining / quota.limit) * 100)
}

function appendProgress(windows: UsageWindowView[], key: string, label: string, progress?: AdminAccountUsageProgress | null) {
  if (!progress) return
  windows.push({ key, label, utilization: clampPercent(progress.utilization), resetsAt: progress.resets_at })
}

function usageWindows(usage: AdminAccountUsageInfo | null | undefined): UsageWindowView[] {
  if (!usage) return []
  const windows: UsageWindowView[] = []
  appendProgress(windows, 'five-hour', '5 小时', usage.five_hour)
  appendProgress(windows, 'seven-day', '7 天', usage.seven_day)
  appendProgress(windows, 'sonnet-seven-day', 'Sonnet 7 天', usage.seven_day_sonnet)
  appendProgress(windows, 'fable-seven-day', 'Fable 7 天', usage.seven_day_fable)
  appendProgress(windows, 'gemini-shared-day', '共享日额度', usage.gemini_shared_daily)
  appendProgress(windows, 'gemini-pro-day', 'Pro 日额度', usage.gemini_pro_daily)
  appendProgress(windows, 'gemini-flash-day', 'Flash 日额度', usage.gemini_flash_daily)
  appendProgress(windows, 'gemini-shared-minute', '共享分钟额度', usage.gemini_shared_minute)
  appendProgress(windows, 'gemini-pro-minute', 'Pro 分钟额度', usage.gemini_pro_minute)
  appendProgress(windows, 'gemini-flash-minute', 'Flash 分钟额度', usage.gemini_flash_minute)

  for (const [model, quota] of Object.entries(usage.antigravity_quota ?? {})) {
    windows.push({ key: `antigravity-${model}`, label: model, utilization: clampPercent(quota.utilization), resetsAt: quota.reset_time })
  }
  if (usage.grok_request_quota) {
    windows.push({ key: 'grok-requests', label: '请求额度', utilization: quotaUtilization(usage.grok_request_quota), resetsAt: usage.grok_request_quota.reset_at ?? null })
  }
  if (usage.grok_token_quota) {
    windows.push({ key: 'grok-tokens', label: 'Token 额度', utilization: quotaUtilization(usage.grok_token_quota), resetsAt: usage.grok_token_quota.reset_at ?? null })
  }
  return windows
}

function progressTone(utilization: number) {
  if (utilization >= 90) return 'critical'
  if (utilization >= 70) return 'warning'
  return 'normal'
}

async function loadUsage(accountId: number, force = false) {
  usageLoading[accountId] = true
  usageErrors[accountId] = ''
  try {
    usageByAccount[accountId] = await getAdminAccountUsage(accountId, force ? { force: true } : undefined)
  } catch (caught) {
    usageByAccount[accountId] = null
    usageErrors[accountId] = caught instanceof Error && caught.message ? caught.message : '用量暂时不可用'
  } finally {
    usageLoading[accountId] = false
  }
}

async function load(background = false) {
  if (background) refreshing.value = true
  else loading.value = true
  loadError.value = ''
  try {
    result.value = await listAdminAccounts({
      page: result.value.page,
      page_size: result.value.page_size,
      search: filters.search.trim() || undefined,
      platform: filters.platform || undefined,
      status: filters.status || undefined,
    })
    await Promise.allSettled(result.value.items.map(account => loadUsage(account.id)))
  } catch (caught) {
    loadError.value = caught instanceof Error && caught.message ? caught.message : '账号列表加载失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function submitFilters() {
  result.value.page = 1
  void load(true)
}

function replaceAccount(account: AdminAccount) {
  result.value.items = result.value.items.map(item => item.id === account.id ? { ...item, ...account } : item)
}

async function toggleAccount(account: AdminAccount) {
  const enabled = isAccountEnabled(account)
  const key = `enabled-${account.id}`
  if (pendingAction.value) return
  pendingAction.value = key
  try {
    let updated: AdminAccount
    if (enabled) {
      const unscheduled = await setAdminAccountSchedulable(account.id, false)
      const inactive = await updateAdminAccount(account.id, { status: 'inactive' })
      updated = { ...account, ...unscheduled, ...inactive, status: 'inactive', schedulable: false }
    } else {
      const active = await updateAdminAccount(account.id, { status: 'active' })
      const scheduled = await setAdminAccountSchedulable(account.id, true)
      updated = { ...account, ...active, ...scheduled, status: 'active', schedulable: true }
    }
    replaceAccount(updated)
    toast.success(`${account.name} 已${enabled ? '停止运行' : '恢复运行'}`)
  } catch (caught) {
    toast.error('状态更新失败', { detail: caught instanceof Error ? caught.message : undefined })
    await load(true)
  } finally {
    pendingAction.value = ''
  }
}

async function recover(account: AdminAccount) {
  const key = `recover-${account.id}`
  if (pendingAction.value) return
  pendingAction.value = key
  try {
    replaceAccount(await recoverAdminAccount(account.id))
    await loadUsage(account.id, true)
    toast.success(`${account.name} 的运行状态已恢复`)
  } catch (caught) {
    toast.error('恢复失败', { detail: caught instanceof Error ? caught.message : '请稍后重试。' })
  } finally {
    pendingAction.value = ''
  }
}

async function openTestDialog(account: AdminAccount) {
  testAccount.value = account
  testDialogOpen.value = true
  testModels.value = []
  selectedModel.value = ''
  testError.value = ''
  testModelsLoading.value = true
  try {
    testModels.value = await getAdminAccountModels(account.id)
    selectedModel.value = testModels.value[0]?.id ?? ''
    if (!testModels.value.length) testError.value = '该账号没有可测试的模型'
  } catch (caught) {
    testError.value = caught instanceof Error && caught.message ? caught.message : '模型列表加载失败'
  } finally {
    testModelsLoading.value = false
  }
}

function closeTestDialog() {
  if (pendingAction.value.startsWith('test-')) return
  testDialogOpen.value = false
  testAccount.value = null
}

async function submitConnectionTest() {
  const account = testAccount.value
  if (!account || !selectedModel.value || pendingAction.value) return
  pendingAction.value = `test-${account.id}`
  testError.value = ''
  try {
    const response = await testAdminAccount(account.id, { model_id: selectedModel.value, prompt: '' })
    toast.success(`${account.name} 连接测试通过`, { detail: `${response.message}${response.latency_ms ? ` · ${response.latency_ms}ms` : ''}` })
    testDialogOpen.value = false
    await loadUsage(account.id, true)
  } catch (caught) {
    testError.value = caught instanceof Error && caught.message ? caught.message : '连接测试失败'
  } finally {
    pendingAction.value = ''
  }
}

function changePage(page: number) {
  result.value.page = page
  void load(true)
}

onMounted(() => void load())
</script>

<template>
  <div class="accounts-page">
    <header class="page-header drag-region">
      <div>
        <span>ACCOUNT OPERATIONS</span>
        <h1>账号管理</h1>
        <p>查看账号健康与额度窗口，在同一处控制运行状态。</p>
      </div>
    </header>

    <section class="summary-strip">
      <div data-testid="account-total"><span>账号总数</span><strong>{{ result.total }}</strong></div>
      <div data-testid="account-normal"><span>当前页运行中</span><strong>{{ normalCount }}</strong></div>
      <div data-testid="account-attention"><span>当前页需关注</span><strong>{{ attentionCount }}</strong></div>
      <div><span>当前总并发</span><strong>{{ result.items.reduce((sum, item) => sum + (item.current_concurrency ?? 0), 0) }}</strong></div>
    </section>

    <form class="filter-bar" data-testid="account-filters" @submit.prevent="submitFilters">
      <label class="search-box"><Search :size="16" /><input v-model="filters.search" data-testid="account-search" placeholder="搜索账号名称或备注" /></label>
      <label><SlidersHorizontal :size="15" /><select v-model="filters.platform" data-testid="account-platform-filter"><option value="">全部平台</option><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="antigravity">Antigravity</option><option value="grok">Grok</option></select></label>
      <label><Activity :size="15" /><select v-model="filters.status"><option value="">全部状态</option><option value="active">运行中</option><option value="inactive">已停用</option><option value="error">异常</option></select></label>
      <button type="submit">应用筛选</button>
      <button class="icon-button" type="button" title="刷新账号" :disabled="refreshing" @click="load(true)"><RefreshCw :size="16" :class="{ spinning: refreshing }" /></button>
    </form>


    <section class="account-content">
      <div v-if="loading" class="card-loading" aria-label="正在加载账号"><i v-for="row in 4" :key="row" /></div>
      <div v-else-if="loadError" class="page-error table-error"><ShieldAlert :size="24" /><strong>账号列表加载失败</strong><span>{{ loadError }}</span><button type="button" @click="load()">重新加载</button></div>
      <div v-else-if="!result.items.length" class="page-error table-error"><strong>没有符合条件的账号</strong><span>调整筛选条件后重新查询。</span></div>
      <div v-else class="account-grid">
        <article v-for="account in result.items" :key="account.id" class="account-card" :class="{ attention: !isAccountEnabled(account) }" data-testid="account-card">
          <header class="card-head">
            <span class="provider-mark"><ProviderIcon :provider="account.platform" :size="21" /></span>
            <div class="account-identity">
              <div><h2>{{ account.name }}</h2><span class="state-dot" :class="{ enabled: isAccountEnabled(account) }">{{ isAccountEnabled(account) ? '运行中' : account.status === 'error' ? '异常' : '已停用' }}</span></div>
              <p>{{ formatPlatform(account.platform) }} · {{ account.type }}</p>
            </div>
            <label class="enabled-switch" :title="isAccountEnabled(account) ? '停止账号与调度' : '启用账号与调度'">
              <input type="checkbox" :checked="isAccountEnabled(account)" :disabled="Boolean(pendingAction)" :data-testid="`account-enabled-${account.id}`" @click.prevent="toggleAccount(account)" />
              <i />
            </label>
          </header>

          <p v-if="account.error_message" class="account-error"><ShieldAlert :size="14" />{{ account.error_message }}</p>

          <div class="account-meta">
            <span><Zap :size="14" />并发 <strong>{{ account.current_concurrency ?? 0 }} / {{ account.concurrency }}</strong></span>
            <span><Clock3 :size="14" />{{ formatDateTime(account.last_used_at) }}</span>
          </div>

          <div class="group-row"><span v-for="group in account.groups?.slice(0, 3)" :key="group.id">{{ group.name }}</span><em v-if="!account.groups?.length">未绑定分组</em></div>

          <section class="usage-panel" :data-testid="`account-usage-${account.id}`">
            <div class="usage-heading"><strong>额度用量</strong><button type="button" title="刷新用量" :disabled="usageLoading[account.id]" @click="loadUsage(account.id, true)"><RefreshCw :size="13" :class="{ spinning: usageLoading[account.id] }" /></button></div>
            <div v-if="usageLoading[account.id] && !usageByAccount[account.id]" class="usage-loading"><i /><i /></div>
            <p v-else-if="usageErrors[account.id]" class="usage-empty">{{ usageErrors[account.id] }}</p>
            <div v-else-if="usageWindows(usageByAccount[account.id]).length" class="usage-windows">
              <div v-for="window in usageWindows(usageByAccount[account.id]).slice(0, 4)" :key="window.key" class="usage-window" :class="progressTone(window.utilization)">
                <div><span>{{ window.label }}</span><strong>{{ Math.round(window.utilization) }}%</strong></div>
                <i><b :style="{ width: `${window.utilization}%` }" /></i>
                <small v-if="window.resetsAt">{{ formatDateTime(window.resetsAt) }} 重置</small>
              </div>
            </div>
            <p v-else class="usage-empty">暂无上游额度窗口</p>
          </section>

          <footer class="card-actions">
            <button class="secondary-action" type="button" :data-testid="`test-account-${account.id}`" :disabled="Boolean(pendingAction)" @click="openTestDialog(account)"><TestTube2 :size="15" />测试连接</button>
            <button v-if="!isAccountEnabled(account)" class="recovery-action" type="button" :data-testid="`recover-account-${account.id}`" :disabled="Boolean(pendingAction)" @click="recover(account)"><RotateCcw :size="15" />恢复状态</button>
          </footer>
        </article>
      </div>
    </section>

    <footer v-if="result.total > result.page_size" class="pagination"><button type="button" :disabled="result.page <= 1" @click="changePage(result.page - 1)">上一页</button><span>第 {{ result.page }} / {{ Math.ceil(result.total / result.page_size) }} 页</span><button type="button" :disabled="result.page * result.page_size >= result.total" @click="changePage(result.page + 1)">下一页</button></footer>

    <Transition name="dialog-fade">
      <div v-if="testDialogOpen" class="dialog-backdrop" @mousedown.self="closeTestDialog">
        <section class="test-dialog" data-testid="account-test-dialog" role="dialog" aria-modal="true" aria-labelledby="account-test-title">
          <header><span><TestTube2 :size="20" /></span><div><h2 id="account-test-title">测试连接</h2><p>{{ testAccount?.name }}</p></div><button type="button" title="关闭" aria-label="关闭" @click="closeTestDialog"><X :size="18" /></button></header>
          <div class="test-body">
            <label><span>测试模型</span><select v-model="selectedModel" data-testid="account-test-model" :disabled="testModelsLoading || pendingAction.startsWith('test-')"><option value="" disabled>{{ testModelsLoading ? '正在读取模型...' : '请选择模型' }}</option><option v-for="model in testModels" :key="model.id" :value="model.id">{{ model.display_name || model.id }}</option></select></label>
            <p>测试会使用所选模型发送最小请求，成功后同步刷新账号用量。</p>
            <p v-if="testError" class="test-error" role="alert">{{ testError }}</p>
          </div>
          <footer><button type="button" @click="closeTestDialog">取消</button><button class="primary-test" type="button" data-testid="account-test-submit" :disabled="!selectedModel || testModelsLoading || pendingAction.startsWith('test-')" @click="submitConnectionTest"><RefreshCw v-if="pendingAction.startsWith('test-')" :size="15" class="spinning" /><TestTube2 v-else :size="15" />{{ pendingAction.startsWith('test-') ? '测试中' : '开始测试' }}</button></footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.accounts-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto;color:var(--text-primary)}
.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.page-header h1{font-size:25px;line-height:1.15}.page-header p{margin-top:7px;color:var(--text-secondary);font-size:14px}.filter-bar>button,.pagination button{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-secondary);font-weight:620}.summary-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:20px;overflow:hidden;background:rgba(255,255,255,.76);border:1px solid rgba(205,216,231,.92);border-radius:8px;box-shadow:0 6px 18px rgba(31,51,78,.04)}.summary-strip>div{display:flex;min-height:70px;align-items:center;justify-content:space-between;gap:12px;padding:0 18px;border-right:1px solid var(--border-subtle)}.summary-strip>div:last-child{border-right:0}.summary-strip span{color:var(--text-secondary);font-size:13px}.summary-strip strong{font-family:var(--font-data);font-size:20px}
.filter-bar{display:flex;align-items:center;gap:9px;margin-top:13px}.filter-bar label{display:flex;height:38px;align-items:center;gap:7px;padding:0 11px;background:rgba(255,255,255,.75);border:1px solid var(--border-subtle);border-radius:7px;color:var(--text-tertiary)}.filter-bar .search-box{min-width:220px;flex:1}.filter-bar input,.filter-bar select{min-width:0;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit;font-size:13px}.filter-bar select{min-width:112px}.filter-bar>button[type=submit]{border-color:var(--accent);background:var(--accent);color:white}.filter-bar .icon-button{width:38px;padding:0;justify-content:center}
.account-content{min-height:300px;margin-top:14px}.account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.account-card{display:flex;min-width:0;min-height:338px;flex-direction:column;padding:17px;background:rgba(255,255,255,.86);border:1px solid rgba(205,216,231,.94);border-radius:8px;box-shadow:0 7px 20px rgba(31,51,78,.045);animation:card-in 360ms var(--motion-ease-out) both}.account-card.attention{border-color:#e8d6d1;background:linear-gradient(145deg,rgba(255,248,246,.92),rgba(255,255,255,.88) 52%)}.card-head{display:grid;grid-template-columns:42px minmax(0,1fr) 38px;align-items:center;gap:10px}.provider-mark{display:grid;width:40px;height:40px;border:1px solid #d8e4f5;border-radius:8px;background:#edf4ff;color:#315f9f;place-items:center}.account-identity{min-width:0}.account-identity>div{display:flex;min-width:0;align-items:center;gap:8px}.account-identity h2{overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.account-identity p{margin-top:3px;color:var(--text-tertiary);font-size:11px}.state-dot{display:inline-flex;flex:0 0 auto;align-items:center;gap:4px;color:#a64a3b;font-size:10px;font-weight:650}.state-dot::before{width:6px;height:6px;border-radius:50%;background:currentColor;content:""}.state-dot.enabled{color:#257957}.enabled-switch{position:relative;width:36px;height:22px}.enabled-switch input{position:absolute;opacity:0}.enabled-switch i{position:absolute;inset:0;border-radius:12px;background:#d7dde6;transition:background 160ms ease}.enabled-switch i::after{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(25,40,60,.24);content:"";transition:transform 160ms ease}.enabled-switch input:checked+i{background:#2d70d2}.enabled-switch input:checked+i::after{transform:translateX(14px)}.enabled-switch input:focus-visible+i{outline:2px solid var(--accent);outline-offset:2px}.enabled-switch input:disabled+i{opacity:.52}.account-error{display:flex;align-items:flex-start;gap:7px;margin-top:12px;padding:8px 9px;background:#fff1ed;border:1px solid #efd0c9;border-radius:6px;color:#a24738;font-size:11px;line-height:1.45}.account-error svg{flex:0 0 auto;margin-top:1px}.account-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px;color:var(--text-tertiary);font-size:11px}.account-meta span{display:flex;min-width:0;align-items:center;gap:5px}.account-meta span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-meta strong{color:var(--text-primary);font-family:var(--font-data)}.group-row{display:flex;min-height:25px;flex-wrap:wrap;gap:5px;margin-top:10px}.group-row span{max-width:100%;padding:3px 7px;overflow:hidden;background:#edf3ff;border-radius:4px;color:#466ca8;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.group-row em{color:var(--text-tertiary);font-size:11px;font-style:normal}
.usage-panel{margin-top:13px;padding-top:12px;border-top:1px solid var(--border-subtle)}.usage-heading{display:flex;align-items:center;justify-content:space-between}.usage-heading strong{font-size:12px}.usage-heading button{display:grid;width:25px;height:25px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--text-tertiary);place-items:center}.usage-heading button:hover{background:var(--bg-base);color:var(--accent)}.usage-windows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:9px}.usage-window>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.usage-window span{overflow:hidden;color:var(--text-secondary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.usage-window strong{font-family:var(--font-data);font-size:11px;font-weight:650}.usage-window>i{display:block;height:5px;margin-top:5px;overflow:hidden;border-radius:3px;background:#e7ecf2}.usage-window>i b{display:block;height:100%;border-radius:inherit;background:#4d85d7;transform-origin:left;animation:bar-in 420ms var(--motion-ease-out) both}.usage-window.warning>i b{background:#d69a34}.usage-window.critical>i b{background:#c95c50}.usage-window small{display:block;margin-top:4px;overflow:hidden;color:#8b96a4;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.usage-empty{margin-top:12px;color:var(--text-tertiary);font-size:11px}.usage-loading{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:11px}.usage-loading i{height:28px;border-radius:5px;background:linear-gradient(90deg,#edf1f5 25%,#fafbfd 45%,#edf1f5 65%);background-size:240% 100%;animation:shimmer 1.15s linear infinite}.card-actions{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:15px}.card-actions button{display:flex;height:33px;align-items:center;justify-content:center;gap:6px;padding:0 11px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:11px;font-weight:650}.card-actions button:hover{border-color:#b9cceb;color:var(--accent)}.card-actions .recovery-action{border-color:#e9c8c1;background:#fff7f5;color:#a44a3b}
.card-loading{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.card-loading i{height:330px;border-radius:8px;background:linear-gradient(90deg,#edf1f5 25%,#fafbfd 45%,#edf1f5 65%);background-size:240% 100%;animation:shimmer 1.15s linear infinite}.page-error{display:grid;min-height:300px;place-content:center;justify-items:center;gap:8px;color:var(--text-tertiary);text-align:center}.page-error strong{color:var(--text-primary);font-size:14px}.page-error span{font-size:12px}.page-error button{margin-top:6px;padding:7px 11px;border:0;border-radius:6px;background:var(--accent);color:white}.pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}.pagination span{color:var(--text-tertiary);font-size:12px}.pagination button{height:32px;font-size:12px}
.dialog-backdrop{position:fixed;z-index:120;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.24);backdrop-filter:blur(10px);place-items:center}.test-dialog{width:min(460px,calc(100vw - 40px));overflow:hidden;background:rgba(251,252,254,.98);border:1px solid rgba(207,217,230,.95);border-radius:8px;box-shadow:0 24px 70px rgba(23,38,59,.23)}.test-dialog>header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}.test-dialog>header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e8f0ff;color:var(--accent);place-items:center}.test-dialog h2{font-size:16px}.test-dialog header p{margin-top:3px;color:var(--text-tertiary);font-size:11px}.test-dialog header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}.test-body{display:grid;gap:12px;padding:18px}.test-body label{display:grid;gap:7px}.test-body label span{color:var(--text-secondary);font-size:12px;font-weight:650}.test-body select{width:100%;height:40px;padding:0 11px;border:1px solid var(--border-strong);border-radius:6px;background:white;color:var(--text-primary);outline:0}.test-body>p{color:var(--text-tertiary);font-size:11px;line-height:1.55}.test-body .test-error{padding:9px 10px;border:1px solid var(--coral-border);border-radius:6px;background:var(--coral-soft);color:var(--danger)}.test-dialog>footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border-subtle);background:#f7f9fc}.test-dialog>footer button{display:flex;height:34px;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:12px;font-weight:650}.test-dialog>footer .primary-test{border-color:var(--accent);background:var(--accent);color:white}
button:disabled{cursor:default;opacity:.5}.spinning{animation:spin .75s linear infinite}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms ease}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-240% 0}}@keyframes card-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes bar-in{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@container app-content (max-width:960px){.accounts-page{padding:24px}.summary-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-strip>div:nth-child(2){border-right:0}.summary-strip>div:nth-child(-n+2){border-bottom:1px solid var(--border-subtle)}.filter-bar{flex-wrap:wrap}.filter-bar .search-box{flex-basis:calc(100% - 47px)}.account-grid,.card-loading{grid-template-columns:1fr}}
@container app-content (max-width:720px){.page-header{align-items:flex-start;flex-direction:column}.filter-bar label{flex:1}.filter-bar .search-box{flex-basis:100%}.summary-strip span{font-size:12px}.usage-windows{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;transform:none!important}}
</style>
