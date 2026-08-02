import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminDeniedListener: null as null | (() => void),
  session: null as any,
  signOut: vi.fn(),
}))

vi.mock('@/lib/http', () => ({
  ApiError: class ApiError extends Error {},
  onAdminAccessDenied: (listener: () => void) => {
    mocks.adminDeniedListener = listener
    return () => {
      mocks.adminDeniedListener = null
    }
  },
}))

vi.mock('@/stores/session', async () => {
  mocks.session = reactive({
    user: {
      username: 'Lin',
      email: 'lin@example.com',
      role: 'user',
      avatar_url: 'https://cdn.example.com/lin.png',
    },
  })
  return { session: mocks.session, signOut: mocks.signOut }
})

import { ADMIN_WORKSPACE_STORAGE_KEY } from '@/lib/admin-workspace'
import MobileAppLayout from './MobileAppLayout.vue'

const RouteView = defineComponent({ template: '<div data-testid="route-view" />' })
const routes = [
  { path: '/dashboard', name: 'dashboard', component: RouteView },
  { path: '/usage', name: 'usage', component: RouteView },
  { path: '/subscriptions', name: 'subscriptions', component: RouteView },
  { path: '/profile', name: 'profile', component: RouteView },
  { path: '/admin/dashboard', name: 'admin-dashboard', component: RouteView, meta: { requiresAdmin: true } },
  { path: '/admin/accounts', name: 'admin-accounts', component: RouteView, meta: { requiresAdmin: true } },
  { path: '/admin/groups', name: 'admin-groups', component: RouteView, meta: { requiresAdmin: true } },
  { path: '/admin/users', name: 'admin-users', component: RouteView, meta: { requiresAdmin: true } },
  { path: '/user-groups', name: 'user-groups', component: RouteView, meta: { userGroupWorkspace: true } },
  { path: '/admin/subscriptions', name: 'admin-subscriptions', component: RouteView, meta: { requiresAdmin: true } },
  { path: '/login', name: 'login', component: RouteView },
]

async function mountLayout(initialRoute: string, role: 'user' | 'admin' = 'user') {
  mocks.session.user.role = role
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(initialRoute)
  await router.isReady()
  const wrapper = mount(MobileAppLayout, {
    global: {
      plugins: [router],
      stubs: {
        Teleport: true,
        ChangePasswordDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue" data-testid="password-dialog">修改密码</div>',
        },
      },
    },
  })
  await flushPromises()
  return { router, wrapper }
}

async function clickAndExpectRoute(
  router: Router,
  element: { trigger: (event: string) => Promise<unknown> },
  routeName: string,
) {
  await element.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe(routeName)
  await nextTick()
  expect(router.currentRoute.value.name).toBe(routeName)
}

