<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, RefreshCw, UserRound } from '@lucide/vue'
import { useRouter } from 'vue-router'

import * as api from '@/api'
import AuthShell from '@/components/AuthShell.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { isAllowedRegistrationEmail, isValidEmail, isValidVerificationCode, passwordsMatch } from '@/lib/auth'
import { ApiError } from '@/lib/http'
import { completeLogin, session } from '@/stores/session'

const router = useRouter()
const stage = ref<'details' | 'verify'>('details')
const username = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const verifyCode = ref('')
const turnstileToken = ref('')
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const showPassword = ref(false)
const submitting = ref(false)
const resendCountdown = ref(0)
const error = ref('')
let countdownTimer: ReturnType<typeof setInterval> | null = null

const settings = computed(() => session.settings)
const registrationEnabled = computed(() => settings.value?.registration_enabled !== false)
const emailVerificationEnabled = computed(() => settings.value?.email_verify_enabled === true)
const turnstileRequired = computed(
  () => settings.value?.turnstile_enabled === true && Boolean(settings.value.turnstile_site_key),
)
const suffixes = computed(() => settings.value?.registration_email_suffix_whitelist ?? [])
const canSubmitDetails = computed(
  () =>
    !submitting.value &&
    username.value.trim().length > 0 &&
    isValidEmail(email.value.trim()) &&
    password.value.length >= 6 &&
    passwordsMatch(password.value, passwordConfirmation.value) &&
    (!turnstileRequired.value || turnstileToken.value.length > 0),
)
const canSubmitVerification = computed(
  () => !submitting.value && isValidVerificationCode(verifyCode.value),
)

function messageFor(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError) {
    if (reason.status === 0) return '无法连接到 LinAI，请检查网络后重试'
    return reason.message || fallback
  }
  return fallback
}

function startCountdown(seconds: number) {
  if (countdownTimer) clearInterval(countdownTimer)
  resendCountdown.value = Math.max(0, seconds)
  countdownTimer = setInterval(() => {
    resendCountdown.value -= 1
    if (resendCountdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function submitDetails() {
  if (!canSubmitDetails.value) return
  error.value = ''
  if (!isAllowedRegistrationEmail(email.value.trim(), suffixes.value)) {
    error.value = `仅支持 ${suffixes.value.join('、')} 邮箱注册`
    return
  }

  submitting.value = true
  try {
    if (emailVerificationEnabled.value) {
      const result = await api.sendVerifyCode({
        email: email.value.trim(),
        ...(turnstileRequired.value ? { turnstile_token: turnstileToken.value } : {}),
      })
      startCountdown(result.countdown)
      stage.value = 'verify'
      return
    }
    await registerAccount()
  } catch (reason) {
    error.value = messageFor(reason, '注册失败，请重试')
    if (turnstileRequired.value) {
      turnstileToken.value = ''
      turnstileRef.value?.reset()
    }
  } finally {
    submitting.value = false
  }
}

async function registerAccount() {
  const response = await api.register({
    username: username.value.trim(),
    email: email.value.trim(),
    password: password.value,
    ...(emailVerificationEnabled.value ? { verify_code: verifyCode.value.replace(/\s/g, '') } : {}),
    ...(turnstileRequired.value ? { turnstile_token: turnstileToken.value } : {}),
  })
  await completeLogin(response)
  await router.replace({ name: 'dashboard' })
}

async function submitVerification() {
  if (!canSubmitVerification.value) return
  submitting.value = true
  error.value = ''
  try {
    await registerAccount()
  } catch (reason) {
    error.value = messageFor(reason, '验证码不正确或已过期')
  } finally {
    submitting.value = false
  }
}

async function resendCode() {
  if (resendCountdown.value > 0 || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const result = await api.sendVerifyCode({ email: email.value.trim() })
    startCountdown(result.countdown)
  } catch (reason) {
    error.value = messageFor(reason, '验证码发送失败，请重试')
  } finally {
    submitting.value = false
  }
}

function backToDetails() {
  stage.value = 'details'
  verifyCode.value = ''
  error.value = ''
}

function acceptTurnstile(token: string) {
  turnstileToken.value = token
  error.value = ''
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <AuthShell
    :title="stage === 'details' ? '创建 LinAI 账号' : '验证邮箱'"
    :subtitle="stage === 'details' ? '注册后即可进入控制台。' : `输入发送至 ${email} 的 6 位验证码。`"
    @back="stage === 'details' ? router.replace({ name: 'login' }) : backToDetails()"
  >
    <div v-if="!registrationEnabled" class="auth-message auth-message--warning" data-testid="registration-disabled">
      当前暂未开放注册，请稍后再试。
    </div>

    <form v-else-if="stage === 'details'" class="auth-form" @submit.prevent="submitDetails">
      <label class="control">
        <span>用户名</span>
        <span class="input-shell"><UserRound :size="17" /><input v-model="username" data-testid="register-username" autocomplete="username" placeholder="输入用户名" :disabled="submitting" /></span>
      </label>
      <label class="control">
        <span>邮箱</span>
        <span class="input-shell"><Mail :size="17" /><input v-model="email" data-testid="register-email" type="email" autocomplete="email" placeholder="name@example.com" :disabled="submitting" /></span>
        <small v-if="suffixes.length" class="field-hint">支持 {{ suffixes.join('、') }}</small>
      </label>
      <label class="control">
        <span>密码</span>
        <span class="input-shell"><KeyRound :size="17" /><input v-model="password" data-testid="register-password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 6 位字符" :disabled="submitting" /><button class="reveal-action" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" :size="17" /></button></span>
      </label>
      <label class="control">
        <span>确认密码</span>
        <span class="input-shell"><KeyRound :size="17" /><input v-model="passwordConfirmation" data-testid="register-password-confirm" type="password" autocomplete="new-password" placeholder="再次输入密码" :disabled="submitting" /></span>
      </label>
      <TurnstileWidget v-if="turnstileRequired" ref="turnstileRef" :site-key="settings?.turnstile_site_key ?? ''" @verify="acceptTurnstile" />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-action" data-testid="register-submit" type="submit" :disabled="!canSubmitDetails"><span>{{ submitting ? '正在处理' : emailVerificationEnabled ? '继续验证邮箱' : '创建账号' }}</span><RefreshCw v-if="submitting" :size="17" class="spinning" /><ArrowRight v-else :size="17" /></button>
    </form>

    <form v-else class="auth-form" @submit.prevent="submitVerification">
      <label class="control"><span>邮箱验证码</span><span class="input-shell code-shell"><Mail :size="17" /><input v-model="verifyCode" data-testid="register-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字" :disabled="submitting" /></span></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-action" data-testid="verify-submit" type="submit" :disabled="!canSubmitVerification"><span>{{ submitting ? '正在创建' : '验证并创建账号' }}</span><RefreshCw v-if="submitting" :size="17" class="spinning" /><ArrowRight v-else :size="17" /></button>
      <button class="text-action auth-secondary-action" type="button" :disabled="resendCountdown > 0 || submitting" @click="resendCode">{{ resendCountdown > 0 ? `${resendCountdown} 秒后重新发送` : '重新发送验证码' }}</button>
    </form>
  </AuthShell>
</template>
