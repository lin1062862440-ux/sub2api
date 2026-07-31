<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Mail, RefreshCw } from '@lucide/vue'
import { useRouter } from 'vue-router'

import * as api from '@/api'
import AuthShell from '@/components/AuthShell.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { isValidEmail } from '@/lib/auth'
import { ApiError } from '@/lib/http'
import { session } from '@/stores/session'

const router = useRouter()
const email = ref('')
const turnstileToken = ref('')
const submitting = ref(false)
const sent = ref(false)
const error = ref('')
const settings = computed(() => session.settings)
const enabled = computed(() => settings.value?.password_reset_enabled !== false)
const turnstileRequired = computed(() => settings.value?.turnstile_enabled === true && Boolean(settings.value.turnstile_site_key))
const canSubmit = computed(() => !submitting.value && isValidEmail(email.value.trim()) && (!turnstileRequired.value || turnstileToken.value.length > 0))

function messageFor(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 0) return '无法连接到 LinAI，请检查网络后重试'
  return reason instanceof ApiError ? reason.message || '发送失败，请重试' : '发送失败，请重试'
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    await api.forgotPassword({ email: email.value.trim(), reset_target: 'desktop', ...(turnstileRequired.value ? { turnstile_token: turnstileToken.value } : {}) })
    sent.value = true
  } catch (reason) {
    error.value = messageFor(reason)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell title="找回密码" subtitle="输入邮箱，我们会发送一封密码重置邮件。" @back="router.replace({ name: 'login' })">
    <div v-if="!enabled" class="auth-message auth-message--warning">当前暂未开放密码找回。</div>
    <div v-else-if="sent" class="auth-success" data-testid="forgot-success">
      <strong>邮件已发送</strong>
      <p>如果邮箱已注册，你会很快收到重置密码的邮件。请在客户端中打开邮件里的链接。</p>
      <button class="primary-action" type="button" @click="router.replace({ name: 'login' })"><span>返回登录</span><ArrowRight :size="17" /></button>
    </div>
    <form v-else class="auth-form" @submit.prevent="submit">
      <label class="control"><span>邮箱</span><span class="input-shell"><Mail :size="17" /><input v-model="email" data-testid="forgot-email" type="email" autocomplete="email" placeholder="name@example.com" :disabled="submitting" autofocus /></span></label>
      <TurnstileWidget v-if="turnstileRequired" :site-key="settings?.turnstile_site_key ?? ''" @verify="turnstileToken = $event" @expire="turnstileToken = ''" @error="turnstileToken = ''" />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-action" data-testid="forgot-submit" type="submit" :disabled="!canSubmit"><span>{{ submitting ? '正在发送' : '发送重置邮件' }}</span><RefreshCw v-if="submitting" :size="17" class="spinning" /><ArrowRight v-else :size="17" /></button>
    </form>
  </AuthShell>
</template>
