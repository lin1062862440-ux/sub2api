/**
 * Router.
 *
 * Hash history, not web history: the production build is loaded from
 * `tauri://localhost` where path-based routes would 404 on reload.
 */
import { watch } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { appCapabilities, type PlatformCapabilities } from '@/lib/platform-capabilities'
import { isAuthenticated, session } from '@/stores/session'

interface RouteAccessInput {
  authenticated: boolean
  role: 'admin' | 'user' | null
  runMode: 'standard' | 'simple'
  userGroupAccess: boolean
  capabilities: PlatformCapabilities
  toName: unknown
  meta: Record<string, unknown>
}

export function resolveRouteAccess(input: RouteAccessInput): true | { name: string } {
  if (!input.authenticated) {
    return input.meta.public ? true : { name: 'login' }
  }
  if (input.toName === 'login') return { name: 'dashboard' }
  const requiredCapability = input.meta.requiresCapability as keyof PlatformCapabilities | undefined
  if (requiredCapability && !input.capabilities[requiredCapability]) return { name: 'dashboard' }
  if (input.meta.requiresAdmin && input.role !== 'admin') return { name: 'dashboard' }
  if (input.meta.requiresUserGroupAccess && !input.userGroupAccess) return { name: 'dashboard' }
  if (input.meta.standardOnly && input.runMode === 'simple') return { name: 'dashboard' }
  return true
}

export function shouldExitUserGroupWorkspace(
  hasAccess: boolean,
  meta: Record<string, unknown>,
): boolean {
  return !hasAccess && meta.userGroupWorkspace === true
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { public: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: { name: 'dashboard' } },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
      },
      {
        path: 'keys',
        name: 'api-keys',
        component: () => import('@/views/ApiKeysView.vue'),
        meta: { requiresCapability: 'apiKeys' },
      },
      {
        path: 'usage',
        name: 'usage',
        component: () => import('@/views/UsageView.vue'),
        meta: { standardOnly: true },
      },
      {
        path: 'channels',
        name: 'channels',
        component: () => import('@/views/ChannelStatusView.vue'),
        meta: { standardOnly: true },
      },
      {
        path: 'subscriptions',
        name: 'subscriptions',
        component: () => import('@/views/SubscriptionsView.vue'),
        meta: { standardOnly: true },
      },
      {
        path: 'redeem',
        name: 'redeem',
        component: () => import('@/views/RedeemView.vue'),
        meta: { standardOnly: true },
      },
      {
        path: 'user-groups',
        name: 'user-groups',
        component: () => import('@/views/UserGroupsView.vue'),
        meta: { requiresUserGroupAccess: true, userGroupWorkspace: true, title: '用户组' },
      },
      {
        path: 'user-group-subscriptions',
        name: 'user-group-subscriptions',
        component: () => import('@/views/UserGroupSubscriptionsView.vue'),
        meta: { requiresUserGroupAccess: true, userGroupWorkspace: true, title: '用户组订阅' },
      },
      {
        path: 'user-group-usage',
        name: 'user-group-usage',
        component: () => import('@/views/UserGroupUsageView.vue'),
        meta: { requiresUserGroupAccess: true, userGroupWorkspace: true, title: '用户组用量' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
      },
      {
        path: 'admin/dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/AdminDashboardView.vue'),
        meta: { requiresAdmin: true, title: '管理概览' },
      },
      {
        path: 'admin/accounts',
        name: 'admin-accounts',
        component: () => import('@/views/admin/AdminAccountsView.vue'),
        meta: { requiresAdmin: true, title: '账号管理' },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsersView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '用户管理' },
      },
      {
        path: 'admin/groups',
        name: 'admin-groups',
        component: () => import('@/views/admin/AdminGroupsView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '分组管理' },
      },
      {
        path: 'admin/usage',
        name: 'admin-usage',
        component: () => import('@/views/admin/AdminUsageView.vue'),
        meta: { requiresAdmin: true, title: '全站用量' },
      },
      {
        path: 'admin/channel-monitors',
        name: 'admin-channel-monitors',
        component: () => import('@/views/admin/AdminChannelMonitorsView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '渠道监控' },
      },
      {
        path: 'admin/audit-logs',
        name: 'admin-audit-logs',
        component: () => import('@/views/admin/AdminAuditLogsView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '审计日志' },
      },
      {
        path: 'admin/subscriptions',
        name: 'admin-subscriptions',
        component: () => import('@/views/admin/AdminSubscriptionsView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '订阅管理' },
      },
      {
        path: 'admin/redeem-codes',
        name: 'admin-redeem-codes',
        component: () => import('@/views/admin/AdminRedeemCodesView.vue'),
        meta: { requiresAdmin: true, standardOnly: true, title: '兑换码' },
      },
      {
        path: 'admin/announcements',
        name: 'admin-announcements',
        component: () => import('@/views/admin/AdminAnnouncementsView.vue'),
        meta: { requiresAdmin: true, title: '公告管理' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  // Navigation waits for bootstrap so we never bounce through /login on launch
  // while the stored session is still being read from disk.
  if (!session.ready) return true

  return resolveRouteAccess({
    authenticated: isAuthenticated(),
    role: session.user?.role ?? null,
    runMode: session.runMode,
    userGroupAccess: session.user?.role === 'admin' || session.userGroupCapabilities?.can_access === true,
    capabilities: appCapabilities,
    toName: to.name,
    meta: to.meta,
  })
})

watch(
  () => session.userGroupCapabilities?.can_access === true,
  (hasAccess) => {
    if (shouldExitUserGroupWorkspace(hasAccess, router.currentRoute.value.meta)) {
      void router.replace({ name: 'dashboard' })
    }
  },
)
