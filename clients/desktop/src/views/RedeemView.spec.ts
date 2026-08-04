import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redeemCode: vi.fn(),
  getRedeemHistory: vi.fn(),
  refreshUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  session: {
    user: { balance: 18.2, concurrency: 5 },
  },
}))

vi.mock('@/api', () => ({
  redeemCode: mocks.redeemCode,
  getRedeemHistory: mocks.getRedeemHistory,
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  refreshUser: mocks.refreshUser,
}))
vi.mock('@/stores/toast', () => ({ toast: {
  success: mocks.toastSuccess,
  error: mocks.toastError,
} }))

import RedeemView from './RedeemView.vue'
import redeemViewSource from './RedeemView.vue?raw'

const history = [
  {
    id: 1,
    code: 'LINAI-2026-PRO',
    type: 'subscription',
    value: 30,
    status: 'used',
    used_at: '2026-08-01T04:00:00Z',
    created_at: '2026-07-31T04:00:00Z',
    validity_days: 30,
    group: { id: 2, name: 'Claude 专业版' },
  },
]

describe('RedeemView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRedeemHistory.mockResolvedValue(history)
    mocks.refreshUser.mockResolvedValue(undefined)
    mocks.redeemCode.mockResolvedValue({
      message: '兑换成功',
      type: 'balance',
      value: 20,
      new_balance: 38.2,
    })
  })

  it('redeems a trimmed code and refreshes account data and history', async () => {
    const wrapper = mount(RedeemView)
    await flushPromises()

    expect(wrapper.text()).toContain('$18.20')
    expect(wrapper.text()).toContain('Claude 专业版')

    await wrapper.get('[data-testid="redeem-input"]').setValue('  LINAI-TEST-20  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.redeemCode).toHaveBeenCalledWith('LINAI-TEST-20')
    expect(mocks.refreshUser).toHaveBeenCalledOnce()
    expect(mocks.getRedeemHistory).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="redeem-result"]').text()).toContain('+$20.00')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('兑换成功', { detail: '余额到账 · +$20.00' })
    expect((wrapper.get('[data-testid="redeem-input"]').element as HTMLInputElement).value).toBe('')
  })

  it('keeps the code and shows an actionable toast when redemption fails', async () => {
    mocks.redeemCode.mockRejectedValue(new Error('兑换码无效或已使用'))
    const wrapper = mount(RedeemView)
    await flushPromises()

    await wrapper.get('[data-testid="redeem-input"]').setValue('BAD-CODE')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('兑换失败', { detail: '兑换码无效或已使用' })
    expect(wrapper.find('[data-testid="redeem-error"]').exists()).toBe(false)
    expect((wrapper.get('[data-testid="redeem-input"]').element as HTMLInputElement).value).toBe('BAD-CODE')
    expect(mocks.refreshUser).not.toHaveBeenCalled()
  })

  it('clips horizontal overflow while history rows animate in', async () => {
    expect(redeemViewSource).toMatch(/\.history-list\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*\}/s)
  })
})
