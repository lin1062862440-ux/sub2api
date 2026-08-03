<template>
  <BaseDialog
    :show="show"
    :title="t('userGroups.promptSettings.title')"
    width="wide"
    close-on-click-outside
    @close="emit('close')"
  >
    <div class="space-y-5">
      <section class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
        <div class="flex items-start gap-4 px-5 py-5">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            <Icon name="shield" size="md" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-950 dark:text-white">{{ groupName }}</p>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.promptSettings.captureDescription') }}</p>
              </div>
              <button
                data-test="prompt-capture-toggle"
                type="button"
                role="switch"
                :aria-checked="enabled"
                class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                :class="enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'"
                @click="enabled = !enabled"
              >
                <span class="h-5 w-5 rounded-full bg-white shadow-sm transition-transform" :class="enabled ? 'translate-x-6' : 'translate-x-1'" />
                <span class="sr-only">{{ t('userGroups.promptSettings.capture') }}</span>
              </button>
            </div>
            <div class="mt-4 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span class="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-dark-800">{{ t('userGroups.promptSettings.latestTurnOnly') }}</span>
              <span class="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-dark-800">{{ t('userGroups.promptSettings.redacted') }}</span>
              <span class="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-dark-800">{{ t('userGroups.promptSettings.retention') }}</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-end justify-between gap-4">
          <div>
            <h4 class="text-sm font-semibold text-gray-950 dark:text-white">{{ t('userGroups.promptSettings.viewers') }}</h4>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.promptSettings.viewersDescription') }}</p>
          </div>
          <span class="shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400">{{ selected.size }} {{ t('common.selected') }}</span>
        </div>

        <div class="flex gap-2">
          <input
            v-model="search"
            data-test="prompt-viewer-search"
            class="input"
            type="search"
            :placeholder="t('admin.users.searchUsers')"
            @keyup.enter="loadUsers"
          />
          <button type="button" class="btn btn-secondary !px-3" :disabled="loading" :title="t('common.search')" @click="loadUsers">
            <Icon name="search" size="sm" />
          </button>
        </div>

        <div class="mt-3 max-h-[42vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-700">
          <div v-if="loading" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
          <div v-else-if="loadError" class="px-4 py-10 text-center">
            <p class="text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>
            <button type="button" class="btn btn-secondary mt-3" @click="loadUsers">{{ t('common.retry') }}</button>
          </div>
          <div v-else-if="users.length === 0" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.noOptionsFound') }}</div>
          <label
            v-for="user in users"
            v-else
            :key="user.id"
            class="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-800/70"
          >
            <input
              :data-test="`prompt-viewer-${user.id}`"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-800"
              :checked="selected.has(user.id)"
              @change="toggle(user.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-gray-900 dark:text-white">{{ user.username || user.email }}</span>
              <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ user.email }} · #{{ user.id }}</span>
            </span>
          </label>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button data-test="save-prompt-settings" type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <Icon v-if="saving" name="refresh" size="sm" class="mr-2 animate-spin" />
          {{ t('common.save') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { usersAPI } from '@/api/admin/users'
import type { AdminUser } from '@/types'

const props = defineProps<{
  show: boolean
  groupName: string
  captureEnabled: boolean
  selectedIds: number[]
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [payload: { enabled: boolean; userIds: number[] }]
}>()

const { t } = useI18n()
const users = ref<AdminUser[]>([])
const selected = ref(new Set<number>())
const enabled = ref(false)
const search = ref('')
const loading = ref(false)
const loadError = ref('')

watch(
  () => props.show,
  (show) => {
    if (!show) return
    enabled.value = props.captureEnabled
    selected.value = new Set(props.selectedIds)
    search.value = ''
    void loadUsers()
  },
  { immediate: true },
)

async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await usersAPI.list(1, 100, { search: search.value.trim() || undefined })
    users.value = result.items
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

function toggle(userId: number, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(userId)
  else next.delete(userId)
  selected.value = next
}

function save() {
  if (props.saving) return
  emit('save', {
    enabled: enabled.value,
    userIds: Array.from(selected.value).sort((a, b) => a - b),
  })
}
</script>
