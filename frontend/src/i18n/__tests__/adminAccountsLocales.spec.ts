import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'

describe('admin accounts locale keys', () => {
  it('contains Spark shadow action copy in zh and en', () => {
    expect(zh.admin.accounts.createSparkShadow).toBeTruthy()
    expect(zh.admin.accounts.createSparkShadowConfirm).toContain('{name}')
    expect(zh.admin.accounts.createSparkShadowSuccess).toBeTruthy()
    expect(zh.admin.accounts.createSparkShadowFailed).toBeTruthy()

    expect(en.admin.accounts.createSparkShadow).toBeTruthy()
    expect(en.admin.accounts.createSparkShadowConfirm).toContain('{name}')
    expect(en.admin.accounts.createSparkShadowSuccess).toBeTruthy()
    expect(en.admin.accounts.createSparkShadowFailed).toBeTruthy()
  })
})
