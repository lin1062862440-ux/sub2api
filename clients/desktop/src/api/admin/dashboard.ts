import { http } from '@/lib/http'

import type {
  AdminDashboardRealtime,
  AdminDashboardSnapshot,
  AdminDashboardSnapshotParams,
} from './types'

export function getAdminDashboardSnapshot(params: AdminDashboardSnapshotParams = {}) {
  return http.get<AdminDashboardSnapshot>('/admin/dashboard/snapshot-v2', {
    query: {
      ...params,
      include_stats: true,
      include_trend: true,
      include_model_stats: true,
      include_group_stats: true,
    },
  })
}

export function getAdminDashboardRealtime() {
  return http.get<AdminDashboardRealtime>('/admin/dashboard/realtime')
}
