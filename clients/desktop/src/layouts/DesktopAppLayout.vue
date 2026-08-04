<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
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
  Megaphone,
  ScrollText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Ticket,
  UserRound,
  UsersRound,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import BrandLogo from '@/components/BrandLogo.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import UserAvatar from '@/components/UserAvatar.vue'
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
import {
  checkDesktopUpdate,
  desktopUpdateErrorMessage,
  installDesktopUpdate,
  type AvailableDesktopUpdate,
} from '@/lib/desktop-updater'
import { session, signOut } from '@/stores/session'
import { toast } from '@/stores/toast'
import type { Update } from '@tauri-apps/plugin-updater'

const router = useRouter()
const route = useRoute()
const signingOut = ref(false)
const accountMenuOpen = ref(false)
const passwordDialogOpen = ref(false)
const settingsDialogOpen = ref(false)
const adminAccessDenied = ref(false)
const updateChecking = ref(false)
const updateInstalling = ref(false)
const updateProgress = ref<number | null>(null)
const updateMessage = ref('')
const availableUpdate = shallowRef<Update | null>(null)
const availableUpdateInfo = ref<AvailableDesktopUpdate | null>(null)
const accountArea = ref<HTMLElement | null>(null)
let stopAdminAccessListener: (() => void) | null = null
const autoCheckUpdatesStorageKey = 'desktop:update:auto-check'
const autoCheckUpdates = ref(localStorage.getItem(autoCheckUpdatesStorageKey) === 'true')

const chromeInset = isMacOS() ? '42px' : '20px'
const user = computed(() => session.user)
const brand = computed(() => normalizeBrand(session.settings))
const isSimpleMode = computed(() => session.runMode === 'simple')
const isAdmin = computed(() => canUseAdminWorkspace(user.value) && !adminAccessDenied.value)
const canAccessUserGroups = computed(() =>
  isAdmin.value || session.userGroupCapabilities?.can_access === true,
)
const workspaceMode = ref<WorkspaceMode>(readWorkspaceMode(user.value))

