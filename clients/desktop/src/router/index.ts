/**
 * Router.
 *
 * Hash history, not web history: the production build is loaded from
 * `tauri://localhost` where path-based routes would 404 on reload.
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { isAuthenticated, session } from '@/stores/session'

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
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
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

  if (!isAuthenticated()) {
    return to.meta.public ? true : { name: 'login' }
  }

  if (to.name === 'login') {
    return { name: 'dashboard' }
  }

  if (to.meta.standardOnly && session.runMode === 'simple') {
    return { name: 'dashboard' }
  }

  return true
})
