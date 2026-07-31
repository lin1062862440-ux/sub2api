<script setup lang="ts">
/**
 * Authenticated shell: fixed sidebar plus a scrolling content pane.
 *
 * The top strip is left draggable so the frameless window can still be moved,
 * with interactive controls opted out via `.no-drag`.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { session, signOut } from '@/stores/session'
import { isMacOS } from '@/lib/platform'

const router = useRouter()
const signingOut = ref(false)

// macOS draws traffic lights over the content; other platforms need no inset.
const chromeInset = isMacOS() ? '34px' : '16px'

const user = computed(() => session.user)
const siteName = computed(() => session.settings?.site_name?.trim() || 'LinAI')
const initials = computed(() => (user.value?.username ?? '?').slice(0, 2).toUpperCase())

const navItems = [
  { name: 'dashboard', label: '仪表盘', icon: 'grid' },
  { name: 'profile', label: '个人信息', icon: 'user' },
] as const

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
  <div class="shell">
    <aside class="sidebar">
      <div class="sidebar-head drag-region" :style="{ paddingTop: chromeInset }">
        <div class="mark no-drag">{{ siteName.slice(0, 2).toUpperCase() }}</div>
        <span class="site-name no-drag">{{ siteName }}</span>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          class="nav-item"
          :to="{ name: item.name }"
          active-class="nav-item-active"
        >
          <svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true">
            <template v-if="item.icon === 'grid'">
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" />
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" />
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" />
              <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" />
            </template>
            <template v-else>
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3 2.7-4.5 6-4.5S14 11 14 14" />
            </template>
          </svg>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="account">
          <div class="avatar">{{ initials }}</div>
          <div class="account-text">
            <span class="account-name">{{ user?.username }}</span>
            <span class="account-role">{{ user?.role === 'admin' ? '管理员' : '用户' }}</span>
          </div>
        </div>
        <button class="signout" type="button" :disabled="signingOut" @click="handleSignOut">
          {{ signingOut ? '退出中…' : '退出登录' }}
        </button>
      </div>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100%;
}

.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
}

.sidebar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Top padding is set inline: it clears the macOS overlay traffic lights and
     collapses to normal spacing elsewhere. */
  padding: 34px 16px 18px;
}

.mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: linear-gradient(150deg, var(--accent), #7b5cff);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.site-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.nav-item-active {
  background: var(--accent-muted);
  color: var(--accent);
}

.nav-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-foot {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid var(--border-subtle);
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}

.avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.account-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.account-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-role {
  font-size: 11px;
  color: var(--text-tertiary);
}

.signout {
  width: 100%;
  margin-top: 8px;
  padding: 7px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-tertiary);
  transition: border-color 0.15s ease, color 0.15s ease;
}

.signout:hover:not(:disabled) {
  border-color: rgba(248, 81, 73, 0.4);
  color: var(--danger);
}

.content {
  overflow-y: auto;
  background: var(--bg-base);
}
</style>
