<template>
  <BaseDialog
    :show="show"
    :title="group ? t('userGroups.groups.edit') : t('userGroups.groups.create')"
    width="normal"
    @close="emit('close')"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('userGroups.groups.name') }}
        </label>
        <input
          v-model="name"
          data-test="group-name-input"
          class="input"
          maxlength="100"
          required
          :placeholder="t('userGroups.groups.namePlaceholder')"
        />
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('userGroups.groups.descriptionLabel') }}
        </label>
        <textarea
          v-model="description"
          data-test="group-description-input"
          class="input min-h-28 resize-y"
          :placeholder="t('userGroups.groups.descriptionPlaceholder')"
        ></textarea>
      </div>
    </form>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          data-test="save-group"
          :disabled="saving || !name.trim()"
          @click="submit"
        >
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
import type { UserGroup, UserGroupMutation } from '@/types/userGroups'

const props = defineProps<{
  show: boolean
  group: UserGroup | null
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [payload: UserGroupMutation]
}>()

const { t } = useI18n()
const name = ref('')
const description = ref('')

watch(
  () => [props.show, props.group] as const,
  ([show, group]) => {
    if (!show) return
    name.value = group?.name ?? ''
    description.value = group?.description ?? ''
  },
  { immediate: true },
)

function submit() {
  const normalizedName = name.value.trim()
  if (!normalizedName || props.saving) return
  emit('save', { name: normalizedName, description: description.value.trim() })
}
</script>
