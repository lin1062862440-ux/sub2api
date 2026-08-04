import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TeamQuotaSettingsSheet from './TeamQuotaSettingsSheet.vue'

const overview = {
  group_id: 3,
  policy: {
    enabled: true,
    weekly_limit_usd: 100,
    weekly_usage_usd: 35,
    weekly_reset_at: '2026-08-10T00:00:00Z',
  },
  managers: [{ user_id: 8, username: 'Owner', email: 'owner@example.com', status: 'active', granted_at: '' }],
  members: [],
  allocated_usd: 60,
  can_manage: true,
  can_configure: true,
  team_subscription_groups: [
    { billing_group_id: 11, name: 'OpenAI Team', platform: 'openai', status: 'active' },
    { billing_group_id: 12, name: 'Claude Team', platform: 'anthropic', status: 'active' },
  ],
  available_team_subscription_groups: [
    { billing_group_id: 11, name: 'OpenAI Team', platform: 'openai', status: 'active' },
    { billing_group_id: 12, name: 'Claude Team', platform: 'anthropic', status: 'active' },
  ],
}

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(TeamQuotaSettingsSheet, {
    props: { modelValue: true, overview, ...props },
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
  })
}

describe('TeamQuotaSettingsSheet', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('stays absent while closed and hydrates policy and subscription drafts when opened', async () => {
    const wrapper = mountSheet({ modelValue: false })
    expect(wrapper.find('[data-testid="team-quota-settings"]').exists()).toBe(false)

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get('[data-testid="team-weekly-limit"]').element).toHaveProperty('value', '100')
    expect(wrapper.get('[data-testid="team-source-openai"]').element).toHaveProperty('value', '11')
    expect(wrapper.get('[data-testid="team-source-anthropic"]').element).toHaveProperty('value', '12')
  })

  it('validates enabled policies and emits one normalized save payload', async () => {
    const wrapper = mountSheet()
    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('0')
    expect(wrapper.get('[data-testid="team-quota-validation"]').text()).toContain('必须大于 0')
    expect(wrapper.get('[data-testid="save-team-policy"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('120')
    await wrapper.get('[data-testid="save-team-policy"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual([{
      enabled: true,
      weeklyLimit: 120,
      teamSubscriptionIds: [11, 12],
    }])
  })

  it('protects a dirty draft before opening quota manager controls', async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const wrapper = mountSheet({ error: '保存失败，请重试' })
    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('125')

    await wrapper.get('[data-testid="manage-quota-managers"]').trigger('click')
    expect(wrapper.emitted('manage')).toBeUndefined()

    await wrapper.get('[data-testid="manage-quota-managers"]').trigger('click')
    expect(wrapper.emitted('manage')).toHaveLength(1)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="team-weekly-limit"]').element).toHaveProperty('value', '125')
    expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
  })

  it('protects a dirty draft before the separate reset confirmation', async () => {
    const confirm = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const wrapper = mountSheet()
    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('125')

    await wrapper.get('[data-testid="reset-team-quota"]').trigger('click')
    expect(wrapper.emitted('reset')).toBeUndefined()

    await wrapper.get('[data-testid="reset-team-quota"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
    expect(confirm).toHaveBeenCalledTimes(3)
    expect(wrapper.get('[data-testid="team-weekly-limit"]').element).toHaveProperty('value', '125')
  })

  it('confirms dirty dismissal and marks the Android safe-area presentation', async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const wrapper = mountSheet({ mobile: true })
    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('125')

    expect(wrapper.get('[data-testid="team-quota-settings"]').classes()).toContain('team-quota-sheet--mobile')
    await wrapper.get('[data-testid="close-team-quota-settings"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('[data-testid="close-team-quota-settings"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
