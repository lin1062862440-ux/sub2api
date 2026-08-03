<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Circle, CircleDot, Layers3, Menu, MonitorUp, RectangleHorizontal, WalletCards } from '@lucide/vue'

import type { UserSubscription } from '@/api'
import type { Platform } from '@/lib/platform'
import type { UsageDisplayConfig } from '@/features/usage-display/core/storage'
import UsageAppearanceChooser from './UsageAppearanceChooser.vue'

const props = defineProps<{
  config: UsageDisplayConfig
  platform: Platform
  subscriptions: readonly UserSubscription[]
  trayTitle: string
  orbValue: string
}>()

const emit = defineEmits<{ update: [config: UsageDisplayConfig] }>()

const selectedSource = ref<UsageDisplayConfig['source']>(props.config.source)
const supported = computed(() => props.platform === 'macos' || props.platform === 'windows')
const canEnable = computed(() => props.config.source === 'balance' || props.config.subscriptionId !== null)

watch(() => props.config.source, (source) => {
  selectedSource.value = source
})

function setSource(source: UsageDisplayConfig['source']) {
  selectedSource.value = source
  if (props.config.enabled && source === 'subscription' && props.config.subscriptionId === null) return
  emit('update', {
    ...props.config,
    source,
    subscriptionId: source === 'subscription' ? props.config.subscriptionId : null,
  })
}

function setSurface(surface: UsageDisplayConfig['surface']) {
  emit('update', { ...props.config, surface })
}

function setAppearance(appearance: UsageDisplayConfig['appearance']) {
  emit('update', { ...props.config, appearance })
}

function setFloatingStyle(floatingStyle: UsageDisplayConfig['floatingStyle']) {
  emit('update', { ...props.config, floatingStyle })
}

function setSubscription(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if ((!Number.isInteger(value) || value <= 0) && props.config.enabled) return
  emit('update', {
    ...props.config,
    source: 'subscription',
    subscriptionId: Number.isInteger(value) && value > 0 ? value : null,
  })
}

function toggle() {
  if (!supported.value || (!props.config.enabled && !canEnable.value)) return
  emit('update', { ...props.config, enabled: !props.config.enabled })
}
</script>

<template>
  <div class="settings-form">
    <div v-if="!supported" class="platform-placeholder">
      <MonitorUp :size="24" />
      <div>
        <strong>当前平台暂未支持</strong>
        <span>Linux 外部用量展示将在后续版本提供</span>
      </div>
    </div>

    <div class="settings-row" :class="{ disabled: !supported }">
      <div>
        <strong>启用外部用量显示</strong>
        <span>登录后在系统区域持续显示所选用量</span>
      </div>
      <button
        type="button"
        role="switch"
        data-testid="usage-display-toggle"
        :aria-checked="config.enabled"
        :disabled="!supported || (!config.enabled && !canEnable)"
        @click="toggle"
      ><span /></button>
    </div>

    <fieldset :disabled="!supported">
      <legend>展示位置</legend>
      <div class="settings-segmented">
        <button
          type="button"
          data-testid="usage-surface-menu-bar"
          :aria-pressed="config.surface === 'menu-bar'"
          @click="setSurface('menu-bar')"
        ><Menu :size="16" /><span>{{ platform === 'windows' ? '系统托盘' : '菜单栏' }}</span></button>
        <button
          type="button"
          data-testid="usage-surface-floating-window"
          :aria-pressed="config.surface === 'floating-window'"
          @click="setSurface('floating-window')"
        ><CircleDot :size="16" /><span>悬浮窗</span></button>
      </div>
    </fieldset>

    <fieldset :disabled="!supported">
      <legend>显示来源</legend>
      <div class="settings-segmented">
        <button
          type="button"
          data-testid="usage-source-balance"
          :aria-pressed="selectedSource === 'balance'"
          @click="setSource('balance')"
        ><WalletCards :size="16" /><span>账户余额</span></button>
        <button
          type="button"
          data-testid="usage-source-subscription"
          :aria-pressed="selectedSource === 'subscription'"
          @click="setSource('subscription')"
        ><Layers3 :size="16" /><span>订阅组</span></button>
      </div>

      <label v-if="selectedSource === 'subscription'" class="subscription-select">
        <span>固定订阅</span>
        <select
          data-testid="usage-subscription-select"
          :value="config.subscriptionId ?? ''"
          @change="setSubscription"
        >
          <option value="">选择一个有效订阅</option>
          <option v-for="item in subscriptions" :key="item.id" :value="item.id">
            {{ item.group?.name || `订阅 #${item.id}` }}
          </option>
        </select>
      </label>
    </fieldset>

    <fieldset :disabled="!supported">
      <legend>展示样式</legend>
      <UsageAppearanceChooser
        :model-value="config.appearance"
        :platform="platform"
        @update:model-value="setAppearance"
      />
    </fieldset>

    <fieldset v-if="config.surface === 'floating-window'" :disabled="!supported">
      <legend>悬浮形态</legend>
      <div class="settings-segmented">
        <button
          type="button"
          data-testid="usage-floating-style-orb"
          :aria-pressed="config.floatingStyle === 'orb'"
          @click="setFloatingStyle('orb')"
        ><Circle :size="16" /><span>圆形</span></button>
        <button
          type="button"
          data-testid="usage-floating-style-bar"
          :aria-pressed="config.floatingStyle === 'bar'"
          @click="setFloatingStyle('bar')"
        ><RectangleHorizontal :size="16" /><span>横条</span></button>
      </div>
    </fieldset>

    <div class="display-preview">
      <span>{{ config.surface === 'menu-bar' ? (platform === 'windows' ? '系统托盘预览' : '菜单栏预览') : '悬浮窗预览' }}</span>
      <strong v-if="config.surface === 'menu-bar'" class="menu-preview"><i aria-hidden="true">L</i>{{ trayTitle }}</strong>
      <strong
        v-else-if="config.floatingStyle === 'orb'"
        class="floating-preview orb-preview"
        :data-appearance="config.appearance"
        data-testid="usage-floating-orb-preview"
      ><b>{{ orbValue }}</b></strong>
      <strong
        v-else
        class="floating-preview bar-preview"
        :data-appearance="config.appearance"
        data-testid="usage-floating-bar-preview"
      ><span>{{ config.source === 'balance' ? '可用余额' : '已使用' }}</span><b>{{ orbValue }}</b></strong>
    </div>
  </div>
