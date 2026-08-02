<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Ban,
  Check,
  Copy,
  Download,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from '@lucide/vue'
import {
  batchDeleteAdminRedeemCodes,
  batchUpdateAdminRedeemCodes,
  deleteAdminRedeemCode,
  expireAdminRedeemCode,
  exportAdminRedeemCodes,
  generateAdminRedeemCodes,
  getAdminRedeemStats,
  listAdminRedeemCodes,
} from '@/api/admin/redeem'
import { getAdminGroups } from '@/api/admin/users'
import type {
  AdminGroupOption,
  AdminRedeemCode,
  AdminRedeemCodeType,
  AdminRedeemStats,
} from '@/api/admin/types'
import { saveTextExport } from '@/lib/export-file'
import { formatCost, formatDateTime } from '@/lib/format'
import { appCapabilities } from '@/lib/platform-capabilities'

const items = ref<AdminRedeemCode[]>([])
const stats = ref<AdminRedeemStats | null>(null)
const groups = ref<AdminGroupOption[]>([])
const loading = ref(true)
const loadError = ref('')
const editorOpen = ref(false)
const message = ref('')
const actionError = ref('')
const search = ref('')
const status = ref('')
const type = ref<AdminRedeemCodeType | ''>('')
const selected = ref<number[]>([])
const pending = ref('')

const form = reactive({
  count: 1,
  type: 'balance' as AdminRedeemCodeType,
  value: 10,
  groupId: '',
  validityDays: 30,
  expiresDays: 30,
})

const selectedCount = computed(() => selected.value.length)

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

function currentFilters() {
  return {
    type: type.value || undefined,
    status: status.value || undefined,
    search: search.value.trim() || undefined,
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [list, nextStats, nextGroups] = await Promise.all([
      listAdminRedeemCodes({ page: 1, page_size: 20, ...currentFilters() }),
      getAdminRedeemStats(),
      getAdminGroups(),
    ])
    items.value = list.items
    stats.value = nextStats
    groups.value = nextGroups
    selected.value = selected.value.filter((id) => list.items.some((item) => item.id === id))
  } catch (caught) {
    loadError.value = errorMessage(caught, '兑换码数据加载失败')
  } finally {
    loading.value = false
  }
}

async function generate() {
  pending.value = 'generate'
  actionError.value = ''
  try {
    const payload = {
      count: Math.max(1, Number(form.count) || 1),
      type: form.type,
      value: form.type === 'subscription' ? 0 : Number(form.value) || 0,
      expires_in_days: Number(form.expiresDays) || null,
      ...(form.type === 'subscription'
        ? {
            group_id: Number(form.groupId) || null,
            validity_days: Number(form.validityDays) || 30,
          }
        : {}),
    }
    const codes = await generateAdminRedeemCodes(payload)
    editorOpen.value = false
    message.value = `已生成 ${codes.length} 个兑换码`
    await load()
  } catch (caught) {
    actionError.value = errorMessage(caught, '兑换码生成失败')
  } finally {
    pending.value = ''
  }
}

function toggle(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((value) => value !== id)
    : [...selected.value, id]
}

async function disableSelected() {
  if (!selected.value.length) return
  if (!window.confirm(`确认禁用选中的 ${selected.value.length} 个兑换码？`)) return
  pending.value = 'disable'
  actionError.value = ''
  try {
    const result = await batchUpdateAdminRedeemCodes(selected.value, { status: 'disabled' })
    message.value = `已禁用 ${result.updated} 个兑换码`
    selected.value = []
    await load()
  } catch (caught) {
    actionError.value = errorMessage(caught, '批量禁用失败')
  } finally {
    pending.value = ''
  }
}

async function deleteSelected() {
  if (!selected.value.length) return
  if (!window.confirm(`确认永久删除选中的 ${selected.value.length} 个兑换码？此操作无法撤销。`)) return
  pending.value = 'batch-delete'
  actionError.value = ''
  try {
    const result = await batchDeleteAdminRedeemCodes(selected.value)
    message.value = `已删除 ${result.deleted} 个兑换码`
    selected.value = []
    await load()
  } catch (caught) {
    actionError.value = errorMessage(caught, '批量删除失败')
  } finally {
    pending.value = ''
  }
}

async function expire(item: AdminRedeemCode) {
  if (!window.confirm(`确认让兑换码 ${item.code} 立即过期？`)) return
  pending.value = `expire-${item.id}`
  actionError.value = ''
  try {
    await expireAdminRedeemCode(item.id)
    message.value = '兑换码已过期'
    await load()
  } catch (caught) {
    actionError.value = errorMessage(caught, '兑换码过期操作失败')
  } finally {
    pending.value = ''
  }
}

