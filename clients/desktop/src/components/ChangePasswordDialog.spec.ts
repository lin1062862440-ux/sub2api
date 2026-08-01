import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
}))

vi.mock('@/api', () => ({
  changePassword: mocks.changePassword,
}))

import ChangePasswordDialog from './ChangePasswordDialog.vue'

function mountDialog() {
  return mount(ChangePasswordDialog, {
    props: { modelValue: true },
    global: { stubs: { Teleport: true } },
  })
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.changePassword.mockResolvedValue({ message: 'ok' })
  })

  it('changes the password without leaving the current page', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="current-password"]').setValue('current-password')
    await wrapper.get('[data-testid="new-password"]').setValue('new-password-123')
    await wrapper.get('[data-testid="confirm-password"]').setValue('new-password-123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.changePassword).toHaveBeenCalledWith({
      old_password: 'current-password',
      new_password: 'new-password-123',
    })
    expect(wrapper.text()).toContain('密码修改成功')
  })

  it('does not submit when the confirmation does not match', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="current-password"]').setValue('current-password')
    await wrapper.get('[data-testid="new-password"]').setValue('new-password-123')
    await wrapper.get('[data-testid="confirm-password"]').setValue('different-password')
    await wrapper.get('form').trigger('submit')

    expect(mocks.changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的新密码不一致')
  })

  it('closes without submitting', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="close-password-dialog"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })
})
