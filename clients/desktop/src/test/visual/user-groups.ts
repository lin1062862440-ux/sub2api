import { previewRouteFlag } from './preview-query'

const now = '2026-08-02T08:00:00Z'
const visualQuery = new URLSearchParams(window.location.search)

function previewFlag(name: 'empty' | 'error') {
  return previewRouteFlag(visualQuery, name, 'user-groups')
}

let groups = [
  { id: 1, name: '跨区域模型推理与超长上下文联合调度', description: '核心研发成员、跨区域模型推理与超长上下文联合调度项目用量统一查看', status: 'active' as const, member_count: 4, viewer_count: 2, created_at: '2026-07-01T00:00:00Z', updated_at: now },
  { id: 2, name: '运营团队', description: '运营、客服与内容协作成员', status: 'active' as const, member_count: 3, viewer_count: 1, created_at: '2026-07-05T00:00:00Z', updated_at: '2026-07-30T08:00:00Z' },
  { id: 3, name: '重点客户', description: '客户成功团队的服务对象与额度跟踪', status: 'active' as const, member_count: 2, viewer_count: 3, created_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-28T08:00:00Z' },
]

const members = [
  { user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 32.5, joined_at: '2026-07-01T00:00:00Z' },
  { user_id: 8, username: 'Nova', email: 'nova@example.com', status: 'active', balance: 18.2, joined_at: '2026-07-03T00:00:00Z' },
  { user_id: 9, username: 'Chen', email: 'chen@example.com', status: 'active', balance: 64, joined_at: '2026-07-08T00:00:00Z' },
]

export async function getUserGroupCapabilities() { return { can_access: true, can_manage: true, group_count: groups.length } }
export async function listUserGroups() {
  if (previewFlag('error')) throw new Error('visual preview user-groups error')
  return previewFlag('empty') ? [] : groups
}
export async function createUserGroup(payload: { name: string; description: string }) { const group = { id: Date.now(), ...payload, status: 'active' as const, member_count: 0, viewer_count: 0, created_at: now, updated_at: now }; groups = [group, ...groups]; return group }
export async function updateUserGroup(id: number, payload: { name: string; description: string }) { const group = { ...groups.find((item) => item.id === id)!, ...payload, updated_at: now }; groups = groups.map((item) => item.id === id ? group : item); return group }
export async function archiveUserGroup(id: number) { groups = groups.filter((item) => item.id !== id) }
export async function getUserGroupMembers() { return members }
export async function replaceUserGroupMembers() {}
export async function getUserGroupViewers() { return [{ user_id: 10, username: 'Viewer', email: 'viewer@example.com', status: 'active', granted_at: now }] }
export async function replaceUserGroupViewers() {}
export async function getUserGroupSubscriptions(_id: number, params: { status?: string; page?: number; page_size?: number } = {}) {
  const rows = members.map((member, index) => ({ member, subscription_id: index === 2 ? null : index + 1, billing_group_id: index === 2 ? null : 1, billing_group: index === 2 ? '' : 'Claude Pro', platform: index === 2 ? '' : 'anthropic', status: index === 2 ? 'none' : 'active', starts_at: '2026-08-01T00:00:00Z', expires_at: index === 2 ? null : '2026-09-01T00:00:00Z', daily_used: 4 + index, daily_limit: index === 2 ? null : 10, weekly_used: 12 + index * 3, weekly_limit: index === 2 ? null : 50, monthly_used: 20 + index * 5, monthly_limit: index === 2 ? null : 100 }))
  const filtered = params.status ? rows.filter((item) => item.status === params.status) : rows
  return { summary: { member_count: members.length, active_subscription_count: 2, no_subscription_count: 1, total_balance: 114.7, active_subscription_usage: 74 }, items: filtered, total: filtered.length, page: 1, page_size: 20, pages: 1 }
}
export async function getUserGroupUsage() {
  return {
    summary: { total_requests: 18240, total_input_tokens: 5200000, total_output_tokens: 1400000, total_cache_tokens: 800000, total_tokens: 7400000, total_actual_cost: 128.6, balance_consumption: 42.2, subscription_consumption: 86.4 },
    by_user: members.map((member, index) => ({ user_id: member.user_id, email: member.email, username: member.username, total_requests: 8200 - index * 1800, total_tokens: 3200000 - index * 700000, total_actual_cost: 58 - index * 14, balance_consumption: 18 - index * 5, subscription_consumption: 40 - index * 9 })),
    items: members.map((member, index) => ({ id: index + 1, user_id: member.user_id, email: member.email, username: member.username, request_id: `req-preview-${index + 1}`, model: index === 1 ? 'gpt-5' : 'claude-sonnet-4', input_tokens: 1200, output_tokens: 420, cache_creation_tokens: 100, cache_read_tokens: 300, total_tokens: 2020, actual_cost: 1.8 + index, billing_type: index === 2 ? 0 as const : 1 as const, created_at: now })),
    total: 3, page: 1, page_size: 20, pages: 1,
  }
}
