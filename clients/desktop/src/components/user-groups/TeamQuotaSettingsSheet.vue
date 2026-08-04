<script setup lang="ts">
import { RefreshCw, Save, Settings2, UsersRound, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { UserGroupQuotaOverview } from '@/api/user-groups'
import { formatDateTime } from '@/lib/format'

export interface TeamQuotaPolicyDraft {
  enabled: boolean
  weeklyLimit: number
  teamSubscriptionIds: number[]
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  overview: UserGroupQuotaOverview | null
  mobile?: boolean
  saving?: boolean
  resetting?: boolean
  error?: string
}>(), {
  mobile: false,
  saving: false,
  resetting: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [draft: TeamQuotaPolicyDraft]
  manage: []
  reset: []
}>()

const platforms = ['openai', 'anthropic'] as const
const enabled = ref(false)
const weeklyLimit = ref('0')
const selections = reactive<Record<(typeof platforms)[number], string>>({ openai: '', anthropic: '' })
const initialSnapshot = ref('')

const selectedIds = computed(() => platforms.map((platform) => selections[platform]).filter(Boolean).map(Number))
const valid = computed(() => !enabled.value || (Number(weeklyLimit.value) > 0 && selectedIds.value.length > 0))
const currentSnapshot = computed(() => JSON.stringify({
  enabled: enabled.value,
  weeklyLimit: weeklyLimit.value,
  selections: { ...selections },
}))
const dirty = computed(() => currentSnapshot.value !== initialSnapshot.value)

function available(platform: string) {
  return (props.overview?.available_team_subscription_groups ?? []).filter((item) => item.platform === platform)
}

function hydrate() {
  if (!props.overview) return
  enabled.value = props.overview.policy.enabled
  weeklyLimit.value = String(props.overview.policy.weekly_limit_usd || 0)
  selections.openai = ''
  selections.anthropic = ''
  for (const source of props.overview.team_subscription_groups) {
    if (source.platform === 'openai' || source.platform === 'anthropic') {
      selections[source.platform] = String(source.billing_group_id)
    }
  }
  initialSnapshot.value = currentSnapshot.value
}

function close() {
  if (props.saving || props.resetting) return
  if (dirty.value && !window.confirm('当前配额设置尚未保存，确认关闭？')) return
  emit('update:modelValue', false)
}

function confirmDiscardDraft(action: string) {
  return !dirty.value || window.confirm(`当前配额设置尚未保存，继续${action}将丢弃这些修改。确认继续？`)
}

function save() {
  if (!valid.value || props.saving) return
  emit('save', {
    enabled: enabled.value,
    weeklyLimit: Math.max(0, Number(weeklyLimit.value) || 0),
    teamSubscriptionIds: selectedIds.value,
  })
}

function reset() {
  if (
    props.resetting
    || !confirmDiscardDraft('重置本周用量')
    || !window.confirm('确认立即清零本周团队及成员配额用量？')
  ) return
  emit('reset')
}

function manage() {
  if (props.saving || props.resetting || !confirmDiscardDraft('管理配额管理员')) return
  emit('manage')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
}

watch(() => [props.modelValue, props.overview] as const, ([open]) => {
  if (open) hydrate()
}, { immediate: true })

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="team-quota-sheet">
      <div v-if="modelValue" class="team-quota-backdrop" @mousedown.self="close">
        <section
          class="team-quota-sheet"
          :class="{ 'team-quota-sheet--mobile': mobile }"
          data-testid="team-quota-settings"
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-quota-settings-title"
        >
          <header class="team-quota-sheet__header">
            <span><Settings2 :size="19" /></span>
            <div>
              <h2 id="team-quota-settings-title">设置周配额</h2>
              <p>设置团队共享额度、订阅来源和配额管理员。</p>
            </div>
            <button type="button" data-testid="close-team-quota-settings" aria-label="关闭" :disabled="saving || resetting" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="team-quota-sheet__body">
            <label class="team-quota-toggle">
              <input v-model="enabled" type="checkbox" />
              <span><strong>启用团队周配额</strong><small>启用后，成员请求共同消耗团队额度。</small></span>
            </label>

            <label class="team-quota-field">
              <span>团队周配额 (USD)</span>
              <input v-model="weeklyLimit" data-testid="team-weekly-limit" type="number" min="0" step="0.01" :disabled="!enabled" />
            </label>

            <div class="team-quota-sources">
              <div><strong>团队订阅来源</strong><small>至少选择一个可用订阅来源。</small></div>
              <label v-for="platform in platforms" :key="platform" class="team-quota-field">
                <span>{{ platform.toUpperCase() }}</span>
                <select v-model="selections[platform]" :data-testid="`team-source-${platform}`" :disabled="!enabled">
                  <option value="">不绑定</option>
                  <option v-for="item in available(platform)" :key="item.billing_group_id" :value="String(item.billing_group_id)">{{ item.name }}</option>
                </select>
              </label>
            </div>

            <p v-if="!valid" class="team-quota-validation" data-testid="team-quota-validation" role="alert">
              启用团队周配额时，额度必须大于 0，且至少绑定一个团队订阅。
            </p>
            <p v-if="error" class="team-quota-error" role="alert">{{ error }}</p>

            <section class="team-quota-management">
              <div>
                <strong>配额管理员</strong>
                <small>{{ overview?.managers.length || 0 }} 人可调整成员额度</small>
              </div>
              <button type="button" data-testid="manage-quota-managers" :disabled="saving || resetting" @click="manage">
                <UsersRound :size="16" />管理
              </button>
            </section>

            <section class="team-quota-reset">
              <div>
                <strong>本周用量</strong>
                <small>下次重置：{{ overview?.policy.weekly_reset_at ? formatDateTime(overview.policy.weekly_reset_at) : '-' }}</small>
              </div>
              <button type="button" data-testid="reset-team-quota" :disabled="resetting || !overview?.policy.enabled" @click="reset">
                <RefreshCw :size="16" :class="{ spinning: resetting }" />{{ resetting ? '重置中' : '立即重置' }}
              </button>
            </section>
          </div>

          <footer class="team-quota-sheet__footer">
            <button type="button" class="secondary" :disabled="saving || resetting" @click="close">取消</button>
            <button type="button" class="primary" data-testid="save-team-policy" :disabled="saving || resetting || !valid" @click="save">
              <Save :size="16" />{{ saving ? '保存中' : '保存设置' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.team-quota-backdrop{position:fixed;z-index:1300;inset:0;background:rgba(23,27,36,.28)}
.team-quota-sheet{position:absolute;top:0;right:0;display:grid;width:min(440px,100vw);height:100%;grid-template-rows:auto minmax(0,1fr) auto;background:var(--bg-surface);box-shadow:-16px 0 36px rgba(23,27,36,.16)}
.team-quota-sheet__header{display:grid;grid-template-columns:38px minmax(0,1fr) 32px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}
.team-quota-sheet__header>span{display:grid;width:36px;height:36px;border-radius:7px;background:var(--accent-soft);color:var(--accent-strong);place-items:center}
.team-quota-sheet__header h2{font-size:17px}.team-quota-sheet__header p{margin-top:3px;color:var(--text-tertiary);font-size:11px}.team-quota-sheet__header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}
.team-quota-sheet__body{display:grid;align-content:start;gap:14px;padding:18px;overflow:auto}.team-quota-toggle{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border-subtle);border-radius:8px}.team-quota-toggle>span,.team-quota-sources>div,.team-quota-management>div,.team-quota-reset>div{display:grid;gap:3px}.team-quota-toggle strong,.team-quota-sources strong,.team-quota-management strong,.team-quota-reset strong{font-size:13px}.team-quota-toggle small,.team-quota-sources small,.team-quota-management small,.team-quota-reset small{color:var(--text-tertiary);font-size:11px}
.team-quota-field{display:grid;gap:6px}.team-quota-field>span{color:var(--text-secondary);font-size:12px;font-weight:650}.team-quota-field input,.team-quota-field select{width:100%;height:40px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;background:white;color:var(--text-primary)}.team-quota-sources{display:grid;gap:10px;padding-top:2px}.team-quota-management,.team-quota-reset{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--border-subtle)}.team-quota-management button,.team-quota-reset button{display:flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary)}
.team-quota-validation,.team-quota-error{margin:0;padding:9px 10px;border-radius:6px;font-size:11px}.team-quota-validation{border:1px solid var(--warning-border);background:var(--warning-soft);color:var(--warning)}.team-quota-error{border:1px solid var(--coral-border);background:var(--coral-soft);color:var(--danger)}
.team-quota-sheet__footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--border-subtle)}.team-quota-sheet__footer button{display:flex;height:38px;align-items:center;justify-content:center;gap:6px;padding:0 14px;border:1px solid var(--border-subtle);border-radius:6px;font-weight:650}.team-quota-sheet__footer .secondary{background:white;color:var(--text-secondary)}.team-quota-sheet__footer .primary{border-color:var(--accent);background:var(--accent);color:white}.team-quota-sheet__footer button:disabled{opacity:.5}
.team-quota-sheet--mobile{top:auto;bottom:0;width:100%;height:min(88dvh,720px);padding-top:env(safe-area-inset-top);border-radius:8px 8px 0 0}.team-quota-sheet-enter-active,.team-quota-sheet-leave-active{transition:opacity 180ms ease}.team-quota-sheet-enter-active .team-quota-sheet,.team-quota-sheet-leave-active .team-quota-sheet{transition:transform 180ms ease}.team-quota-sheet-enter-from,.team-quota-sheet-leave-to{opacity:0}.team-quota-sheet-enter-from .team-quota-sheet,.team-quota-sheet-leave-to .team-quota-sheet{transform:translateX(20px)}
@media(max-width:680px){.team-quota-sheet:not(.team-quota-sheet--mobile){width:100%}}
@media(prefers-reduced-motion:reduce){.team-quota-sheet-enter-active,.team-quota-sheet-leave-active,.team-quota-sheet-enter-active .team-quota-sheet,.team-quota-sheet-leave-active .team-quota-sheet{transition:none}}
</style>
