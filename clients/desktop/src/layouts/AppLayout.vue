<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  ChartNoAxesCombined,
  ChevronUp,
  Gift,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  UserRound,
} from '@lucide/vue'
import { useRouter } from 'vue-router'

import BrandLogo from '@/components/BrandLogo.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import UsageDisplayDialog from '@/features/usage-display/internal/settings/UsageDisplayDialog.vue'
import { normalizeBrand } from '@/lib/brand'
import { isMacOS } from '@/lib/platform'
import { session, signOut } from '@/stores/session'

const router = useRouter()
const signingOut = ref(false)
const accountMenuOpen = ref(false)
const passwordDialogOpen = ref(false)
const usageDisplayDialogOpen = ref(false)
const accountArea = ref<HTMLElement | null>(null)

const chromeInset = isMacOS() ? '42px' : '20px'
const user = computed(() => session.user)
const brand = computed(() => normalizeBrand(session.settings))
const isSimpleMode = computed(() => session.runMode === 'simple')
async function handleSignOut() {
  accountMenuOpen.value = false
  signingOut.value = true
  try {
    await signOut()
    await router.replace({ name: 'login' })
  } finally {
    signingOut.value = false
  }
}

function closeAccountMenu() {
  accountMenuOpen.value = false
}

function openPasswordDialog() {
  closeAccountMenu()
  passwordDialogOpen.value = true
}

function openUsageDisplay() {
  closeAccountMenu()
  usageDisplayDialogOpen.value = true
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!accountArea.value?.contains(event.target as Node)) closeAccountMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAccountMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div class="app-shell">
    <aside class="app-rail">
      <div
        class="rail-brand drag-region"
        data-testid="app-brand"
        :style="{ paddingTop: chromeInset }"
      >
        <BrandLogo class="no-drag" :src="brand.logo" :alt="brand.name" :size="38" />
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
          title="仪表盘"
        >
          <LayoutDashboard :size="18" />
          <span>仪表盘</span>
        </RouterLink>
        <RouterLink
          class="nav-link"
          :to="{ name: 'api-keys' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="API 密钥"
        >
          <KeyRound :size="18" />
          <span>API 密钥</span>
        </RouterLink>
        <RouterLink
          v-if="!isSimpleMode"
          class="nav-link"
          :to="{ name: 'usage' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="使用记录"
        >
          <ChartNoAxesCombined :size="18" />
          <span>使用记录</span>
        </RouterLink>
        <RouterLink
          v-if="!isSimpleMode"
          class="nav-link"
          :to="{ name: 'channels' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="渠道状态"
        >
          <Activity :size="18" />
          <span>渠道状态</span>
        </RouterLink>
        <RouterLink
          v-if="!isSimpleMode"
          class="nav-link"
          :to="{ name: 'subscriptions' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="我的订阅"
        >
          <Layers3 :size="18" />
          <span>我的订阅</span>
        </RouterLink>
        <RouterLink
          v-if="!isSimpleMode"
          class="nav-link"
          :to="{ name: 'redeem' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="兑换"
        >
          <Gift :size="18" />
          <span>兑换</span>
        </RouterLink>
      </nav>

      <div ref="accountArea" class="rail-account">
        <div v-if="accountMenuOpen" class="account-menu" data-testid="account-menu" role="menu">
          <div class="menu-identity">
            <div class="avatar" data-testid="account-avatar">
              <UserAvatar :name="user?.username" :src="user?.avatar_url" />
            </div>
            <div class="account-copy">
              <strong :title="user?.username">{{ user?.username }}</strong>
              <span :title="user?.email">{{ user?.email }}</span>
            </div>
          </div>

          <div class="menu-actions">
            <RouterLink
              class="menu-item"
              :to="{ name: 'profile' }"
              role="menuitem"
              data-testid="profile-menu-item"
              @click="closeAccountMenu"
            >
              <UserRound :size="16" />
              <span>个人资料</span>
            </RouterLink>
            <button
              class="menu-item"
              type="button"
              role="menuitem"
              data-testid="usage-display-menu-item"
              @click="openUsageDisplay"
            >
              <ChartNoAxesCombined :size="16" />
              <span>用量显示</span>
            </button>
            <button
              class="menu-item"
              type="button"
              role="menuitem"
              data-testid="password-menu-item"
              @click="openPasswordDialog"
            >
              <KeyRound :size="16" />
              <span>修改密码</span>
            </button>
          </div>

          <button
            class="menu-item menu-logout"
            type="button"
            role="menuitem"
            data-testid="logout"
            :disabled="signingOut"
            @click="handleSignOut"
          >
            <RefreshCw v-if="signingOut" :size="16" class="spinning" />
            <LogOut v-else :size="16" />
            <span>{{ signingOut ? '正在退出' : '退出登录' }}</span>
          </button>
        </div>

        <button
          class="account-trigger"
          type="button"
          data-testid="account-menu-trigger"
          aria-haspopup="menu"
          :aria-expanded="accountMenuOpen"
          :title="user?.username || '账户菜单'"
          @click="accountMenuOpen = !accountMenuOpen"
        >
          <div class="avatar" data-testid="account-trigger-avatar">
            <UserAvatar :name="user?.username" :src="user?.avatar_url" />
          </div>
          <div class="account-copy">
            <strong :title="user?.username">{{ user?.username }}</strong>
            <span>{{ user?.role === 'admin' ? '管理员' : '用户' }}</span>
          </div>
          <ChevronUp :size="16" class="account-chevron" :class="{ open: accountMenuOpen }" />
        </button>
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

  <ChangePasswordDialog v-model="passwordDialogOpen" />
  <UsageDisplayDialog v-model="usageDisplayDialogOpen" :user="user ?? null" />
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
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
  min-height: 100px;
  align-items: center;
  gap: 12px;
  padding: 42px 20px 18px;
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
  font-family: var(--font-data);
  font-size: 12px;
}

