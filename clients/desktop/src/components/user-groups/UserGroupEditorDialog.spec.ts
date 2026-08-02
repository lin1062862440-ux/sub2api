import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UserGroupEditorDialog from './UserGroupEditorDialog.vue'

function mountDialog() {
  return mount(UserGroupEditorDialog, {
    props: { modelValue: true },
    global: { stubs: { Teleport: true } },
  })
}

describe('UserGroupEditorDialog', () => {
  it('trims and emits the organizational fields', async () => {
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="user-group-name"]').setValue('  研发团队  ')
    await wrapper.get('[data-testid="user-group-description"]').setValue('  核心研发成员  ')
    await wrapper.get('[data-testid="user-group-editor-form"]').trigger('submit')

    expect(wrapper.emitted('save')?.[0]).toEqual([{ name: '研发团队', description: '核心研发成员' }])
  })

  it('closes from the backdrop and Escape unless saving', async () => {
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="user-group-editor"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])

    await document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)

    await wrapper.setProps({ saving: true })
    await document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
  })
})
