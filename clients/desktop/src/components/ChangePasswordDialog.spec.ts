import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  changePassword: mocks.changePassword,
}))

vi.mock('@/stores/toast', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

import ChangePasswordDialog from './ChangePasswordDialog.vue'

function mountDialog(toastFeedback = true) {
  return mount(ChangePasswordDialog, {
    props: { modelValue: true, toastFeedback },
    global: { stubs: { Teleport: true } },
  })
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.changePassword.mockResolvedValue({ message: 'ok' })
  })

  it('closes the dialog and reports a successful password change through Toast', async () => {
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
    expect(mocks.toastSuccess).toHaveBeenCalledWith('密码已修改', {
      detail: '下次登录时请使用新密码。',
    })
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.text()).not.toContain('密码修改成功')
  })

  it('keeps the dialog open and reports a request failure through Toast', async () => {
    mocks.changePassword.mockRejectedValue(new Error('当前密码不正确'))
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="current-password"]').setValue('current-password')
    await wrapper.get('[data-testid="new-password"]').setValue('new-password-123')
    await wrapper.get('[data-testid="confirm-password"]').setValue('new-password-123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('密码修改失败', {
      detail: '当前密码不正确',
    })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('preserves inline completion and request errors when Toast feedback is not enabled', async () => {
    const success = mountDialog(false)

    await success.get('[data-testid="current-password"]').setValue('current-password')
    await success.get('[data-testid="new-password"]').setValue('new-password-123')
    await success.get('[data-testid="confirm-password"]').setValue('new-password-123')
    await success.get('form').trigger('submit')
    await flushPromises()

    expect(success.text()).toContain('密码修改成功')
    expect(success.emitted('update:modelValue')).toBeUndefined()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    mocks.changePassword.mockRejectedValueOnce(new Error('当前密码不正确'))
    const failure = mountDialog(false)
    await failure.get('[data-testid="current-password"]').setValue('current-password')
    await failure.get('[data-testid="new-password"]').setValue('new-password-123')
    await failure.get('[data-testid="confirm-password"]').setValue('new-password-123')
    await failure.get('form').trigger('submit')
    await flushPromises()

    expect(failure.get('[role="alert"]').text()).toBe('当前密码不正确')
    expect(mocks.toastError).not.toHaveBeenCalled()
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
