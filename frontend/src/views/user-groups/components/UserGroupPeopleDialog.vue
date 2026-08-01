<template>
  <BaseDialog
    :show="show"
    :title="mode === 'members' ? t('userGroups.groups.manageMembers') : t('userGroups.groups.manageViewers')"
    width="wide"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/60">
        <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ groupName }}</p>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {{ mode === 'members' ? t('userGroups.groups.members') : t('userGroups.groups.viewers') }} · {{ selected.size }}
        </p>
      </div>

      <div class="flex gap-2">
        <input
          v-model="search"
          data-test="people-search"
          class="input"
          type="search"
          :placeholder="t('admin.users.searchUsers')"
          @keyup.enter="loadUsers"
        />
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadUsers">
          <Icon name="search" size="sm" />
          <span class="sr-only">{{ t('common.search') }}</span>
        </button>
      </div>

      <div class="max-h-[52vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-700">
        <div v-if="loading" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="loadError" class="px-4 py-10 text-center">
          <p class="text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>
          <button type="button" class="btn btn-secondary mt-3" @click="loadUsers">{{ t('common.retry') }}</button>
        </div>
        <div v-else-if="users.length === 0" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('common.noOptionsFound') }}
        </div>
        <label
          v-for="user in users"
          v-else
          :key="user.id"
          class="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/60"
        >
          <input
            :data-test="`person-${user.id}`"
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-800"
            :checked="selected.has(user.id)"
            @change="toggle(user.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-gray-900 dark:text-white">{{ user.username || user.email }}</span>
            <span class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ user.email }} · #{{ user.id }}</span>
          </span>
          <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {{ user.status }}
          </span>
        </label>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ selected.size }} {{ t('common.selected') }}</span>
        <div class="flex gap-3">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button type="button" class="btn btn-primary" data-test="save-people" :disabled="saving" @click="save">
            <Icon v-if="saving" name="refresh" size="sm" class="mr-2 animate-spin" />
            {{ t('common.save') }}
          </button>
        </div>
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
  mode: 'members' | 'viewers'
  groupName: string
  selectedIds: number[]
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [userIds: number[]]
}>()

const { t } = useI18n()
const users = ref<AdminUser[]>([])
const selected = ref(new Set<number>())
const search = ref('')
const loading = ref(false)
const loadError = ref('')

watch(
  () => props.show,
  (show) => {
    if (!show) return
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
    const result = await usersAPI.list(1, 100, {
      search: search.value.trim() || undefined,
    })
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
  emit('save', Array.from(selected.value).sort((a, b) => a - b))
}
</script>
