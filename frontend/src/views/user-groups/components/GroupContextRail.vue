<template>
  <div class="flex flex-col gap-4 border-y border-gray-200 bg-white/70 px-4 py-4 dark:border-dark-700 dark:bg-dark-900/50 sm:flex-row sm:items-center sm:px-5">
    <div class="min-w-0 flex-1">
      <label class="mb-1.5 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {{ t('userGroups.common.selectGroup') }}
      </label>
      <select
        data-test="group-select"
        class="input max-w-md"
        :value="modelValue ?? ''"
        :disabled="loading || groups.length === 0"
        @change="selectGroup"
      >
        <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
      </select>
    </div>
    <div v-if="selectedGroup" class="flex flex-wrap items-center gap-2 sm:justify-end">
      <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-dark-700 dark:text-gray-200">
        {{ t('userGroups.common.memberCount', { count: selectedGroup.member_count }) }}
      </span>
      <span
        class="rounded-full px-3 py-1 text-xs font-medium"
        :class="canManage
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'"
      >
        {{ canManage ? t('userGroups.common.administrator') : t('userGroups.common.readOnly') }}
      </span>
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
