<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { getUserGroupSubscriptions, listUserGroups, type UserGroup, type UserGroupSubscriptionResult } from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import QuotaProgress from '@/components/user-groups/QuotaProgress.vue'
import UserGroupContextBar from '@/components/user-groups/UserGroupContextBar.vue'
import UserGroupWorkspaceTabs from '@/components/user-groups/UserGroupWorkspaceTabs.vue'
import { formatCost, formatDateTime, formatPlatform } from '@/lib/format'
import { session } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const groups = ref<UserGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const loadingGroups = ref(true)
const loading = ref(false)
const error = ref('')
const result = ref<UserGroupSubscriptionResult | null>(null)
const status = ref('')
const page = ref(1)
const pageSize = 20

const canManage = computed(() => session.user?.role === 'admin' || session.userGroupCapabilities?.can_manage === true)

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
      await loadSubscriptions()
    }
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : '用户组加载失败'
  } finally {
    loadingGroups.value = false
  }
}

async function loadSubscriptions() {
  if (!selectedGroupId.value) return
  loading.value = true
  error.value = ''
  try {
    result.value = await getUserGroupSubscriptions(selectedGroupId.value, {
      status: status.value || undefined,
      page: page.value,
      page_size: pageSize,
    })
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : '订阅概览加载失败'
  } finally {
    loading.value = false
  }
}

async function changeGroup(id: number) {
  selectedGroupId.value = id
  page.value = 1
  await setQuery(id)
  await loadSubscriptions()
}

function applyStatus() {
  page.value = 1
  void loadSubscriptions()
}

function changePage(direction: -1 | 1) {
  const next = page.value + direction
  if (!result.value || next < 1 || next > result.value.pages) return
  page.value = next
  void loadSubscriptions()
}

onMounted(() => void loadGroups())
</script>

<template>
  <div class="user-group-page subscriptions-page">
    <header class="ug-page-header drag-region"><div><span>GROUP SUBSCRIPTIONS</span><h1>用户组</h1><p>查看组内成员余额、订阅状态与周期额度。</p></div></header>
    <UserGroupWorkspaceTabs />
    <UserGroupContextBar :groups="groups" :model-value="selectedGroupId" :can-manage="canManage" :loading="loadingGroups" @update:model-value="changeGroup">
      <div class="ug-context-controls"><select v-model="status" data-testid="subscription-status" @change="applyStatus"><option value="">全部状态</option><option value="active">有效订阅</option><option value="expired">已过期</option><option value="none">无订阅</option></select><button type="button" title="刷新" :disabled="loading" @click="loadSubscriptions"><RefreshCw :size="15" :class="{ spinning: loading }" /></button></div>
    </UserGroupContextBar>

    <div v-if="error" class="ug-inline-error"><span>{{ error }}</span><button type="button" @click="selectedGroupId ? loadSubscriptions() : loadGroups()">重试</button></div>
    <div v-if="!loadingGroups && !groups.length" class="ug-empty"><strong>暂无可访问的用户组</strong><span>请先创建用户组或联系管理员授予访问权限。</span></div>
    <template v-else-if="result">
      <section class="ug-summary five">
        <div><span>成员总数</span><strong>{{ result.summary.member_count }}</strong></div>
        <div><span>有效订阅</span><strong>{{ result.summary.active_subscription_count }}</strong></div>
        <div><span>无订阅成员</span><strong>{{ result.summary.no_subscription_count }}</strong></div>
        <div><span>成员总余额</span><strong>{{ formatCost(result.summary.total_balance) }}</strong></div>
        <div><span>有效订阅用量</span><strong>{{ formatCost(result.summary.active_subscription_usage) }}</strong></div>
      </section>

      <section class="ug-subscription-list">
        <div v-if="loading" class="ug-card-loading"><i v-for="n in 4" :key="n" /></div>
        <div v-else-if="!result.items.length" class="ug-empty"><strong>暂无订阅数据</strong><span>当前筛选条件下没有成员订阅。</span></div>
        <article v-for="item in result.items" v-else :key="item.member.user_id" class="ug-subscription-row">
          <header><div class="identity"><UserAvatar :name="item.member.username" :src="item.member.avatar_url" /><div><strong>{{ item.member.username || item.member.email }}</strong><span>{{ item.member.email }} · 余额 {{ formatCost(item.member.balance) }}</span></div></div><div class="subscription-meta"><span :class="item.status">{{ item.subscription_id ? item.status === 'active' ? '有效订阅' : item.status === 'expired' ? '已过期' : item.status : '无订阅' }}</span><strong>{{ item.billing_group || '未分配订阅' }}</strong><small v-if="item.platform">{{ formatPlatform(item.platform) }} · 到期 {{ formatDateTime(item.expires_at) }}</small></div></header>
          <div class="quota-grid"><QuotaProgress label="日额度" :used="item.daily_used" :limit="item.daily_limit" /><QuotaProgress label="周额度" :used="item.weekly_used" :limit="item.weekly_limit" /><QuotaProgress label="月额度" :used="item.monthly_used" :limit="item.monthly_limit" /></div>
        </article>
      </section>

      <footer v-if="result.pages > 1" class="ug-pagination"><button type="button" :disabled="page <= 1 || loading" @click="changePage(-1)"><ChevronLeft :size="15" />上一页</button><span>第 {{ page }} / {{ result.pages }} 页 · 共 {{ result.total }} 条</span><button type="button" :disabled="page >= result.pages || loading" @click="changePage(1)">下一页<ChevronRight :size="15" /></button></footer>
    </template>
    <div v-else-if="loading" class="ug-card-loading"><i v-for="n in 4" :key="n" /></div>
  </div>
