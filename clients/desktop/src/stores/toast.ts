import { reactive, readonly } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface ToastOptions {
  detail?: string
  action?: ToastAction
  duration?: number
}

export interface ToastItem extends ToastOptions {
  id: number
  type: ToastType
  title: string
  count: number
  paused: boolean
}

interface ToastRuntime {
  createdAt: number
  duration: number
  remaining: number
  startedAt: number
  timer: number | null
}

const MAX_VISIBLE_TOASTS = 3
const DEDUPE_WINDOW_MS = 1_000
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4_000,
  info: 4_000,
  warning: 7_000,
  error: 7_000,
}

const state = reactive({ items: [] as ToastItem[] })
const runtimes = new Map<number, ToastRuntime>()
let nextId = 1

export const toastState = readonly(state) as Readonly<{ items: readonly ToastItem[] }>

function clearRuntime(id: number) {
  const runtime = runtimes.get(id)
  if (runtime?.timer !== null && runtime?.timer !== undefined) window.clearTimeout(runtime.timer)
  runtimes.delete(id)
}

export function dismissToast(id: number) {
  const index = state.items.findIndex((item) => item.id === id)
  if (index >= 0) state.items.splice(index, 1)
  clearRuntime(id)
}

function scheduleDismissal(id: number) {
  const runtime = runtimes.get(id)
  const item = state.items.find((candidate) => candidate.id === id)
  if (!runtime || !item) return
  if (runtime.timer !== null) window.clearTimeout(runtime.timer)
  item.paused = false
  if (runtime.remaining <= 0) {
    dismissToast(id)
    return
  }
  runtime.startedAt = Date.now()
  runtime.timer = window.setTimeout(() => dismissToast(id), runtime.remaining)
}

function resetRuntime(id: number, duration: number) {
  const runtime = runtimes.get(id)
  if (!runtime) return
  if (runtime.timer !== null) window.clearTimeout(runtime.timer)
  runtime.createdAt = Date.now()
  runtime.duration = duration
  runtime.remaining = duration
  runtime.timer = null
  scheduleDismissal(id)
}

function showToast(type: ToastType, title: string, options: ToastOptions = {}): number {
  const now = Date.now()
  const detail = options.detail ?? ''
  const duplicate = state.items.find((item) => {
    const runtime = runtimes.get(item.id)
    return item.type === type
      && item.title === title
      && (item.detail ?? '') === detail
      && runtime !== undefined
      && now - runtime.createdAt <= DEDUPE_WINDOW_MS
  })
  const duration = options.duration ?? DEFAULT_DURATION[type]

  if (duplicate) {
    duplicate.count += 1
    duplicate.action = options.action
    const index = state.items.findIndex((item) => item.id === duplicate.id)
    if (index > 0) state.items.unshift(...state.items.splice(index, 1))
    resetRuntime(duplicate.id, duration)
    return duplicate.id
  }

  const id = nextId++
  state.items.unshift({
    id,
    type,
    title,
    detail: options.detail,
    action: options.action,
    duration,
    count: 1,
    paused: false,
  })
  runtimes.set(id, {
    createdAt: now,
    duration,
    remaining: duration,
    startedAt: now,
    timer: null,
  })
  scheduleDismissal(id)

  while (state.items.length > MAX_VISIBLE_TOASTS) {
    dismissToast(state.items[state.items.length - 1].id)
  }
  return id
}

export const toast = {
  success: (title: string, options?: ToastOptions) => showToast('success', title, options),
  error: (title: string, options?: ToastOptions) => showToast('error', title, options),
  warning: (title: string, options?: ToastOptions) => showToast('warning', title, options),
  info: (title: string, options?: ToastOptions) => showToast('info', title, options),
}

export function pauseToast(id: number) {
  const runtime = runtimes.get(id)
  const item = state.items.find((candidate) => candidate.id === id)
  if (!runtime || !item || item.paused) return
  if (runtime.timer !== null) {
    window.clearTimeout(runtime.timer)
    runtime.timer = null
    runtime.remaining = Math.max(0, runtime.remaining - (Date.now() - runtime.startedAt))
  }
  item.paused = true
}

export function resumeToast(id: number) {
  const item = state.items.find((candidate) => candidate.id === id)
  if (!item?.paused) return
  scheduleDismissal(id)
}

export async function invokeToastAction(id: number) {
  const action = state.items.find((item) => item.id === id)?.action
  if (!action) return
  dismissToast(id)
  await action.run()
}

export function clearToasts() {
  for (const item of [...state.items]) dismissToast(item.id)
}
