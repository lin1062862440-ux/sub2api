<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Search } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getUserGroupMembers,
  getUserGroupUsage,
  listUserGroups,
  type UserGroup,
  type UserGroupMember,
  type UserGroupUsageResult,
} from '@/api/user-groups'
import UserGroupContextBar from '@/components/user-groups/UserGroupContextBar.vue'
import UserGroupWorkspaceTabs from '@/components/user-groups/UserGroupWorkspaceTabs.vue'
import { formatCost, formatDateTime, formatNumber } from '@/lib/format'
import { session } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
const groups = ref<UserGroup[]>([])
const members = ref<UserGroupMember[]>([])
const selectedGroupId = ref<number | null>(null)
const loadingGroups = ref(true)
const loading = ref(false)
const error = ref('')
const result = ref<UserGroupUsageResult | null>(null)
const endDate = ref(localDate(new Date()))
const startDate = ref(localDate(addDays(new Date(), -6)))
const memberId = ref<number | ''>('')
const model = ref('')
const billingType = ref<'' | '0' | '1'>('')
const moreFilters = ref(false)
const resultMode = ref<'members' | 'details'>('members')
const page = ref(1)
const pageSize = 20

const canManage = computed(() => session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)
const activeFilters = computed(() => [memberId.value, model.value.trim(), billingType.value].filter((value) => value !== '').length)

