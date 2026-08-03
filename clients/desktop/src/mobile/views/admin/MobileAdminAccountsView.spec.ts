import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminAccount, AdminAccountListResponse } from '@/api/admin/types'
import AccountEditorDialog from '@/components/admin/AccountEditorDialog.vue'
import accountEditorSource from '@/components/admin/AccountEditorDialog.vue?raw'
import accountsViewSource from './MobileAdminAccountsView.vue?raw'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getModels: vi.fn(),
  test: vi.fn(),
  recover: vi.fn(),
  clearError: vi.fn(),
  refreshCredentials: vi.fn(),
  setSchedulable: vi.fn(),
}))

vi.mock('@/api/admin/accounts', () => ({
  listAdminAccounts: mocks.list,
  createAdminAccount: mocks.create,
  updateAdminAccount: mocks.update,
  getAdminAccountModels: mocks.getModels,
  testAdminAccount: mocks.test,
  recoverAdminAccount: mocks.recover,
  clearAdminAccountError: mocks.clearError,
  refreshAdminAccountCredentials: mocks.refreshCredentials,
  setAdminAccountSchedulable: mocks.setSchedulable,
}))

import MobileAdminAccountsView from './MobileAdminAccountsView.vue'

function account(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 17,
    name: 'Claude Primary With A Deliberately Long Account Name',
    notes: 'production pool',
    platform: 'anthropic',
    type: 'apikey',
    proxy_id: null,
    concurrency: 10,
    current_concurrency: 3,
    priority: 10,
    rate_multiplier: 1.2,
    status: 'active',
    error_message: null,
    schedulable: true,
    last_used_at: '2026-08-02T07:50:00Z',
    expires_at: null,
    rate_limited_at: null,
    rate_limit_reset_at: null,
    overload_until: null,
    temp_unschedulable_until: null,
    temp_unschedulable_reason: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-02T07:50:00Z',
    groups: [{ id: 4, name: 'Claude Code' }],
    ...overrides,
  }
}

const healthy = account()
const unhealthy = account({
  id: 29,
  name: 'Codex Backup',
  platform: 'openai',
  status: 'error',
  schedulable: false,
  current_concurrency: Number.NaN,
  concurrency: Number.POSITIVE_INFINITY,
  rate_multiplier: Number.NaN,
  expires_at: Number.POSITIVE_INFINITY,
  error_message: 'refresh token expired with credential=must-not-render',
  groups: [],
})