</template>

<style scoped>
.user-group-page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.ug-page-header>div>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.ug-page-header h1{margin:0;font-size:25px}.ug-page-header p{margin:7px 0 0;color:var(--text-secondary);font-size:14px}.ug-context-controls{display:flex;gap:7px}.ug-context-controls select,.ug-context-controls button{height:34px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}.ug-context-controls select{padding:0 9px;font-size:11px}.ug-context-controls button{display:grid;width:34px;padding:0;place-items:center}.ug-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:13px;overflow:hidden;background:rgba(255,255,255,.82);border:1px solid var(--border-subtle);border-radius:8px}.ug-summary>div{display:grid;min-height:64px;align-content:center;gap:5px;padding:0 14px;border-right:1px solid var(--border-subtle)}.ug-summary>div:last-child{border:0}.ug-summary span{color:var(--text-tertiary);font-size:10px}.ug-summary strong{font-family:var(--font-data);font-size:15px}.ug-inline-error{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 12px;background:#fff0f1;border:1px solid #f1ccd1;border-radius:7px;color:#ae3d4b;font-size:12px}.ug-inline-error button{height:30px;padding:0 9px;border:0;border-radius:5px;background:white;color:inherit}.ug-subscription-list{display:grid;gap:9px;margin-top:11px}.ug-subscription-row{padding:14px 16px;background:rgba(255,255,255,.84);border:1px solid var(--border-subtle);border-radius:8px;animation:row-in 360ms var(--motion-ease-out) both}.ug-subscription-row>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.identity{display:grid;min-width:0;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:9px}.identity>.user-avatar{width:36px;height:36px;border-radius:50%}.identity>div{display:grid;min-width:0;gap:3px}.identity strong,.identity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity strong{font-size:12px}.identity span,.subscription-meta small{color:var(--text-tertiary);font-size:10px}.subscription-meta{display:grid;justify-items:end;gap:3px}.subscription-meta>span{padding:4px 6px;background:#eff2f5;border-radius:5px;color:var(--text-tertiary);font-size:9px}.subscription-meta>span.active{background:#eaf8f1;color:#277a58}.subscription-meta>span.expired{background:#fff1e9;color:#a45a29}.subscription-meta strong{font-size:11px}.quota-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.ug-card-loading{display:grid;gap:8px;margin-top:11px}.ug-card-loading i{height:132px;background:var(--skeleton);border-radius:8px;animation:pulse 1.2s ease-in-out infinite}.ug-empty{display:grid;min-height:260px;color:var(--text-tertiary);place-content:center;justify-items:center;gap:7px}.ug-empty strong{color:var(--text-primary)}.ug-pagination{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px;color:var(--text-tertiary);font-size:11px}.ug-pagination button{display:flex;height:34px;align-items:center;gap:4px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}@container app-content (max-width: 860px){.user-group-page{padding:24px}.ug-summary{grid-template-columns:repeat(3,1fr)}.ug-summary>div:nth-child(3){border-right:0}.ug-summary>div:nth-child(-n+3){border-bottom:1px solid var(--border-subtle)}}@container app-content (max-width: 650px){.ug-summary{grid-template-columns:1fr 1fr}.ug-summary>div{border-bottom:1px solid var(--border-subtle)}.ug-summary>div:nth-child(odd){border-right:1px solid var(--border-subtle)}.ug-summary>div:nth-child(even){border-right:0}.ug-subscription-row>header{align-items:flex-start;flex-direction:column}.subscription-meta{justify-items:start}.quota-grid{grid-template-columns:1fr}.ug-pagination{justify-content:space-between}.ug-pagination span{display:none}}
</style>