describe('MobileAppLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.session.user.role = 'user'
  })

  it('renders a centered route title and right avatar without a menu trigger', async () => {
    const { wrapper } = await mountLayout('/usage')

    const bar = wrapper.get('[data-testid="mobile-app-bar"]')
    expect(bar.get('[data-testid="mobile-route-title"]').text()).toBe('用量')
    expect(bar.get('[data-testid="mobile-account-trigger"] img').attributes('src')).toBe(
      'https://cdn.example.com/lin.png',
    )
    expect(bar.find('[data-testid="mobile-menu-trigger"]').exists()).toBe(false)
    expect(bar.find('[aria-label="打开导航"]').exists()).toBe(false)
  })

  it('navigates every personal bottom destination without synthetic history', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back')
    const reload = vi.spyOn(window.location, 'reload')
    const { router, wrapper } = await mountLayout('/dashboard')
    const items = wrapper.findAll('[data-testid="mobile-direct-nav-item"]')

    expect(items.map((item) => item.attributes('data-route-name'))).toEqual([
      'dashboard',
      'usage',
      'subscriptions',
    ])
    for (const routeName of ['dashboard', 'usage', 'subscriptions']) {
      await clickAndExpectRoute(
        router,
        wrapper.get(`[data-testid="mobile-direct-nav-item"][data-route-name="${routeName}"]`),
        routeName,
      )
    }

    expect(pushState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('navigates every administrator direct and overflow destination', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back')
    const reload = vi.spyOn(window.location, 'reload')
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')
    const direct = wrapper.findAll('[data-testid="mobile-direct-nav-item"]')

    expect(direct.map((item) => item.attributes('data-route-name'))).toEqual([
      'admin-dashboard',
      'admin-accounts',
      'admin-groups',
      'admin-users',
    ])
    expect(wrapper.get('[data-testid="mobile-more-trigger"]').text()).toContain('更多')

    for (const routeName of ['admin-dashboard', 'admin-accounts', 'admin-groups', 'admin-users']) {
      await clickAndExpectRoute(
        router,
        wrapper.get(`[data-testid="mobile-direct-nav-item"][data-route-name="${routeName}"]`),
        routeName,
      )
    }

    await wrapper.get('[data-testid="mobile-more-trigger"]').trigger('click')
    const overflow = wrapper.findAll('[data-testid="mobile-overflow-nav-item"]')
    expect(overflow.map((item) => item.attributes('data-route-name'))).toEqual([
      'user-groups',
      'admin-subscriptions',
    ])
    await clickAndExpectRoute(
      router,
      wrapper.get('[data-testid="mobile-overflow-nav-item"][data-route-name="user-groups"]'),
      'user-groups',
    )
    expect(wrapper.get('[data-testid="mobile-more-trigger"]').classes()).toContain('mobile-nav-active')

    await wrapper.get('[data-testid="mobile-more-trigger"]').trigger('click')
    await clickAndExpectRoute(
      router,
      wrapper.get('[data-testid="mobile-overflow-nav-item"][data-route-name="admin-subscriptions"]'),
      'admin-subscriptions',
    )
    expect(wrapper.get('[data-testid="mobile-more-trigger"]').classes()).toContain('mobile-nav-active')
    expect(pushState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('opens an Android account popover and navigates to profile', async () => {
    const { router, wrapper } = await mountLayout('/dashboard')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')

    const popover = wrapper.get('[data-testid="mobile-account-popover"]')
    expect(popover.text()).toContain('Lin')
    expect(popover.text()).toContain('lin@example.com')
    expect(popover.text()).toContain('个人资料')
    expect(popover.text()).toContain('修改密码')
    expect(popover.text()).toContain('退出登录')
    expect(popover.text()).not.toContain('用量显示')
    expect(popover.text()).not.toContain('网页管理后台')
    expect(popover.find('[data-testid="mobile-workspace-switch"]').exists()).toBe(false)

    await clickAndExpectRoute(router, popover.get('[data-testid="profile-menu-item"]'), 'profile')
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
  })

  it('opens the password dialog and signs out to login', async () => {
    const { router, wrapper } = await mountLayout('/dashboard')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await wrapper.get('[data-testid="password-menu-item"]').trigger('click')
    expect(wrapper.get('[data-testid="password-dialog"]').text()).toContain('修改密码')

    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('switches administrator workspaces immediately and persists the preference', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back')
    const reload = vi.spyOn(window.location, 'reload')
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')
    const replace = vi.spyOn(router, 'replace')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-workspace-switch"]').text()).toContain('切换到用户端')

    await wrapper.get('[data-testid="mobile-workspace-switch"]').trigger('click')
    await flushPromises()
    expect(localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)).toBe('personal')
    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(replace).toHaveBeenLastCalledWith({ name: 'dashboard' })
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-direct-nav-item"]')
      .map((item) => item.attributes('data-route-name'))).toEqual(['dashboard', 'usage', 'subscriptions'])

    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-workspace-switch"]').text()).toContain('切换到管理端')
    await wrapper.get('[data-testid="mobile-workspace-switch"]').trigger('click')
    await flushPromises()
    expect(localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)).toBe('admin')
    expect(router.currentRoute.value.name).toBe('admin-dashboard')
    expect(replace).toHaveBeenLastCalledWith({ name: 'admin-dashboard' })
    expect(wrapper.findAll('[data-testid="mobile-direct-nav-item"]')).toHaveLength(4)
    expect(pushState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('restores an administrator saved workspace on mount', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router } = await mountLayout('/dashboard', 'admin')
    expect(router.currentRoute.value.name).toBe('admin-dashboard')
  })

  it('closes account and More layers on popstate or Escape without changing route', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')

    await wrapper.get('[data-testid="mobile-more-trigger"]').trigger('click')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-more-sheet"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('admin-dashboard')

    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('admin-dashboard')
  })

  it('returns to personal navigation when administrator access is denied or role is lost', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')
    expect(mocks.adminDeniedListener).toBeTypeOf('function')

    mocks.adminDeniedListener?.()
    await flushPromises()
    expect(localStorage.getItem(ADMIN_WORKSPACE_STORAGE_KEY)).toBe('personal')
    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(wrapper.get('[data-testid="admin-access-notice"]').text()).toContain('管理员权限已失效')
    expect(wrapper.findAll('[data-testid="mobile-direct-nav-item"]')).toHaveLength(3)

    wrapper.unmount()
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const lost = await mountLayout('/admin/dashboard', 'admin')
    mocks.session.user.role = 'user'
    await flushPromises()
    expect(lost.router.currentRoute.value.name).toBe('dashboard')
    expect(lost.wrapper.findAll('[data-testid="mobile-direct-nav-item"]')).toHaveLength(3)
  })
})
