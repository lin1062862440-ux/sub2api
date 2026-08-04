<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getName, getVersion } from '@tauri-apps/api/app'
import {
  BadgeCheck,
  ChartNoAxesCombined,
  Check,
  Info,
  LoaderCircle,
  Power,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from '@lucide/vue'

import type { User } from '@/api'
import { notifyUsageConfigChanged } from '@/features/usage-display/core/host'
import { formatUsageOrbValue } from '@/features/usage-display/core/format'
import { createUsageDisplayStore } from '@/features/usage-display/core/store'
import type { UsageDisplayConfig } from '@/features/usage-display/core/storage'
import UsageDisplaySettingsForm from '@/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue'
import type { AvailableDesktopUpdate } from '@/lib/desktop-updater'
import {
  getLaunchAtStartup,
  setLaunchAtStartup,
  startupSettingsErrorMessage,
} from '@/lib/startup'
import { toast } from '@/stores/toast'

type SettingsSection = 'general' | 'usage' | 'about' | 'updates'

const props = defineProps<{
  modelValue: boolean
  user: User | null
  productName: string
  canUseUsageDisplay: boolean
  canUseUpdater: boolean
  canManageLaunchAtStartup: boolean
  updateChecking: boolean
  updateInstalling: boolean
  updateProgress: number | null
  updateMessage: string
  hasAvailableUpdate: boolean
  availableUpdateInfo: AvailableDesktopUpdate | null
  autoCheckUpdates: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'check-update': []
  'install-update': []
  'update:autoCheckUpdates': [value: boolean]
}>()

const settingsStore = createUsageDisplayStore(undefined, {
  backgroundRefresh: false,
  syncDisplayOnAttach: false,
})
const { state } = settingsStore
const dialog = ref<HTMLElement | null>(null)
const activeSection = ref<SettingsSection>('usage')
const usageSaving = ref(false)
const startupLoading = ref(false)
const startupSaving = ref(false)
const startupError = ref('')
const launchAtStartup = ref(false)
const appName = ref('')
const appVersion = ref('')

const visibleSections = computed(() => [
  ...(props.canManageLaunchAtStartup ? [{ id: 'general' as const, label: '常规设置', icon: Power }] : []),
  ...(props.canUseUsageDisplay ? [{ id: 'usage' as const, label: '用量显示', icon: ChartNoAxesCombined }] : []),
  { id: 'about' as const, label: '关于信息', icon: Info },
  ...(props.canUseUpdater ? [{ id: 'updates' as const, label: '检查更新', icon: BadgeCheck }] : []),
])

const activeTitle = computed(() => visibleSections.value.find((item) => item.id === activeSection.value)?.label ?? '设置')
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
  if (usageSaving.value || startupSaving.value || props.updateInstalling) return
  settingsStore.stop(false)
  emit('update:modelValue', false)
}

function selectSection(section: SettingsSection) {
  activeSection.value = section
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) closeDialog()
}

async function loadAppInfo() {
  try {
    const [name, version] = await Promise.all([getName(), getVersion()])
    appName.value = name || props.productName
    appVersion.value = version || ''
  } catch {
    appName.value = props.productName
    appVersion.value = ''
  }
}

async function loadUsageSettings() {
  if (!props.modelValue || !props.user || !props.canUseUsageDisplay) return
  await settingsStore.attachUser(props.user)
  await settingsStore.loadSubscriptions()
}

async function loadStartupSettings() {
  if (!props.modelValue || !props.canManageLaunchAtStartup) return
  startupError.value = ''
  startupLoading.value = true
  try {
    launchAtStartup.value = await getLaunchAtStartup()
  } catch (error) {
    startupError.value = startupSettingsErrorMessage(error)
  } finally {
    startupLoading.value = false
  }
}

async function updateLaunchAtStartup(enabled: boolean) {
  const previous = launchAtStartup.value
  launchAtStartup.value = enabled
  startupError.value = ''
  startupSaving.value = true
  try {
    launchAtStartup.value = await setLaunchAtStartup(enabled)
    toast.success('开机启动设置已更新')
  } catch (error) {
    launchAtStartup.value = previous
    toast.error('开机启动设置更新失败', {
      detail: startupSettingsErrorMessage(error),
    })
  } finally {
    startupSaving.value = false
  }
}

async function openDialog() {
  if (!props.modelValue) return
  const firstSection = visibleSections.value[0]?.id ?? 'about'
  if (!visibleSections.value.some((item) => item.id === activeSection.value)) {
    activeSection.value = firstSection
  }
  await Promise.all([loadAppInfo(), loadUsageSettings(), loadStartupSettings()])
  await nextTick()
  dialog.value?.focus()
}

