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

  return true
})
