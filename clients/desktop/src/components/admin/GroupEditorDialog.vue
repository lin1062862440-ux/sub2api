<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { X } from '@lucide/vue'

import type {
  AdminGroup,
  AdminGroupPlatform,
  AdminGroupSubscriptionType,
  CreateAdminGroupRequest,
} from '@/api/admin/types'

const props = withDefaults(defineProps<{
  modelValue: boolean
  group: AdminGroup | null
  pending?: boolean
  mobile?: boolean
  error?: string
}>(), { pending: false, mobile: false, error: '' })

const emit = defineEmits<{
  close: []
  save: [payload: CreateAdminGroupRequest]
}>()

type NumberInput = number | string

interface GroupForm {
  name: string
  description: string
  platform: AdminGroupPlatform
  rateMultiplier: NumberInput
  rpmLimit: NumberInput
  isExclusive: boolean
  subscriptionType: AdminGroupSubscriptionType
  dailyLimit: NumberInput
  weeklyLimit: NumberInput
  monthlyLimit: NumberInput
}

const form = reactive<GroupForm>({
  name: '',
  description: '',
  platform: 'anthropic',
  rateMultiplier: 1,
  rpmLimit: 0,
  isExclusive: false,
  subscriptionType: 'standard',
  dailyLimit: '',
  weeklyLimit: '',
  monthlyLimit: '',
})
const displayError = computed(() => props.mobile && props.error
  ? '分组保存失败，请稍后重试。'
  : props.error)

function resetForm() {
  const group = props.group
  form.name = group?.name ?? ''
  form.description = group?.description ?? ''
  form.platform = group?.platform ?? 'anthropic'
  form.rateMultiplier = group?.rate_multiplier ?? 1
  form.rpmLimit = group?.rpm_limit ?? 0
  form.isExclusive = group?.is_exclusive ?? false
  form.subscriptionType = group?.subscription_type ?? 'standard'
  form.dailyLimit = group?.daily_limit_usd ?? ''
  form.weeklyLimit = group?.weekly_limit_usd ?? ''
  form.monthlyLimit = group?.monthly_limit_usd ?? ''
}