async function updateUsageConfig(config: UsageDisplayConfig) {
  if (!props.user) return
  usageSaving.value = true
  try {
    await settingsStore.updateConfig(config)
    await notifyUsageConfigChanged(props.user.id)
    toast.success('用量显示设置已保存')
  } catch (error) {
    toast.error('用量显示设置保存失败', {
      detail: error instanceof Error ? error.message : '设置未能保存',
    })
  } finally {
    usageSaving.value = false
  }
}

watch(() => [props.modelValue, props.user?.id] as const, () => void openDialog(), { immediate: true })
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  settingsStore.stop(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-fade">
      <div
        v-if="modelValue"
        class="settings-backdrop"
        data-testid="settings-dialog"
        @mousedown.self="closeDialog"
      >
        <section
          ref="dialog"
          class="settings-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          tabindex="-1"
        >
          <header class="settings-head">
            <span class="settings-mark"><Settings2 :size="19" /></span>
            <div>
              <h2 id="settings-dialog-title">设置</h2>
              <p>{{ activeTitle }}</p>
            </div>
            <button
              class="settings-close"
              type="button"
              title="关闭"
              aria-label="关闭"
              data-testid="close-settings-dialog"
              :disabled="usageSaving || startupSaving || updateInstalling"
              @click="closeDialog"
            ><X :size="17" /></button>
          </header>

          <div class="settings-body">
            <nav class="settings-nav" aria-label="设置菜单">
              <button
                v-for="item in visibleSections"
                :key="item.id"
                type="button"
                :aria-pressed="activeSection === item.id"
                :data-testid="`settings-tab-${item.id}`"
                @click="selectSection(item.id)"
              >
                <component :is="item.icon" :size="17" />
                <span>{{ item.label }}</span>
              </button>
            </nav>

            <main class="settings-panel">
              <section
                v-if="activeSection === 'general' && canManageLaunchAtStartup"
                class="settings-section general-section"
              >
                <p v-if="startupError" class="settings-error" role="alert">
                  {{ startupError }}
                </p>
                <div class="settings-row">
                  <div>
                    <strong>开机时启动 LinAI</strong>
                    <span>登录 Windows 后自动启动，可随时在这里关闭</span>
                  </div>
                  <label class="settings-check">
                    <input
                      type="checkbox"
                      aria-label="开机时启动 LinAI"
                      data-testid="launch-at-startup"
                      :checked="launchAtStartup"
                      :disabled="startupLoading || startupSaving"
                      @change="updateLaunchAtStartup(($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ startupLoading ? '读取中' : launchAtStartup ? '已开启' : '已关闭' }}</span>
                  </label>
                </div>
              </section>

              <section v-else-if="activeSection === 'usage' && canUseUsageDisplay" class="settings-section">
                <p v-if="state.error" class="settings-error" role="alert">
                  {{ state.error }}
                </p>
                <UsageDisplaySettingsForm
                  :config="state.config"
                  :platform="state.platform"
                  :subscriptions="state.subscriptions"
                  :tray-title="state.trayTitle"
                  :orb-value="orbValue"
                  @update="updateUsageConfig"
                />
              </section>

              <section v-else-if="activeSection === 'about'" class="settings-section about-section">
                <div class="about-identity">
                  <span><Sparkles :size="22" /></span>
                  <div>
                    <strong>{{ appName || productName }}</strong>
                    <small>桌面客户端</small>
                  </div>
                </div>
                <dl class="about-list">
                  <div>
                    <dt>软件名称</dt>
                    <dd>{{ appName || productName }}</dd>
                  </div>
                  <div>
                    <dt>当前版本</dt>
                    <dd data-testid="settings-app-version">{{ appVersion || '未知' }}</dd>
                  </div>
                </dl>
              </section>

              <section v-else-if="activeSection === 'updates' && canUseUpdater" class="settings-section update-section">
                <div class="settings-row">
                  <div>
                    <strong>启动时自动检查更新</strong>
                    <span>只检查新版本，安装前仍会等待确认</span>
                  </div>
                  <label class="settings-check">
                    <input
                      type="checkbox"
                      data-testid="auto-check-updates"
                      :checked="autoCheckUpdates"
                      @change="emit('update:autoCheckUpdates', ($event.target as HTMLInputElement).checked)"
                    />
                    <span>自动</span>
                  </label>
                </div>

                <div class="update-command">
                  <button
                    type="button"
                    data-testid="check-update-button"
                    :disabled="updateChecking || updateInstalling"
                    @click="emit('check-update')"
                  >
                    <RefreshCw v-if="updateChecking" :size="16" class="spinning" />
                    <BadgeCheck v-else :size="16" />
                    <span>{{ updateChecking ? '正在检查' : '手动检查更新' }}</span>
                  </button>
                  <button
                    v-if="hasAvailableUpdate"
                    class="primary-command"
                    type="button"
                    data-testid="install-update"
                    :disabled="updateInstalling"
                    @click="emit('install-update')"
                  >
                    <LoaderCircle v-if="updateInstalling" :size="16" class="spinning" />
                    <Check v-else :size="16" />
                    <span>{{ updateInstalling ? '安装中' : '立即更新' }}</span>
                  </button>
                </div>

                <div
                  v-if="updateMessage"
                  class="update-state"
                  data-testid="desktop-update-status"
                  role="status"
                >
                  <strong>{{ updateMessage }}</strong>
                  <span v-if="availableUpdateInfo">
                    当前 {{ availableUpdateInfo.currentVersion }}，可更新到 {{ availableUpdateInfo.version }}
                  </span>
                  <small v-if="availableUpdateInfo?.notes">{{ availableUpdateInfo.notes }}</small>
                  <div v-if="updateProgress !== null" class="update-progress" aria-hidden="true">
                    <span :style="{ width: `${updateProgress}%` }" />
                  </div>
                </div>
              </section>
            </main>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-backdrop {
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

.settings-dialog {
  display: flex;
  width: min(100%, 720px);
  max-height: calc(100vh - 56px);
  min-height: 520px;
  flex-direction: column;
  overflow: hidden;
  background: #fbfdff;
  border: 1px solid rgba(198, 210, 225, 0.92);
  border-radius: var(--radius-md);
  box-shadow: 0 26px 72px rgba(24, 42, 68, 0.24), 0 4px 18px rgba(24, 42, 68, 0.1);
  outline: 0;
}

.settings-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 17px 18px 15px;
  border-bottom: 1px solid var(--border-subtle);
}

.settings-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  background: var(--accent-soft);
  border-radius: 7px;
  color: var(--accent-strong);
  place-items: center;
}