function response(items = [healthy, unhealthy], overrides: Partial<AdminAccountListResponse> = {}): AdminAccountListResponse {
  return { items, total: items.length, page: 1, page_size: 20, ...overrides }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function openMenu(wrapper: ReturnType<typeof mount>, id: number) {
  await wrapper.get(`[data-testid="account-menu-trigger-${id}"]`).trigger('click')
}

describe('MobileAdminAccountsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockResolvedValue(response())
    mocks.create.mockResolvedValue(healthy)
    mocks.update.mockResolvedValue(healthy)
    mocks.getModels.mockResolvedValue([{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }])
    mocks.test.mockResolvedValue({ success: true, message: '连接正常', latency_ms: 320 })
    mocks.recover.mockResolvedValue({ ...unhealthy, status: 'active', schedulable: true, error_message: null })
    mocks.clearError.mockResolvedValue({ ...unhealthy, error_message: null })
    mocks.refreshCredentials.mockResolvedValue(unhealthy)
    mocks.setSchedulable.mockImplementation((id: number, schedulable: boolean) =>
      Promise.resolve({ ...(id === healthy.id ? healthy : unhealthy), schedulable }),
    )
  })

  it('renders safe account cards and submits search plus bottom-sheet filters', async () => {
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('账号管理')
    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain(healthy.name)
    expect(wrapper.text()).toContain('Claude Code')
    expect(wrapper.text()).toContain('3 / 10')
    expect(wrapper.text()).not.toContain('must-not-render')
    expect(wrapper.get('[data-testid="mobile-account-card"]').text()).toContain('1.2x')
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, page_size: 20 })

    await wrapper.get('[data-testid="account-search"]').setValue(' Claude ')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, search: 'Claude' })

    await wrapper.get('[data-testid="account-filter-trigger"]').trigger('click')
    const platformFilter = document.querySelector<HTMLSelectElement>('[data-testid="account-platform-filter"]')
    const statusFilter = document.querySelector<HTMLSelectElement>('[data-testid="account-status-filter"]')
    const applyButton = document.querySelector<HTMLButtonElement>('[data-testid="account-filter-apply"]')
    expect(platformFilter).not.toBeNull()
    expect(statusFilter).not.toBeNull()
    expect(applyButton).not.toBeNull()
    platformFilter!.value = 'openai'
    platformFilter!.dispatchEvent(new Event('change', { bubbles: true }))
    statusFilter!.value = 'error'
    statusFilter!.dispatchEvent(new Event('change', { bubbles: true }))
    applyButton!.click()
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'Claude',
      platform: 'openai',
      status: 'error',
    })
    wrapper.unmount()
  })

  it('confirms a schedulable change, supports cancellation, and calls the exact account id once', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    expect(wrapper.get('[data-testid="account-schedulable-dialog"]').text()).toContain('暂停调度')
    await wrapper.get('[data-testid="cancel-account-schedulable"]').trigger('click')
    expect(mocks.setSchedulable).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    await wrapper.get('[data-testid="confirm-account-schedulable"]').trigger('click')
    await flushPromises()
    expect(mocks.setSchedulable).toHaveBeenCalledTimes(1)
    expect(mocks.setSchedulable).toHaveBeenCalledWith(17, false)
  })

  it('tests, recovers, clears errors and refreshes credentials with each exact account id', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="test-account-17"]').trigger('click')
    await flushPromises()
    expect(mocks.getModels).toHaveBeenCalledWith(17)
    await wrapper.get('[data-testid="account-test-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.test).toHaveBeenCalledWith(17, { model_id: 'claude-sonnet-4-5', prompt: '' })

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="recover-account-29"]').trigger('click')
    await flushPromises()
    expect(mocks.recover).toHaveBeenCalledWith(29)

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="clear-account-error-29"]').trigger('click')
    await flushPromises()
    expect(mocks.clearError).toHaveBeenCalledWith(29)

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="refresh-account-credentials-29"]').trigger('click')
    await flushPromises()
    expect(mocks.refreshCredentials).toHaveBeenCalledWith(29)
  })

  it('replaces an account only from a complete credential refresh response', async () => {
    const refreshed = account({
      id: unhealthy.id,
      name: 'Codex Backup Refreshed',
      platform: 'openai',
      status: 'active',
      error_message: null,
      groups: [],
    })
    mocks.list.mockResolvedValueOnce(response()).mockResolvedValueOnce(response([healthy, refreshed]))
    mocks.refreshCredentials.mockResolvedValueOnce(refreshed)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="refresh-account-credentials-29"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Codex Backup Refreshed')
    expect(wrapper.text()).not.toContain('must-not-render')
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing card and shows a fixed message for a refresh warning response', async () => {
    mocks.list.mockResolvedValueOnce(response()).mockResolvedValueOnce(response())
    mocks.refreshCredentials.mockResolvedValueOnce({
      warning: 'missing_project_id_temporary',
      message: 'raw credential refresh details must-not-render',
    })
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="refresh-account-credentials-29"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(unhealthy.name)
    expect(wrapper.get('[data-testid="account-action-message"]').text()).toContain('凭据已刷新，但项目 ID 暂未获取，系统将自动重试。')
    expect(wrapper.text()).not.toContain('raw credential refresh details')
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('preserves the refresh warning and old card when its follow-up list reload fails', async () => {
    mocks.list.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('token=follow-up-secret'))
    mocks.refreshCredentials.mockResolvedValueOnce({
      warning: 'missing_project_id_temporary',
      message: 'raw warning message must-not-render',
    })
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="refresh-account-credentials-29"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(unhealthy.name)
    expect(wrapper.get('[data-testid="account-action-message"]').text()).toContain('凭据已刷新，但项目 ID 暂未获取，系统将自动重试。')
    expect(wrapper.find('[data-testid="account-action-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('follow-up-secret')
    expect(wrapper.text()).not.toContain('raw warning message')
  })

  it('opens the existing mobile detail and editor surfaces from real card controls', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-detail-trigger-17"]').trigger('click')
    expect(wrapper.get('[data-testid="account-detail"]').classes()).toContain('mobile')
    expect(wrapper.get('[data-testid="account-detail"]').text()).toContain(healthy.name)
    await wrapper.get('[data-testid="account-detail"]').get('[aria-label="关闭"]').trigger('click')

    await wrapper.get('[data-testid="account-detail-trigger-29"]').trigger('click')
    expect(wrapper.get('[data-testid="account-detail"]').text()).toContain('账号存在错误')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('must-not-render')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('NaN')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('Infinity')
    await wrapper.get('[data-testid="account-detail"]').get('[aria-label="关闭"]').trigger('click')

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    expect(wrapper.get('.dialog-backdrop').classes()).toContain('mobile')
    expect(wrapper.get('.account-editor').classes()).toContain('mobile')
    expect(wrapper.get('[data-testid="account-editor-close"]').attributes('data-testid')).toBe('account-editor-close')
    expect(wrapper.get('[data-testid="account-editor-name"]').element).toHaveProperty('value', healthy.name)
  })

  it('renders an extreme finite account expiry with a safe placeholder', async () => {
    const extremeExpiry = account({ expires_at: Number.MAX_VALUE })
    mocks.list.mockResolvedValueOnce(response([extremeExpiry]))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-detail-trigger-17"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="account-detail"]').text()).toContain('永不过期')
    expect(wrapper.get('[data-testid="account-detail"]').text()).not.toContain('Invalid')
  })

  it('traps focus in account detail and editor dialogs and restores their triggers', async () => {
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    const detailTrigger = wrapper.get('[data-testid="account-detail-trigger-17"]')
    ;(detailTrigger.element as HTMLElement).focus()
    await detailTrigger.trigger('click')
    await flushPromises()
    const detailClose = wrapper.get('[data-testid="account-detail"] [aria-label="关闭"]')
    expect(document.activeElement).toBe(detailClose.element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(detailClose.element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-detail"]').exists()).toBe(false)
    expect(document.activeElement).toBe(detailTrigger.element)

    const menuTrigger = wrapper.get('[data-testid="account-menu-trigger-17"]')
    ;(menuTrigger.element as HTMLElement).focus()
    await menuTrigger.trigger('click')
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="account-editor-name"]').element)
    const editorClose = wrapper.get('[data-testid="account-editor-close"]')
    ;(editorClose.element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(wrapper.get('[data-testid="account-editor-save"]').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('.account-editor').exists()).toBe(false)
    expect(document.activeElement).toBe(menuTrigger.element)
    wrapper.unmount()
  })

  it('manages focus and pending close guards for account test and scheduling dialogs', async () => {
    const pending = deferred<AdminAccount>()
    mocks.setSchedulable.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    const testTrigger = wrapper.get('[data-testid="test-account-17"]')
    ;(testTrigger.element as HTMLElement).focus()
    await testTrigger.trigger('click')
    await flushPromises()
    const testDialog = wrapper.get('.test-dialog')
    expect(testDialog.element.contains(document.activeElement)).toBe(true)
    const testButtons = testDialog.findAll('button:not(:disabled)')
    ;(testButtons.at(-1)!.element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(testDialog.find('select:not(:disabled)').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('.test-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(testTrigger.element)

    const scheduleTrigger = wrapper.get('[data-testid="account-schedulable-17"]')
    ;(scheduleTrigger.element as HTMLElement).focus()
    await scheduleTrigger.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="cancel-account-schedulable"]').element)
    const confirm = wrapper.get('[data-testid="confirm-account-schedulable"]')
    ;(confirm.element as HTMLElement).focus()
    await confirm.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.get('.confirm-backdrop').trigger('mousedown')
    expect(wrapper.find('[data-testid="account-schedulable-dialog"]').exists()).toBe(true)
    pending.resolve({ ...healthy, schedulable: false })
    await flushPromises()
    expect(wrapper.find('[data-testid="account-schedulable-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(scheduleTrigger.element)
    wrapper.unmount()
  })

  it('keeps the mobile editor open and redacts an account update rejection', async () => {
    mocks.update.mockRejectedValueOnce(new Error('api_key=editor-secret credential=raw-message'))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    await wrapper.get('[data-testid="account-editor-submit"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.account-editor').exists()).toBe(true)
    expect(wrapper.get('.form-error').text()).toBe('账号保存失败，请稍后重试。')
    expect(wrapper.text()).not.toContain('editor-secret')
    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="account-editor-save"]').attributes('disabled')).toBeUndefined()
  })

  it('preserves zero account concurrency, priority and rate multiplier boundaries', async () => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    const numericInputs = wrapper.findAll('.account-editor input[type="number"]')
    expect(numericInputs).toHaveLength(3)
    for (const input of numericInputs) await input.setValue('0')
    await wrapper.get('[data-testid="account-editor-submit"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledWith(17, expect.objectContaining({
      concurrency: 0,
      priority: 0,
      rate_multiplier: 0,
    }))
  })

  it('submits an account update only once while the first request is pending', async () => {
    const pending = deferred<AdminAccount>()
    mocks.update.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    const form = wrapper.get('[data-testid="account-editor-submit"]')
    await form.trigger('submit')
    await form.trigger('submit')

    expect(mocks.update).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.get('.dialog-backdrop').trigger('mousedown')
    expect(wrapper.find('.account-editor').exists()).toBe(true)
    pending.resolve(healthy)
    await flushPromises()
    wrapper.unmount()
  })

  it('does not emit account editor results when a pending save settles after unmount', async () => {
    const pending = deferred<AdminAccount>()
    const onSaved = vi.fn()
    const onModelValue = vi.fn()
    mocks.update.mockReturnValueOnce(pending.promise)
    const wrapper = mount(AccountEditorDialog, {
      props: {
        modelValue: true,
        account: healthy,
        mobile: true,
        onSaved,
        'onUpdate:modelValue': onModelValue,
      },
    })

    await wrapper.get('[data-testid="account-editor-submit"]').trigger('submit')
    const editorState = wrapper.vm as unknown as { saving: boolean }
    expect(editorState.saving).toBe(true)
    wrapper.unmount()
    pending.resolve(healthy)
    await flushPromises()

    expect(onSaved).not.toHaveBeenCalled()
    expect(onModelValue).not.toHaveBeenCalled()
    expect(editorState.saving).toBe(true)
  })

  it.each([
    ['blank concurrency', 0, '', '并发上限必须是非负整数。'],
    ['negative concurrency', 0, '-1', '并发上限必须是非负整数。'],
    ['fractional concurrency', 0, '1.5', '并发上限必须是非负整数。'],
    ['infinite concurrency', 0, 'Infinity', '并发上限必须是非负整数。'],
    ['NaN concurrency', 0, 'NaN', '并发上限必须是非负整数。'],
    ['blank priority', 1, '', '优先级必须是非负整数。'],
    ['negative priority', 1, '-1', '优先级必须是非负整数。'],
    ['fractional priority', 1, '1.5', '优先级必须是非负整数。'],
    ['infinite priority', 1, 'Infinity', '优先级必须是非负整数。'],
    ['NaN priority', 1, 'NaN', '优先级必须是非负整数。'],
    ['blank rate multiplier', 2, '', '计费倍率必须是有限的非负数字。'],
    ['negative rate multiplier', 2, '-1', '计费倍率必须是有限的非负数字。'],
    ['infinite rate multiplier', 2, 'Infinity', '计费倍率必须是有限的非负数字。'],
    ['NaN rate multiplier', 2, 'NaN', '计费倍率必须是有限的非负数字。'],
  ])('rejects %s without calling the account API', async (_caseName, inputIndex, value, expectedError) => {
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="edit-account-17"]').trigger('click')
    const input = wrapper.findAll('.account-editor input[type="number"]')[inputIndex]
    if (value === 'Infinity' || value === 'NaN') input.element.setAttribute('type', 'text')
    await input.setValue(value)
    await wrapper.get('[data-testid="account-editor-submit"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper.find('.account-editor').exists()).toBe(true)
    expect(wrapper.get('.account-editor [role="alert"]').text()).toBe(expectedError)
    if (value === 'Infinity' || value === 'NaN') {
      expect(wrapper.get('.account-editor [role="alert"]').text()).not.toContain(value)
    }
  })

  it('scopes 44px account editor controls to explicit mobile mode', () => {
    const desktop = mount(AccountEditorDialog, { props: { modelValue: true, account: healthy } })
    expect(desktop.get('.dialog-backdrop').classes()).not.toContain('mobile')
    expect(desktop.get('.account-editor').classes()).not.toContain('mobile')

    expect(accountEditorSource).toMatch(/\.account-editor\.mobile header button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/)
    expect(accountEditorSource).toMatch(/\.account-editor\.mobile (?:input|input,select,textarea)[^{]*\{[^}]*min-height:\s*44px/)
    expect(accountEditorSource).toMatch(/\.account-editor\.mobile footer button\s*\{[^}]*min-height:\s*44px/)
  })

  it('gives the account identity control an exact 44px minimum touch target', () => {
    expect(accountsViewSource).toMatch(/\.identity\s*\{[^}]*min-height:\s*44px/)
  })

  it('closes the per-card menu with Escape and an outside click', async () => {
    const wrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()

    await openMenu(wrapper, 17)
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(false)

    await openMenu(wrapper, 17)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="account-menu-17"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps cards on mutation failure, redacts the raw error and releases the action busy state', async () => {
    mocks.setSchedulable.mockRejectedValueOnce(new Error('api_key=super-secret token=also-secret'))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-schedulable-17"]').trigger('click')
    await wrapper.get('[data-testid="confirm-account-schedulable"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="account-action-error"]').text()).toContain('操作失败')
    expect(wrapper.text()).not.toContain('super-secret')
    expect(wrapper.get('[data-testid="account-schedulable-17"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps feedback owned by the latest account mutation when operations finish out of order', async () => {
    const olderRefresh = deferred<AdminAccount>()
    const newerRecover = deferred<AdminAccount>()
    mocks.refreshCredentials.mockReturnValueOnce(olderRefresh.promise)
    mocks.recover.mockReturnValueOnce(newerRecover.promise)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await openMenu(wrapper, 17)
    await wrapper.get('[data-testid="refresh-account-credentials-17"]').trigger('click')
    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="recover-account-29"]').trigger('click')
    newerRecover.resolve({ ...unhealthy, status: 'active', schedulable: true, error_message: null })
    await flushPromises()
    olderRefresh.reject(new Error('token=older-operation-secret'))
    await flushPromises()

    expect(wrapper.get('[data-testid="account-action-message"]').text()).toContain(`${unhealthy.name} 已恢复运行状态`)
    expect(wrapper.find('[data-testid="account-action-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('older-operation-secret')
  })

  it('does not let an older standalone account reload conflict with a newer mutation result', async () => {
    const olderList = deferred<AdminAccountListResponse>()
    const newerRecover = deferred<AdminAccount>()
    mocks.list
      .mockResolvedValueOnce(response())
      .mockReturnValueOnce(olderList.promise)
      .mockResolvedValueOnce(response())
    mocks.recover.mockReturnValueOnce(newerRecover.promise)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-refresh"]').trigger('click')
    await openMenu(wrapper, 29)
    await wrapper.get('[data-testid="recover-account-29"]').trigger('click')
    olderList.reject(new Error('token=older-list-secret'))
    await flushPromises()
    newerRecover.resolve({ ...unhealthy, status: 'active', schedulable: true, error_message: null })
    await flushPromises()

    expect(wrapper.get('[data-testid="account-action-message"]').text()).toContain(`${unhealthy.name} 已恢复运行状态`)
    expect(wrapper.find('[data-testid="account-action-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('older-list-secret')
  })

  it('shows loading, retryable private errors and empty results', async () => {
    const pending = deferred<AdminAccountListResponse>()
    mocks.list.mockReturnValueOnce(pending.promise)
    const wrapper = mount(MobileAdminAccountsView)
    expect(wrapper.get('[data-testid="mobile-page-loading"]').attributes('aria-label')).toContain('正在加载账号')
    pending.reject(new Error('credential=private-value offline'))
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('账号列表加载失败')
    expect(wrapper.text()).not.toContain('private-value')
    mocks.list.mockResolvedValueOnce(response([]))
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-page-empty"]').text()).toContain('暂无账号')
  })

  it.each([
    ['null row', { ...response(), items: [null], total: 1, diagnostic: 'credential=null-row-secret' }],
    ['duplicate id', response([healthy, { ...healthy, name: 'credential=duplicate-id-secret' }])],
    ['invalid status', { ...response(), items: [{ ...healthy, status: 'credential=invalid-status-secret' }], total: 1 }],
    ['invalid pagination', { ...response(), page_size: 0, diagnostic: 'credential=page-secret' }],
  ])('rejects a malformed account list with %s and recovers on retry', async (_caseName, payload) => {
    mocks.list
      .mockResolvedValueOnce(payload as unknown as AdminAccountListResponse)
      .mockResolvedValueOnce(response([healthy]))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain(
      '账号列表加载失败，请检查网络后重试。',
    )
    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('credential=')

    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-account-card"]')).toHaveLength(1)
    expect(wrapper.text()).toContain(healthy.name)
  })

  it('ignores stale filter responses and does not leave the page busy', async () => {
    const older = deferred<AdminAccountListResponse>()
    const newer = deferred<AdminAccountListResponse>()
    mocks.list.mockResolvedValueOnce(response()).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-search"]').setValue('older')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    await wrapper.get('[data-testid="account-search"]').setValue('newer')
    await wrapper.get('[data-testid="account-search-form"]').trigger('submit')
    newer.resolve(response([account({ id: 42, name: 'Newest Account' })]))
    await flushPromises()
    older.resolve(response([account({ id: 41, name: 'Stale Account' })]))
    await flushPromises()

    expect(wrapper.text()).toContain('Newest Account')
    expect(wrapper.text()).not.toContain('Stale Account')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('loads exact previous and next pages while enforcing pagination boundaries', async () => {
    mocks.list
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 1 }))
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 2 }))
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 1 }))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-pagination-previous"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    await wrapper.get('[data-testid="mobile-pagination-previous"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
  })

  it('keeps the previous account page and releases busy when a shrink fallback request fails', async () => {
    const oldPageAccount = account({ id: 42, name: 'Retained Page Two Account' })
    mocks.list
      .mockResolvedValueOnce(response([healthy], { total: 41, page: 1 }))
      .mockResolvedValueOnce(response([oldPageAccount], { total: 41, page: 2 }))
      .mockResolvedValueOnce(response([], { total: 1, page: 2 }))
      .mockRejectedValueOnce(new Error('credential=fallback-page-secret'))
    const wrapper = mount(MobileAdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="mobile-pagination-next"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(oldPageAccount.name)
    await wrapper.get('[data-testid="account-refresh"]').trigger('click')
    await flushPromises()

    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    expect(wrapper.text()).toContain(oldPageAccount.name)
    expect(wrapper.get('[data-testid="account-action-error"]').text()).toContain('已保留当前数据')
    expect(wrapper.text()).not.toContain('fallback-page-secret')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('ignores pending account list and mutation settlements after unmount', async () => {
    const unhandled = vi.fn()
    window.addEventListener('unhandledrejection', unhandled)

    const pendingList = deferred<AdminAccountListResponse>()
    mocks.list.mockReturnValueOnce(pendingList.promise)
    const listWrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    listWrapper.unmount()
    pendingList.reject(new Error('credential=unmounted-list-secret'))
    await flushPromises()

    mocks.list.mockResolvedValueOnce(response())
    const pendingRefresh = deferred<AdminAccount>()
    mocks.refreshCredentials.mockReturnValueOnce(pendingRefresh.promise)
    const mutationWrapper = mount(MobileAdminAccountsView, { attachTo: document.body })
    await flushPromises()
    await openMenu(mutationWrapper, 17)
    await mutationWrapper.get('[data-testid="refresh-account-credentials-17"]').trigger('click')
    mutationWrapper.unmount()
    pendingRefresh.reject(new Error('token=unmounted-mutation-secret'))
    await flushPromises()

    expect(unhandled).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('unmounted-list-secret')
    expect(document.body.textContent).not.toContain('unmounted-mutation-secret')
    window.removeEventListener('unhandledrejection', unhandled)
  })
})