async function remove(item: AdminRedeemCode) {
  if (!window.confirm(`确认永久删除兑换码 ${item.code}？此操作无法撤销。`)) return
  pending.value = `delete-${item.id}`
  actionError.value = ''
  try {
    await deleteAdminRedeemCode(item.id)
    message.value = '兑换码已删除'
    await load()
  } catch (caught) {
    actionError.value = errorMessage(caught, '兑换码删除失败')
  } finally {
    pending.value = ''
  }
}

function exportFilename() {
  const value = new Date()
  const date = [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('')
  const time = [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('')
  return `linai-redeem-codes-${date}-${time}.csv`
}

async function exportCodes() {
  pending.value = 'export'
  actionError.value = ''
  try {
    const csv = await exportAdminRedeemCodes(currentFilters())
    const path = await saveTextExport(csv, exportFilename())
    message.value = `已导出到 ${path}`
  } catch (caught) {
    actionError.value = errorMessage(caught, '兑换码导出失败')
  } finally {
    pending.value = ''
  }
}

async function copy(code: string) {
  await navigator.clipboard?.writeText(code)
  message.value = '兑换码已复制'
}

function typeLabel(value: string) {
  return { balance: '余额', concurrency: '并发', subscription: '订阅', invitation: '邀请' }[value]
    ?? value
}

function statusLabel(value: string) {
  return { active: '可使用', unused: '可使用', used: '已使用', expired: '已过期', disabled: '已禁用' }[value]
    ?? value
}

onMounted(() => void load())
</script>

<template>
  <div class="page">
    <header class="page-header drag-region">
      <div>
        <span>REDEEM INVENTORY</span>
        <h1>兑换码</h1>
        <p>生成和维护余额、并发与订阅兑换凭证。</p>
      </div>
      <div class="header-actions no-drag">
        <button
          v-if="appCapabilities.textExport"
          type="button"
          class="secondary"
          data-testid="export-redeem"
          :disabled="pending === 'export'"
          @click="exportCodes"
        >
          <LoaderCircle v-if="pending === 'export'" :size="17" class="spinning" />
          <Download v-else :size="17" />
          导出 CSV
        </button>
        <button class="primary" data-testid="generate-redeem" @click="editorOpen = true">
          <Plus :size="17" />
          生成兑换码
        </button>
      </div>
    </header>

    <section class="stats">
      <div data-testid="redeem-total"><span>总数量</span><strong>{{ stats?.total_codes ?? 0 }}</strong></div>
      <div><span>可使用</span><strong>{{ stats?.active_codes ?? 0 }}</strong></div>
      <div><span>已使用</span><strong>{{ stats?.used_codes ?? 0 }}</strong></div>
      <div><span>已过期</span><strong>{{ stats?.expired_codes ?? 0 }}</strong></div>
      <div><span>累计发放</span><strong>{{ formatCost(stats?.total_value_distributed) }}</strong></div>
    </section>

    <form class="toolbar" @submit.prevent="load">
      <label class="search-field">
        <Search :size="15" />
        <input v-model="search" placeholder="搜索兑换码" />
      </label>
      <select v-model="type" aria-label="兑换类型">
        <option value="">全部类型</option>
        <option value="balance">余额</option>
        <option value="concurrency">并发</option>
        <option value="subscription">订阅</option>
        <option value="invitation">邀请</option>
      </select>
      <select v-model="status" aria-label="兑换状态">
        <option value="">全部状态</option>
        <option value="unused">可使用</option>
        <option value="used">已使用</option>
        <option value="expired">已过期</option>
        <option value="disabled">已禁用</option>
      </select>
      <button type="submit">筛选</button>
      <div v-if="selectedCount" class="batch-actions">
        <span>已选 {{ selectedCount }} 项</span>
        <button type="button" :disabled="Boolean(pending)" @click="disableSelected">
          <Ban :size="15" />禁用
        </button>
        <button
          type="button"
          class="danger"
          data-testid="delete-selected-redeem"
          :disabled="Boolean(pending)"
          @click="deleteSelected"
        >
          <Trash2 :size="15" />删除
        </button>
      </div>
    </form>

    <p v-if="message" class="message">{{ message }}</p>
    <p v-if="actionError" class="message error-message">{{ actionError }}</p>

    <section class="table-wrap">
      <div v-if="loading" class="loading"><i v-for="n in 6" :key="n" /></div>
      <div v-else-if="loadError" class="empty">
        <strong>兑换码加载失败</strong>
        <span>{{ loadError }}</span>
        <button type="button" @click="load">重试</button>
      </div>
      <div v-else-if="!items.length" class="empty">
        <strong>没有符合条件的兑换码</strong>
        <span>调整筛选条件，或生成新的兑换码。</span>
      </div>
      <div v-else class="table">
        <div class="row head">
          <span></span><span>兑换码</span><span>类型</span><span>权益</span><span>状态</span><span>使用者</span><span>有效期</span><span>操作</span>
        </div>
        <article v-for="item in items" :key="item.id" class="row">
          <button
            class="check"
            type="button"
            :data-testid="`select-redeem-${item.id}`"
            :aria-pressed="selected.includes(item.id)"
            @click="toggle(item.id)"
          ><Check :size="12" /></button>
          <button class="code" type="button" @click="copy(item.code)">
            <strong>{{ item.code }}</strong><Copy :size="13" />
          </button>
          <span>{{ typeLabel(item.type) }}</span>
          <div>
            <strong>{{ item.type === 'balance' ? formatCost(item.value) : item.type === 'concurrency' ? `${item.value} 并发` : item.group?.name || '订阅' }}</strong>
            <small v-if="item.validity_days">{{ item.validity_days }} 天</small>
          </div>
          <em :class="item.status">{{ statusLabel(item.status) }}</em>
          <span>{{ item.user?.email || '—' }}</span>
          <span>{{ item.expires_at ? formatDateTime(item.expires_at) : '永久' }}</span>
          <div class="actions">
            <button
              type="button"
              title="立即过期"
              :data-testid="`expire-redeem-${item.id}`"
              :disabled="pending === `expire-${item.id}`"
              @click="expire(item)"
            ><Ban :size="14" /></button>
            <button
              type="button"
              title="删除"
              :disabled="pending === `delete-${item.id}`"
              @click="remove(item)"
            ><Trash2 :size="14" /></button>
          </div>
        </article>
      </div>
    </section>

    <Transition name="fade">
      <div v-if="editorOpen" class="backdrop" @mousedown.self="editorOpen = false">
        <section class="editor">
          <header>
            <div><h2>生成兑换码</h2><p>批量创建可分发的权益凭证</p></div>
            <button type="button" @click="editorOpen = false"><X :size="18" /></button>
          </header>
          <form data-testid="redeem-editor" @submit.prevent="generate">
            <label><span>生成数量</span><input v-model.number="form.count" data-testid="redeem-count" type="number" min="1" max="1000" /></label>
            <label><span>兑换类型</span><select v-model="form.type"><option value="balance">余额</option><option value="concurrency">并发</option><option value="subscription">订阅</option><option value="invitation">邀请</option></select></label>
            <label v-if="form.type !== 'subscription'"><span>{{ form.type === 'balance' ? '金额' : '数量' }}</span><input v-model.number="form.value" type="number" min="0" step="0.01" /></label>
            <template v-else>
              <label><span>订阅分组</span><select v-model="form.groupId"><option value="">请选择</option><option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option></select></label>
              <label><span>订阅有效天数</span><input v-model.number="form.validityDays" type="number" min="1" /></label>
            </template>
            <label><span>兑换码有效天数</span><input v-model.number="form.expiresDays" type="number" min="1" /></label>
            <p v-if="actionError" class="editor-error">{{ actionError }}</p>
            <footer>
              <button type="button" @click="editorOpen = false">取消</button>
              <button class="save" type="submit" :disabled="pending === 'generate'">
                <LoaderCircle v-if="pending === 'generate'" :size="16" class="spinning" />
                确认生成
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page{width:100%;min-height:100%;padding:28px 30px 34px;overflow:auto}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-header>div:first-child>span{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:720;letter-spacing:.08em}.page-header h1{margin:0;font-size:25px}.page-header p{margin:7px 0 0;color:var(--text-secondary);font-size:14px}.header-actions{display:flex;gap:8px}.primary,.secondary,.toolbar>button,.batch-actions button{display:flex;height:36px;align-items:center;justify-content:center;gap:7px;padding:0 13px;border-radius:7px}.primary,.toolbar>button{border:0;background:var(--accent);color:white}.secondary{border:1px solid var(--border-subtle);background:white;color:var(--text-secondary)}button:disabled{cursor:not-allowed;opacity:.55}.stats{display:grid;grid-template-columns:repeat(5,1fr);margin-top:20px;background:white;border:1px solid var(--border-subtle);border-radius:8px}.stats>div{display:flex;min-height:64px;align-items:center;justify-content:space-between;padding:0 15px;border-right:1px solid var(--border-subtle)}.stats>div:last-child{border:0}.stats span{color:var(--text-secondary);font-size:12px}.stats strong{font-family:var(--font-data);font-size:18px}.toolbar{display:flex;align-items:center;gap:8px;margin-top:12px}.search-field{display:flex;min-width:230px;height:36px;align-items:center;gap:7px;padding:0 10px;background:white;border:1px solid var(--border-subtle);border-radius:7px;color:var(--text-tertiary)}.toolbar input{width:100%;border:0;outline:0}.toolbar select{height:36px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:7px;background:white}.batch-actions{display:flex;align-items:center;gap:7px;margin-left:auto;padding-left:12px;border-left:1px solid var(--border-subtle)}.batch-actions>span{color:var(--text-secondary);font-size:12px}.batch-actions button{border:1px solid var(--border-subtle);background:white;color:var(--text-secondary)}.batch-actions .danger{border-color:#ebc7c0;background:#fff5f3;color:#a63e31}.message{overflow-wrap:anywhere;padding:8px 11px;background:#edf5ff;border:1px solid #d3e3f8;border-radius:7px;color:#3f67a2;font-size:12px}.error-message,.editor-error{background:#fff2f0;border-color:#f0ccc6;color:#a33d31}.table-wrap{margin-top:12px;overflow:hidden;background:white;border:1px solid var(--border-subtle);border-radius:8px}.table{min-width:900px}.row{display:grid;min-height:55px;grid-template-columns:28px minmax(155px,1.2fr) 62px 95px 74px minmax(110px,1fr) 105px 62px;align-items:center;gap:9px;padding:0 13px;border-bottom:1px solid var(--border-subtle);font-size:12px}.head{min-height:40px;background:#f6f8fb;color:var(--text-tertiary);font-weight:650}.check{display:grid;width:19px;height:19px;padding:0;border:1px solid var(--border-subtle);border-radius:4px;background:white;color:transparent;place-items:center}.check[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:white}.code{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:6px;padding:0;border:0;background:transparent;color:var(--text-primary)}.code strong{overflow:hidden;font-family:var(--font-data);text-overflow:ellipsis}.row>div{display:grid;gap:3px}.row small{color:var(--text-tertiary)}.row em{width:max-content;padding:3px 6px;background:#eaf8f1;border-radius:4px;color:#277a58;font-style:normal}.row em.used,.row em.expired,.row em.disabled{background:#eff2f5;color:#737d89}.actions{display:flex!important;gap:4px}.actions button{display:grid;width:27px;height:27px;border:0;border-radius:5px;background:var(--bg-base);color:var(--text-tertiary);place-items:center}.loading{display:grid;gap:9px;padding:16px}.loading i{height:42px;background:linear-gradient(90deg,#edf1f5,#f7f9fb,#edf1f5);background-size:200% 100%;border-radius:6px;animation:shimmer 1.4s infinite}.empty{display:grid;min-height:210px;align-content:center;justify-items:center;gap:7px;color:var(--text-secondary)}.empty strong{color:var(--text-primary);font-size:15px}.empty span{font-size:13px}.empty button{height:34px;margin-top:5px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:7px;background:white}.backdrop{position:fixed;z-index:100;inset:0;display:grid;background:rgba(28,39,56,.22);backdrop-filter:blur(10px);place-items:center}.editor{width:min(520px,calc(100% - 48px));background:white;border-radius:10px;box-shadow:0 25px 70px rgba(28,42,62,.24)}.editor>header{display:flex;justify-content:space-between;padding:20px;border-bottom:1px solid var(--border-subtle)}.editor h2{margin:0;font-size:18px}.editor header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}.editor header button{border:0;background:transparent}.editor form{display:grid;grid-template-columns:repeat(2,1fr);gap:13px;padding:19px 20px}.editor label{display:grid;gap:5px}.editor label span{color:var(--text-secondary);font-size:12px}.editor input,.editor select{height:38px;padding:0 9px;border:1px solid var(--border-subtle);border-radius:7px}.editor-error{grid-column:1/-1;margin:0;padding:8px 10px;border:1px solid;border-radius:7px;font-size:12px}.editor footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.editor footer button{display:flex;height:36px;align-items:center;gap:7px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:7px;background:white}.editor footer .save{background:var(--accent);color:white}.spinning{animation:spin .8s linear infinite}@keyframes shimmer{to{background-position:-200% 0}}@keyframes spin{to{transform:rotate(360deg)}}@container app-content (max-width:900px){.page{padding:24px}.stats{grid-template-columns:repeat(2,1fr)}.stats>div{border-bottom:1px solid var(--border-subtle)}.toolbar{flex-wrap:wrap}.batch-actions{width:100%;margin-left:0;padding:8px 0 0;border-top:1px solid var(--border-subtle);border-left:0}.table-wrap{overflow-x:auto}}@container app-content (max-width:680px){.page-header{align-items:flex-start;flex-direction:column;gap:15px}.header-actions{width:100%}.header-actions button{flex:1}.toolbar .search-field{min-width:100%}.editor form{grid-template-columns:1fr}.editor form>*{grid-column:1}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
