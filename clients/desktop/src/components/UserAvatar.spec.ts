import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('shows the real avatar and falls back to the H5 default avatar when it cannot load', async () => {
    const wrapper = mount(UserAvatar, {
      props: {
        name: 'Lin Ai',
        src: 'https://cdn.example.com/avatar.png',
      },
    })

    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe('https://cdn.example.com/avatar.png')
    expect(image.attributes('alt')).toBe('Lin Ai 的头像')

    await image.trigger('error')

    expect(wrapper.get('img').attributes('src')).toContain('default-avatar.svg')
  })

  it('uses the H5 default avatar when the user has no avatar', () => {
    const wrapper = mount(UserAvatar, { props: { name: 'Lin Ai', src: null } })

    expect(wrapper.get('img').attributes('src')).toContain('default-avatar.svg')
  })
})
