import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AndroidUpdateState } from '@/lib/android-updater'
import MobileUpdateSheet from './MobileUpdateSheet.vue'

const release = {
  version: '0.1.5',
  versionCode: 1_005,
  notes: '优化 Android 更新流程。\n修复已知问题。',
  publishedAt: '2026-08-03T00:00:00.000Z',
  url: 'https://gitee.com/linsource/linai-desktop-release/releases/download/android-v0.1.5/LinAI.apk',
  bytes: 2_048,
  sha256: 'a'.repeat(64),
  signature: 'signature',
}

function state(overrides: Partial<AndroidUpdateState> = {}): AndroidUpdateState {
  return {
    phase: 'available',
    release,
    installedVersion: '0.1.4',
    downloadedBytes: 0,
    totalBytes: release.bytes,
    error: null,
    ...overrides,
  }
}

function mountSheet(updateState = state()) {
  return mount(MobileUpdateSheet, {
    attachTo: document.body,
    props: { modelValue: true, state: updateState },
  })
}

describe('MobileUpdateSheet', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('shows version, date, size, notes, and explicit download consent', async () => {
    const wrapper = mountSheet()
    expect(document.body.textContent).toContain('0.1.4')
    expect(document.body.textContent).toContain('0.1.5')
    expect(document.body.textContent).toContain('2026年8月3日')
    expect(document.body.textContent).toContain('2 KB')
    expect(document.body.textContent).toContain('优化 Android 更新流程。')

    const button = document.body.querySelector<HTMLButtonElement>('[data-testid="android-update-download"]')!
    button.click()
    expect(wrapper.emitted('download')).toHaveLength(1)
  })

  it('renders bounded native progress and a cancel command', () => {
    const wrapper = mountSheet(state({
      phase: 'downloading',
      downloadedBytes: 1_024,
      totalBytes: 2_048,
    }))
    const progress = document.body.querySelector<HTMLProgressElement>('progress')!
    expect(progress.max).toBe(2_048)
    expect(progress.value).toBe(1_024)

    document.body.querySelector<HTMLButtonElement>('[data-testid="android-update-cancel"]')!.click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('directs permission and ready states to different commands', () => {
    const permission = mountSheet(state({ phase: 'permission-required' }))
    document.body.querySelector<HTMLButtonElement>('[data-testid="android-update-permission"]')!.click()
    expect(permission.emitted('request-permission')).toHaveLength(1)
    permission.unmount()

    document.body.innerHTML = ''
    const ready = mountSheet(state({ phase: 'ready-to-install' }))
    document.body.querySelector<HTMLButtonElement>('[data-testid="android-update-install"]')!.click()
    expect(ready.emitted('install')).toHaveLength(1)
  })

  it('redacts failures through state copy and exposes a retry', () => {
    const wrapper = mountSheet(state({ phase: 'error', error: '更新包下载失败，请检查网络后重试。' }))
    expect(document.body.textContent).toContain('更新包下载失败，请检查网络后重试。')
    const retry = document.body.querySelector<HTMLButtonElement>('[data-testid="android-update-retry"]')!
    retry.click()
    expect(wrapper.emitted('download')).toHaveLength(1)
  })

  it('does not allow verification to be dismissed', () => {
    mountSheet(state({ phase: 'verifying' }))
    expect(document.body.querySelector<HTMLButtonElement>('[data-testid="mobile-bottom-sheet-close"]')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('正在验证更新包')
  })
})