.settings-head > div { min-width: 0; flex: 1; }
.settings-head h2 { font-size: 15px; font-weight: 720; }
.settings-head p { margin-top: 2px; color: var(--text-tertiary); font-size: 13px; }

.settings-close {
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
.settings-close:hover:not(:disabled) { background: var(--bg-inset); color: var(--text-primary); }
.settings-close:disabled { opacity: 0.5; }

.settings-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 172px minmax(0, 1fr);
}

.settings-nav {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 5px;
  padding: 14px 10px;
  background: var(--bg-rail);
  border-right: 1px solid var(--border-subtle);
}

.settings-nav button {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 620;
  text-align: left;
}
.settings-nav button:hover { background: rgba(255, 255, 255, 0.62); color: var(--text-primary); }
.settings-nav button[aria-pressed='true'] {
  background: var(--bg-surface);
  box-shadow: 0 1px 4px rgba(25, 45, 75, 0.08);
  color: var(--accent-strong);
}

.settings-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.settings-section { min-height: 100%; }
.settings-section :deep(.settings-form) { padding: 18px 20px 20px; }

.settings-error {
  margin: 14px 20px -4px;
  padding: 9px 11px;
  background: var(--coral-soft);
  border: 1px solid var(--coral-border);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
}

.about-section,
.general-section,
.update-section {
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 20px;
}

.about-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.about-identity > span {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--accent-strong);
  place-items: center;
}
.about-identity div { display: grid; gap: 3px; }
.about-identity strong { font-size: 18px; font-weight: 740; }
.about-identity small { color: var(--text-tertiary); font-size: 13px; }

.about-list {
  display: grid;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.about-list div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 16px;
  padding: 13px 14px;
  background: var(--bg-surface);
}
.about-list dt { color: var(--text-tertiary); font-size: 13px; }
.about-list dd { min-width: 0; margin: 0; color: var(--text-primary); font-size: 13px; font-weight: 650; }

.settings-row {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.settings-row > div { display: grid; gap: 3px; }
.settings-row strong { color: var(--text-primary); font-size: 14px; font-weight: 700; }
.settings-row span { color: var(--text-tertiary); font-size: 12px; }

.settings-check {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 620;
}
.settings-check input { width: 15px; height: 15px; accent-color: var(--accent); }

.update-command {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 2px;
}
.update-command button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 680;
}
.update-command button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.update-command button:disabled { cursor: default; opacity: 0.68; }
.update-command .primary-command {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
.update-command .primary-command:hover:not(:disabled) { background: var(--accent-strong); color: white; }

.update-state {
  display: grid;
  gap: 7px;
  padding: 12px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}
.update-state strong { color: var(--text-primary); font-weight: 700; }
.update-state span,
.update-state small { color: var(--text-tertiary); }
.update-state small {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.update-progress {
  height: 5px;
  overflow: hidden;
  background: rgba(198, 210, 226, 0.7);
  border-radius: 999px;
}
.update-progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 140ms ease;
}

.spinning { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 760px) {
  .settings-dialog { min-height: min(560px, calc(100vh - 56px)); }
  .settings-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .settings-nav {
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .settings-nav button { flex: 0 0 auto; }
}

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
  .update-progress span { transition: none; }
}
</style>