.rail-nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 18px 13px;
}

.nav-link {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 11px;
  padding: 0 12px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 14px;
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
  position: relative;
  margin-top: auto;
  padding: 14px 12px 16px;
  border-top: 1px solid var(--border-subtle);
}

.account-trigger,
.menu-identity {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.account-trigger {
  padding: 3px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  text-align: left;
}

.account-trigger:hover {
  background: rgba(255, 255, 255, 0.62);
}

.account-trigger[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.68);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72), 0 4px 12px rgba(35, 55, 80, 0.06);
}

.account-trigger:hover .account-copy strong {
  color: var(--accent-strong);
}

.avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 7px;
  font-size: 12px;
  overflow: hidden;
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
  font-size: 14px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.account-chevron {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  transition: transform 160ms ease;
}

.account-chevron.open {
  transform: rotate(180deg);
}

.account-menu {
  position: absolute;
  z-index: 20;
  right: 9px;
  bottom: calc(100% + 8px);
  left: 9px;
  padding: 6px;
  overflow: hidden;
  background: rgba(247, 250, 255, 0.76);
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: var(--radius-md);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 18px 42px rgba(30, 48, 74, 0.18),
    0 3px 10px rgba(30, 48, 74, 0.08);
  backdrop-filter: blur(22px) saturate(1.35);
  -webkit-backdrop-filter: blur(22px) saturate(1.35);
  animation: account-menu-in 150ms ease-out;
}

.menu-identity {
  padding: 10px;
  background: rgba(255, 255, 255, 0.44);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 7px;
  box-shadow: inset 0 0 0 1px rgba(207, 219, 235, 0.24);
}

.menu-identity .avatar {
  width: 34px;
  height: 34px;
}

.menu-identity .account-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-actions {
  padding: 5px 0 0;
}

.menu-item {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  text-align: left;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-primary);
}

.menu-logout {
  margin-top: 3px;
  box-shadow: inset 0 1px 0 rgba(135, 151, 173, 0.18);
  color: var(--coral);
}

.menu-logout:hover:not(:disabled) {
  background: var(--coral-soft);
  color: var(--coral);
}

.account-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 11px 0 0 45px;
  color: var(--text-tertiary);
  font-size: 12px;
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
  container-name: app-content;
  container-type: inline-size;
}

@media (max-width: 1180px) {
  .app-shell { grid-template-columns: 218px minmax(0, 1fr); }
  .rail-brand { padding-right: 16px; padding-left: 16px; }
  .rail-nav { padding-right: 10px; padding-left: 10px; }
}

@media (max-width: 1020px) {
  .app-shell { grid-template-columns: 76px minmax(0, 1fr); }
  .rail-brand { justify-content: center; padding-right: 0; padding-left: 0; }
  .brand-copy { display: none; }
  .rail-nav { padding-right: 9px; padding-left: 9px; }
  .nav-link { justify-content: center; padding: 0; }
  .nav-link > span { display: none; }
  .rail-account { padding-right: 9px; padding-left: 9px; }
  .account-trigger { justify-content: center; padding: 4px 0; }
  .account-trigger > .account-copy,
  .account-trigger > .account-chevron { display: none; }
  .account-status { justify-content: center; margin-left: 0; }
  .account-status > span:last-child { display: none; }
  .account-menu { right: auto; bottom: 8px; left: calc(100% + 8px); width: 244px; }
}

@media (max-height: 760px) {
  .rail-brand { min-height: 90px; padding-bottom: 12px; }
  .rail-nav { gap: 3px; padding-top: 12px; }
  .nav-link { min-height: 40px; }
  .rail-account { padding-bottom: 12px; }
}

.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes account-menu-in {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .account-menu { animation: none; }
}
</style>
