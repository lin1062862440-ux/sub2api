<script setup lang="ts">
/**
 * Login.
 *
 * Username/password and TOTP run natively. Third-party OAuth cannot complete
 * inside the webview — the callback redirects to the web origin — so those
 * providers open the deployment's login page in the system browser instead. The
 * button set comes from `/settings/public`, so the client offers exactly what
 * the deployment has enabled.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { openUrl } from '@tauri-apps/plugin-opener'
import * as api from '@/api'
import { isTotpRequired } from '@/api'
import { webUrl } from '@/config'
import { ApiError } from '@/lib/http'
import { completeLogin, reloadSettings, session } from '@/stores/session'

const router = useRouter()

const email = ref('')
const password = ref('')
const totpCode = ref('')
const tempToken = ref('')
const maskedEmail = ref('')
const stage = ref<'credentials' | 'totp'>('credentials')
const submitting = ref(false)
const retrying = ref(false)
const error = ref('')

const settings = computed(() => session.settings)
const siteName = computed(() => settings.value?.site_name?.trim() || 'LinAI')

interface OAuthProvider {
  key: string
  label: string
}

const oauthProviders = computed<OAuthProvider[]>(() => {
  const s = settings.value
  if (!s) return []
  const providers: OAuthProvider[] = []
  if (s.linuxdo_oauth_enabled) providers.push({ key: 'linuxdo', label: 'LinuxDo' })
  if (s.oidc_oauth_enabled) {
    providers.push({ key: 'oidc', label: s.oidc_oauth_provider_name?.trim() || 'SSO' })
  }
  if (s.github_oauth_enabled) providers.push({ key: 'github', label: 'GitHub' })
  if (s.google_oauth_enabled) providers.push({ key: 'google', label: 'Google' })
  if (s.wechat_oauth_enabled) providers.push({ key: 'wechat', label: '微信' })
  if (s.dingtalk_oauth_enabled) providers.push({ key: 'dingtalk', label: '钉钉' })
  return providers
})

async function submitCredentials() {
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱和密码'
    return
  }

  submitting.value = true
  error.value = ''
  try {
    const response = await api.login({
      email: email.value.trim(),
      password: password.value,
    })

    if (isTotpRequired(response)) {
      tempToken.value = response.temp_token
      maskedEmail.value = response.user_email_masked ?? ''
      stage.value = 'totp'
      return
    }

    await completeLogin(response)
    // Settings may not have loaded at launch if the network was down.
    if (!settings.value) void reloadSettings()
    await router.replace({ name: 'dashboard' })
  } catch (err) {
    error.value = messageFor(err, '登录失败，请检查用户名和密码')
  } finally {
    submitting.value = false
  }
}

async function submitTotp() {
  const code = totpCode.value.replace(/\s/g, '')
  if (code.length < 6) {
    error.value = '请输入 6 位验证码'
    return
  }

  submitting.value = true
  error.value = ''
  try {
    const response = await api.loginWith2FA({ temp_token: tempToken.value, totp_code: code })
    await completeLogin(response)
    if (!settings.value) void reloadSettings()
    await router.replace({ name: 'dashboard' })
  } catch (err) {
    error.value = messageFor(err, '验证码不正确')
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

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return '无法连接到服务器，请检查网络'
    return err.message || fallback
  }
  return fallback
}

async function retryConnection() {
  retrying.value = true
  error.value = ''
  try {
    await reloadSettings()
    if (session.offline) error.value = '仍然无法连接到服务器'
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <div class="login drag-region">
    <div class="panel no-drag">
      <header class="head">
        <div class="mark">{{ siteName.slice(0, 2).toUpperCase() }}</div>
        <h1>{{ siteName }}</h1>
        <p class="sub">
          <template v-if="stage === 'credentials'">
            {{ settings?.site_subtitle?.trim() || '登录以继续' }}
          </template>
          <template v-else>
            {{ maskedEmail ? `请输入 ${maskedEmail} 的验证码` : '请输入两步验证码' }}
          </template>
        </p>
      </header>

      <div v-if="session.offline" class="offline">
        <span>无法连接到服务器</span>
        <button class="link" type="button" :disabled="retrying" @click="retryConnection">
          {{ retrying ? '重试中…' : '重试' }}
        </button>
      </div>

      <form v-if="stage === 'credentials'" class="form" @submit.prevent="submitCredentials">
        <label class="field">
          <span class="field-label">邮箱</span>
          <input
            v-model="email"
            class="field-input"
            type="email"
            autocomplete="username"
            spellcheck="false"
            placeholder="you@example.com"
            :disabled="submitting"
            autofocus
          />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <input
            v-model="password"
            class="field-input"
            type="password"
            autocomplete="current-password"
            :disabled="submitting"
          />
        </label>

        <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

        <button class="btn btn-primary btn-block" type="submit" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>

      <form v-else class="form" @submit.prevent="submitTotp">
        <label class="field">
          <span class="field-label">验证码</span>
          <input
            v-model="totpCode"
            class="field-input code-input"
            type="text"
            inputmode="numeric"
            maxlength="6"
            autocomplete="one-time-code"
            :disabled="submitting"
            autofocus
          />
        </label>

        <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

        <button class="btn btn-primary btn-block" type="submit" :disabled="submitting">
          {{ submitting ? '验证中…' : '验证并登录' }}
        </button>
        <button class="btn btn-ghost btn-block" type="button" @click="backToCredentials">
          返回
        </button>
      </form>

      <template v-if="stage === 'credentials' && oauthProviders.length">
        <div class="divider"><span>其他登录方式</span></div>
        <div class="oauth">
          <button
            v-for="provider in oauthProviders"
            :key="provider.key"
            class="btn btn-ghost oauth-btn"
            type="button"
            @click="openUrl(webUrl('/login'))"
          >
            {{ provider.label }}
          </button>
        </div>
        <p class="field-hint oauth-hint">第三方登录将在浏览器中完成</p>
      </template>

      <footer v-if="settings?.registration_enabled || settings?.password_reset_enabled" class="foot">
        <button
          v-if="settings?.registration_enabled"
          class="link"
          type="button"
          @click="openUrl(webUrl('/register'))"
        >
          注册账号
        </button>
        <button
          v-if="settings?.password_reset_enabled"
          class="link"
          type="button"
          @click="openUrl(webUrl('/forgot-password'))"
        >
          忘记密码
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  background:
    radial-gradient(120% 90% at 50% -20%, rgba(76, 141, 255, 0.1), transparent 60%),
    var(--bg-base);
}

.panel {
  width: 100%;
  max-width: 380px;
  padding: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.head {
  margin-bottom: 26px;
  text-align: center;
}

.mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 14px;
  background: linear-gradient(150deg, var(--accent), #7b5cff);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
}

h1 {
  font-size: 18px;
}

.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.offline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  padding: 9px 12px;
  background: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--warning);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.code-input {
  font-family: var(--font-mono);
  font-size: 18px;
  letter-spacing: 0.4em;
  text-align: center;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.oauth {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
}

.oauth-btn {
  padding: 9px 12px;
  font-size: 13px;
}

.oauth-hint {
  margin-top: 10px;
  text-align: center;
}

.foot {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}

.link {
  padding: 0;
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-tertiary);
  transition: color 0.15s ease;
}

.link:hover:not(:disabled) {
  color: var(--accent);
}
</style>