function nullablePositiveNumber(value: NumberInput): number | null {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nonNegativeNumber(value: NumberInput, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function submit() {
  const name = form.name.trim()
  if (!name) return
  emit('save', {
    name,
    description: form.description.trim(),
    platform: form.platform,
    rate_multiplier: nonNegativeNumber(form.rateMultiplier, 1),
    rpm_limit: Math.round(nonNegativeNumber(form.rpmLimit, 0)),
    is_exclusive: form.isExclusive,
    subscription_type: form.subscriptionType,
    daily_limit_usd: nullablePositiveNumber(form.dailyLimit),
    weekly_limit_usd: nullablePositiveNumber(form.weeklyLimit),
    monthly_limit_usd: nullablePositiveNumber(form.monthlyLimit),
  })
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm()
  },
)
</script>

<template>
  <Transition name="fade">
    <div v-if="modelValue" class="dialog-backdrop" :class="{ mobile }" @mousedown.self="emit('close')">
      <section class="group-editor" :class="{ mobile }" role="dialog" aria-modal="true" :aria-label="group ? '编辑分组' : '新增分组'">
        <header>
          <div>
            <span>{{ group ? 'GROUP SETTINGS' : 'NEW GROUP' }}</span>
            <h2>{{ group ? '编辑分组' : '新增分组' }}</h2>
          </div>
          <button type="button" title="关闭" aria-label="关闭" data-testid="group-editor-close" @click="emit('close')"><X :size="18" /></button>
        </header>

        <form data-testid="group-editor" @submit.prevent="submit">
          <div class="form-section">
            <div class="section-heading"><strong>基础信息</strong><span>定义分组身份和上游平台</span></div>
            <div class="form-grid">
              <label class="wide">
                <span>分组名称</span>
                <input v-model="form.name" data-testid="group-name" required maxlength="80" autocomplete="off" />
              </label>
              <label class="wide">
                <span>描述</span>
                <textarea v-model="form.description" data-testid="group-description" rows="2" maxlength="240" />
              </label>
              <label>
                <span>平台</span>
                <select v-model="form.platform" data-testid="group-platform">
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="antigravity">Antigravity</option>
                  <option value="grok">Grok</option>
                  <option value="composite">聚合平台</option>
                </select>
              </label>
              <label>
                <span>消费类型</span>
                <select v-model="form.subscriptionType" data-testid="group-subscription-type">
                  <option value="standard">余额消费</option>
                  <option value="subscription">订阅额度</option>
                </select>
              </label>
            </div>
          </div>

          <div class="form-section">
            <div class="section-heading"><strong>调度与计费</strong><span>控制请求成本与速率上限</span></div>
            <div class="form-grid">
              <label>
                <span>计费倍率</span>
                <input v-model="form.rateMultiplier" data-testid="group-rate-multiplier" type="number" min="0" step="0.01" />
              </label>
              <label>
                <span>每用户 RPM</span>
                <input v-model="form.rpmLimit" data-testid="group-rpm-limit" type="number" min="0" step="1" />
                <small>0 表示不限制</small>
              </label>
              <label class="toggle-row wide">
                <span><strong>专属分组</strong><small>仅允许被明确授权的用户使用</small></span>
                <input v-model="form.isExclusive" data-testid="group-exclusive" type="checkbox" />
              </label>
            </div>
          </div>

          <div class="form-section quota-section">
            <div class="section-heading"><strong>额度窗口</strong><span>留空表示该窗口不限制</span></div>
            <div class="quota-grid">
              <label><span>日额度</span><div><i>$</i><input v-model="form.dailyLimit" data-testid="group-daily-limit" type="number" min="0" step="0.01" placeholder="不限" /></div></label>
              <label><span>周额度</span><div><i>$</i><input v-model="form.weeklyLimit" data-testid="group-weekly-limit" type="number" min="0" step="0.01" placeholder="不限" /></div></label>
              <label><span>月额度</span><div><i>$</i><input v-model="form.monthlyLimit" data-testid="group-monthly-limit" type="number" min="0" step="0.01" placeholder="不限" /></div></label>
            </div>
          </div>

          <p v-if="displayError" class="form-error" role="alert">{{ displayError }}</p>

          <footer>
            <button type="button" @click="emit('close')">取消</button>
            <button class="save" type="submit" data-testid="group-editor-save" :disabled="pending || !form.name.trim()">{{ pending ? '正在保存' : '保存分组' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop{position:fixed;z-index:140;inset:0;display:grid;padding:24px;background:rgba(25,37,54,.25);backdrop-filter:blur(10px);place-items:center}.group-editor{width:min(640px,100%);max-height:min(760px,calc(100vh - 48px));overflow:auto;background:#fff;border:1px solid var(--border-subtle);border-radius:8px;box-shadow:0 28px 76px rgba(29,44,65,.25)}.group-editor>header{position:sticky;z-index:2;top:0;display:flex;align-items:flex-start;justify-content:space-between;padding:20px 22px;border-bottom:1px solid var(--border-subtle);background:rgba(255,255,255,.96)}.group-editor header span{display:block;margin-bottom:4px;color:var(--accent);font-size:10px;font-weight:750}.group-editor h2{font-size:18px}.group-editor header button{display:grid;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}.group-editor form{display:grid}.form-section{padding:18px 22px;border-bottom:1px solid var(--border-subtle)}.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:13px}.section-heading strong{font-size:12px}.section-heading span{color:var(--text-tertiary);font-size:10px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.form-grid label,.quota-grid label{display:grid;gap:6px}.form-grid label>span,.quota-grid label>span{color:var(--text-secondary);font-size:11px;font-weight:650}.form-grid input,.form-grid select,.form-grid textarea,.quota-grid input{width:100%;border:1px solid var(--border-subtle);border-radius:7px;background:#fbfcfe;color:var(--text-primary);font:inherit;outline:0}.form-grid input,.form-grid select{height:38px;padding:0 10px}.form-grid textarea{padding:9px 10px;resize:vertical;line-height:1.5}.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus,.quota-grid input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(69,112,184,.1)}.form-grid small{color:var(--text-tertiary);font-size:9px}.wide{grid-column:1/-1}.toggle-row{display:flex!important;min-height:50px;align-items:center;justify-content:space-between;padding:9px 11px;border:1px solid var(--border-subtle);border-radius:7px;background:#f8fafc}.toggle-row>span{display:grid;gap:3px}.toggle-row input{width:34px;height:18px;accent-color:var(--accent)}.quota-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.quota-grid label>div{display:grid;grid-template-columns:26px minmax(0,1fr);height:38px;overflow:hidden;border:1px solid var(--border-subtle);border-radius:7px;background:#fbfcfe}.quota-grid i{display:grid;border-right:1px solid var(--border-subtle);color:var(--text-tertiary);font-style:normal;place-items:center}.quota-grid input{height:100%;padding:0 8px;border:0;border-radius:0}.form-error{margin:0;padding:11px 22px;border-bottom:1px solid #efd5cf;background:#fff7f5;color:#a14639;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.group-editor footer{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;background:#f7f9fc;border-top:1px solid var(--border-subtle)}.group-editor footer button{height:36px;padding:0 14px;border:1px solid var(--border-subtle);border-radius:7px;background:#fff;color:var(--text-secondary)}.group-editor footer .save{border-color:var(--accent);background:var(--accent);color:#fff}.group-editor footer button:disabled{opacity:.5}.fade-enter-active,.fade-leave-active{transition:opacity 160ms}.fade-enter-from,.fade-leave-to{opacity:0}@media(max-width:620px){.dialog-backdrop{padding:12px}.form-grid,.quota-grid{grid-template-columns:1fr}.form-grid>*{grid-column:1}.section-heading{align-items:flex-start;flex-direction:column;gap:3px}}.dialog-backdrop.mobile{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));align-items:center}.group-editor.mobile{width:100%;max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);overscroll-behavior:contain}.group-editor.mobile>header{padding:14px 16px}.group-editor.mobile h2,.group-editor.mobile .section-heading span,.group-editor.mobile label>span,.group-editor.mobile small{overflow-wrap:anywhere}.group-editor.mobile header button{width:44px;height:44px}.group-editor.mobile .form-section{padding:16px}.group-editor.mobile .form-error{padding:11px 16px}.group-editor.mobile .form-grid,.group-editor.mobile .quota-grid{grid-template-columns:minmax(0,1fr)}.group-editor.mobile .form-grid>*{grid-column:1}.group-editor.mobile .form-grid input{min-height:44px;height:auto}.group-editor.mobile .form-grid select{min-height:44px;height:auto}.group-editor.mobile .form-grid textarea{min-height:88px}.group-editor.mobile .quota-grid label>div{height:44px}.group-editor.mobile .toggle-row{min-height:56px}.group-editor.mobile footer{flex-wrap:wrap;padding:12px 16px max(12px,env(safe-area-inset-bottom))}.group-editor.mobile footer button{min-height:44px;height:auto;flex:1 1 120px;white-space:normal}
</style>
