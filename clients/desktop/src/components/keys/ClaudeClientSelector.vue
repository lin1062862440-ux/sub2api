<script setup lang="ts">
import { CodeXml, Monitor } from '@lucide/vue'

import type { ClaudeTarget } from '@/lib/client-config'

defineProps<{
  modelValue: ClaudeTarget
  desktopSupported?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [target: ClaudeTarget]
}>()
</script>

<template>
  <div class="claude-targets" data-testid="claude-targets" role="group" aria-label="选择 Claude 客户端">
    <button
      type="button"
      data-testid="target-claude-code"
      :class="{ active: modelValue === 'claude_code' }"
      @click="emit('update:modelValue', 'claude_code')"
    >
      <CodeXml :size="17" />
      <span><strong>Claude Code</strong><small>终端与开发工作流</small></span>
    </button>
    <button
      type="button"
      data-testid="target-claude-desktop"
      :class="{ active: modelValue === 'claude_desktop' }"
      :disabled="desktopSupported === false"
      @click="emit('update:modelValue', 'claude_desktop')"
    >
      <Monitor :size="17" />
      <span><strong>Claude Desktop</strong><small>{{ desktopSupported === false ? '当前系统不支持' : '桌面应用与 Cowork' }}</small></span>
    </button>
  </div>
</template>

<style scoped>
.claude-targets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.claude-targets button { display: grid; min-height: 58px; grid-template-columns: 34px 1fr; align-items: center; gap: 7px; padding: 8px 10px; background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-secondary); text-align: left; transition: border-color var(--motion-fast), background var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast); }
.claude-targets button:hover:not(:disabled) { border-color: #adc3e8; background: #fff; }
.claude-targets button:active:not(:disabled) { transform: translateY(1px); }
.claude-targets button.active { background: #f2f7ff; border-color: #8db0ee; box-shadow: inset 0 0 0 1px rgba(37,99,235,.08); color: var(--accent-strong); }
.claude-targets button:disabled { opacity: .48; }
.claude-targets svg { justify-self: center; }
.claude-targets span,.claude-targets strong,.claude-targets small { display: block; min-width: 0; }
.claude-targets strong { color: var(--text-primary); font-size: 14px; font-weight: 720; }
.claude-targets small { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
</style>
