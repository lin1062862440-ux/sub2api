import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'

describe('admin groups locale keys', () => {
  it('contains rate label copy in zh and en', () => {
    expect(zh.admin.groups.rateLabel).toBe('倍率')
    expect(en.admin.groups.rateLabel).toBe('rate')
  })
})
