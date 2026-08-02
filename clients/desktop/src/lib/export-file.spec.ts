import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

import { saveTextExport } from './export-file'

describe('native text export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the desktop host to save text into the downloads directory', async () => {
    mocks.invoke.mockResolvedValue('/Users/lin/Downloads/linai-redeem-codes.csv')

    await expect(saveTextExport('id,code\n', 'linai-redeem-codes.csv')).resolves.toBe(
      '/Users/lin/Downloads/linai-redeem-codes.csv',
    )

    expect(mocks.invoke).toHaveBeenCalledWith('save_text_export', {
      content: 'id,code\n',
      suggestedName: 'linai-redeem-codes.csv',
    })
  })
})
