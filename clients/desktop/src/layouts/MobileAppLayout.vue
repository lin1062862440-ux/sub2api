<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  Building2,
  ChartNoAxesCombined,
  CircleUserRound,
  Ellipsis,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  canUseAdminWorkspace,
  readWorkspaceMode,
  saveWorkspaceMode,
  workspaceDestination,
  type WorkspaceMode,
} from '@/lib/admin-workspace'
import { onAdminAccessDenied } from '@/lib/http'
import {
  isMobileOverflowActive,
  mobileNavigation,
  mobileRouteTitle,
  type MobileIconKey,
} from '@/mobile/navigation'
import { session, signOut } from '@/stores/session'

const mobileIcons: Record<MobileIconKey, Component> = {
  'layout-dashboard': LayoutDashboard,
  'chart-no-axes-combined': ChartNoAxesCombined,
  'receipt-text': ReceiptText,
  'circle-user-round': CircleUserRound,
  'users-round': UsersRound,
  'layers-3': Layers3,
  'user-round-cog': UserRoundCog,
  'building-2': Building2,
}

const router = useRouter()
const route = useRoute()
const user = computed(() => session.user)
const workspaceMode = ref<WorkspaceMode>(readWorkspaceMode(user.value))
const workspaceOwner = ref(user.value)
const accountOpen = ref(false)
const moreOpen = ref(false)
const passwordDialogOpen = ref(false)
const signingOut = ref(false)
const adminAccessDenied = ref(false)
const accountArea = ref<HTMLElement | null>(null)
const accountTrigger = ref<HTMLButtonElement | null>(null)
const moreArea = ref<HTMLElement | null>(null)
const moreTrigger = ref<HTMLButtonElement | null>(null)
const moreSheet = ref<HTMLElement | null>(null)
let stopAdminAccessListener: (() => void) | null = null

const isAdmin = computed(() => canUseAdminWorkspace(user.value) && !adminAccessDenied.value)
const navigation = computed(() => mobileNavigation(workspaceMode.value))
const currentTitle = computed(() => mobileRouteTitle(route.name) || String(route.meta.title || '概览'))
const overflowActive = computed(() => isMobileOverflowActive(route.name, workspaceMode.value))

function closeLayers() {
  const restoreMore = moreOpen.value
  const restoreAccount = accountOpen.value
  accountOpen.value = false
  moreOpen.value = false
  if (restoreMore) void nextTick(() => moreTrigger.value?.focus())
  else if (restoreAccount) void nextTick(() => accountTrigger.value?.focus())
}

function closeAccount(restoreFocus = false) {
  if (!accountOpen.value) return
  accountOpen.value = false
  if (restoreFocus) void nextTick(() => accountTrigger.value?.focus())
}

function closeMore(restoreFocus = false) {
  if (!moreOpen.value) return
  moreOpen.value = false
  if (restoreFocus) void nextTick(() => moreTrigger.value?.focus())
}

function accountFocusableElements() {
  if (!accountArea.value) return []
  return Array.from(accountArea.value.querySelectorAll<HTMLElement>(
    '#mobile-account-popover a[href], #mobile-account-popover button:not(:disabled)',
  ))
}

async function toggleAccount() {
  if (accountOpen.value) {
    closeAccount(true)
    return
  }
  closeMore(false)
  accountOpen.value = true
  await nextTick()
  accountFocusableElements()[0]?.focus()
}

async function toggleMore() {
  if (moreOpen.value) {
    closeMore(true)
    return
  }
  closeAccount(false)
  moreOpen.value = true
  await nextTick()
  moreSheet.value?.querySelector<HTMLElement>('[data-testid="mobile-overflow-nav-item"]')?.focus()
}

function openPasswordDialog() {
  closeLayers()
  passwordDialogOpen.value = true
}

async function switchWorkspace() {
  const next = workspaceMode.value === 'admin' ? 'personal' : 'admin'
  saveWorkspaceMode(next, user.value)
  workspaceMode.value = next
  closeLayers()
  await router.replace({ name: workspaceDestination(next) })
}