</template>

<style scoped>
.settings-form { display: grid; gap: 17px; padding: 18px; }

.platform-placeholder {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
}

.platform-placeholder > div,
.settings-row > div { display: grid; gap: 3px; }
.platform-placeholder strong,
.settings-row strong { color: var(--text-primary); font-size: 14px; font-weight: 700; }
.platform-placeholder span,
.settings-row span { color: var(--text-tertiary); font-size: 12px; }

.settings-row {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.settings-row.disabled,
fieldset:disabled { opacity: 0.52; }

.settings-row button[role='switch'] {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  background: #aeb9c8;
  border: 0;
  border-radius: 11px;
}

.settings-row button[role='switch'] span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(28, 44, 67, 0.24);
  transition: transform 160ms ease;
}

.settings-row button[role='switch'][aria-checked='true'] { background: var(--success); }
.settings-row button[role='switch'][aria-checked='true'] span { transform: translateX(16px); }

fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
legend,
.subscription-select > span,
.display-preview > span { color: var(--text-secondary); font-size: 13px; font-weight: 680; }
legend { margin-bottom: 8px; }

.settings-segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 40px;
  padding: 3px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.settings-segmented button {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 13px;
}

.settings-segmented button[aria-pressed='true'] {
  background: var(--bg-surface);
  box-shadow: 0 1px 4px rgba(29, 45, 68, 0.1);
  color: var(--accent-strong);
  font-weight: 680;
}

.subscription-select { display: grid; gap: 7px; margin-top: 14px; }
.subscription-select select {
  width: 100%;
  height: 40px;
  padding: 0 34px 0 11px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  outline: 0;
}
.subscription-select select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.display-preview {
  display: grid;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.menu-preview {
  display: inline-flex;
  min-width: 0;
  min-height: 30px;
  justify-self: start;
  align-items: center;
  gap: 7px;
  padding: 0 10px 0 5px;
  overflow: hidden;
  background: #2c3440;
  border-radius: 5px;
  color: white;
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-preview i {
  display: grid;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 4px;
  color: #202733;
  font-size: 12px;
  font-style: normal;
  place-items: center;
}

.floating-preview {
  --preview-bg: #dcecf5;
  --preview-border: rgba(80, 127, 156, 0.2);
  --preview-text: #24374a;
  background: var(--preview-bg);
  border: 1px solid var(--preview-border);
  color: var(--preview-text);
  box-shadow: inset -16px -14px 24px rgba(83, 148, 186, 0.16), 0 5px 12px rgba(43, 67, 84, 0.1);
}
.floating-preview[data-appearance='meadow'] { --preview-bg: #edf1c9; --preview-border: rgba(116, 129, 54, 0.2); --preview-text: #364126; box-shadow: inset -16px -14px 24px rgba(172, 183, 79, 0.18), 0 5px 12px rgba(63, 70, 35, 0.1); }
.floating-preview[data-appearance='sunset'] { --preview-bg: #f4d6cd; --preview-border: rgba(162, 81, 67, 0.2); --preview-text: #52302c; box-shadow: inset -16px -14px 24px rgba(206, 106, 87, 0.17), 0 5px 12px rgba(88, 48, 40, 0.1); }
.floating-preview[data-appearance='native'] {
  --preview-bg: rgba(229, 235, 241, 0.74);
  --preview-border: rgba(255, 255, 255, 0.72);
  --preview-text: #29313a;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.76), 0 4px 10px rgba(50, 62, 73, 0.1);
}
.orb-preview {
  display: grid;
  width: 62px;
  height: 62px;
  justify-self: start;
  place-content: center;
  border-radius: 50%;
  text-align: center;
}
.orb-preview b { margin-top: 2px; font-size: 14px; font-weight: 720; }
.bar-preview {
  display: flex;
  width: 142px;
  min-height: 42px;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  justify-self: start;
  padding: 0 14px;
  border-radius: 14px;
}
.bar-preview[data-appearance='native'] { width: 154px; min-height: 36px; border-radius: 18px; }
.bar-preview span { color: inherit; font-size: 10px; font-weight: 560; opacity: 0.68; }
.bar-preview b { font-size: 15px; font-weight: 680; }

@media (prefers-reduced-motion: reduce) {
  .settings-row button[role='switch'] span { transition: none; }
}
</style>
