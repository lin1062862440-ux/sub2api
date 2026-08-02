<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  page: number
  pageCount: number
}>()

const emit = defineEmits<{
  change: [page: number]
}>()

const normalizedPageCount = computed(() => Math.max(1, Math.floor(props.pageCount) || 1))
const normalizedPage = computed(() => Math.min(normalizedPageCount.value, Math.max(1, Math.floor(props.page) || 1)))

function goTo(page: number) {
  const target = Math.min(normalizedPageCount.value, Math.max(1, page))
  if (target !== normalizedPage.value) emit('change', target)
}
</script>

<template>
  <nav class="mobile-pagination" aria-label="分页">
    <button
      type="button"
      data-testid="mobile-pagination-previous"
      :disabled="normalizedPage === 1"
      @click="goTo(normalizedPage - 1)"
    >
      <ChevronLeft :size="18" />
      上一页
    </button>
    <span data-testid="mobile-pagination-label" aria-live="polite">第 {{ normalizedPage }} / {{ normalizedPageCount }} 页</span>
    <button
      type="button"
      data-testid="mobile-pagination-next"
      :disabled="normalizedPage === normalizedPageCount"
      @click="goTo(normalizedPage + 1)"
    >
      下一页
      <ChevronRight :size="18" />
    </button>
  </nav>
</template>

<style scoped>
.mobile-pagination {
  display: grid;
  min-height: 44px;
  grid-template-columns: minmax(84px, 1fr) minmax(96px, auto) minmax(84px, 1fr);
  align-items: center;
  gap: 8px;
}

.mobile-pagination button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
}

.mobile-pagination button:disabled {
  opacity: 0.5;
}

.mobile-pagination span {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
