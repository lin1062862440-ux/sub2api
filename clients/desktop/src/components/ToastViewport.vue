<script setup lang="ts">
import {
  AlertCircle as CircleAlert,
  CheckCircle2 as CircleCheck,
  Info,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component, watch } from 'vue'
import {
  dismissToast,
  invokeToastAction,
  pauseToast,
  resumeToast,
  toastState,
  type ToastType,
} from '@/stores/toast'

const icons: Record<ToastType, Component> = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
}

const items = computed(() => toastState.items)
const viewport = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

function syncScrollReserve(height?: number) {
  if (!items.value.length) {
    document.documentElement.style.removeProperty('--toast-scroll-reserve')
    return
  }
  const measuredHeight = height ?? viewport.value?.getBoundingClientRect().height ?? 0
  if (measuredHeight <= 0) return
  document.documentElement.style.setProperty('--toast-scroll-reserve', `${Math.ceil(measuredHeight) + 32}px`)
}

watch(() => items.value.length, () => void nextTick(() => syncScrollReserve()), { immediate: true, flush: 'post' })

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === viewport.value)
      syncScrollReserve(entry?.contentRect.height)
    })
    resizeObserver.observe(viewport.value)
  }
  syncScrollReserve()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  document.documentElement.style.removeProperty('--toast-scroll-reserve')
})
</script>

<template>
  <div
    ref="viewport"
    class="toast-viewport"
    data-testid="toast-viewport"
    aria-label="操作通知"
  >
    <TransitionGroup name="toast-stack">
      <article
        v-for="item in items"
        :key="item.id"
        class="toast-item"
        :class="`toast-item--${item.type}`"
        data-testid="toast-item"
        :data-toast-id="item.id"
        :role="item.type === 'error' ? 'alert' : 'status'"
        :aria-live="item.type === 'error' ? 'assertive' : 'polite'"
        aria-atomic="true"
        @mouseenter="pauseToast(item.id)"
        @mouseleave="resumeToast(item.id)"
        @focusin="pauseToast(item.id)"
        @focusout="resumeToast(item.id)"
      >
        <span class="toast-item__icon" aria-hidden="true">
          <component :is="icons[item.type]" :size="18" :stroke-width="2" />
        </span>

        <div class="toast-item__content">
          <div class="toast-item__title-row">
            <strong>{{ item.title }}</strong>
            <span v-if="item.count > 1" class="toast-item__count">x{{ item.count }}</span>
          </div>
          <p v-if="item.detail">{{ item.detail }}</p>
          <button
            v-if="item.action"
            type="button"
            class="toast-item__action"
            data-testid="toast-action"
            @click="invokeToastAction(item.id)"
          >
            {{ item.action.label }}
          </button>
        </div>

        <button
          type="button"
          class="toast-item__dismiss"
          data-testid="dismiss-toast"
          aria-label="关闭通知"
          @click="dismissToast(item.id)"
        >
          <X :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-viewport {
  position: fixed;
  z-index: 1600;
  right: 20px;
  bottom: 20px;
  display: flex;
  width: min(360px, calc(100vw - 40px));
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast-item {
  --toast-color: var(--accent-strong);
  --toast-soft: var(--accent-soft);
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  align-items: start;
  min-height: 72px;
  padding: 13px 10px 13px 12px;
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--toast-color);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: 0 12px 28px rgba(23, 27, 36, 0.14);
  color: var(--text-primary);
  pointer-events: auto;
}

.toast-item--success {
  --toast-color: var(--success);
  --toast-soft: var(--success-soft);
}

.toast-item--error {
  --toast-color: var(--danger);
  --toast-soft: var(--coral-soft);
}

.toast-item--warning {
  --toast-color: var(--warning);
  --toast-soft: var(--warning-soft);
}

.toast-item__icon {
  display: grid;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--toast-soft);
  color: var(--toast-color);
  place-items: center;
}

.toast-item__content {
  min-width: 0;
  padding: 3px 8px 0 2px;
}

.toast-item__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.toast-item__title-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
}

.toast-item__count {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 650;
}

.toast-item__content p {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.toast-item__action {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--toast-color);
  font-size: 13px;
  font-weight: 700;
}

.toast-item__dismiss {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  place-items: center;
}

.toast-item__dismiss:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.toast-stack-enter-active,
.toast-stack-leave-active,
.toast-stack-move {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-stack-enter-from,
.toast-stack-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

:global(html:has([role='dialog']) .toast-viewport) {
  z-index: 60;
}

html[data-mobile='true'] .toast-viewport {
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(72px + env(safe-area-inset-bottom));
  left: max(12px, env(safe-area-inset-left));
  width: min(360px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  margin-inline: auto;
}

@media (prefers-reduced-motion: reduce) {
  .toast-stack-enter-active,
  .toast-stack-leave-active,
  .toast-stack-move {
    transition: none;
  }
}
</style>
