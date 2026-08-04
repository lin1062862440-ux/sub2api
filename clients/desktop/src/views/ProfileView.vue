<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Activity,
  CalendarDays,
  Camera,
  Check,
  Gauge,
  Hash,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
} from '@lucide/vue'

import * as api from '@/api'
import type { User } from '@/api'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatCost, formatDateTime, formatNumber } from '@/lib/format'
import { ApiError } from '@/lib/http'
import { session, setCurrentUser } from '@/stores/session'
import { toast } from '@/stores/toast'

const maxAvatarBytes = 100 * 1024
const targetAvatarBytes = 80 * 1024

const profile = ref<User | null>(session.user)
const username = ref(session.user?.username ?? '')
const avatarDraft = ref<string | undefined>(undefined)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

const user = computed(() => profile.value ?? session.user)
const avatarSrc = computed(() => avatarDraft.value ?? user.value?.avatar_url ?? '')
const displayName = computed(() => username.value.trim() || user.value?.username || '用户')
const isSimpleMode = computed(() => session.runMode === 'simple')
const hasAvatar = computed(() => Boolean(avatarSrc.value.trim()))
const hasChanges = computed(() => {
  return username.value.trim() !== (user.value?.username ?? '') || avatarDraft.value !== undefined
})
const rpmLimitText = computed(() => {
  const limit = user.value?.rpm_limit
  if (limit === undefined || limit === null) return '继承分组'
  return limit === 0 ? '不限' : `${formatNumber(limit)} / 分钟`
})

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError && caught.message) return caught.message
  if (caught instanceof Error && caught.message) return caught.message
  return fallback
}

function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取头像失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法识别这张图片，请换一张重试'))
    image.src = dataUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('头像压缩失败'))
    }, 'image/webp', quality)
  })
}

async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size <= targetAvatarBytes) return readFileAsDataURL(file)
  if (file.type === 'image/gif') throw new Error('GIF 头像不能超过 80 KB')

  const sourceUrl = await readFileAsDataURL(file)
  const image = await loadImage(sourceUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法处理这张图片')

  const maxSide = Math.max(image.naturalWidth, image.naturalHeight)
  const baseScale = Math.min(1, 512 / maxSide)
  const scales = [1, 0.84, 0.68, 0.52, 0.4]
  const qualities = [0.86, 0.72, 0.58, 0.44]

  for (const scale of scales) {
    const width = Math.max(1, Math.round(image.naturalWidth * baseScale * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * baseScale * scale))
    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= targetAvatarBytes) return readFileAsDataURL(blob)
    }
  }

  throw new Error(`头像处理后仍超过 ${Math.round(maxAvatarBytes / 1024)} KB，请换一张图片`)
}

async function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  error.value = ''
  try {
    avatarDraft.value = await prepareAvatar(file)
  } catch (caught) {
    error.value = errorMessage(caught, '头像处理失败')
  }
}

function removeAvatar() {
  avatarDraft.value = ''
}

