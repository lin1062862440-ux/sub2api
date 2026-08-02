<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    loading?: boolean
    error?: string
    empty?: boolean
    loadingLabel?: string
    emptyTitle?: string
    emptyMessage?: string
  }>(),
  {
    subtitle: '',
    loading: false,
    error: '',
    empty: false,
    loadingLabel: '正在加载',
    emptyTitle: '暂无内容',
    emptyMessage: '当前没有可显示的内容。',
  },
)

const emit = defineEmits<{
  refresh: []
  retry: []
}>()
</script>

<template>
  <main class="mobile-page-scroll">
    <header class="mobile-page-header">
      <div class="mobile-page-heading">
        <h1>{{ title }}</h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="mobile-page-action">
        <slot name="action" />
      </div>
    </header>

    <div v-if="loading" class="mobile-page-state" data-testid="mobile-page-loading" role="status" :aria-label="loadingLabel">
      <slot name="loading"><span>{{ loadingLabel }}</span></slot>
    </div>
    <div v-else-if="error" class="mobile-page-state" data-testid="mobile-page-error" role="alert" aria-label="加载失败">
      <slot name="error" :error="error">
        <strong>加载失败</strong>
        <p>{{ error }}</p>
        <button type="button" data-testid="mobile-page-retry" @click="emit('retry')">
          <RefreshCw :size="17" />
          重试
        </button>
      </slot>
    </div>
    <div v-else-if="empty" class="mobile-page-state" data-testid="mobile-page-empty" role="status" aria-label="暂无内容">
      <slot name="empty">
        <strong>{{ emptyTitle }}</strong>
        <p>{{ emptyMessage }}</p>
        <button type="button" data-testid="mobile-page-refresh" @click="emit('refresh')">
          <RefreshCw :size="17" />
          刷新
        </button>
      </slot>
    </div>
    <section v-else class="mobile-page-content">
      <slot />
    </section>
  </main>
</template>

<style scoped>
.mobile-page-scroll {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 100%;
  padding: 16px var(--mobile-gutter, 16px);
}

.mobile-page-header {
  display: grid;
  min-height: 44px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  margin-bottom: 16px;
}

.mobile-page-heading {
  min-width: 0;
}

.mobile-page-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.3;
}

.mobile-page-heading p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.mobile-page-action {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.mobile-page-state {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  text-align: center;
}

.mobile-page-state strong {
  color: var(--text-primary);
  font-size: 16px;
}

.mobile-page-state p {
  max-width: 32rem;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.mobile-page-state button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 6px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
}

.mobile-page-content {
  min-width: 0;
}
</style>
