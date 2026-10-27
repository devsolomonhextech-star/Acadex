import { apiRequest } from '../../shared/api/client'
import type { Task, TaskCreate } from '../../shared/api/types'

export function fetchTasks(token: string, params?: {
  status?: 'open' | 'in_progress' | 'completed' | 'cancelled'
  assigned_to?: string
  search?: string
  page?: number
  page_size?: number
}) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status_filter', params.status)
  if (params?.assigned_to) query.set('assigned_to', params.assigned_to)
  if (params?.search) query.set('search', params.search)
  if (params?.page) query.set('page', String(params.page))
  if (params?.page_size) query.set('page_size', String(params.page_size))
  return apiRequest<Task[]>(`/tasks?${query.toString()}`, {}, token)
}

export function createTask(token: string, payload: TaskCreate) {
  return apiRequest<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token)
}

export function getTask(token: string, taskId: string) {
  return apiRequest<Task>(`/tasks/${encodeURIComponent(taskId)}`, {}, token)
}

export function updateTaskStatus(token: string, taskId: string, status: Task['status']) {
  return apiRequest<Task>(`/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  }, token)
}

export function deleteTask(token: string, taskId: string) {
  return apiRequest<void>(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }, token)
}
