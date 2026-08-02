import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserSubscription } from '@/api'

const mocks = vi.hoisted(() => ({
  getSubscriptions: vi.fn(),
}))

vi.mock('@/api', () => ({ getSubscriptions: mocks.getSubscriptions }))

import MobileSubscriptionsView from './MobileSubscriptionsView.vue'

function subscription(overrides: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: 11,
    user_id: 1,
    group_id: 2,
    status: 'active',
    starts_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-08-28T00:00:00Z',
    daily_usage_usd: 10,
    weekly_usage_usd: 32,
    monthly_usage_usd: 74,
    daily_window_start: '2026-08-01T00:00:00Z',
    weekly_window_start: '2026-07-28T00:00:00Z',
    monthly_window_start: '2026-08-01T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    group: {
      id: 2,
      name: 'Claude 专业版',
      description: '适合日常开发与长任务',
      platform: 'anthropic',
      rate_multiplier: 1,
      daily_limit_usd: 10,
      weekly_limit_usd: 50,
      monthly_limit_usd: 100,
    },
    ...overrides,
  }
}

const subscriptions: UserSubscription[] = [
  subscription(),
  subscription({
    id: 12,
    group_id: 3,
    status: 'expired',
    expires_at: '2026-06-30T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
    daily_usage_usd: 0,
    weekly_usage_usd: 0,
    monthly_usage_usd: 0,
    group: { id: 3, name: 'OpenAI 体验版', platform: 'openai', rate_multiplier: 1 },
  }),
  subscription({
    id: 13,
    group_id: 4,
    expires_at: null,
    updated_at: '2026-08-02T00:00:00Z',
    daily_usage_usd: 0,
    weekly_usage_usd: 0,
    monthly_usage_usd: 0,
    group: { id: 4, name: 'Gemini 无限版', platform: 'gemini', rate_multiplier: 0.8 },
  }),
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const wrappers: Array<{ unmount: () => void }> = []

function mountView() {
  const wrapper = mount(MobileSubscriptionsView)
  wrappers.push(wrapper)
  return wrapper
}

describe('MobileSubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    mocks.getSubscriptions.mockResolvedValue(subscriptions)
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps the mobile page shell stable while the initial request is pending', () => {
    mocks.getSubscriptions.mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()

    expect(wrapper.get('h1').text()).toBe('我的订阅')
    expect(wrapper.find('.mobile-page-scroll').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-page-loading"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="subscriptions-refresh"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
  })

  it('renders totals, lifecycle order, all finite windows, unlimited state, and expiry', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getSubscriptions).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="subscriptions-active-total"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="subscriptions-exhausted-total"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="subscriptions-all-total"]').text()).toContain('3')

    const cards = wrapper.findAll('[data-testid="subscription-card"]')
    expect(cards.map((card) => card.get('h2').text())).toEqual([
      'Gemini 无限版',
      'Claude 专业版',
      'OpenAI 体验版',
    ])

    const limited = cards[1]
    expect(limited.text()).toContain('额度已用满')
    expect(limited.text()).toContain('使用中')
    expect(limited.text()).toContain('2026年8月28日')
    expect(limited.get('[data-testid="subscription-quota-daily"]').text()).toContain('$10.00 / $10.00')
    expect(limited.get('[data-testid="subscription-quota-weekly"]').text()).toContain('$32.00 / $50.00')
    expect(limited.get('[data-testid="subscription-quota-monthly"]').text()).toContain('$74.00 / $100.00')
    expect(limited.findAll('[data-testid="subscription-progress"]')).toHaveLength(3)
    expect(limited.get('[data-testid="subscription-quota-daily"] [data-testid="subscription-progress-bar"]').attributes('style')).toContain('width: 100%')

    expect(cards[0].get('[data-testid="subscription-unlimited"]').text()).toContain('无周期额度上限')
    expect(cards[0].text()).toContain('长期有效')
    expect(cards[2].text()).toContain('已过期')
  })

  it('refreshes in place with a busy accessible action and retains current cards', async () => {
    const wrapper = mountView()
    await flushPromises()

    const refresh = deferred<UserSubscription[]>()
    mocks.getSubscriptions.mockReturnValueOnce(refresh.promise)
    await wrapper.get('[data-testid="subscriptions-refresh"]').trigger('click')

    expect(wrapper.get('[data-testid="subscriptions-refresh"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="subscriptions-refresh"]').attributes('aria-label')).toBe('正在刷新订阅')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Gemini 无限版')

    refresh.resolve([subscription({ group: { id: 2, name: '刷新后的订阅', platform: 'anthropic' } })])
    await flushPromises()

    expect(wrapper.get('[data-testid="subscriptions-refresh"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="subscriptions-refresh"]').attributes('aria-label')).toBe('刷新订阅')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
    expect(wrapper.text()).toContain('刷新后的订阅')
  })

  it('retains current cards and hides raw error details when a refresh fails', async () => {
    const wrapper = mountView()
    await flushPromises()

    mocks.getSubscriptions.mockRejectedValueOnce(new Error('credential-name-must-stay-private'))
    await wrapper.get('[data-testid="subscriptions-refresh"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="subscription-card"]')).toHaveLength(3)
    const error = wrapper.get('[data-testid="subscriptions-inline-error"]')
    expect(error.text()).toContain('刷新失败')
    expect(error.text()).not.toContain('credential-name')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('shows a private initial error and recovers through the shared retry action', async () => {
    mocks.getSubscriptions.mockRejectedValueOnce(new Error('Bearer sk-secret must not render'))
    const wrapper = mountView()
    await flushPromises()

    const error = wrapper.get('[data-testid="mobile-page-error"]')
    expect(error.text()).toContain('订阅信息暂时无法获取')
    expect(error.text()).not.toContain('sk-secret')

    mocks.getSubscriptions.mockResolvedValueOnce(subscriptions)
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="subscription-card"]')).toHaveLength(3)
  })

  it('renders an actionable empty state without linking to the excluded redeem route', async () => {
    mocks.getSubscriptions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

    const empty = wrapper.get('[data-testid="mobile-page-empty"]')
    expect(empty.text()).toContain('暂无订阅')
    expect(empty.text()).toContain('刷新')
    expect(empty.findAll('a')).toHaveLength(0)
    expect(wrapper.html()).not.toContain('#/redeem')
  })

  it('keeps the newer result when an older request finishes last', async () => {
    const first = deferred<UserSubscription[]>()
    mocks.getSubscriptions.mockReturnValueOnce(first.promise)
    const wrapper = mountView()

    mocks.getSubscriptions.mockResolvedValueOnce([
      subscription({ id: 30, group: { id: 30, name: '最新订阅', platform: 'openai' } }),
    ])
    const setupState = (wrapper.vm.$ as unknown as {
      setupState: { load: () => Promise<void> }
    }).setupState
    await setupState.load()
    await flushPromises()
    expect(wrapper.text()).toContain('最新订阅')

    first.resolve([subscription({ id: 31, group: { id: 31, name: '过期响应', platform: 'gemini' } })])
    await flushPromises()

    expect(wrapper.text()).toContain('最新订阅')
    expect(wrapper.text()).not.toContain('过期响应')
  })

  it('does not write request results after the view unmounts', async () => {
    const pending = deferred<UserSubscription[]>()
    mocks.getSubscriptions.mockReturnValueOnce(pending.promise)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountView()
    const setupState = (wrapper.vm.$ as unknown as {
      setupState: { subscriptions: UserSubscription[] }
    }).setupState

    wrapper.unmount()
    pending.resolve(subscriptions)
    await flushPromises()

    expect(setupState.subscriptions).toEqual([])
    expect(warning).not.toHaveBeenCalled()
  })
})
