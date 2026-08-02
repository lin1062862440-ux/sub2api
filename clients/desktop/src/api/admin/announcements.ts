import{http}from'@/lib/http';import type{PaginatedResponse}from'@/api/types';import type{AdminAnnouncement,AdminAnnouncementInput,AdminAnnouncementReadStatus}from'./types'
export function listAdminAnnouncements(params:{page?:number;page_size?:number;status?:string;search?:string}={}){return http.get<PaginatedResponse<AdminAnnouncement>>('/admin/announcements',{query:params})}
export function createAdminAnnouncement(payload:AdminAnnouncementInput){return http.post<AdminAnnouncement>('/admin/announcements',payload)}
export function updateAdminAnnouncement(id:number,payload:Partial<AdminAnnouncementInput>){return http.put<AdminAnnouncement>(`/admin/announcements/${id}`,payload)}
export function deleteAdminAnnouncement(id:number){return http.delete<{message:string}>(`/admin/announcements/${id}`)}
export function getAdminAnnouncementReadStatus(id:number,params:{page?:number;page_size?:number;search?:string}={}){return http.get<PaginatedResponse<AdminAnnouncementReadStatus>>(`/admin/announcements/${id}/read-status`,{query:params})}
