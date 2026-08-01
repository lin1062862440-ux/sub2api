<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, KeyRound, RefreshCw } from '@lucide/vue'
import { useRouter } from 'vue-router'

import * as api from '@/api'
import AuthShell from '@/components/AuthShell.vue'
import { passwordsMatch } from '@/lib/auth'
import { clearResetHandoff, consumeResetHandoff } from '@/lib/deep-link'
import { ApiError } from '@/lib/http'

const router = useRouter()
const handoff = consumeResetHandoff()
const password = ref('')
const confirmation = ref('')
const submitting = ref(false)
const success = ref(false)
const error = ref('')
const invalidLink = !handoff
const canSubmit = computed(() => !submitting.value && password.value.length >= 6 && passwordsMatch(password.value, confirmation.value))

function messageFor(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 0) return '无法连接到 LinAI，请检查网络后重试'
  return reason instanceof ApiError ? reason.message || '链接无效或已过期，请重新申请' : '链接无效或已过期，请重新申请'
}

async function submit() {
  if (!canSubmit.value || !handoff) return
  submitting.value = true
  error.value = ''
  try {
    await api.resetPassword({ email: handoff.email, token: handoff.token, new_password: password.value })
    clearResetHandoff()
    success.value = true
  } catch (reason) {
    error.value = messageFor(reason)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell title="设置新密码" subtitle="密码更新后即可使用新密码登录。" @back="router.replace({ name: 'login' })">
    <div v-if="invalidLink" class="auth-message auth-message--warning" data-testid="reset-invalid-link">
      此重置链接无效或已过期，请重新申请密码重置邮件。
      <button class="primary-action" type="button" @click="router.replace({ name: 'forgot-password' })"><span>重新申请</span><ArrowRight :size="17" /></button>
    </div>
    <div v-else-if="success" class="auth-success" data-testid="reset-success">
      <strong>密码已更新</strong>
      <p>你现在可以使用新密码登录 LinAI。</p>
      <button class="primary-action" type="button" @click="router.replace({ name: 'login' })"><span>返回登录</span><ArrowRight :size="17" /></button>
    </div>
    <form v-else class="auth-form" @submit.prevent="submit">
      <label class="control"><span>新密码</span><span class="input-shell"><KeyRound :size="17" /><input v-model="password" data-testid="reset-password" type="password" autocomplete="new-password" placeholder="至少 6 位字符" :disabled="submitting" autofocus /></span></label>
      <label class="control"><span>确认新密码</span><span class="input-shell"><KeyRound :size="17" /><input v-model="confirmation" data-testid="reset-password-confirm" type="password" autocomplete="new-password" placeholder="再次输入密码" :disabled="submitting" /></span></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-action" data-testid="reset-submit" type="submit" :disabled="!canSubmit"><span>{{ submitting ? '正在更新' : '更新密码' }}</span><RefreshCw v-if="submitting" :size="17" class="spinning" /><ArrowRight v-else :size="17" /></button>
    </form>
  </AuthShell>
</template>
