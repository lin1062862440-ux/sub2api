import { computed, onMounted, onUnmounted, ref } from 'vue'

export function useEChartTheme() {
  const isDark = ref(false)
  let observer: MutationObserver | undefined

  const syncTheme = () => {
    isDark.value = document.documentElement.classList.contains('dark')
  }

  onMounted(() => {
    syncTheme()
    observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })

  onUnmounted(() => observer?.disconnect())

  return computed(() => ({
    isDark: isDark.value,
    text: isDark.value ? '#d1d5db' : '#4b5563',
    mutedText: isDark.value ? '#9ca3af' : '#6b7280',
    grid: isDark.value ? '#374151' : '#e5e7eb',
    tooltipBackground: isDark.value ? '#1f2937' : '#ffffff',
    tooltipTitle: isDark.value ? '#f3f4f6' : '#111827'
  }))
}
