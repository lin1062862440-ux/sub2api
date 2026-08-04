<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, X } from '@lucide/vue'

import * as api from '@/api'
import { ApiError } from '@/lib/http'
import { toast } from '@/stores/toast'

const props = withDefaults(defineProps<{
  modelValue: boolean
  toastFeedback?: boolean
}>(), {
  toastFeedback: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const currentPasswordInput = ref<HTMLInputElement | null>(null)
const showCurrentPassword = ref(false)
const showNewPasswords = ref(false)
const saving = ref(false)
const error = ref('')
const completed = ref(false)

const passwordLongEnough = computed(() => form.newPassword.length >= 8)
const passwordsMatch = computed(() => {
  return form.confirmPassword.length > 0 && form.newPassword === form.confirmPassword
})
const formFilled = computed(() => {
  return Boolean(form.currentPassword && form.newPassword && form.confirmPassword)
})

function resetDialog() {
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  showCurrentPassword.value = false
  showNewPasswords.value = false
  error.value = ''
  completed.value = false
}

function closeDialog() {
  if (saving.value) return
  emit('update:modelValue', false)
}

function clearError() {
  error.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) closeDialog()
}

async function submitPassword() {
  clearError()
  if (!form.currentPassword) {
    error.value = '请输入当前密码'
    return
  }
  if (!passwordLongEnough.value) {
    error.value = '新密码至少需要 8 位'
    return
  }
  if (!passwordsMatch.value) {
    error.value = '两次输入的新密码不一致'
    return
  }

  saving.value = true
  try {
    await api.changePassword({
      old_password: form.currentPassword,
      new_password: form.newPassword,
    })
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    if (props.toastFeedback) {
      toast.success('密码已修改', { detail: '下次登录时请使用新密码。' })
      emit('update:modelValue', false)
    } else {
      completed.value = true
    }
  } catch (caught) {
    const detail = caught instanceof ApiError && caught.message
      ? caught.message
      : caught instanceof Error && caught.message
        ? caught.message
        : '请稍后重试。'
    if (props.toastFeedback) toast.error('密码修改失败', { detail })
    else error.value = detail
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  async (opened) => {
    if (!opened) return
    resetDialog()
    await nextTick()
    currentPasswordInput.value?.focus()
  },
  { immediate: true },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="modelValue"
        class="dialog-backdrop"
        data-testid="password-dialog"
        @mousedown.self="closeDialog"
      >
        <section
          class="password-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-dialog-title"
        >
          <header class="dialog-head">
            <span class="dialog-mark"><ShieldCheck :size="20" /></span>
            <div>
              <h2 id="password-dialog-title">修改密码</h2>
              <p>更新用于登录 LinAI 的账户密码</p>
            </div>
            <button
              class="close-button"
              type="button"
              title="关闭"
              aria-label="关闭"
              data-testid="close-password-dialog"
              :disabled="saving"
              @click="closeDialog"
            >
              <X :size="17" />
            </button>
          </header>

          <div v-if="completed" class="success-state">
            <span class="success-mark"><Check :size="23" /></span>
            <h3>密码修改成功</h3>
            <p>下次登录时请使用新密码。</p>
            <button class="primary-button" type="button" @click="closeDialog">完成</button>
          </div>

          <form v-else @submit.prevent="submitPassword">
            <p v-if="error" class="notice-error" role="alert">{{ error }}</p>

            <label class="field">
              <span>当前密码</span>
              <div class="password-input">
                <KeyRound :size="16" />
                <input
                  ref="currentPasswordInput"
                  v-model="form.currentPassword"
                  data-testid="current-password"
                  :type="showCurrentPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="输入当前密码"
                  @input="clearError"
                >
                <button
                  type="button"
                  :title="showCurrentPassword ? '隐藏密码' : '显示密码'"
                  :aria-label="showCurrentPassword ? '隐藏密码' : '显示密码'"
                  @click="showCurrentPassword = !showCurrentPassword"
                >
                  <EyeOff v-if="showCurrentPassword" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
            </label>

            <label class="field">
              <span>新密码</span>
              <div class="password-input">
                <KeyRound :size="16" />
                <input
                  v-model="form.newPassword"
                  data-testid="new-password"
                  :type="showNewPasswords ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="至少 8 位"
                  @input="clearError"
                >
                <button
                  type="button"
                  :title="showNewPasswords ? '隐藏密码' : '显示密码'"
                  :aria-label="showNewPasswords ? '隐藏密码' : '显示密码'"
                  @click="showNewPasswords = !showNewPasswords"
                >
                  <EyeOff v-if="showNewPasswords" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
            </label>

            <label class="field">
              <span>确认新密码</span>
              <div class="password-input">
                <KeyRound :size="16" />
                <input
                  v-model="form.confirmPassword"
                  data-testid="confirm-password"
                  :type="showNewPasswords ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="再次输入新密码"
                  @input="clearError"
                >
              </div>
            </label>

            <div class="requirements" aria-label="密码要求">
              <span :class="{ met: passwordLongEnough }"><i />至少 8 位字符</span>
              <span :class="{ met: passwordsMatch }"><i />两次输入一致</span>
            </div>

            <footer class="dialog-actions">
              <span>密码不会保存在客户端中</span>
              <div>
                <button class="secondary-button" type="button" :disabled="saving" @click="closeDialog">
                  取消
                </button>
                <button class="primary-button" type="submit" :disabled="saving || !formFilled">
                  <LoaderCircle v-if="saving" class="spinning" :size="16" />
                  <Check v-else :size="16" />
                  {{ saving ? '正在修改' : '确认修改' }}
                </button>
              </div>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  padding: 28px;
  background: rgba(31, 45, 65, 0.18);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  place-items: center;
}

.password-dialog {
  width: min(100%, 468px);
  overflow: hidden;
  background: rgba(249, 252, 255, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: 8px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 30px 80px rgba(24, 42, 68, 0.25),
    0 4px 18px rgba(24, 42, 68, 0.12);
  backdrop-filter: blur(28px) saturate(1.3);
  -webkit-backdrop-filter: blur(28px) saturate(1.3);
}

.dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 16px;
  border-bottom: 1px solid rgba(175, 190, 210, 0.38);
}

.dialog-mark,
.success-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  background: rgba(220, 232, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 7px;
  color: var(--accent-strong);
  box-shadow: inset 0 0 0 1px rgba(63, 106, 190, 0.08);
  place-items: center;
}

.dialog-head > div { min-width: 0; flex: 1; }
.dialog-head h2 { font-size: 15px; font-weight: 720; }
.dialog-head p { margin-top: 2px; color: var(--text-tertiary); font-size: 13px; }

.close-button {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 6px;
  color: var(--text-tertiary);
  place-items: center;
}

.close-button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.72); color: var(--text-primary); }