async function handleSignOut() {
  closeLayers()
  signingOut.value = true
  try {
    await signOut()
    await router.replace({ name: 'login' })
  } finally {
    signingOut.value = false
  }
}

function returnToPersonal(showNotice: boolean) {
  saveWorkspaceMode('personal', workspaceOwner.value)
  workspaceMode.value = 'personal'
  closeLayers()
  adminAccessDenied.value = showNotice
  void router.replace({ name: 'dashboard' })
}

function handleAdminAccessDenied() {
  if (!canUseAdminWorkspace(user.value)) return
  returnToPersonal(true)
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (accountOpen.value || moreOpen.value)) {
    event.preventDefault()
    closeLayers()
    return
  }
  if (event.key !== 'Tab') return

  if (accountOpen.value) {
    const controls = accountFocusableElements()
    const first = controls[0]
    const last = controls[controls.length - 1]
    const active = document.activeElement
    const outside = !accountArea.value?.contains(active)
    if (!first || !last) {
      event.preventDefault()
      accountTrigger.value?.focus()
    } else if (event.shiftKey ? active === first || outside : active === last || outside) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
    return
  }

  if (!moreOpen.value || !moreSheet.value) return

  const destinations = Array.from(
    moreSheet.value.querySelectorAll<HTMLElement>('[data-testid="mobile-overflow-nav-item"]'),
  )
  const first = destinations[0]
  const last = destinations[destinations.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  const outsideSheet = !moreSheet.value.contains(active)
  if (event.shiftKey ? active === first || outsideSheet : active === last || outsideSheet) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (accountOpen.value && !accountArea.value?.contains(target)) {
    const focusable = target instanceof Element && Boolean(target.closest(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ))
    closeAccount(!focusable)
  }
  if (moreOpen.value && !moreArea.value?.contains(target)) closeMore(true)
}

function handlePopState() {
  closeLayers()
}

watch(
  () => user.value?.role,
  (role, previousRole) => {
    if (role === 'admin') {
      workspaceOwner.value = user.value
      return
    }
    if (previousRole === 'admin' && workspaceMode.value === 'admin') returnToPersonal(false)
  },
)

watch(
  () => route.name,
  () => {
    if (!isAdmin.value) return
    if (route.meta.requiresAdmin && workspaceMode.value !== 'admin') {
      workspaceMode.value = 'admin'
      saveWorkspaceMode('admin', user.value)
      return
    }
    if (
      ['dashboard', 'usage', 'subscriptions'].includes(String(route.name))
      && workspaceMode.value !== 'personal'
    ) {
      workspaceMode.value = 'personal'
      saveWorkspaceMode('personal', user.value)
    }
  },
)

onMounted(() => {
  stopAdminAccessListener = onAdminAccessDenied(handleAdminAccessDenied)
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('popstate', handlePopState)
  if (
    isAdmin.value
    && workspaceMode.value === 'admin'
    && !route.meta.requiresAdmin
    && !route.meta.userGroupWorkspace
  ) {
    void router.replace({ name: 'admin-dashboard' })
  }
})

