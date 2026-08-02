<template>
  <div class="flex flex-col gap-4 border-y border-gray-200 bg-white px-4 py-3.5 dark:border-dark-700 dark:bg-dark-900 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div class="flex min-w-0 items-center gap-3">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
        {{ selectedGroup?.name.trim().slice(0, 1) || '#' }}
      </span>
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-sm font-semibold text-gray-950 dark:text-white">{{ selectedGroup?.name || t('userGroups.common.selectGroup') }}</p>
          <span
            v-if="selectedGroup"
            class="hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex"
            :class="canManage
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'"
          >
            {{ canManage ? t('userGroups.common.administrator') : t('userGroups.common.readOnly') }}
          </span>
        </div>
        <label class="mt-0.5 block">
          <span class="sr-only">{{ t('userGroups.common.selectGroup') }}</span>
          <select
            data-test="group-select"
            class="block max-w-full border-0 bg-transparent p-0 pr-6 text-xs text-gray-600 focus:ring-0 dark:text-gray-300"
            :value="modelValue ?? ''"
            :disabled="loading || groups.length === 0"
            @change="selectGroup"
          >
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
        </label>
      </div>
    </div>
    <div v-if="$slots.controls" class="flex flex-wrap items-end gap-2 sm:justify-end">
      <slot name="controls" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserGroup } from '@/types/userGroups'

const props = defineProps<{
  groups: UserGroup[]
  modelValue: number | null
  canManage: boolean
  loading?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [groupId: number] }>()
const { t } = useI18n()
const selectedGroup = computed(() => props.groups.find(group => group.id === props.modelValue) ?? null)

function selectGroup(event: Event) {
  const groupId = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(groupId) && groupId > 0) emit('update:modelValue', groupId)
}
</script>
