<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  ChevronUp,
  CreditCard,
  ExternalLink,
  FolderKanban,
  Gift,
  Globe2,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Ticket,
  UserRound,
  UsersRound,
  X,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import BrandLogo from '@/components/BrandLogo.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import UsageDisplayDialog from '@/features/usage-display/internal/settings/UsageDisplayDialog.vue'
import { webUrl } from '@/config'
import { normalizeBrand } from '@/lib/brand'
import { onAdminAccessDenied } from '@/lib/http'
import {
  canUseAdminWorkspace,
  readWorkspaceMode,
  saveWorkspaceMode,
  workspaceDestination,
  type WorkspaceMode,
} from '@/lib/admin-workspace'
import { isMacOS } from '@/lib/platform'
import { appCapabilities } from '@/lib/platform-capabilities'
import { session, signOut } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const signingOut = ref(false)
const accountMenuOpen = ref(false)
const drawerOpen = ref(false)
const passwordDialogOpen = ref(false)
const usageDisplayDialogOpen = ref(false)
const adminAccessDenied = ref(false)
const accountArea = ref<HTMLElement | null>(null)
let stopAdminAccessListener: (() => void) | null = null

const mobile = appCapabilities.mobile
const chromeInset = mobile ? 'calc(16px + env(safe-area-inset-top))' : isMacOS() ? '42px' : '20px'
const user = computed(() => session.user)
const brand = computed(() => normalizeBrand(session.settings))
const isSimpleMode = computed(() => session.runMode === 'simple')
const isAdmin = computed(() => canUseAdminWorkspace(user.value) && !adminAccessDenied.value)
const canAccessUserGroups = computed(() =>
  isAdmin.value || session.userGroupCapabilities?.can_access === true,
)
const workspaceMode = ref<WorkspaceMode>(readWorkspaceMode(user.value))
const currentTitle = computed(() => String(route.meta.title || '仪表盘'))

function openDrawer() {
  if (drawerOpen.value) return
  drawerOpen.value = true
  window.history.pushState({ ...window.history.state, linaiDrawer: true }, '')
}

function closeDrawer() {
  if (!drawerOpen.value) return
  const ownsHistoryEntry = window.history.state?.linaiDrawer === true
  drawerOpen.value = false
  if (ownsHistoryEntry) window.history.back()
}

function openMobileAccount() {
  openDrawer()
  accountMenuOpen.value = true
}

function handlePopState() {
  drawerOpen.value = false
}

async function selectWorkspace(mode: WorkspaceMode) {
  if (mode === 'admin' && !isAdmin.value) return
  workspaceMode.value = mode
  saveWorkspaceMode(mode, user.value)
  closeDrawer()
  await router.replace({ name: workspaceDestination(mode) })
}
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

function openWebAdmin() {
  closeAccountMenu()
  void openUrl(webUrl('/admin'))
}

function handleAdminAccessDenied() {
  if (!canUseAdminWorkspace(user.value)) return
  saveWorkspaceMode('personal', user.value)
  adminAccessDenied.value = true
  workspaceMode.value = 'personal'
  void router.replace({ name: 'dashboard' })
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!accountArea.value?.contains(event.target as Node)) closeAccountMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeAccountMenu()
    closeDrawer()
  }
}

onMounted(() => {
  stopAdminAccessListener = onAdminAccessDenied(handleAdminAccessDenied)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('popstate', handlePopState)
  if (isAdmin.value && workspaceMode.value === 'admin' && !route.meta.requiresAdmin && !route.meta.userGroupWorkspace) {
    void router.replace({ name: 'admin-dashboard' })
  }
})