onBeforeUnmount(() => {
  stopAdminAccessListener?.()
  stopAdminAccessListener = null
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-app-bar" data-testid="mobile-app-bar">
      <span aria-hidden="true" />
      <strong data-testid="mobile-route-title">{{ currentTitle }}</strong>
      <div ref="accountArea" class="mobile-account-anchor">
        <button
          ref="accountTrigger"
          class="mobile-account-trigger"
          type="button"
          data-testid="mobile-account-trigger"
          aria-label="账户"
          aria-haspopup="dialog"
          aria-controls="mobile-account-popover"
          :aria-expanded="accountOpen"
          @click="toggleAccount"
        >
          <UserAvatar :name="user?.username" :src="user?.avatar_url" />
        </button>

        <section
          v-if="accountOpen"
          id="mobile-account-popover"
          class="mobile-account-popover"
          data-testid="mobile-account-popover"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-account-heading"
        >
          <div class="mobile-identity">
            <UserAvatar :name="user?.username" :src="user?.avatar_url" />
            <div>
              <strong id="mobile-account-heading">{{ user?.username }}</strong>
              <span>{{ user?.email }}</span>
            </div>
          </div>
          <RouterLink
            class="mobile-menu-item"
            :to="{ name: 'profile' }"
            data-testid="profile-menu-item"
            @click="closeLayers"
          >
            <CircleUserRound :size="18" />
            <span>个人资料</span>
          </RouterLink>
          <button
            class="mobile-menu-item"
            type="button"
            data-testid="password-menu-item"
            @click="openPasswordDialog"
          >
            <KeyRound :size="18" />
            <span>修改密码</span>
          </button>
          <button
            v-if="isAdmin"
            class="mobile-menu-item"
            type="button"
            data-testid="mobile-workspace-switch"
            @click="switchWorkspace"
          >
            <ShieldCheck :size="18" />
            <span>{{ workspaceMode === 'admin' ? '切换到用户端' : '切换到管理端' }}</span>
          </button>
          <button
            class="mobile-menu-item mobile-menu-logout"
            type="button"
            data-testid="logout"
            :disabled="signingOut"
            @click="handleSignOut"
          >
            <RefreshCw v-if="signingOut" :size="18" class="spinning" />
            <LogOut v-else :size="18" />
            <span>{{ signingOut ? '正在退出' : '退出登录' }}</span>
          </button>
        </section>
      </div>
    </header>

    <main class="mobile-content">
      <div
        v-if="adminAccessDenied"
        class="mobile-admin-notice"
        data-testid="admin-access-notice"
        role="status"
      >
        <ShieldCheck :size="18" />
        <span><strong>管理员权限已失效</strong> 已返回个人空间。</span>
        <button type="button" aria-label="关闭提示" @click="adminAccessDenied = false">×</button>
      </div>
      <RouterView />
    </main>

    <nav class="mobile-bottom-nav" data-testid="mobile-bottom-nav" aria-label="主要导航">
      <RouterLink
        v-for="item in navigation.direct"
        :key="item.routeName"
        class="mobile-nav-item"
        active-class="mobile-nav-active"
        :to="{ name: item.routeName }"
        data-testid="mobile-direct-nav-item"
        :data-route-name="item.routeName"
        @click="closeLayers"
      >
        <component :is="mobileIcons[item.iconKey]" :size="21" />
        <span>{{ item.title }}</span>
      </RouterLink>

      <div v-if="navigation.overflow.length" ref="moreArea" class="mobile-more-anchor">
        <button
          ref="moreTrigger"
          class="mobile-nav-item"
          :class="{ 'mobile-nav-active': overflowActive }"
          type="button"
          data-testid="mobile-more-trigger"
          aria-haspopup="dialog"
          aria-controls="mobile-more-sheet"
          :aria-expanded="moreOpen"
          @click="toggleMore"
        >
          <Ellipsis :size="22" />
          <span>更多</span>
        </button>

        <button
          v-if="moreOpen"
          class="mobile-more-scrim"
          type="button"
          data-testid="mobile-more-scrim"
          aria-label="关闭更多导航"
          @click="closeMore(true)"
        />

        <section
          v-if="moreOpen"
          id="mobile-more-sheet"
          ref="moreSheet"
          class="mobile-more-sheet"
          data-testid="mobile-more-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-more-sheet-title"
        >
          <div class="mobile-sheet-handle" aria-hidden="true" />
          <h2 id="mobile-more-sheet-title">更多</h2>
          <RouterLink
            v-for="item in navigation.overflow"
            :key="item.routeName"
            class="mobile-sheet-item"
            active-class="mobile-sheet-item-active"
            :to="{ name: item.routeName }"
            data-testid="mobile-overflow-nav-item"
            :data-route-name="item.routeName"
            @click="closeMore(true)"
          >
            <component :is="mobileIcons[item.iconKey]" :size="20" />
            <span>{{ item.title }}</span>
          </RouterLink>
        </section>
      </div>
    </nav>
  </div>

  <ChangePasswordDialog v-model="passwordDialogOpen" />
</template>

<style scoped>
.mobile-shell {
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-base);
}

.mobile-app-bar {
  position: fixed;
  z-index: 60;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  min-height: calc(56px + env(safe-area-inset-top));
  grid-template-columns: 44px minmax(0, 1fr) 44px;
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

.mobile-account-anchor {
  position: relative;
  width: 44px;
  height: 44px;
}

.mobile-account-trigger {
  display: inline-flex;
  width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.mobile-account-trigger .user-avatar {
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 7px;
}

.mobile-account-popover {
  position: absolute;
  z-index: 90;
  top: calc(100% + 8px);
  right: 0;
  width: min(286px, calc(100vw - 24px));
  padding: 7px;
  background: rgba(248, 251, 255, 0.98);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 18px 42px rgba(30, 48, 74, 0.2);
}

.mobile-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 9px;
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-identity .user-avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
}

.mobile-identity > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.mobile-identity strong,
.mobile-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-identity strong { font-size: 14px; }
.mobile-identity span { color: var(--text-tertiary); font-size: 12px; }

.mobile-menu-item,
.mobile-sheet-item {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 14px;
  text-align: left;
}

.mobile-menu-logout {
  margin-top: 3px;
  border-top: 1px solid var(--border-subtle);
  color: var(--coral);
}

.mobile-content {
  position: fixed;
  top: calc(56px + env(safe-area-inset-top));
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom));
  left: 0;
  height: auto;
  min-width: 0;
  overflow-y: auto;
  scroll-padding-block: 12px;
  background: var(--bg-base);
  container-name: app-content;
  container-type: inline-size;
}

