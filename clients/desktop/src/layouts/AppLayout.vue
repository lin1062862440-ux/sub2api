<script setup lang="ts">
import { computed, ref } from 'vue'
import { LayoutDashboard, LogOut, RefreshCw } from '@lucide/vue'
import { useRouter } from 'vue-router'

import BrandLogo from '@/components/BrandLogo.vue'
import { normalizeBrand } from '@/lib/brand'
import { isMacOS } from '@/lib/platform'
import { session, signOut } from '@/stores/session'

const router = useRouter()
const signingOut = ref(false)

const chromeInset = isMacOS() ? '42px' : '20px'
const user = computed(() => session.user)
const brand = computed(() => normalizeBrand(session.settings))
const initials = computed(() => (user.value?.username ?? '?').slice(0, 2).toUpperCase())

async function handleSignOut() {
  signingOut.value = true
  try {
    await signOut()
    await router.replace({ name: 'login' })
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-rail">
      <div
        class="rail-brand drag-region"
        data-testid="app-brand"
        :style="{ paddingTop: chromeInset }"
      >
        <BrandLogo class="no-drag" :src="brand.logo" :alt="brand.name" :size="34" />
        <div class="brand-copy no-drag">
          <strong>{{ brand.name }}</strong>
          <span>Desktop</span>
        </div>
      </div>

      <nav class="rail-nav" aria-label="主导航">
        <RouterLink
          class="nav-link"
          :to="{ name: 'dashboard' }"
          active-class="nav-link-active"
          data-testid="nav-item"
        >
          <LayoutDashboard :size="17" />
          <span>仪表盘</span>
        </RouterLink>
      </nav>

      <div class="rail-account">
        <div class="account-main">
          <div class="avatar">{{ initials }}</div>
          <div class="account-copy">
            <strong :title="user?.username">{{ user?.username }}</strong>
            <span>{{ user?.role === 'admin' ? '管理员' : '用户' }}</span>
          </div>
          <button
            class="logout-button"
            type="button"
            data-testid="logout"
            :title="signingOut ? '正在退出' : '退出登录'"
            :aria-label="signingOut ? '正在退出' : '退出登录'"
            :disabled="signingOut"
            @click="handleSignOut"
          >
            <RefreshCw v-if="signingOut" :size="16" class="spinning" />
            <LogOut v-else :size="16" />
          </button>
        </div>
        <div class="account-status">
          <span aria-hidden="true" />
          <span>已安全登录</span>
        </div>
      </div>
    </aside>

    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 214px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 900px;
  background: var(--bg-base);
}

.app-rail {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: var(--bg-rail);
  border-right: 1px solid var(--border-subtle);
}

.rail-brand {
  display: flex;
  min-height: 94px;
  align-items: center;
  gap: 11px;
  padding: 42px 18px 18px;
}

.brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.25;
}

.brand-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-copy span {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 9px;
}

.rail-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 12px;
}

.nav-link {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 580;
  transition: background 180ms ease, color 180ms ease;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-primary);
}

.nav-link-active {
  background: var(--bg-surface);
  box-shadow: 0 1px 4px rgba(25, 45, 75, 0.08);
  color: var(--accent-strong);
}

.rail-account {
  margin-top: auto;
  padding: 14px 12px 16px;
  border-top: 1px solid var(--border-subtle);
}

.account-main {
  display: flex;
  align-items: center;
  gap: 9px;
}

.avatar {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  background: var(--accent-soft);
  border-radius: 7px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 700;
  place-items: center;
}

.account-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  line-height: 1.25;
}

.account-copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy span {
  color: var(--text-tertiary);
  font-size: 10px;
}

.logout-button {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-tertiary);
  place-items: center;
}

.logout-button:hover:not(:disabled) {
  background: var(--coral-soft);
  border-color: var(--coral-border);
  color: var(--coral);
}

.account-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 11px 0 0 41px;
  color: var(--text-tertiary);
  font-size: 9px;
}

.account-status > span:first-child {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
}

.app-content {
  min-width: 0;
  overflow-y: auto;
  background: var(--bg-base);
}

.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}
</style>