onBeforeUnmount(() => {
  stopAdminAccessListener?.()
  stopAdminAccessListener = null
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="app-shell" :class="{ 'mobile-shell': mobile }">
    <header v-if="mobile" class="mobile-app-bar" data-testid="mobile-app-bar">
      <button
        class="mobile-bar-action"
        type="button"
        data-testid="mobile-menu-trigger"
        aria-label="打开导航"
        @click="openDrawer"
      >
        <Menu :size="22" />
      </button>
      <strong>{{ currentTitle }}</strong>
      <button class="mobile-bar-action" type="button" aria-label="账户" @click="openMobileAccount">
        <UserAvatar :name="user?.username" :src="user?.avatar_url" />
      </button>
    </header>

    <button
      v-if="mobile && drawerOpen"
      class="drawer-scrim"
      type="button"
      aria-label="关闭导航"
      @click="closeDrawer"
    />

    <aside
      v-if="!mobile || drawerOpen"
      class="app-rail"
      :class="{ 'mobile-drawer': mobile }"
      :data-testid="mobile ? 'mobile-drawer' : undefined"
    >
      <button
        v-if="mobile"
        class="mobile-drawer-close"
        type="button"
        data-testid="mobile-drawer-close"
        aria-label="关闭导航"
        @click="closeDrawer"
      >
        <X :size="20" />
      </button>
      <div
        class="rail-brand drag-region"
        data-testid="app-brand"
        :style="{ paddingTop: chromeInset }"
      >
        <BrandLogo class="no-drag" :src="brand.logo" :alt="brand.name" :size="38" />
        <div class="brand-copy no-drag">
          <strong>{{ brand.name }}</strong>
          <span>{{ mobile ? 'Android' : 'Desktop' }}</span>
        </div>
      </div>

      <div v-if="isAdmin" class="workspace-switch no-drag" data-testid="workspace-switch" aria-label="工作空间">
        <button
          type="button"
          data-testid="workspace-personal"
          title="个人空间"
          :aria-pressed="workspaceMode === 'personal'"
          @click="selectWorkspace('personal')"
        >
          <UserRound :size="14" />
          <span>个人</span>
        </button>
        <button
          type="button"
          data-testid="workspace-admin"
          title="管理空间"
          :aria-pressed="workspaceMode === 'admin'"
          @click="selectWorkspace('admin')"
        >
          <ShieldCheck :size="14" />
          <span>管理</span>
        </button>
      </div>

      <nav v-if="workspaceMode === 'personal'" class="rail-nav" aria-label="个人导航">
        <RouterLink
          class="nav-link"
          :to="{ name: 'dashboard' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="仪表盘"
          @click="closeDrawer"
        >
          <LayoutDashboard :size="18" />
          <span>仪表盘</span>
        </RouterLink>
        <RouterLink
          v-if="appCapabilities.apiKeys"
          class="nav-link"
          :to="{ name: 'api-keys' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="API 密钥"
          @click="closeDrawer"
        >
          <KeyRound :size="18" />
          <span>API 密钥</span>
        </RouterLink>
        <RouterLink
          v-if="!isAdmin && canAccessUserGroups"
          class="nav-link"
          :to="{ name: 'user-groups' }"
          active-class="nav-link-active"
          data-testid="user-group-nav-item"
          title="用户组"
          @click="closeDrawer"
        >
          <FolderKanban :size="18" />
          <span>用户组</span>
        </RouterLink>
        <RouterLink
          v-if="!isSimpleMode"
          class="nav-link"
          :to="{ name: 'usage' }"
          active-class="nav-link-active"
          data-testid="nav-item"
          title="使用记录"
          @click="closeDrawer"
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
          @click="closeDrawer"
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
          @click="closeDrawer"
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
          @click="closeDrawer"
        >
          <Gift :size="18" />
          <span>兑换</span>
        </RouterLink>
      </nav>

      <nav v-else class="rail-nav admin-nav" aria-label="管理导航">
        <RouterLink class="nav-link" :to="{ name: 'admin-dashboard' }" active-class="nav-link-active" data-testid="admin-nav-item" title="管理概览" @click="closeDrawer"><LayoutDashboard :size="18" /><span>管理概览</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-accounts' }" active-class="nav-link-active" data-testid="admin-nav-item" title="账号管理" @click="closeDrawer"><Globe2 :size="18" /><span>账号管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-users' }" active-class="nav-link-active" data-testid="admin-nav-item" title="用户管理" @click="closeDrawer"><UsersRound :size="18" /><span>用户管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-groups' }" active-class="nav-link-active" data-testid="admin-nav-item" title="分组管理" @click="closeDrawer"><Boxes :size="18" /><span>分组管理</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'user-groups' }" active-class="nav-link-active" data-testid="admin-nav-item" title="用户组" @click="closeDrawer"><FolderKanban :size="18" /><span>用户组</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-usage' }" active-class="nav-link-active" data-testid="admin-nav-item" title="全站用量" @click="closeDrawer"><ChartNoAxesCombined :size="18" /><span>全站用量</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-channel-monitors' }" active-class="nav-link-active" data-testid="admin-nav-item" title="渠道监控" @click="closeDrawer"><Activity :size="18" /><span>渠道监控</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-audit-logs' }" active-class="nav-link-active" data-testid="admin-nav-item" title="审计日志" @click="closeDrawer"><ScrollText :size="18" /><span>审计日志</span></RouterLink>
        <span class="nav-section-label">运营</span>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-subscriptions' }" active-class="nav-link-active" data-testid="admin-nav-item" title="订阅管理" @click="closeDrawer"><CreditCard :size="18" /><span>订阅管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-redeem-codes' }" active-class="nav-link-active" data-testid="admin-nav-item" title="兑换码" @click="closeDrawer"><Ticket :size="18" /><span>兑换码</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-announcements' }" active-class="nav-link-active" data-testid="admin-nav-item" title="公告管理" @click="closeDrawer"><Megaphone :size="18" /><span>公告管理</span></RouterLink>
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
              v-if="appCapabilities.externalUsageDisplay"
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
            <button
              v-if="isAdmin"
              class="menu-item"
              type="button"
              role="menuitem"
              data-testid="web-admin-menu-item"
              @click="openWebAdmin"
            >
              <ExternalLink :size="16" />
              <span>打开网页管理后台</span>
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
      <div v-if="adminAccessDenied" class="admin-access-notice" data-testid="admin-access-notice" role="status">
        <ShieldCheck :size="17" />
        <span><strong>管理员权限已失效</strong> 已返回个人空间，请重新登录或联系平台管理员。</span>
        <button type="button" aria-label="关闭提示" @click="adminAccessDenied = false">×</button>
      </div>
      <RouterView />
    </main>
  </div>

  <ChangePasswordDialog v-model="passwordDialogOpen" />
  <UsageDisplayDialog
    v-if="appCapabilities.externalUsageDisplay"
    v-model="usageDisplayDialogOpen"
    :user="user ?? null"
  />
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

