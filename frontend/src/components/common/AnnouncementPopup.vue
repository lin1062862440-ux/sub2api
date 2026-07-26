<template>
  <Teleport to="body">
    <Transition name="popup-fade">
      <div
        v-if="displayedAnnouncement"
        class="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-gray-950/60 px-4 py-6 backdrop-blur-sm sm:py-[8vh]"
      >
        <div
          class="w-full max-w-[640px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_70px_rgb(15_23_42/0.24)] dark:border-dark-700 dark:bg-dark-900 dark:shadow-black/30"
          @click.stop
        >
          <div class="border-b border-gray-100 px-5 py-5 dark:border-dark-700 sm:px-6">
            <div class="flex items-start gap-4">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-500/15 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20">
                <Icon name="bell" size="md" />
              </div>

              <div class="min-w-0 flex-1">
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 ring-1 ring-primary-500/15 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-400/20">
                    <span class="h-1.5 w-1.5 rounded-full bg-primary-600 dark:bg-primary-300"></span>
                    {{ t('announcements.unread') }}
                  </span>
                  <span class="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-300">
                    <Icon name="clock" size="xs" />
                    <time>{{ formatRelativeWithDateTime(displayedAnnouncement.created_at) }}</time>
                  </span>
                </div>

                <h2 class="text-xl font-semibold leading-snug text-gray-950 dark:text-white sm:text-2xl">
                  {{ displayedAnnouncement.title }}
                </h2>
              </div>
            </div>
          </div>

          <div class="max-h-[54vh] overflow-y-auto px-5 py-6 dark:bg-dark-900 sm:px-6">
            <div
              class="markdown-body prose prose-sm max-w-none dark:prose-invert"
              v-html="renderedContent"
            ></div>
          </div>

          <div class="border-t border-gray-100 bg-gray-50 px-5 py-4 dark:border-dark-700 dark:bg-dark-950/50 sm:px-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div v-if="!preview" class="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-300">
                <Icon name="infoCircle" size="sm" />
                <span>{{ t('announcements.markReadHint') }}</span>
              </div>

              <button
                @click="handleDismiss"
                data-testid="announcement-popup-dismiss"
                class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 focus:ring-offset-gray-50 active:bg-primary-800 dark:bg-primary-500 dark:hover:bg-primary-400 dark:focus:ring-primary-400/40 dark:focus:ring-offset-dark-950"
              >
                <Icon :name="preview ? 'x' : 'check'" size="sm" />
                {{ preview ? t('common.close') : t('announcements.markRead') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAnnouncementStore } from '@/stores/announcements'
import { formatRelativeWithDateTime } from '@/utils/format'
import Icon from '@/components/icons/Icon.vue'
import type { Announcement, UserAnnouncement } from '@/types'
import '@/styles/announcement-markdown.css'

type PreviewAnnouncement = Pick<Announcement | UserAnnouncement, 'title' | 'content' | 'created_at'>

const props = withDefaults(defineProps<{
  announcement?: PreviewAnnouncement | null
  preview?: boolean
}>(), {
  announcement: null,
  preview: false,
})

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const announcementStore = useAnnouncementStore()
const displayedAnnouncement = computed(() => (
  props.preview ? props.announcement : announcementStore.currentPopup
))

marked.setOptions({
  breaks: true,
  gfm: true,
})

const renderedContent = computed(() => {
  const content = displayedAnnouncement.value?.content
  if (!content) return ''
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
})

function handleDismiss() {
  if (props.preview) {
    emit('close')
    return
  }
  announcementStore.dismissPopup()
}

watch(
  displayedAnnouncement,
  (popup) => {
    document.body.style.overflow = popup ? 'hidden' : ''
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<style scoped>
.popup-fade-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-fade-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}

.popup-fade-enter-from > div {
  transform: scale(0.97) translateY(-8px);
  opacity: 0;
}

.popup-fade-leave-to > div {
  transform: scale(0.98) translateY(-4px);
  opacity: 0;
}

/* Scrollbar Styling */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #cbd5e1, #94a3b8);
  border-radius: 4px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
  background: #475569;
}

@media (prefers-reduced-motion: reduce) {
  .popup-fade-enter-active,
  .popup-fade-leave-active {
    transition: opacity 0.01ms linear;
  }

  .popup-fade-enter-from > div,
  .popup-fade-leave-to > div {
    transform: none;
  }
}
</style>