.mobile-admin-notice {
  display: grid;
  min-height: 48px;
  grid-template-columns: 22px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 7px;
  margin: 10px 12px 0;
  padding: 7px 6px 7px 10px;
  background: #fff8e8;
  border: 1px solid #eed7a0;
  border-radius: 8px;
  color: #80601f;
  font-size: 13px;
}

.mobile-admin-notice button {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 19px;
}

.mobile-bottom-nav {
  position: fixed;
  z-index: 60;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  min-height: calc(64px + env(safe-area-inset-bottom));
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  align-items: start;
  padding: 4px 4px env(safe-area-inset-bottom);
  background: rgba(250, 252, 255, 0.98);
  border-top: 1px solid var(--border-subtle);
  box-shadow: 0 -4px 16px rgba(30, 48, 74, 0.07);
  backdrop-filter: blur(18px);
}

.mobile-nav-item {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 3px;
  padding: 3px 2px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 620;
}

.mobile-nav-item span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-nav-active {
  background: rgba(234, 241, 251, 0.88);
  color: var(--accent-strong);
}

.mobile-more-anchor {
  position: relative;
  min-width: 0;
}

.mobile-more-scrim {
  position: fixed;
  z-index: 70;
  inset: 0;
  padding: 0;
  background: rgba(18, 29, 44, 0.24);
  border: 0;
}

.mobile-more-sheet {
  position: fixed;
  z-index: 80;
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom));
  left: 0;
  padding: 8px 12px 14px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -18px 44px rgba(30, 48, 74, 0.18);
}

.mobile-more-sheet h2 {
  margin: 0 4px 6px;
  font-size: 15px;
  font-weight: 680;
}

.mobile-sheet-handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 8px;
  background: var(--border-strong);
  border-radius: 2px;
}

.mobile-sheet-item-active {
  background: rgba(234, 241, 251, 0.88);
  color: var(--accent-strong);
}

.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}
</style>
