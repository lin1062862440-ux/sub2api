<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
  theme: 'light' | 'dark' | 'auto'
  size: 'normal' | 'compact' | 'flexible'
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onTurnstileLoad?: () => void
  }
}

const props = withDefaults(
  defineProps<{
    siteKey: string
    theme?: 'light' | 'dark' | 'auto'
    size?: 'normal' | 'compact' | 'flexible'
  }>(),
  { theme: 'light', size: 'flexible' },
)

const emit = defineEmits<{
  verify: [token: string]
  expire: []
  error: []
}>()

const container = ref<HTMLElement | null>(null)
const widgetId = ref<string | null>(null)
const scriptLoaded = ref(false)

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      scriptLoaded.value = true
      resolve()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]')
    window.onTurnstileLoad = () => {
      scriptLoaded.value = true
      resolve()
    }
    if (existing) return

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('Failed to load Turnstile script'))
    document.head.appendChild(script)
  })
}

function removeWidget() {
  if (!window.turnstile || !widgetId.value) return
  try {
    window.turnstile.remove(widgetId.value)
  } catch {
    // The widget may already have removed itself after navigation.
  }
  widgetId.value = null
}

function renderWidget() {
  if (!window.turnstile || !container.value || !props.siteKey) return

  removeWidget()
  container.value.innerHTML = ''
  widgetId.value = window.turnstile.render(container.value, {
    sitekey: props.siteKey,
    callback: (token) => emit('verify', token),
    'expired-callback': () => emit('expire'),
    'error-callback': () => emit('error'),
    theme: props.theme,
    size: props.size,
  })
}

function reset() {
  if (window.turnstile && widgetId.value) window.turnstile.reset(widgetId.value)
}

defineExpose({ reset })

onMounted(async () => {
  if (!props.siteKey) return
  try {
    await loadScript()
    renderWidget()
  } catch {
    emit('error')
  }
})

onUnmounted(removeWidget)

watch(
  () => props.siteKey,
  (siteKey) => {
    if (siteKey && scriptLoaded.value) renderWidget()
  },
)
</script>

<template>
  <div v-if="siteKey" class="turnstile-wrapper">
    <div ref="container" class="turnstile-container" />
  </div>
</template>

<style scoped>
.turnstile-wrapper,
.turnstile-container {
  width: 100%;
}

.turnstile-container {
  min-height: 65px;
}

.turnstile-container :deep(iframe) {
  width: 100% !important;
}
</style>
