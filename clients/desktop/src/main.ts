import { createApp } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import App from './App.vue'
import { router } from './router'
import { parseResetDeepLink, setResetHandoff } from '@/lib/deep-link'
import { appCapabilities } from '@/lib/platform-capabilities'
import { bootstrap } from '@/stores/session'
import './style.css'
import './components/user-groups/user-groups.css'
import './mobile/mobile.css'

async function handleDeepLinks(urls: string[]) {
  const handoff = urls.map(parseResetDeepLink).find((value) => value !== null)
  if (!handoff) return
  setResetHandoff(handoff)
  await router.replace({ name: 'reset-password' })
}

async function start() {
  document.documentElement.dataset.mobile = String(appCapabilities.mobile)
  await bootstrap()

  try {
    const current = await getCurrent()
    if (current?.length) await handleDeepLinks(current)
    await onOpenUrl((urls) => void handleDeepLinks(urls))
    if (appCapabilities.desktopSecondInstance) {
      await listen<string[]>('linai://new-url', (event) => void handleDeepLinks(event.payload))
    }
  } catch {
    // Deep-link APIs are unavailable in browser/Vite preview mode.
  }

  createApp(App).use(router).mount('#app')
}

void start()