async function selectWorkspace(mode: WorkspaceMode) {
  if (mode === 'admin' && !isAdmin.value) return
  workspaceMode.value = mode
  saveWorkspaceMode(mode, user.value)
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

function openSettingsDialog() {
  closeAccountMenu()
  settingsDialogOpen.value = true
}

function setAutoCheckUpdates(value: boolean) {
  autoCheckUpdates.value = value
  localStorage.setItem(autoCheckUpdatesStorageKey, String(value))
}

async function handleCheckUpdate(manual = true) {
  updateChecking.value = true
  updateMessage.value = ''
  availableUpdate.value = null
  availableUpdateInfo.value = null
  try {
    const result = await checkDesktopUpdate()
    if (!result.available || !result.update || !result.info) {
      updateMessage.value = '已是最新版本'
      if (manual) toast.info('已是最新版本')
      return
    }
    availableUpdate.value = result.update
    availableUpdateInfo.value = result.info
    updateMessage.value = `发现新版本 ${result.info.version}`
    toast.info(updateMessage.value)
  } catch (error) {
    const detail = desktopUpdateErrorMessage(error)
    updateMessage.value = detail
    if (manual) toast.error('检查更新失败', { detail })
  } finally {
    updateChecking.value = false
  }
}

async function handleInstallUpdate() {
  if (!availableUpdate.value) return
  updateInstalling.value = true
  updateProgress.value = null
  updateMessage.value = '正在下载更新'
  try {
    await installDesktopUpdate(availableUpdate.value, (progress) => {
      updateProgress.value = progress.percent ?? null
      updateMessage.value = progress.percent == null ? '正在下载更新' : `正在下载更新 ${progress.percent}%`
    })
    updateMessage.value = '更新已安装，正在重启'
    toast.success(updateMessage.value)
  } catch (error) {
    const detail = desktopUpdateErrorMessage(error)
    updateMessage.value = detail
    toast.error('更新安装失败', { detail })
    updateInstalling.value = false
  }
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
  if (event.key === 'Escape') closeAccountMenu()
}

onMounted(() => {
  stopAdminAccessListener = onAdminAccessDenied(handleAdminAccessDenied)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  if (isAdmin.value && workspaceMode.value === 'admin' && !route.meta.requiresAdmin && !route.meta.userGroupWorkspace) {
    void router.replace({ name: 'admin-dashboard' })
  }
  if (appCapabilities.desktopUpdater && autoCheckUpdates.value) {
    void handleCheckUpdate(false)
  }
})

onBeforeUnmount(() => {
  stopAdminAccessListener?.()
  stopAdminAccessListener = null
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
          title="团队管理"
        >
          <FolderKanban :size="18" />
          <span>团队管理</span>
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

      <nav v-else class="rail-nav admin-nav" aria-label="管理导航">
        <RouterLink class="nav-link" :to="{ name: 'admin-dashboard' }" active-class="nav-link-active" data-testid="admin-nav-item" title="管理概览"><LayoutDashboard :size="18" /><span>管理概览</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-accounts' }" active-class="nav-link-active" data-testid="admin-nav-item" title="账号管理"><Globe2 :size="18" /><span>账号管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-users' }" active-class="nav-link-active" data-testid="admin-nav-item" title="用户管理"><UsersRound :size="18" /><span>用户管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-groups' }" active-class="nav-link-active" data-testid="admin-nav-item" title="分组管理"><Boxes :size="18" /><span>分组管理</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'user-groups' }" active-class="nav-link-active" data-testid="admin-nav-item" title="团队管理"><FolderKanban :size="18" /><span>团队管理</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-usage' }" active-class="nav-link-active" data-testid="admin-nav-item" title="全站用量"><ChartNoAxesCombined :size="18" /><span>全站用量</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-channel-monitors' }" active-class="nav-link-active" data-testid="admin-nav-item" title="渠道监控"><Activity :size="18" /><span>渠道监控</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-audit-logs' }" active-class="nav-link-active" data-testid="admin-nav-item" title="审计日志"><ScrollText :size="18" /><span>审计日志</span></RouterLink>
        <span class="nav-section-label">运营</span>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-subscriptions' }" active-class="nav-link-active" data-testid="admin-nav-item" title="订阅管理"><CreditCard :size="18" /><span>订阅管理</span></RouterLink>
        <RouterLink v-if="!isSimpleMode" class="nav-link" :to="{ name: 'admin-redeem-codes' }" active-class="nav-link-active" data-testid="admin-nav-item" title="兑换码"><Ticket :size="18" /><span>兑换码</span></RouterLink>
        <RouterLink class="nav-link" :to="{ name: 'admin-announcements' }" active-class="nav-link-active" data-testid="admin-nav-item" title="公告管理"><Megaphone :size="18" /><span>公告管理</span></RouterLink>
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
              data-testid="settings-menu-item"
              @click="openSettingsDialog"
            >
              <Settings2 :size="16" />
              <span>设置</span>
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

  <ChangePasswordDialog v-model="passwordDialogOpen" toast-feedback />
  <SettingsDialog
    v-model="settingsDialogOpen"
    :user="user ?? null"
    :product-name="brand.name"
    :can-use-usage-display="appCapabilities.externalUsageDisplay"
    :can-use-updater="appCapabilities.desktopUpdater"
    :can-manage-launch-at-startup="appCapabilities.launchAtStartup"
    :update-checking="updateChecking"
    :update-installing="updateInstalling"
    :update-progress="updateProgress"
    :update-message="updateMessage"
    :has-available-update="Boolean(availableUpdate)"
    :available-update-info="availableUpdateInfo"
    :auto-check-updates="autoCheckUpdates"
    @check-update="handleCheckUpdate"
    @install-update="handleInstallUpdate"
    @update:auto-check-updates="setAutoCheckUpdates"
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

.app-rail {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-rail);
  border-right: 1px solid var(--border-subtle);
}

.rail-brand {
  display: flex;
  min-height: 100px;
  flex: 0 0 auto;
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
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 5px;
  padding: 18px 13px;
  overflow-y: auto;
  scrollbar-color: rgba(116, 136, 162, 0.38) transparent;
  scrollbar-width: thin;
}

.workspace-switch {
  display: grid;
  flex: 0 0 auto;
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
  flex: 0 0 auto;
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

.menu-item:disabled {
  cursor: default;
  opacity: 0.68;
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
  padding-bottom: var(--toast-scroll-reserve, 0px);
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
