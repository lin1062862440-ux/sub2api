import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearToasts,
  dismissToast,
  invokeToastAction,
  pauseToast,
  resumeToast,
  toast,
  toastState,
} from './toast'

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T13:00:00Z'))
    clearToasts()
  })

  afterEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it('creates semantic notifications newest first and caps the visible stack', () => {
    toast.success('团队已创建')
    toast.info('成员列表已刷新')
    toast.warning('团队周配额即将用尽')
    toast.error('成员配额保存失败')

    expect(toastState.items.map(({ type, title }) => ({ type, title }))).toEqual([
      { type: 'error', title: '成员配额保存失败' },
      { type: 'warning', title: '团队周配额即将用尽' },
      { type: 'info', title: '成员列表已刷新' },
    ])
  })

  it('merges identical notifications raised within one second', () => {
    const originalId = toast.success('团队配额已保存', { detail: '新额度将在下一次请求时生效。' })
    vi.advanceTimersByTime(800)

    const duplicateId = toast.success('团队配额已保存', { detail: '新额度将在下一次请求时生效。' })

    expect(duplicateId).toBe(originalId)
    expect(toastState.items).toHaveLength(1)
    expect(toastState.items[0]).toMatchObject({ id: originalId, count: 2 })
  })

  it('uses four-second and seven-second semantic timeouts', () => {
    const successId = toast.success('保存成功')
    const errorId = toast.error('保存失败')

    vi.advanceTimersByTime(3_999)
    expect(toastState.items.some((item) => item.id === successId)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(toastState.items.some((item) => item.id === successId)).toBe(false)
    expect(toastState.items.some((item) => item.id === errorId)).toBe(true)
    vi.advanceTimersByTime(3_000)
    expect(toastState.items.some((item) => item.id === errorId)).toBe(false)
  })

  it('pauses and resumes the remaining dismissal time', () => {
    const id = toast.success('保存成功')
    vi.advanceTimersByTime(3_000)

    pauseToast(id)
    vi.advanceTimersByTime(5_000)
    expect(toastState.items.find((item) => item.id === id)?.paused).toBe(true)

    resumeToast(id)
    vi.advanceTimersByTime(999)
    expect(toastState.items.some((item) => item.id === id)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(toastState.items.some((item) => item.id === id)).toBe(false)
  })

  it('dismisses before invoking an optional action and invokes it once', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const id = toast.error('更新失败', { action: { label: '重试', run: action } })

    await invokeToastAction(id)
    await invokeToastAction(id)

    expect(action).toHaveBeenCalledTimes(1)
    expect(toastState.items.some((item) => item.id === id)).toBe(false)
  })

  it('supports explicit dismissal and clearing session notifications', () => {
    const first = toast.info('第一条')
    toast.info('第二条')

    dismissToast(first)
    expect(toastState.items.map((item) => item.title)).toEqual(['第二条'])

    clearToasts()
    expect(toastState.items).toEqual([])
  })
})
