<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
} from '@lucide/vue'

import * as api from '@/api'
import { isTotpRequired } from '@/api'
import BrandLogo from '@/components/BrandLogo.vue'
import BrandMotion from '@/components/BrandMotion.vue'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import { webUrl } from '@/config'
import { normalizeBrand } from '@/lib/brand'
import { ApiError } from '@/lib/http'
import { completeLogin, reloadSettings, session } from '@/stores/session'

const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const turnstileToken = ref('')
const turnstileRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const totpCode = ref('')
const tempToken = ref('')
const maskedEmail = ref('')
const stage = ref<'credentials' | 'totp'>('credentials')
const submitting = ref(false)
const error = ref('')

const settings = computed(() => session.settings)
const brand = computed(() => normalizeBrand(settings.value))
const turnstileRequired = computed(
  () => settings.value?.turnstile_enabled === true && Boolean(settings.value.turnstile_site_key),
)
const canSubmitCredentials = computed(
  () =>
    email.value.trim().length > 0 &&
    password.value.length > 0 &&
    (!turnstileRequired.value || turnstileToken.value.length > 0) &&
    !submitting.value,
)
const canSubmitTotp = computed(
  () => /^\d{6}$/.test(totpCode.value.replace(/\s/g, '')) && !submitting.value,
)

interface OAuthProvider {
  key: string
  label: string
}

const oauthProviders = computed<OAuthProvider[]>(() => {
  const value = settings.value
  if (!value) return []

  const providers: OAuthProvider[] = []
  if (value.linuxdo_oauth_enabled) providers.push({ key: 'linuxdo', label: 'LinuxDo' })
  if (value.oidc_oauth_enabled) {
    providers.push({ key: 'oidc', label: value.oidc_oauth_provider_name?.trim() || 'SSO' })
  }
  if (value.github_oauth_enabled) providers.push({ key: 'github', label: 'GitHub' })
  if (value.google_oauth_enabled) providers.push({ key: 'google', label: 'Google' })
  if (value.wechat_oauth_enabled) providers.push({ key: 'wechat', label: '微信' })
  if (value.dingtalk_oauth_enabled) providers.push({ key: 'dingtalk', label: '钉钉' })
  return providers
})

async function submitCredentials() {
  if (!canSubmitCredentials.value) return

  submitting.value = true
  error.value = ''
  try {
    const response = await api.login({
      email: email.value.trim(),
      password: password.value,
      ...(turnstileRequired.value ? { turnstile_token: turnstileToken.value } : {}),
    })

    if (isTotpRequired(response)) {
      tempToken.value = response.temp_token
      maskedEmail.value = response.user_email_masked ?? ''
      stage.value = 'totp'
      return
    }

    await completeLogin(response)
    if (!settings.value) void reloadSettings()
    await router.replace({ name: 'dashboard' })
  } catch (reason) {
    if (turnstileRequired.value) {
      turnstileToken.value = ''
      turnstileRef.value?.reset()
    }
    error.value = messageFor(reason, '邮箱或密码不正确')
  } finally {
    submitting.value = false
  }
}

function acceptTurnstile(token: string) {
  turnstileToken.value = token
  error.value = ''
}

function expireTurnstile() {
  turnstileToken.value = ''
  error.value = '验证已过期，请重新验证'
}

function failTurnstile() {
  turnstileToken.value = ''
  error.value = '人机验证失败，请重试'
}

async function submitTotp() {
  if (!canSubmitTotp.value) return

  submitting.value = true
  error.value = ''
  try {
    const response = await api.loginWith2FA({
      temp_token: tempToken.value,
      totp_code: totpCode.value.replace(/\s/g, ''),
    })
    await completeLogin(response)
    if (!settings.value) void reloadSettings()
    await router.replace({ name: 'dashboard' })
  } catch (reason) {
    error.value = messageFor(reason, '验证码不正确')
  } finally {
    submitting.value = false
  }
}

function backToCredentials() {
  stage.value = 'credentials'
  totpCode.value = ''
  tempToken.value = ''
  maskedEmail.value = ''
  error.value = ''
}

