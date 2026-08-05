import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import TeamQuotaSettingsDialog from '../TeamQuotaSettingsDialog.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
}))

const overview = {
  group_id: 5,
  policy: {
    enabled: true,
    weekly_limit_usd: 800,
    weekly_usage_usd: 250,
    weekly_reset_at: '2026-08-09T16:00:00Z',
  },
  managers: [],
  members: [],
  allocated_usd: 0,
  can_manage: true,
  can_configure: true,
  team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
  ],
  available_team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
    { billing_group_id: 32, name: 'Claude Team', platform: 'anthropic', status: 'active' },
  ],
}

function mountDialog() {
  return mount(TeamQuotaSettingsDialog, {
    props: { show: true, overview },
    global: {
      stubs: {
        BaseDialog: {
          props: ['show', 'title'],
          emits: ['close'],
          template: '<section v-if="show"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>',
        },
        Icon: true,
      },
    },
  })
}

describe('TeamQuotaSettingsDialog', () => {
  it('hydrates and submits the team quota policy', async () => {
    const wrapper = mountDialog()

    expect(wrapper.get('[data-test="quota-policy-limit"]').element).toHaveProperty('value', '800')
    expect(wrapper.get('[data-test="team-group-openai"]').element).toHaveProperty('value', '31')

    await wrapper.get('[data-test="quota-policy-limit"]').setValue('900')
    await wrapper.get('[data-test="team-group-anthropic"]').setValue('32')
    await wrapper.get('[data-test="save-quota-policy"]').trigger('click')

    expect(wrapper.emitted('save')?.[0]).toEqual([{ enabled: true, weeklyLimit: 900, teamSubscriptionIds: [31, 32] }])
  })

  it('keeps reset and manager controls in the system configuration surface', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-test="manage-quota-managers"]').trigger('click')
    await wrapper.get('[data-test="reset-team-quota"]').trigger('click')

    expect(wrapper.emitted('manage')).toHaveLength(1)
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('blocks an enabled policy without a positive limit and source', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-test="quota-policy-limit"]').setValue('0')
    await wrapper.get('[data-test="team-group-openai"]').setValue('')

    expect(wrapper.get('[data-test="quota-policy-validation"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="save-quota-policy"]').attributes('disabled')).toBeDefined()
  })
})