.mobile-app-bar { display: none; }

.app-shell.mobile-shell {
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding-top: calc(56px + env(safe-area-inset-top));
}

.mobile-shell .mobile-app-bar {
  position: fixed;
  z-index: 60;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  min-height: calc(56px + env(safe-area-inset-top));
  grid-template-columns: 48px minmax(0, 1fr) 48px;
  align-items: end;
  padding: env(safe-area-inset-top) 8px 4px;
  background: rgba(250, 252, 255, 0.96);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: 0 3px 12px rgba(30, 48, 74, 0.06);
  backdrop-filter: blur(18px);
}

.mobile-app-bar > strong {
  min-width: 0;
  align-self: center;
  overflow: hidden;
  font-size: 16px;
  font-weight: 680;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-bar-action,
.mobile-drawer-close {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--text-secondary);
}

.mobile-bar-action .user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  overflow: hidden;
}

.mobile-drawer {
  position: fixed;
  z-index: 80;
  inset: 0 auto 0 0;
  width: min(86vw, 320px);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 18px 0 44px rgba(25, 42, 68, 0.18);
}

.mobile-drawer-close {
  position: absolute;
  z-index: 2;
  top: calc(8px + env(safe-area-inset-top));
  right: 8px;
}

.drawer-scrim {
  position: fixed;
  z-index: 70;
  inset: 0;
  padding: 0;
  background: rgba(18, 29, 44, 0.28);
  border: 0;
}