form { display: grid; gap: 16px; padding: 18px; }
.field { display: grid; gap: 7px; }
.field > span { color: var(--text-secondary); font-size: 13px; font-weight: 650; }

.password-input {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 10px 0 12px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(171, 187, 208, 0.62);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  box-shadow: inset 0 1px 2px rgba(34, 53, 79, 0.035);
}

.password-input:focus-within { background: rgba(255, 255, 255, 0.82); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.password-input input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-primary); font-size: 14px; }
.password-input input::placeholder { color: #9aa6b5; }
.password-input button { display: grid; padding: 4px; background: transparent; border: 0; color: var(--text-tertiary); place-items: center; }
.password-input button:hover { color: var(--text-primary); }

.notice-error {
  padding: 9px 11px;
  background: rgba(255, 240, 243, 0.74);
  border: 1px solid var(--coral-border);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
}

.requirements { display: flex; flex-wrap: wrap; gap: 14px; color: var(--text-tertiary); font-size: 12px; }
.requirements span { display: flex; align-items: center; gap: 6px; }
.requirements i { width: 6px; height: 6px; background: var(--border-strong); border-radius: 50%; }
.requirements .met { color: var(--success); }
.requirements .met i { background: var(--success); }

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 2px -18px -18px;
  padding: 13px 18px;
  background: rgba(236, 242, 250, 0.48);
  border-top: 1px solid rgba(175, 190, 210, 0.34);
}

.dialog-actions > span { color: var(--text-tertiary); font-size: 12px; }
.dialog-actions > div { display: flex; gap: 7px; }
.primary-button,
.secondary-button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border: 1px solid; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650; }
.secondary-button { background: rgba(255, 255, 255, 0.48); border-color: rgba(171, 187, 208, 0.56); color: var(--text-secondary); }
.secondary-button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.8); color: var(--text-primary); }
.primary-button { background: var(--accent); border-color: var(--accent); color: #fff; }
.primary-button:hover:not(:disabled) { background: var(--accent-strong); }
.primary-button:disabled,
.secondary-button:disabled { opacity: 0.48; }

.success-state { display: grid; justify-items: center; padding: 34px 22px 24px; text-align: center; }
.success-mark { width: 46px; height: 46px; background: rgba(220, 245, 236, 0.78); color: var(--success); }
.success-state h3 { margin-top: 14px; font-size: 16px; }
.success-state p { margin-top: 4px; color: var(--text-tertiary); font-size: 13px; }
.success-state .primary-button { margin-top: 20px; min-width: 88px; }

.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 150ms ease; }
.dialog-fade-enter-active .password-dialog,
.dialog-fade-leave-active .password-dialog { transition: transform 170ms ease, opacity 150ms ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
.dialog-fade-enter-from .password-dialog,
.dialog-fade-leave-to .password-dialog { opacity: 0; transform: translateY(9px) scale(0.985); }

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
  .dialog-fade-enter-active,
  .dialog-fade-leave-active,
  .dialog-fade-enter-active .password-dialog,
  .dialog-fade-leave-active .password-dialog { transition: none; }
}
</style>
