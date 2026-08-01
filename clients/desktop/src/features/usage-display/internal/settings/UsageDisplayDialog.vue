<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Gauge, X } from '@lucide/vue'

import type { User } from '@/api'
import { notifyUsageConfigChanged } from '@/features/usage-display/core/host'
import { createUsageDisplayStore } from '@/features/usage-display/core/store'
import type { UsageDisplayConfig } from '@/features/usage-display/core/storage'
import { formatUsageOrbValue } from '@/features/usage-display/core/format'
import UsageDisplaySettingsForm from './UsageDisplaySettingsForm.vue'

const props = defineProps<{ modelValue: boolean; user: User | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const settingsStore = createUsageDisplayStore(undefined, {
  backgroundRefresh: false,
  syncDisplayOnAttach: false,
})
const { state } = settingsStore
const dialog = ref<HTMLElement | null>(null)
const localError = ref('')
const saving = ref(false)
const orbValue = computed(() => {
  if (state.config.source === 'balance') {
    return formatUsageOrbValue({ kind: 'balance', balance: state.balance?.available ?? null })
  }
  if (!state.quotaSummary) return formatUsageOrbValue({ kind: 'unavailable' })
  return formatUsageOrbValue({
    kind: 'subscription',
    remainingPercent: state.quotaSummary.remainingPercent,
    unlimited: state.quotaSummary.unlimited,
  })
})

function closeDialog() {
  if (saving.value) return
  settingsStore.stop(false)
  emit('update:modelValue', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) closeDialog()
}

async function loadSettings() {
  if (!props.modelValue || !props.user) return
  localError.value = ''
  await settingsStore.attachUser(props.user)
  await settingsStore.loadSubscriptions()
  await nextTick()
  dialog.value?.focus()
}

async function updateConfig(config: UsageDisplayConfig) {
  if (!props.user) return
  localError.value = ''
  saving.value = true
  try {
    await settingsStore.updateConfig(config)
    await notifyUsageConfigChanged(props.user.id)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '设置未能保存'
  } finally {
    saving.value = false
  }
}

watch(() => [props.modelValue, props.user?.id] as const, () => void loadSettings(), { immediate: true })
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  settingsStore.stop(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="modelValue"
        class="dialog-backdrop"
        @mousedown.self="closeDialog"
      >
        <section
          ref="dialog"
          class="usage-display-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usage-display-dialog-title"
          tabindex="-1"
          data-testid="usage-display-dialog"
        >
          <header class="dialog-head">
            <span class="dialog-mark"><Gauge :size="19" /></span>
            <div>
              <h2 id="usage-display-dialog-title">用量显示</h2>
              <p>设置系统外部用量展示</p>
            </div>
            <button
              class="close-button"
              type="button"
              title="关闭"
              aria-label="关闭"
              data-testid="close-usage-display-dialog"
              :disabled="saving"
              @click="closeDialog"
            ><X :size="17" /></button>
          </header>

          <p v-if="localError || state.error" class="notice-error" role="alert">
            {{ localError || state.error }}
          </p>

          <UsageDisplaySettingsForm
            :config="state.config"
            :platform="state.platform"
            :subscriptions="state.subscriptions"
            :tray-title="state.trayTitle"
            :orb-value="orbValue"
            @update="updateConfig"
          />

          <footer class="dialog-actions">
            <span>更改将自动保存</span>
            <button
              class="primary-button"
              type="button"
              data-testid="complete-usage-display-settings"
              :disabled="saving"
              @click="closeDialog"
            ><Check :size="15" />完成</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  padding: 28px;
  background: rgba(31, 45, 65, 0.18);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  place-items: center;
}

.usage-display-dialog {
  display: flex;
  width: min(100%, 468px);
  max-height: calc(100vh - 56px);
  flex-direction: column;
  overflow: hidden;
  background: #fbfdff;
  border: 1px solid rgba(198, 210, 225, 0.92);
  border-radius: var(--radius-md);
  box-shadow: 0 26px 72px rgba(24, 42, 68, 0.24), 0 4px 18px rgba(24, 42, 68, 0.1);
  outline: 0;
}

.usage-display-dialog :deep(.settings-form) { min-height: 0; overflow-y: auto; }

.dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 17px 18px 15px;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  background: var(--accent-soft);
  border-radius: 7px;
  color: var(--accent-strong);
  place-items: center;
}

.dialog-head > div { min-width: 0; flex: 1; }
.dialog-head h2 { font-size: 15px; font-weight: 720; }
.dialog-head p { margin-top: 2px; color: var(--text-tertiary); font-size: 13px; }

.close-button {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  place-items: center;
}
.close-button:hover:not(:disabled) { background: var(--bg-inset); color: var(--text-primary); }

.notice-error {
  margin: 14px 18px -4px;
  padding: 9px 11px;
  background: var(--coral-soft);
  border: 1px solid var(--coral-border);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 18px;
  background: var(--bg-inset);
  border-top: 1px solid var(--border-subtle);
}
.dialog-actions > span { color: var(--text-tertiary); font-size: 12px; }

.primary-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 680;
}
.primary-button:hover:not(:disabled) { background: var(--accent-strong); }
.primary-button:disabled,
.close-button:disabled { opacity: 0.5; }

@media (prefers-reduced-motion: reduce) {
  .dialog-backdrop,
  .usage-display-dialog { transition: none; }
}
</style>
