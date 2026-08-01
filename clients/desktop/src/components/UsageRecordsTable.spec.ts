import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UsageRecordsTable from './UsageRecordsTable.vue'

const row = {
  id: 1, api_key_id: 2, model: 'claude-sonnet-4', inbound_endpoint: '/v1/messages',
  input_tokens: 1200, output_tokens: 300, cache_creation_tokens: 50, cache_read_tokens: 450,
  actual_cost: 0.0812, request_type: 'stream' as const, stream: true,
  duration_ms: 1240, first_token_ms: 186, billing_type: 0,
  created_at: '2026-08-01T08:30:00Z', api_key: { name: 'production-key' },
}

describe('UsageRecordsTable', () => {
  it('renders the user-facing request fields', () => {
    const wrapper = mount(UsageRecordsTable, { props: { rows: [row], loading: false } })
    const text = wrapper.text()
    expect(text).toContain('production-key')
    expect(text).toContain('claude-sonnet-4')
    expect(text).toContain('/v1/messages')
    expect(text).toContain('流式')
    expect(text).toContain('2,000')
    expect(text).toContain('$0.08')
    expect(text).toContain('186ms')
    expect(text).toContain('1.24s')
  })

  it('hides cost in simple mode and renders the filtered empty state', () => {
    const simple = mount(UsageRecordsTable, { props: { rows: [row], loading: false, simpleMode: true } })
    expect(simple.text()).not.toContain('$0.08')
    const empty = mount(UsageRecordsTable, { props: { rows: [], loading: false, filtered: true } })
    expect(empty.text()).toContain('没有匹配当前筛选的记录')
  })
})
