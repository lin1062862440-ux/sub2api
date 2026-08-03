import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminDeniedListener: null as null | (() => void),
  backButtonHandler: null as null | ((payload: { canGoBack: boolean }) => void),
  onBackButtonPress: vi.fn(),
  platform: 'android' as 'android' | 'macos',
  session: null as any,
  signOut: vi.fn(),
  unregisterBackButton: vi.fn(),
  updateCancel: vi.fn(),
  updateCheck: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updatePermission: vi.fn(),
  updateState: null as any,
}))

vi.mock('@tauri-apps/api/app', () => ({
  onBackButtonPress: mocks.onBackButtonPress,
}))

vi.mock('@/lib/platform', () => ({
  platform: () => mocks.platform,
}))

vi.mock('@/lib/android-updater-host', async () => {
  const { ref } = await import('vue')
  mocks.updateState = ref({
    phase: 'idle',
    release: null,
    installedVersion: '0.1.4',
    downloadedBytes: 0,
    totalBytes: 0,
    error: null,
  })
  return {
    androidUpdater: {
      state: mocks.updateState,
      check: mocks.updateCheck,
      download: mocks.updateDownload,
      cancel: mocks.updateCancel,
      requestInstallPermission: mocks.updatePermission,
      install: mocks.updateInstall,
    },
  }
})

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
import mobileAppLayoutSource from './MobileAppLayout.vue?raw'

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
const mountedWrappers: Array<{ unmount: () => void }> = []