.mobile-shell .app-content {
  min-height: 0;
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

.workspace-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  margin: 4px 13px 0;
  padding: 3px;
  background: rgba(218, 228, 241, 0.76);
  border: 1px solid rgba(198, 210, 226, 0.78);
  border-radius: 8px;
}

.workspace-switch button {
  display: inline-flex;
  min-width: 0;
  min-height: 31px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 7px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 650;
}

.workspace-switch button[aria-pressed='true'] {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 7px rgba(38, 59, 88, 0.09);
  color: var(--accent-strong);
}

.admin-nav { overflow-y: auto; }
.nav-section-label { margin: 11px 12px 3px; color: var(--text-tertiary); font-size: 11px; font-weight: 720; }

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
  position: relative;
  min-width: 0;
  overflow-y: auto;
  background: var(--bg-base);
  container-name: app-content;
  container-type: inline-size;
}

.admin-access-notice {
  position: absolute;
  z-index: 30;
  top: 18px;
  right: 22px;
  left: 22px;
  display: grid;
  min-height: 46px;
  grid-template-columns: 22px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 13px;
  background: rgba(255, 248, 232, 0.95);
  border: 1px solid #eed7a0;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(54, 65, 82, 0.12);
  color: #80601f;
  font-size: 13px;
  backdrop-filter: blur(14px);
}

.admin-access-notice strong { color: #6e4e10; }
.admin-access-notice button { border: 0; background: transparent; color: inherit; font-size: 19px; }

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
  .workspace-switch { margin-right: 9px; margin-left: 9px; }
  .workspace-switch button { padding: 0; }
  .workspace-switch button span { display: none; }
  .nav-link { justify-content: center; padding: 0; }
  .nav-link > span { display: none; }
  .nav-section-label { height: 1px; margin: 8px 4px 3px; overflow: hidden; background: var(--border-subtle); color: transparent; }
  .rail-account { padding-right: 9px; padding-left: 9px; }
  .account-trigger { justify-content: center; padding: 4px 0; }
  .account-trigger > .account-copy,
  .account-trigger > .account-chevron { display: none; }
  .account-status { justify-content: center; margin-left: 0; }
  .account-status > span:last-child { display: none; }
  .account-menu { right: auto; bottom: 8px; left: calc(100% + 8px); width: 244px; }

  .mobile-drawer .rail-brand {
    justify-content: flex-start;
    padding-right: 20px;
    padding-left: 20px;
  }
  .mobile-drawer .brand-copy { display: flex; }
  .mobile-drawer .rail-nav {
    min-height: 0;
    flex: 1;
    padding-right: 13px;
    padding-left: 13px;
    overflow-y: auto;
  }
  .mobile-drawer .workspace-switch { margin-right: 13px; margin-left: 13px; }
  .mobile-drawer .workspace-switch button { padding: 0 7px; }
  .mobile-drawer .workspace-switch button span { display: inline; }
  .mobile-drawer .nav-link { justify-content: flex-start; padding: 0 12px; }
  .mobile-drawer .nav-link > span { display: inline; }
  .mobile-drawer .nav-section-label {
    height: auto;
    margin: 11px 12px 3px;
    overflow: visible;
    background: transparent;
    color: var(--text-tertiary);
  }
  .mobile-drawer .rail-account { padding-right: 12px; padding-left: 12px; }
  .mobile-drawer .account-trigger { justify-content: flex-start; padding: 3px; }
  .mobile-drawer .account-trigger > .account-copy,
  .mobile-drawer .account-trigger > .account-chevron { display: flex; }
  .mobile-drawer .account-status { justify-content: flex-start; margin-left: 45px; }
  .mobile-drawer .account-status > span:last-child { display: inline; }
  .mobile-drawer .account-menu {
    right: 9px;
    bottom: calc(100% + 8px);
    left: 9px;
    width: auto;
  }
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