function addDays(value: Date, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function requestedGroupId() {
  const value = Number(route.query.group_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

async function setQuery(id: number) {
  await router.replace({ query: { ...route.query, group_id: String(id) } })
}

async function loadGroups() {
  loadingGroups.value = true
  error.value = ''
  try {
    groups.value = await listUserGroups()
    const requested = requestedGroupId()
    selectedGroupId.value = groups.value.some((group) => group.id === requested) ? requested : groups.value[0]?.id ?? null
    if (selectedGroupId.value) {
      if (requested !== selectedGroupId.value) await setQuery(selectedGroupId.value)
      await loadGroupContext()
    }
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : '用户组加载失败'
  } finally {
    loadingGroups.value = false
  }
}

async function loadGroupContext() {
  if (!selectedGroupId.value) return
  const [memberResult] = await Promise.allSettled([getUserGroupMembers(selectedGroupId.value)])
  members.value = memberResult.status === 'fulfilled' ? memberResult.value : []
  await loadUsage()
}

async function loadUsage() {
  if (!selectedGroupId.value) return
  loading.value = true
  error.value = ''
  try {
    result.value = await getUserGroupUsage(selectedGroupId.value, {
      start_date: startDate.value,
      end_date: endDate.value,
      timezone,
      user_id: memberId.value === '' ? undefined : memberId.value,
      model: model.value.trim() || undefined,
      billing_type: billingType.value === '' ? undefined : Number(billingType.value) as 0 | 1,
      page: page.value,
      page_size: pageSize,
    })
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : '用量分析加载失败'
  } finally {
    loading.value = false
  }
}

async function changeGroup(id: number) {
  selectedGroupId.value = id
  page.value = 1
  memberId.value = ''
  await setQuery(id)
  await loadGroupContext()
}

function applyFilters() {
  page.value = 1
  void loadUsage()
}

function changePage(direction: -1 | 1) {
  const next = page.value + direction
  if (!result.value || next < 1 || next > result.value.pages) return
  page.value = next
  void loadUsage()
}

onMounted(() => void loadGroups())
</script>

<template>
  <div class="user-group-page usage-page">
    <header class="ug-page-header drag-region"><div><span>GROUP USAGE ANALYTICS</span><h1>用户组</h1><p>按成员汇总请求、Token 与余额或订阅消费。</p></div></header>
    <UserGroupWorkspaceTabs />
    <UserGroupContextBar :groups="groups" :model-value="selectedGroupId" :can-manage="canManage" :loading="loadingGroups" @update:model-value="changeGroup">
      <form class="ug-date-controls" data-testid="group-usage-filters" @submit.prevent="applyFilters"><label><span>开始日期</span><input v-model="startDate" type="date" :max="endDate" /></label><label><span>结束日期</span><input v-model="endDate" type="date" :min="startDate" /></label><button type="button" class="more" :aria-expanded="moreFilters" @click="moreFilters = !moreFilters"><Filter :size="14" />筛选<span v-if="activeFilters">{{ activeFilters }}</span></button><button type="submit" :disabled="loading"><Search :size="14" />查询</button></form>
    </UserGroupContextBar>

    <Transition name="filter-drop"><section v-if="moreFilters" class="ug-advanced-filters"><label><span>成员</span><select v-model="memberId"><option value="">全部成员</option><option v-for="member in members" :key="member.user_id" :value="member.user_id">{{ member.username || member.email }}</option></select></label><label><span>模型</span><input v-model="model" placeholder="例如 claude-sonnet-4" /></label><label><span>计费方式</span><select v-model="billingType"><option value="">全部方式</option><option value="0">余额计费</option><option value="1">订阅计费</option></select></label></section></Transition>

    <div v-if="error" class="ug-inline-error"><span>{{ error }}</span><button type="button" @click="selectedGroupId ? loadUsage() : loadGroups()">重试</button></div>
    <div v-if="!loadingGroups && !groups.length" class="ug-empty"><strong>暂无可访问的用户组</strong><span>请联系管理员授予用户组查看权限。</span></div>
    <template v-else-if="result">
      <section class="ug-summary five">
        <div><span>请求数</span><strong>{{ formatNumber(result.summary.total_requests) }}</strong></div>
        <div><span>总 Token</span><strong>{{ formatNumber(result.summary.total_tokens) }}</strong></div>
        <div><span>实际消费</span><strong>{{ formatCost(result.summary.total_actual_cost) }}</strong></div>
        <div><span>余额消费</span><strong>{{ formatCost(result.summary.balance_consumption) }}</strong></div>
        <div><span>订阅消费</span><strong>{{ formatCost(result.summary.subscription_consumption) }}</strong></div>
      </section>

      <div class="ug-result-switch" role="tablist"><button type="button" :aria-selected="resultMode === 'members'" @click="resultMode = 'members'">成员汇总</button><button type="button" :aria-selected="resultMode === 'details'" @click="resultMode = 'details'">请求明细</button><button class="refresh" type="button" title="刷新" :disabled="loading" @click="loadUsage"><RefreshCw :size="14" :class="{ spinning: loading }" /></button></div>

      <section class="ug-usage-table">
        <div v-if="loading" class="ug-table-loading"><i v-for="n in 6" :key="n" /></div>
        <template v-else-if="resultMode === 'members'">
          <div v-if="!result.by_user.length" class="ug-empty"><strong>暂无成员用量</strong><span>当前条件下没有产生请求。</span></div>
          <template v-else><div class="ug-member-row head"><span>成员</span><span>请求</span><span>Token</span><span>余额消费</span><span>订阅消费</span></div><article v-for="item in result.by_user" :key="item.user_id" class="ug-member-row"><div><strong>{{ item.username || item.email }}</strong><span>{{ item.email }}</span></div><strong>{{ formatNumber(item.total_requests) }}</strong><strong>{{ formatNumber(item.total_tokens) }}</strong><strong>{{ formatCost(item.balance_consumption) }}</strong><strong>{{ formatCost(item.subscription_consumption) }}</strong></article></template>
        </template>
        <template v-else>
          <div v-if="!result.items.length" class="ug-empty"><strong>暂无请求明细</strong><span>调整筛选或时间范围后重试。</span></div>
          <template v-else><div class="ug-detail-row head"><span>成员 / 请求</span><span>模型</span><span>Token</span><span>消费</span><span>时间</span></div><article v-for="item in result.items" :key="item.id" class="ug-detail-row"><div><strong>{{ item.username || item.email }}</strong><span>{{ item.request_id }}</span></div><div><strong>{{ item.model }}</strong><span :class="item.billing_type === 1 ? 'subscription' : 'balance'">{{ item.billing_type === 1 ? '订阅计费' : '余额计费' }}</span></div><strong>{{ formatNumber(item.total_tokens) }}</strong><strong>{{ formatCost(item.actual_cost) }}</strong><span>{{ formatDateTime(item.created_at) }}</span></article></template>
        </template>
      </section>

      <footer v-if="resultMode === 'details' && result.pages > 1" class="ug-pagination"><button type="button" :disabled="page <= 1 || loading" @click="changePage(-1)"><ChevronLeft :size="15" />上一页</button><span>第 {{ page }} / {{ result.pages }} 页 · 共 {{ result.total }} 条</span><button type="button" :disabled="page >= result.pages || loading" @click="changePage(1)">下一页<ChevronRight :size="15" /></button></footer>
    </template>
    <div v-else-if="loading" class="ug-table-loading"><i v-for="n in 6" :key="n" /></div>
  </div>
</template>

<style scoped>
.user-group-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.ug-page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.ug-page-header h1{margin:0;font-size:25px}.ug-page-header p{margin:7px 0 0;color:var(--text-secondary);font-size:14px}.ug-date-controls{display:flex;align-items:end;gap:7px}.ug-date-controls label{display:grid;gap:3px}.ug-date-controls label span{color:var(--text-tertiary);font-size:9px}.ug-date-controls input,.ug-date-controls button{height:34px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:10px}.ug-date-controls input{width:125px;padding:0 7px}.ug-date-controls button{display:flex;align-items:center;gap:5px;padding:0 9px}.ug-date-controls button:last-child{background:var(--accent);border-color:var(--accent);color:white}.ug-date-controls button>span{padding:1px 5px;background:#dce8ff;border-radius:8px;color:var(--accent-strong);font-size:9px}.ug-advanced-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px;padding:11px 13px;background:rgba(255,255,255,.75);border:1px solid var(--border-subtle);border-radius:7px}.ug-advanced-filters label{display:grid;gap:5px}.ug-advanced-filters label>span{color:var(--text-tertiary);font-size:10px}.ug-advanced-filters input,.ug-advanced-filters select{height:36px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-primary);font:inherit;font-size:11px}.ug-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:13px;overflow:hidden;background:rgba(255,255,255,.82);border:1px solid var(--border-subtle);border-radius:8px}.ug-summary>div{display:grid;min-height:64px;align-content:center;gap:5px;padding:0 14px;border-right:1px solid var(--border-subtle)}.ug-summary>div:last-child{border:0}.ug-summary span{color:var(--text-tertiary);font-size:10px}.ug-summary strong{font-family:var(--font-data);font-size:15px}.ug-inline-error{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 12px;background:#fff0f1;border:1px solid #f1ccd1;border-radius:7px;color:#ae3d4b;font-size:12px}.ug-inline-error button{height:30px;padding:0 9px;border:0;border-radius:5px;background:white;color:inherit}.ug-result-switch{display:flex;gap:3px;margin-top:12px;padding:3px;width:max-content;background:#e8edf4;border-radius:7px}.ug-result-switch button{height:31px;padding:0 11px;border:0;border-radius:5px;background:transparent;color:var(--text-tertiary);font-size:11px}.ug-result-switch button[aria-selected=true]{background:white;box-shadow:0 2px 7px rgba(40,58,85,.1);color:var(--accent-strong);font-weight:650}.ug-result-switch .refresh{width:31px;padding:0;display:grid;place-items:center}.ug-usage-table{min-height:300px;margin-top:10px;overflow:hidden;background:rgba(255,255,255,.84);border:1px solid var(--border-subtle);border-radius:8px}.ug-member-row,.ug-detail-row{display:grid;min-height:62px;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--border-subtle);font-size:11px}.ug-member-row{grid-template-columns:minmax(180px,1.4fr) 80px 105px 100px 100px}.ug-detail-row{grid-template-columns:minmax(160px,1.2fr) minmax(150px,1fr) 90px 90px 125px}.ug-member-row:last-child,.ug-detail-row:last-child{border-bottom:0}.ug-member-row.head,.ug-detail-row.head{min-height:40px;background:rgba(244,247,251,.88);color:var(--text-tertiary);font-size:10px;font-weight:650}.ug-member-row>div,.ug-detail-row>div{display:grid;min-width:0;gap:3px}.ug-member-row strong,.ug-detail-row strong,.ug-member-row span,.ug-detail-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ug-member-row>div span,.ug-detail-row>div>span:not(.subscription):not(.balance),.ug-detail-row>span{color:var(--text-tertiary);font-size:9px}.ug-member-row>strong,.ug-detail-row>strong{font-family:var(--font-data);font-size:11px}.ug-detail-row .subscription,.ug-detail-row .balance{width:max-content;padding:3px 5px;border-radius:4px;font-size:9px}.ug-detail-row .subscription{background:#eaf1ff;color:#456ba6}.ug-detail-row .balance{background:#fff4df;color:#8a6220}.ug-table-loading{display:grid;gap:1px;margin-top:10px;overflow:hidden;border-radius:8px}.ug-table-loading i{height:62px;background:var(--skeleton);animation:pulse 1.2s ease-in-out infinite}.ug-empty{display:grid;min-height:260px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.ug-empty strong{color:var(--text-primary)}.ug-pagination{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px;color:var(--text-tertiary);font-size:11px}.ug-pagination button{display:flex;height:34px;align-items:center;gap:4px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.filter-drop-enter-active,.filter-drop-leave-active{transition:opacity 160ms,transform 160ms}.filter-drop-enter-from,.filter-drop-leave-to{opacity:0;transform:translateY(-4px)}@container app-content (max-width: 960px){.user-group-page{padding:24px}.ug-context{align-items:flex-start;flex-wrap:wrap}.ug-context :deep(.ug-date-controls){width:100%;margin-left:0}.ug-summary{grid-template-columns:repeat(3,1fr)}.ug-summary>div:nth-child(3){border-right:0}.ug-summary>div:nth-child(-n+3){border-bottom:1px solid var(--border-subtle)}.ug-detail-row{grid-template-columns:minmax(150px,1.2fr) minmax(130px,1fr) 80px 90px}.ug-detail-row>*:nth-child(5){display:none}}@container app-content (max-width: 700px){.ug-date-controls{width:100%;flex-wrap:wrap}.ug-date-controls label{flex:1}.ug-date-controls input{width:100%}.ug-advanced-filters{grid-template-columns:1fr}.ug-summary{grid-template-columns:1fr 1fr}.ug-summary>div{border-bottom:1px solid var(--border-subtle)}.ug-summary>div:nth-child(odd){border-right:1px solid var(--border-subtle)}.ug-summary>div:nth-child(even){border-right:0}.ug-member-row,.ug-detail-row{grid-template-columns:minmax(150px,1fr) 90px 90px}.ug-member-row>*:nth-child(2),.ug-member-row>*:nth-child(4),.ug-detail-row>*:nth-child(3),.ug-detail-row>*:nth-child(5){display:none}.ug-pagination{justify-content:space-between}.ug-pagination span{display:none}}
</style>
