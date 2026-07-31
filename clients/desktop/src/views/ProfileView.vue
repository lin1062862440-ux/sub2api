<script setup lang="ts">
/**
 * Profile: account identity, limits, and the connected deployment.
 *
 * Read-only for now — editing lands with the settings work.
 */
import { computed, onMounted, ref } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import * as api from '@/api'
import type { User } from '@/api'
import { BACKEND_ORIGIN, webUrl } from '@/config'
import { ApiError } from '@/lib/http'
import { formatCost, formatDateTime, formatNumber } from '@/lib/format'
import { platform } from '@/lib/platform'
import { session } from '@/stores/session'

const profile = ref<User | null>(null)
const loading = ref(true)
const error = ref('')

// Falls back to the bootstrap snapshot so the page renders while loading.
const user = computed(() => profile.value ?? session.user)
const isSimpleMode = computed(() => session.runMode === 'simple')
const initials = computed(() => (user.value?.username ?? '?').slice(0, 2).toUpperCase())

const rpmLimitText = computed(() => {
  const limit = user.value?.rpm_limit
  if (limit === undefined || limit === null) return '继承分组'
  return limit === 0 ? '不限' : `${formatNumber(limit)} / 分钟`
})

onMounted(async () => {
  try {
    profile.value = await api.getProfile()
  } catch (err) {
    error.value =
      err instanceof ApiError && err.status === 0 ? '无法连接到服务器' : '加载个人信息失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <header class="head drag-region">
      <div class="no-drag">
        <h1>个人信息</h1>
        <p class="sub">账户与连接设置</p>
      </div>
    </header>

    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>

    <section class="card identity">
      <div class="avatar">{{ initials }}</div>
      <div class="identity-text">
        <h2>{{ user?.username ?? '—' }}</h2>
        <p class="email">{{ user?.email || '未绑定邮箱' }}</p>
        <div class="badges">
          <span class="badge">{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
          <span class="badge" :class="user?.status === 'active' ? 'badge-ok' : 'badge-off'">
            {{ user?.status === 'active' ? '正常' : '已停用' }}
          </span>
        </div>
      </div>
      <div v-if="!isSimpleMode" class="balance">
        <span class="balance-label">余额</span>
        <span class="balance-value">{{ formatCost(user?.balance) }}</span>
        <span v-if="user?.frozen_balance" class="balance-hint">
          冻结 {{ formatCost(user.frozen_balance) }}
        </span>
      </div>
    </section>

    <section class="card block">
      <h3>账户</h3>
      <dl class="rows">
        <div class="row">
          <dt>用户 ID</dt>
          <dd class="mono">{{ user?.id ?? '—' }}</dd>
        </div>
        <div class="row">
          <dt>并发上限</dt>
          <dd class="mono">{{ formatNumber(user?.concurrency) }}</dd>
        </div>
        <div class="row">
          <dt>速率上限</dt>
          <dd class="mono">{{ rpmLimitText }}</dd>
        </div>
        <div class="row">
          <dt>注册时间</dt>
          <dd>{{ formatDateTime(user?.created_at) }}</dd>
        </div>
        <div class="row">
          <dt>最近活跃</dt>
          <dd>{{ formatDateTime(user?.last_active_at) }}</dd>
        </div>
      </dl>
    </section>

    <section class="card block">
      <h3>连接</h3>
      <dl class="rows">
        <div class="row">
          <dt>服务器</dt>
          <dd class="mono truncate" :title="BACKEND_ORIGIN">{{ BACKEND_ORIGIN }}</dd>
        </div>
        <div class="row">
          <dt>服务端版本</dt>
          <dd class="mono">{{ session.settings?.version || '—' }}</dd>
        </div>
        <div class="row">
          <dt>运行模式</dt>
          <dd>{{ isSimpleMode ? '简单模式' : '标准模式' }}</dd>
        </div>
        <div class="row">
          <dt>客户端平台</dt>
          <dd class="mono">{{ platform() }}</dd>
        </div>
      </dl>

      <div class="actions">
        <button class="btn btn-ghost" type="button" @click="openUrl(webUrl('/user/profile'))">
          在浏览器中管理
        </button>
      </div>
    </section>

    <p v-if="loading" class="loading">正在加载…</p>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  padding: 0 28px 28px;
}

.head {
  padding: 30px 0 4px;
}

h1 {
  font-size: 20px;
}

.sub {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}

.identity {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}

.avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  background: linear-gradient(150deg, var(--accent), #7b5cff);
  border-radius: 50%;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.identity-text {
  flex: 1;
  min-width: 0;
}

h2 {
  font-size: 17px;
}

.email {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badges {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.badge {
  padding: 2px 8px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-secondary);
}

.badge-ok {
  border-color: rgba(63, 185, 80, 0.35);
  color: var(--success);
}

.badge-off {
  border-color: rgba(248, 81, 73, 0.35);
  color: var(--danger);
}

.balance {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding-left: 16px;
  border-left: 1px solid var(--border-subtle);
}

.balance-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.balance-value {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.balance-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.block {
  padding: 18px;
}

h3 {
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.rows {
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.row:last-child {
  border-bottom: none;
}

dt {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

dd {
  margin: 0;
  font-size: 13px;
  text-align: right;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.loading {
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>
