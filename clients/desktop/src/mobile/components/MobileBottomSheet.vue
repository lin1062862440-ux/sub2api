<script setup lang="ts">
import { X } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    closeDisabled?: boolean
  }>(),
  { closeDisabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const sheet = ref<HTMLElement | null>(null)
const titleId = `mobile-bottom-sheet-title-${Math.random().toString(36).slice(2, 9)}`
let previousFocus: HTMLElement | null = null
let mounted = false

function focusableElements() {
  if (!sheet.value) return []
  return Array.from(
    sheet.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'))
}

async function focusFirst() {
  await nextTick()
  focusableElements()[0]?.focus()
}

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function requestClose() {
  if (props.closeDisabled) return
  emit('update:modelValue', false)
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue) return
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key !== 'Tab') return

  const elements = focusableElements()
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  const outside = !sheet.value?.contains(active)
  if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

function handleOpenChange(open: boolean) {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusFirst()
  } else {
    restoreFocus()
  }
}

watch(() => props.modelValue, (open) => {
  if (mounted) handleOpenChange(open)
})

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', handleKeydown)
  if (props.modelValue) handleOpenChange(true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (props.modelValue) restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="mobile-bottom-sheet">
      <div v-if="modelValue" class="mobile-bottom-sheet-layer">
        <button
          class="mobile-bottom-sheet-scrim"
          type="button"
          data-testid="mobile-bottom-sheet-scrim"
          aria-label="关闭"
          :disabled="closeDisabled"
          @pointerdown="requestClose"
        />
        <section
          ref="sheet"
          class="mobile-bottom-sheet"
          data-testid="mobile-bottom-sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <div class="mobile-bottom-sheet-handle" aria-hidden="true" />
          <header class="mobile-bottom-sheet-header">
            <h2 :id="titleId">{{ title }}</h2>
            <button
              type="button"
              data-testid="mobile-bottom-sheet-close"
              aria-label="关闭"
              :disabled="closeDisabled"
              @click="requestClose"
            >
              <X :size="20" />
            </button>
          </header>
          <div class="mobile-bottom-sheet-content"><slot /></div>
          <footer v-if="$slots.footer" class="mobile-bottom-sheet-footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mobile-bottom-sheet-layer {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(24, 35, 49, 0.3);
}

.mobile-bottom-sheet-scrim {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.mobile-bottom-sheet {
  position: relative;
  display: flex;
  width: 100%;
  max-height: calc(100dvh - env(safe-area-inset-top));
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  overflow: hidden;
  background: var(--bg-surface);
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -12px 36px rgba(27, 43, 63, 0.18);
}

.mobile-bottom-sheet-handle {
  width: 36px;
  height: 4px;
  flex: 0 0 auto;
  margin: 8px auto 0;
  background: var(--border-strong);
  border-radius: 2px;
}

.mobile-bottom-sheet-header {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-bottom-sheet-header h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-bottom-sheet-header button {
  display: grid;
  width: 44px;
  min-height: 44px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
}

.mobile-bottom-sheet-content {
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.mobile-bottom-sheet-footer {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-subtle);
}

.mobile-bottom-sheet-enter-active,
.mobile-bottom-sheet-leave-active {
  transition: opacity 160ms ease;
}

.mobile-bottom-sheet-enter-active .mobile-bottom-sheet,
.mobile-bottom-sheet-leave-active .mobile-bottom-sheet {
  transition: transform 160ms ease;
}

.mobile-bottom-sheet-enter-from,
.mobile-bottom-sheet-leave-to {
  opacity: 0;
}

.mobile-bottom-sheet-enter-from .mobile-bottom-sheet,
.mobile-bottom-sheet-leave-to .mobile-bottom-sheet {
  transform: translateY(20px);
}
</style>