function messageFor(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError) {
    if (reason.status === 0) return '无法连接到 LinAI，请检查网络后重试'
    return reason.message || fallback
  }
  return fallback
}

function openAccountPage(path: string) {
  void openUrl(webUrl(path))
}
</script>

<template>
  <div class="auth-window drag-region">
    <section class="brand-pane">
      <div class="brand-lockup">
        <BrandLogo :src="brand.logo" :alt="brand.name" :size="42" />
        <span data-testid="brand-name">{{ brand.name }}</span>
      </div>

      <BrandMotion wordmark="L AI" />
    </section>

    <main class="form-pane">
      <div class="form-wrap no-drag">
        <header class="form-head">
          <template v-if="stage === 'credentials'">
            <h1>登录 LinAI</h1>
            <p>使用你的账户继续访问用量与服务状态。</p>
          </template>
          <template v-else>
            <button class="back-action" type="button" @click="backToCredentials">
              <ArrowLeft :size="16" />
              返回账户登录
            </button>
            <h1>两步验证</h1>
            <p>{{ maskedEmail ? `输入发送至 ${maskedEmail} 的验证码。` : '输入你的 6 位验证码。' }}</p>
          </template>
        </header>

        <form v-if="stage === 'credentials'" class="auth-form" @submit.prevent="submitCredentials">
          <label class="control">
            <span>邮箱</span>
            <span class="input-shell">
              <Mail :size="17" aria-hidden="true" />
              <input
                v-model="email"
                data-testid="email-input"
                type="email"
                autocomplete="username"
                spellcheck="false"
                placeholder="name@example.com"
                :disabled="submitting"
                autofocus
              />
            </span>
          </label>

          <label class="control">
            <span class="control-line">
              <span>密码</span>
              <button
                v-if="settings?.password_reset_enabled"
                class="text-action"
                type="button"
                data-testid="password-reset-link"
                @click="router.push({ name: 'forgot-password' })"
              >
                找回密码
              </button>
            </span>
            <span class="input-shell">
              <LockKeyhole :size="17" aria-hidden="true" />
              <input
                v-model="password"
                data-testid="password-input"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="输入密码"
                :disabled="submitting"
              />
              <button
                class="reveal-action"
                type="button"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" :size="17" />
              </button>
            </span>
          </label>

          <div v-if="turnstileRequired" class="turnstile-slot" data-testid="turnstile-widget">
            <TurnstileWidget
              ref="turnstileRef"
              :site-key="settings?.turnstile_site_key ?? ''"
              theme="light"
              size="flexible"
              @verify="acceptTurnstile"
              @expire="expireTurnstile"
              @error="failTurnstile"
            />
          </div>

          <div class="message-slot" aria-live="polite">
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          </div>

          <button
            class="primary-action"
            data-testid="login-submit"
            type="submit"
            :disabled="!canSubmitCredentials"
          >
            <span>{{ submitting ? '正在登录' : '登录' }}</span>
            <RefreshCw v-if="submitting" :size="17" class="spinning" />
            <ArrowRight v-else :size="17" />
          </button>
        </form>

        <form v-else class="auth-form" @submit.prevent="submitTotp">
          <label class="control">
            <span>验证码</span>
            <span class="input-shell code-shell">
              <ShieldCheck :size="18" aria-hidden="true" />
              <input
                v-model="totpCode"
                data-testid="totp-input"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="6 位数字"
                :disabled="submitting"
                autofocus
              />
            </span>
          </label>

          <div class="message-slot" aria-live="polite">
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          </div>

          <button class="primary-action" type="submit" :disabled="!canSubmitTotp">
            <span>{{ submitting ? '正在验证' : '验证并登录' }}</span>
            <RefreshCw v-if="submitting" :size="17" class="spinning" />
            <ArrowRight v-else :size="17" />
          </button>
        </form>

        <template v-if="stage === 'credentials' && oauthProviders.length">
          <div class="divider"><span>或使用其他方式</span></div>
          <div class="oauth-actions">
            <button
              v-for="provider in oauthProviders"
              :key="provider.key"
              class="secondary-action"
              type="button"
              @click="openAccountPage('/login')"
            >
              <span>{{ provider.label }}</span>
              <ExternalLink :size="15" />
            </button>
          </div>
        </template>

        <footer v-if="stage === 'credentials' && settings?.registration_enabled" class="form-foot">
          <span>还没有账户？</span>
          <button
            class="text-action"
            type="button"
            data-testid="registration-link"
            @click="router.push({ name: 'register' })"
          >
            创建账号
            <ExternalLink :size="14" />
          </button>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-window {
  display: grid;
  grid-template-columns: minmax(340px, 0.88fr) minmax(460px, 1.12fr);
  width: 100%;
  height: 100%;
  min-height: 620px;
  overflow: auto;
  background: #f7f9fc;
  color: #171b24;
}

