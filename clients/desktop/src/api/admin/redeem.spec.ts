import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getText: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/http', () => ({
  http: {
    getText: mocks.getText,
    post: mocks.post,
  },
}))

import { batchDeleteAdminRedeemCodes, exportAdminRedeemCodes } from './redeem'

describe('admin redeem batch operations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes all selected redeem codes through the batch endpoint', async () => {
    mocks.post.mockResolvedValue({ deleted: 2, message: 'ok' })

    await batchDeleteAdminRedeemCodes([3, 7])

    expect(mocks.post).toHaveBeenCalledWith('/admin/redeem-codes/batch-delete', { ids: [3, 7] })
  })

  it('exports the current filters as raw CSV text', async () => {
    mocks.getText.mockResolvedValue('id,code\n')

    await exportAdminRedeemCodes({
      type: 'subscription',
      status: 'unused',
      search: 'LINAI',
    })

    expect(mocks.getText).toHaveBeenCalledWith('/admin/redeem-codes/export', {
      query: {
        type: 'subscription',
        status: 'unused',
        search: 'LINAI',
      },
    })
  })
})
