import { apiClient } from './client'
import type {
  UserGroup,
  UserGroupCapabilities,
  UserGroupMember,
  UserGroupMutation,
  UserGroupPromptDetail,
  UserGroupQuotaOverview,
  UserGroupQuotaPolicyMutation,
  UserGroupMemberQuotaMutation,
  UserGroupSubscriptionParams,
  UserGroupSubscriptionResult,
  UserGroupUsageParams,
  UserGroupUsageResult,
  UserGroupViewer,
} from '@/types/userGroups'

export const userGroupAPI = {
  async getCapabilities(): Promise<UserGroupCapabilities> {
    const { data } = await apiClient.get<UserGroupCapabilities>('/user-groups/capabilities')
    return data
  },

  async list(): Promise<UserGroup[]> {
    const { data } = await apiClient.get<UserGroup[]>('/user-groups')
    return data
  },

  async create(payload: UserGroupMutation): Promise<UserGroup> {
    const { data } = await apiClient.post<UserGroup>('/user-groups', payload)
    return data
  },

  async update(groupId: number, payload: UserGroupMutation): Promise<UserGroup> {
    const { data } = await apiClient.put<UserGroup>(`/user-groups/${groupId}`, payload)
    return data
  },

  async archive(groupId: number): Promise<void> {
    await apiClient.delete(`/user-groups/${groupId}`)
  },

  async getMembers(groupId: number): Promise<UserGroupMember[]> {
    const { data } = await apiClient.get<UserGroupMember[]>(`/user-groups/${groupId}/members`)
    return data
  },

  async replaceMembers(groupId: number, userIds: number[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/members`, { user_ids: userIds })
  },

  async getViewers(groupId: number): Promise<UserGroupViewer[]> {
    const { data } = await apiClient.get<UserGroupViewer[]>(`/user-groups/${groupId}/viewers`)
    return data
  },

  async replaceViewers(groupId: number, userIds: number[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/viewers`, { user_ids: userIds })
  },

  async setPromptCapture(groupId: number, enabled: boolean): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/prompt-capture`, { enabled })
  },

  async getPromptViewers(groupId: number): Promise<UserGroupViewer[]> {
    const { data } = await apiClient.get<UserGroupViewer[]>(`/user-groups/${groupId}/prompt-viewers`)
    return data
  },

  async replacePromptViewers(groupId: number, userIds: number[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/prompt-viewers`, { user_ids: userIds })
  },

  async getSubscriptions(groupId: number, params: UserGroupSubscriptionParams = {}): Promise<UserGroupSubscriptionResult> {
    const { data } = await apiClient.get<UserGroupSubscriptionResult>(`/user-groups/${groupId}/subscriptions`, { params })
    return data
  },

  async getUsage(groupId: number, params: UserGroupUsageParams = {}): Promise<UserGroupUsageResult> {
    const { data } = await apiClient.get<UserGroupUsageResult>(`/user-groups/${groupId}/usage`, { params })
    return data
  },

  async getUsagePrompts(groupId: number, usageLogId: number): Promise<UserGroupPromptDetail[]> {
    const { data } = await apiClient.get<UserGroupPromptDetail[]>(`/user-groups/${groupId}/usage/${usageLogId}/prompts`)
    return data
  },

  async getQuotaOverview(groupId: number): Promise<UserGroupQuotaOverview> {
    const { data } = await apiClient.get<UserGroupQuotaOverview>(`/user-groups/${groupId}/quota`)
    return data
  },

  async setQuotaPolicy(groupId: number, payload: UserGroupQuotaPolicyMutation): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/quota-policy`, payload)
  },

  async replaceQuotaManagers(groupId: number, userIds: number[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/quota-managers`, { user_ids: userIds })
  },

  async updateMemberQuotas(groupId: number, members: UserGroupMemberQuotaMutation[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/member-quotas`, { members })
  },

  async replaceTeamSubscriptionGroups(groupId: number, billingGroupIds: number[]): Promise<void> {
    await apiClient.put(`/user-groups/${groupId}/team-subscription-groups`, { billing_group_ids: billingGroupIds })
  },

  async resetQuotaUsage(groupId: number): Promise<void> {
    await apiClient.post(`/user-groups/${groupId}/quota-reset`)
  },
}
