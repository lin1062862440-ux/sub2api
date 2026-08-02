import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  textExport: true,
  list: vi.fn(),
  stats: vi.fn(),
  generate: vi.fn(),
  batchUpdate: vi.fn(),
  batchDelete: vi.fn(),
  expire: vi.fn(),
  remove: vi.fn(),
  exportCodes: vi.fn(),
  saveText: vi.fn(),
  groups: vi.fn(),
}))

vi.mock('@/api/admin/redeem', () => ({
  listAdminRedeemCodes: mocks.list,
  getAdminRedeemStats: mocks.stats,
  generateAdminRedeemCodes: mocks.generate,
  batchUpdateAdminRedeemCodes: mocks.batchUpdate,
  batchDeleteAdminRedeemCodes: mocks.batchDelete,
  expireAdminRedeemCode: mocks.expire,
  deleteAdminRedeemCode: mocks.remove,
  exportAdminRedeemCodes: mocks.exportCodes,
}))
vi.mock('@/api/admin/users', () => ({ getAdminGroups: mocks.groups }))
vi.mock('@/lib/export-file', () => ({ saveTextExport: mocks.saveText }))
vi.mock('@/lib/platform-capabilities', () => ({
  appCapabilities: {
    get textExport() { return mocks.textExport },
  },
}))

import View from './AdminRedeemCodesView.vue'

const code = {
  id: 1,
  code: 'LINAI-TEST',
  type: 'balance',
  value: 20,
  status: 'active',
  used_by: null,
  used_at: null,
  created_at: '2026-08-02T00:00:00Z',
}

describe('AdminRedeemCodesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.textExport = true
    window.confirm = vi.fn(() => true)
    mocks.list.mockResolvedValue({ items: [code], total: 1, page: 1, page_size: 20 })
    mocks.stats.mockResolvedValue({
      total_codes: 10,
      active_codes: 6,
      used_codes: 3,
      expired_codes: 1,
      total_value_distributed: 60,
      by_type: { balance: 8, concurrency: 1, subscription: 1, invitation: 0 },
    })
    mocks.groups.mockResolvedValue([{ id: 2, name: 'Claude Code' }])
    mocks.generate.mockResolvedValue([code])
    mocks.batchUpdate.mockResolvedValue({ updated: 1, message: 'ok' })
    mocks.batchDelete.mockResolvedValue({ deleted: 1, message: 'ok' })
    mocks.expire.mockResolvedValue({ ...code, status: 'expired' })
    mocks.remove.mockResolvedValue({ message: 'ok' })
    mocks.exportCodes.mockResolvedValue('id,code\n1,LINAI-TEST\n')
    mocks.saveText.mockResolvedValue('/Users/lin/Downloads/linai-redeem-codes.csv')
  })

  it('renders code statistics and list', async () => {
    const wrapper = mount(View)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('兑换码')
    expect(wrapper.get('[data-testid="redeem-total"]').text()).toContain('10')
    expect(wrapper.text()).toContain('LINAI-TEST')
  })

  it('generates a batch with explicit type and expiry', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="generate-redeem"]').trigger('click')
    await wrapper.get('[data-testid="redeem-count"]').setValue('5')
    await wrapper.get('[data-testid="redeem-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      count: 5,
      type: 'balance',
      expires_in_days: 30,
    }))
  })

  it('exports the current filters and saves the CSV through the native host', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="export-redeem"]').trigger('click')
    await flushPromises()

    expect(mocks.exportCodes).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }))
    expect(mocks.saveText).toHaveBeenCalledWith(
      'id,code\n1,LINAI-TEST\n',
      expect.stringMatching(/^linai-redeem-codes-\d{8}-\d{6}\.csv$/),
    )
    expect(wrapper.text()).toContain('已导出到')
  })

  it('requires confirmation before deleting the selected codes', async () => {
    const confirmation = vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="select-redeem-1"]').trigger('click')

    await wrapper.get('[data-testid="delete-selected-redeem"]').trigger('click')
    expect(mocks.batchDelete).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="delete-selected-redeem"]').trigger('click')
    await flushPromises()

    expect(confirmation).toHaveBeenCalledTimes(2)
    expect(mocks.batchDelete).toHaveBeenCalledWith([1])
  })

  it('requires confirmation before expiring a redeem code', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="expire-redeem-1"]').trigger('click')
    expect(mocks.expire).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="expire-redeem-1"]').trigger('click')
    await flushPromises()
    expect(mocks.expire).toHaveBeenCalledWith(1)
  })

  it('preserves loading, empty, and retryable error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(View)

    expect(wrapper.find('.loading').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('兑换码加载失败')
    expect(wrapper.text()).toContain('offline')

    await wrapper.get('.empty button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)

    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('.toolbar').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('没有符合条件的兑换码')
  })

  it('keeps generation but omits native export on Android', async () => {
    mocks.textExport = false
    const wrapper = mount(View)
    await flushPromises()

    expect(wrapper.find('[data-testid="export-redeem"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="generate-redeem"]').exists()).toBe(true)
  })
})