async function mountLayout(initialRoute: string, role: 'user' | 'admin' = 'user') {
  mocks.session.user.role = role
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(initialRoute)
  await router.isReady()
  const wrapper = mount(MobileAppLayout, {
    attachTo: document.body,
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
  mountedWrappers.push(wrapper)
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
    mocks.backButtonHandler = null
    mocks.platform = 'android'
    mocks.onBackButtonPress.mockReset().mockImplementation(async (handler) => {
      mocks.backButtonHandler = handler
      return { unregister: mocks.unregisterBackButton }
    })
    mocks.unregisterBackButton.mockReset().mockResolvedValue(undefined)
    mocks.updateCancel.mockReset().mockResolvedValue(undefined)
    mocks.updateCheck.mockReset().mockResolvedValue(true)
    mocks.updateDownload.mockReset().mockResolvedValue(undefined)
    mocks.updateInstall.mockReset().mockResolvedValue(undefined)
    mocks.updatePermission.mockReset().mockResolvedValue(undefined)
    const idleUpdateState = {
      phase: 'idle',
      release: null,
      installedVersion: '0.1.4',
      downloadedBytes: 0,
      totalBytes: 0,
      error: null,
    }
    if (mocks.updateState) mocks.updateState.value = idleUpdateState
    else mocks.updateState = { value: idleUpdateState }
    mocks.session.user.role = 'user'
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    document.body.innerHTML = ''
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
    expect(popover.text()).toContain('检查更新')
    expect(popover.text()).not.toContain('用量显示')
    expect(popover.text()).not.toContain('网页管理后台')
    expect(popover.find('[data-testid="mobile-workspace-switch"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="mobile-account-trigger"]').attributes('aria-controls'))
      .toBe('mobile-account-popover')
    expect(wrapper.get('[data-testid="mobile-account-trigger"]').attributes('aria-haspopup')).toBe('dialog')
    expect(popover.attributes('role')).toBe('dialog')
    expect(popover.attributes('aria-modal')).toBe('true')
    expect(popover.find('[role="menuitem"]').exists()).toBe(false)

    await clickAndExpectRoute(router, popover.get('[data-testid="profile-menu-item"]'), 'profile')
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
  })

  it('checks automatically without opening a sheet and exposes the same entry to administrators', async () => {
    const personal = await mountLayout('/dashboard')
    expect(mocks.updateCheck).toHaveBeenCalledWith({ manual: false })
    expect(personal.wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(false)
    await personal.wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    expect(personal.wrapper.find('[data-testid="android-update-menu-item"]').exists()).toBe(true)

    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const admin = await mountLayout('/admin/dashboard', 'admin')
    await admin.wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    expect(admin.wrapper.find('[data-testid="android-update-menu-item"]').exists()).toBe(true)
  })

  it('runs an unrestricted manual check and opens the update sheet', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    mocks.updateCheck.mockClear()
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await wrapper.get('[data-testid="android-update-menu-item"]').trigger('click')
    await flushPromises()

    expect(mocks.updateCheck).toHaveBeenCalledWith({ manual: true })
    expect(wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(true)
  })

  it('keeps discovery non-blocking and opens it from the update notice', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    mocks.updateState.value = {
      phase: 'available',
      release: {
        version: '0.1.5', versionCode: 1_005, notes: '更新说明', publishedAt: '2026-08-03T00:00:00.000Z',
        url: 'https://gitee.com/a.apk', bytes: 2_048, sha256: 'a'.repeat(64), signature: 'signature',
      },
      installedVersion: '0.1.4',
      downloadedBytes: 0,
      totalBytes: 2_048,
      error: null,
    }
    await nextTick()

    expect(wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(false)
    const notice = wrapper.get('[data-testid="android-update-notice"]')
    expect(notice.text()).toContain('0.1.5')
    await notice.trigger('click')
    expect(wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(true)
  })

  it('hides Android updater controls when the mobile shell is rendered on desktop', async () => {
    mocks.platform = 'macos'
    const { wrapper } = await mountLayout('/dashboard')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')

    expect(wrapper.find('[data-testid="android-update-menu-item"]').exists()).toBe(false)
    expect(mocks.updateCheck).not.toHaveBeenCalled()
  })

  it('closes the account disclosure on blank space and restores avatar focus', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    const trigger = wrapper.get<HTMLButtonElement>('[data-testid="mobile-account-trigger"]')

    await trigger.trigger('click')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('allows an outside focusable pointer target to receive focus when account closes', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    const outside = document.createElement('button')
    outside.type = 'button'
    document.body.appendChild(outside)

    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    outside.focus()
    await nextTick()

    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('restores avatar focus when Escape closes the account disclosure', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    const trigger = wrapper.get<HTMLButtonElement>('[data-testid="mobile-account-trigger"]')

    await trigger.trigger('click')
    wrapper.get<HTMLButtonElement>('[data-testid="password-menu-item"]').element.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('moves focus into the account popover and traps Tab in its controls', async () => {
    const { wrapper } = await mountLayout('/dashboard')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await nextTick()
    const controls = wrapper.findAll<HTMLElement>('[data-testid="mobile-account-popover"] a, [data-testid="mobile-account-popover"] button')
    const first = controls[0]!.element
    const last = controls[controls.length - 1]!.element

    expect(document.activeElement).toBe(first)

    last.focus()
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(forwards)
    expect(forwards.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    first.focus()
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(backwards)
    expect(backwards.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
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

  it('signs an administrator out, closes the account layer, and routes to login', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')

    await wrapper.get('[data-testid="logout"]').trigger('click')
    await flushPromises()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
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

  it('consumes native Back for the account layer, then leaves real router history to the host', async () => {
    const { router, wrapper } = await mountLayout('/dashboard')
    await router.push('/usage')
    await flushPromises()

    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await flushPromises()
    expect(mocks.onBackButtonPress).toHaveBeenCalledOnce()
    expect(mocks.backButtonHandler).toBeTypeOf('function')

    mocks.backButtonHandler?.({ canGoBack: true })
    await flushPromises()
    expect(wrapper.find('[data-testid="mobile-account-popover"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('usage')
    expect(mocks.unregisterBackButton).toHaveBeenCalledOnce()

    router.back()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('consumes native Back for the update sheet before route history', async () => {
    const { router, wrapper } = await mountLayout('/dashboard')
    await router.push('/usage')
    await flushPromises()
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await wrapper.get('[data-testid="android-update-menu-item"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(true)
    expect(mocks.backButtonHandler).toBeTypeOf('function')
    mocks.backButtonHandler?.({ canGoBack: true })
    await flushPromises()

    expect(wrapper.find('[data-testid="android-update-sheet"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('usage')
  })

  it('consumes native Back for More and does not register the Android listener on desktop', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const mobile = await mountLayout('/admin/dashboard', 'admin')
    await mobile.router.push('/admin/accounts')
    await flushPromises()

    await mobile.wrapper.get('[data-testid="mobile-more-trigger"]').trigger('click')
    await flushPromises()
    mocks.backButtonHandler?.({ canGoBack: true })
    await flushPromises()
    expect(mobile.wrapper.find('[data-testid="mobile-more-sheet"]').exists()).toBe(false)
    expect(mobile.router.currentRoute.value.name).toBe('admin-accounts')
    expect(mocks.unregisterBackButton).toHaveBeenCalledOnce()

    mocks.platform = 'macos'
    mocks.onBackButtonPress.mockClear()
    const desktop = await mountLayout('/dashboard')
    await desktop.wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await flushPromises()
    expect(mocks.onBackButtonPress).not.toHaveBeenCalled()
  })

  it('opens More as a labelled modal, focuses its first destination, and restores focus on Escape', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { wrapper } = await mountLayout('/admin/dashboard', 'admin')
    const trigger = wrapper.get<HTMLButtonElement>('[data-testid="mobile-more-trigger"]')
    await trigger.trigger('click')
    await nextTick()

    const sheet = wrapper.get('[data-testid="mobile-more-sheet"]')
    const first = wrapper.get<HTMLAnchorElement>(
      '[data-testid="mobile-overflow-nav-item"][data-route-name="user-groups"]',
    )
    expect(sheet.attributes('role')).toBe('dialog')
    expect(sheet.attributes('aria-modal')).toBe('true')
    expect(sheet.attributes('aria-labelledby')).toBe('mobile-more-sheet-title')
    expect(document.activeElement).toBe(first.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-more-sheet"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('keeps Tab and Shift+Tab focus inside the More modal', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { wrapper } = await mountLayout('/admin/dashboard', 'admin')
    await wrapper.get('[data-testid="mobile-more-trigger"]').trigger('click')
    await nextTick()
    const destinations = wrapper.findAll<HTMLAnchorElement>('[data-testid="mobile-overflow-nav-item"]')
    const first = destinations[0]!.element
    const last = destinations[destinations.length - 1]!.element

    last.focus()
    const forwards = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(forwards)
    expect(forwards.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    first.focus()
    const backwards = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(backwards)
    expect(backwards.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('restores More trigger focus after scrim, selection, and popstate closes', async () => {
    localStorage.setItem(ADMIN_WORKSPACE_STORAGE_KEY, 'admin')
    const { router, wrapper } = await mountLayout('/admin/dashboard', 'admin')
    const trigger = wrapper.get<HTMLButtonElement>('[data-testid="mobile-more-trigger"]')

    await trigger.trigger('click')
    await wrapper.get('[data-testid="mobile-more-scrim"]').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await wrapper.get('[data-testid="mobile-overflow-nav-item"][data-route-name="user-groups"]')
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('user-groups')
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-more-sheet"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('removes account and layer listeners after unmount', async () => {
    const addDocument = vi.spyOn(document, 'addEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = await mountLayout('/dashboard')
    await wrapper.get('[data-testid="mobile-account-trigger"]').trigger('click')
    await flushPromises()

    wrapper.unmount()

    expect(addDocument.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(removeDocument).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeDocument).toHaveBeenCalledWith('pointerdown', expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith('popstate', expect.any(Function))
    expect(mocks.unregisterBackButton).toHaveBeenCalledOnce()
    expect(mocks.adminDeniedListener).toBeNull()
  })

  it('keeps the scrolling content viewport between the fixed mobile bars', () => {
    expect(mobileAppLayoutSource).toMatch(/\.mobile-content\s*\{[^}]*position:\s*fixed;/s)
    expect(mobileAppLayoutSource).toMatch(/\.mobile-content\s*\{[^}]*top:\s*calc\(56px \+ env\(safe-area-inset-top\)\);/s)
    expect(mobileAppLayoutSource).toMatch(/\.mobile-content\s*\{[^}]*bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\);/s)
    expect(mobileAppLayoutSource).toMatch(/\.mobile-content\s*\{[^}]*scroll-padding-block:\s*12px;/s)
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