async function saveProfile() {
  const normalizedUsername = username.value.trim()
  if (!normalizedUsername) {
    error.value = '用户名不能为空'
    return
  }

  error.value = ''
  saving.value = true
  try {
    const payload: { username: string; avatar_url?: string } = { username: normalizedUsername }
    if (avatarDraft.value !== undefined) payload.avatar_url = avatarDraft.value

    const updated = await api.updateProfile(payload)
    profile.value = updated
    username.value = updated.username
    avatarDraft.value = undefined
    setCurrentUser(updated)
    toast.success('资料已保存')
  } catch (caught) {
    toast.error('保存个人资料失败', { detail: errorMessage(caught, '请稍后重试。') })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const current = await api.getProfile()
    profile.value = current
    username.value = current.username
    setCurrentUser(current)
  } catch (caught) {
    error.value = errorMessage(caught, '加载个人资料失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="profile-page">
    <header class="page-head drag-region">
      <div class="no-drag">
        <h1>个人资料</h1>
      </div>
    </header>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <section
      class="identity-console"
      data-testid="identity-console"
      aria-label="LinAI 身份控制台"
    >

      <div class="console-top">
        <aside class="portrait-rail">
          <div class="avatar-orbit">
            <div class="profile-avatar" data-testid="profile-avatar">
              <UserAvatar :name="displayName" :src="avatarSrc" />
            </div>
          </div>

          <div class="portrait-actions">
            <label class="avatar-upload" title="选择头像">
              <Camera :size="15" />
              <span>更换头像</span>
              <input type="file" accept="image/*" @change="handleAvatarFileChange">
            </label>
            <button
              v-if="hasAvatar"
              class="remove-avatar"
              type="button"
              title="移除头像"
              aria-label="移除头像"
              data-testid="remove-avatar"
              @click="removeAvatar"
            >
              <Trash2 :size="15" />
            </button>
          </div>
          <p>JPG、PNG、WebP<br>图片将自动压缩</p>
        </aside>

        <div class="identity-stage">
          <div class="identity-heading">
            <div>
              <span class="stage-label">LINAI IDENTITY</span>
              <div class="name-row">
                <h2>{{ user?.username || '用户' }}</h2>
                <span class="role-badge">{{ user?.role === 'admin' ? '管理员' : '用户' }}</span>
              </div>
              <p><Mail :size="13" />{{ user?.email || '未绑定邮箱' }}</p>
            </div>
            <span class="live-status" :class="{ offline: user?.status !== 'active' }">
              <i />
              {{ user?.status === 'active' ? '账户在线' : '账户已停用' }}
            </span>
          </div>

          <div class="metric-ribbon" data-testid="profile-metrics">
            <div v-if="!isSimpleMode" class="metric metric-balance">
              <WalletCards :size="17" />
              <span>账户余额</span>
              <strong>{{ formatCost(user?.balance) }}</strong>
              <small>可用于服务调用</small>
            </div>
            <div class="metric">
              <Gauge :size="17" />
              <span>并发上限</span>
              <strong>{{ formatNumber(user?.concurrency) }}</strong>
              <small>同时进行的请求</small>
            </div>
            <div class="metric">
              <Activity :size="17" />
              <span>每分钟请求</span>
              <strong>{{ rpmLimitText }}</strong>
              <small>当前速率限制</small>
            </div>
            <div class="metric metric-date">
              <CalendarDays :size="17" />
              <span>加入时间</span>
              <strong>{{ formatDateTime(user?.created_at) }}</strong>
              <small>账户创建时间</small>
            </div>
          </div>
        </div>
      </div>

      <div class="console-body">
        <form class="identity-form" @submit.prevent="saveProfile">
          <header class="section-head">
            <div>
              <span class="section-kicker">PUBLIC PROFILE</span>
              <h3>公开身份</h3>
            </div>
            <UserRound :size="19" />
          </header>

          <div class="form-fields">
            <label class="field">
              <span><UserRound :size="14" /> 用户名</span>
              <input
                v-model="username"
                data-testid="username-input"
                type="text"
                autocomplete="nickname"
                maxlength="64"
                placeholder="输入用户名"
              >
            </label>
            <label class="field">
              <span><Mail :size="14" /> 登录邮箱</span>
              <input :value="user?.email" type="email" readonly>
              <small>邮箱用于登录，当前不可在客户端修改。</small>
            </label>
          </div>

          <footer class="form-footer">
            <span :class="{ pending: hasChanges }">
              <i />
              {{ hasChanges ? '有尚未保存的修改' : '资料已是最新状态' }}
            </span>
            <button class="save-button" type="submit" :disabled="saving || !hasChanges">
              <LoaderCircle v-if="saving" class="spinning" :size="16" />
              <Check v-else :size="16" />
              {{ saving ? '正在保存' : '保存修改' }}
            </button>
          </footer>
        </form>

        <aside class="account-dossier">
          <header class="section-head">
            <div>
              <span class="section-kicker">ACCOUNT FILE</span>
              <h3>账户档案</h3>
              <p>身份权限与最近活动记录。</p>
            </div>
            <ShieldCheck :size="19" />
          </header>

          <dl>
            <div>
              <dt><Hash :size="13" />用户 ID</dt>
              <dd class="mono">{{ user?.id ?? '—' }}</dd>
            </div>
            <div>
              <dt>账户类型</dt>
              <dd>{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</dd>
            </div>
            <div>
              <dt>账户状态</dt>
              <dd class="status-value"><i />{{ user?.status === 'active' ? '正常' : '已停用' }}</dd>
            </div>
            <div v-if="!isSimpleMode">
              <dt>冻结余额</dt>
              <dd class="mono">{{ formatCost(user?.frozen_balance) }}</dd>
            </div>
            <div>
              <dt>最近活跃</dt>
              <dd>{{ formatDateTime(user?.last_active_at) }}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div v-if="loading" class="sync-state">
        <LoaderCircle class="spinning" :size="14" />
        正在同步账户资料
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  width: min(100%, 1120px);
  min-height: 100%;
  padding: 0 28px 38px;
}

.page-head {
  display: flex;
  min-height: 92px;
  align-items: flex-end;
  padding: 28px 0 18px;
}

.page-head h1 { font-size: 23px; font-weight: 760; }

.notice {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.notice-error { background: var(--coral-soft); border-color: var(--coral-border); color: var(--danger); }

.identity-console {
  position: relative;
  overflow: hidden;
  background: rgba(250, 252, 255, 0.8);
  border: 1px solid rgba(205, 216, 231, 0.92);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 44px rgba(31, 52, 78, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px) saturate(1.16);
  -webkit-backdrop-filter: blur(18px) saturate(1.16);
  animation: console-enter 420ms cubic-bezier(0.22, 0.78, 0.24, 1);
}

.identity-console::after {
  position: absolute;
  z-index: 8;
  inset: 0;
  background: linear-gradient(105deg, transparent 28%, rgba(90, 143, 255, 0.18) 48%, rgba(76, 194, 180, 0.12) 55%, transparent 72%);
  content: '';
  pointer-events: none;
  transform: translateX(-130%);
}

.identity-console.save-complete::after { animation: save-sweep 720ms ease-out; }

.save-feedback {
  position: absolute;
  z-index: 10;
  top: 14px;
  right: 16px;
  display: flex;
  min-height: 29px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: rgba(238, 250, 246, 0.88);
  border: 1px solid rgba(117, 193, 165, 0.45);
  border-radius: 6px;
  color: #176b55;
  font-size: 12px;
  box-shadow: 0 7px 18px rgba(29, 102, 79, 0.1);
  animation: feedback-in 220ms ease-out;
}

.console-top {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  min-height: 270px;
  border-bottom: 1px solid var(--border-subtle);
}

.portrait-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 22px;
  background: rgba(232, 239, 249, 0.55);
  border-right: 1px solid var(--border-subtle);
  text-align: center;
  animation: portrait-enter 500ms cubic-bezier(0.22, 0.78, 0.24, 1);
}

.avatar-orbit {
  position: relative;
  display: grid;
  width: 116px;
  height: 116px;
  place-items: center;
}

.avatar-orbit::before {
  position: absolute;
  inset: 0;
  padding: 2px;
  background: linear-gradient(120deg, rgba(37, 99, 235, 0.28), #2563eb 28%, #0c91a8 48%, rgba(255, 255, 255, 0.48) 66%, #2563eb 84%, rgba(37, 99, 235, 0.28));
  background-size: 220% 220%;
  border-radius: 22px;
  content: '';
  filter: drop-shadow(0 7px 13px rgba(37, 99, 235, 0.14));
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  animation: orbit-flow 4s ease-in-out infinite;
}

.profile-avatar {
  position: relative;
  z-index: 1;
  width: 106px;
  height: 106px;
  overflow: hidden;
  background: #fff;
  border: 4px solid rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  box-shadow: 0 12px 28px rgba(34, 58, 88, 0.17);
  font-size: 20px;
}

.portrait-actions { display: flex; align-items: center; gap: 7px; margin-top: 18px; }
.avatar-upload,
.remove-avatar {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.64);
  border: 1px solid rgba(178, 192, 211, 0.72);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.avatar-upload { cursor: pointer; }
.avatar-upload input { display: none; }
.avatar-upload:hover { background: rgba(255, 255, 255, 0.88); color: var(--accent-strong); }
.remove-avatar { width: 32px; padding: 0; color: var(--coral); }
.remove-avatar:hover { background: var(--coral-soft); border-color: var(--coral-border); }
.portrait-rail > p { margin-top: 9px; color: var(--text-tertiary); font-size: 12px; line-height: 1.55; }

.identity-stage { min-width: 0; display: grid; grid-template-rows: auto 1fr; }
.identity-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 27px 28px 20px;
}

.stage-label,
.section-kicker {
  color: #718096;
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 700;
}

.name-row { display: flex; min-width: 0; align-items: center; gap: 9px; margin-top: 5px; }
.name-row h2 { overflow: hidden; font-size: 24px; font-weight: 760; text-overflow: ellipsis; white-space: nowrap; }
.role-badge { flex: 0 0 auto; padding: 2px 7px; background: var(--accent-soft); border-radius: 4px; color: var(--accent-strong); font-size: 12px; font-weight: 700; }
.identity-heading > div > p { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--text-secondary); font-size: 13px; }

.live-status {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  color: var(--success);
  font-size: 12px;
  font-weight: 650;
}

.live-status i,
.status-value i,
.form-footer span i {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
}

.live-status i { box-shadow: 0 0 0 0 rgba(8, 127, 91, 0.3); animation: status-pulse 2.6s ease-out infinite; }
.live-status.offline { color: var(--danger); }
.live-status.offline i { background: var(--danger); animation: none; }

.metric-ribbon {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  border-top: 1px solid var(--border-subtle);
}

.metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: 20px 18px;
  border-right: 1px solid var(--border-subtle);
  color: #708097;
  transition: background 170ms ease, color 170ms ease, transform 170ms ease;
  animation: metric-rise 430ms both;
}

.metric:nth-child(2) { animation-delay: 50ms; }
.metric:nth-child(3) { animation-delay: 100ms; }
.metric:nth-child(4) { animation-delay: 150ms; }
.metric:last-child { border-right: 0; }
.metric:hover { z-index: 1; background: rgba(255, 255, 255, 0.42); color: var(--accent-strong); transform: translateY(-2px); }
.metric span { margin-top: 11px; color: var(--text-tertiary); font-size: 12px; }
.metric strong { overflow: hidden; margin-top: 3px; color: var(--text-primary); font-family: var(--font-data); font-size: 14px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.metric small { margin-top: 3px; color: #8995a6; font-size: 12px; }
.metric-balance strong { color: var(--accent-strong); }
.metric-date strong { font-size: 13px; line-height: 1.35; white-space: normal; }

.console-body { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(275px, 0.8fr); }
.identity-form { position: relative; min-width: 0; border-right: 1px solid var(--border-subtle); transition: box-shadow 180ms ease; }
.identity-form:focus-within { box-shadow: inset 3px 0 0 rgba(37, 99, 235, 0.78); }
.section-head { display: flex; min-height: 88px; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 19px 20px; border-bottom: 1px solid var(--border-subtle); color: #74839a; }
.section-head h3 { margin-top: 3px; color: var(--text-primary); font-size: 14px; font-weight: 720; }
.section-head p { margin-top: 3px; color: var(--text-tertiary); font-size: 12px; }

.form-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; min-height: 146px; padding: 20px; }
.field { display: flex; min-width: 0; flex-direction: column; gap: 7px; }
.field > span { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.field input { width: 100%; height: 41px; padding: 0 11px; outline: 0; background: rgba(255, 255, 255, 0.64); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 14px; transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease; }
.field input:focus { background: rgba(255, 255, 255, 0.9); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.field input[readonly] { background: rgba(232, 238, 246, 0.72); color: var(--text-tertiary); }
.field small { color: var(--text-tertiary); font-size: 12px; }

.form-footer { display: flex; min-height: 61px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 20px; background: rgba(237, 243, 251, 0.48); border-top: 1px solid var(--border-subtle); }
.form-footer > span { display: flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 12px; }
.form-footer > span i { background: var(--border-strong); }
.form-footer > span.pending { color: var(--warning); }
.form-footer > span.pending i { background: #d6a326; }
.save-button { display: inline-flex; min-height: 35px; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; background: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); color: #fff; font-size: 12px; font-weight: 680; transition: background 150ms ease, transform 150ms ease; }
.save-button:hover:not(:disabled) { background: var(--accent-strong); }
.save-button:active:not(:disabled) { transform: translateY(1px); }
.save-button:disabled { opacity: 0.48; }

.account-dossier { min-width: 0; background: rgba(246, 249, 253, 0.46); }
.account-dossier dl { margin: 0; padding: 5px 20px 12px; }
.account-dossier dl > div { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid rgba(216, 225, 237, 0.86); }
.account-dossier dl > div:last-child { border-bottom: 0; }
.account-dossier dt { display: flex; align-items: center; gap: 5px; color: var(--text-tertiary); font-size: 12px; }
.account-dossier dd { overflow: hidden; margin: 0; color: var(--text-secondary); font-size: 12px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.status-value { display: flex; align-items: center; gap: 6px; }
.status-value i { width: 5px; height: 5px; }
.mono { font-family: var(--font-data); font-variant-numeric: tabular-nums; }

.sync-state { position: absolute; right: 16px; bottom: 12px; display: flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 12px; }
.spinning { animation: spin 800ms linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes orbit-flow {
  0%, 100% { background-position: 0% 50%; opacity: 0.72; }
  50% { background-position: 100% 50%; opacity: 1; }
}
@keyframes console-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes portrait-enter { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes metric-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
@keyframes status-pulse { 70% { box-shadow: 0 0 0 0 rgba(8, 127, 91, 0.3); } 100% { box-shadow: 0 0 0 6px rgba(8, 127, 91, 0); } }
@keyframes save-sweep { from { transform: translateX(-130%); } to { transform: translateX(130%); } }
@keyframes feedback-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

@container app-content (max-width: 1050px) {
  .console-top { grid-template-columns: 1fr; }
  .portrait-rail { min-height: 196px; flex-direction: row; gap: 24px; border-right: 0; border-bottom: 1px solid var(--border-subtle); text-align: left; }
  .avatar-orbit { width: 102px; height: 102px; flex: 0 0 auto; }
  .profile-avatar { width: 92px; height: 92px; }
  .portrait-actions { margin-top: 0; }
  .portrait-rail > p { margin-top: 0; }
  .console-body { grid-template-columns: 1fr; }
  .identity-form { border-right: 0; border-bottom: 1px solid var(--border-subtle); }
}

@container app-content (max-width: 720px) {
  .profile-page { padding-right: 16px; padding-left: 16px; }
  .portrait-rail { align-items: flex-start; flex-direction: column; gap: 16px; }
  .portrait-actions { width: 100%; }
  .form-fields { grid-template-columns: 1fr; }
  .form-footer { align-items: stretch; flex-direction: column; }
  .save-button { width: 100%; }
  .metric-ribbon { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .metric:nth-child(odd) { border-right: 1px solid var(--border-subtle); }
  .metric:nth-child(even) { border-right: 0; }
  .metric:nth-child(n+3) { border-top: 1px solid var(--border-subtle); }
}

@media (prefers-reduced-motion: reduce) {
  .identity-console,
  .portrait-rail,
  .metric,
  .avatar-orbit::before,
  .live-status i,
  .identity-console.save-complete::after,
  .save-feedback,
  .spinning { animation: none; }
}
</style>
