import { createApp } from 'vue'
import { listen } from '@tauri-apps/api/event'

import * as api from '@/api'
import { usageDisplayStore } from '@/features/usage-display/core/store'
import MacOSFloatingWindow from './MacOSFloatingWindow.vue'
import '@/style.css'
import './macos-floating-window.css'

async function syncSession(userId?: number | null) {
  if (userId === null) {
    await usageDisplayStore.detachUser()
    return
  }
  try {
    const user = await api.getCurrentUser()
    if (userId !== undefined && user.id !== userId) return
    await usageDisplayStore.attachUser(user)
    if (usageDisplayStore.state.config.surface !== 'floating-window') usageDisplayStore.stop(false)
  } catch {
    await usageDisplayStore.detachUser()
  }
}

async function start() {
  try {
    await listen<number | null>('usage-display://session-changed', ({ payload }) => void syncSession(payload))
    await listen<number>('usage-display://config-changed', ({ payload }) => void syncSession(payload))
  } catch {
    // Browser preview has no Tauri event bus.
  }
  await syncSession()
  createApp(MacOSFloatingWindow).mount('#usage-floating-window')
}

void start()