.brand-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 620px;
  padding: 52px 54px 38px;
  overflow: hidden;
  background: #edf3ff;
  border-right: 1px solid #dce5f4;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 720;
}

.form-pane {
  display: grid;
  min-height: 620px;
  padding: 72px 64px 48px;
  place-items: center;
  background: #ffffff;
}

.form-wrap {
  width: 100%;
  max-width: 390px;
}

.form-head {
  margin-bottom: 34px;
}

.form-head h1 {
  font-size: 28px;
  font-weight: 690;
  line-height: 1.2;
  letter-spacing: 0;
}

.form-head p {
  margin-top: 10px;
  color: #667085;
  font-size: 14px;
  line-height: 1.65;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.turnstile-slot {
  min-height: 65px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control > span:first-child,
.control-line {
  color: #344054;
  font-size: 14px;
  font-weight: 620;
}

.control-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 13px;
  background: #ffffff;
  border: 1px solid #d7dde8;
  border-radius: 8px;
  color: #7a8493;
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.input-shell:focus-within {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.input-shell:has(input:disabled) {
  background: #f4f6f9;
  opacity: 0.7;
}

.input-shell input {
  min-width: 0;
  flex: 1;
  padding: 0;
  background: transparent;
  border: 0;
  outline: 0;
  color: #171b24;
  font-size: 14px;
}

.input-shell input::placeholder {
  color: #667085;
  opacity: 1;
}

.reveal-action,
.icon-action,
.back-action,
.text-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
}

.reveal-action {
  width: 28px;
  height: 28px;
  color: #667085;
}

.icon-action {
  width: 32px;
  height: 32px;
  border: 1px solid currentColor;
  border-radius: 7px;
}

.back-action {
  gap: 7px;
  margin-bottom: 22px;
  color: #526070;
  font-size: 14px;
}

.text-action {
  gap: 5px;
  color: #245ccc;
  font-size: 14px;
  font-weight: 620;
}

.message-slot {
  min-height: 19px;
  margin-top: -4px;
}

.form-error {
  color: #b4233c;
  font-size: 14px;
  line-height: 1.45;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 46px;
  padding: 0 16px;
  border-radius: 8px;
  font-weight: 650;
  transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.primary-action {
  background: #1f5bd5;
  border: 1px solid #1f5bd5;
  color: #ffffff;
}

.primary-action:hover:not(:disabled) {
  background: #184db9;
  border-color: #184db9;
}

.primary-action:active:not(:disabled) {
  transform: translateY(1px);
}

.primary-action:disabled {
  background: #9fb7e8;
  border-color: #9fb7e8;
  cursor: not-allowed;
}

.divider {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 30px 0 16px;
  color: #667085;
  font-size: 14px;
}

.divider::before,
.divider::after {
  flex: 1;
  height: 1px;
  content: '';
  background: #e1e6ee;
}

.oauth-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.secondary-action {
  flex: 1 1 120px;
  background: #ffffff;
  border: 1px solid #d7dde8;
  color: #344054;
  font-size: 14px;
}

.secondary-action:hover {
  background: #f7f9fc;
  border-color: #aab4c4;
}

.form-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 30px;
  color: #667085;
  font-size: 14px;
}

.spinning {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .auth-window {
    grid-template-columns: 1fr;
  }

  .brand-pane {
    display: none;
  }

  .form-pane {
    min-height: 100%;
    padding-right: 44px;
    padding-left: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
