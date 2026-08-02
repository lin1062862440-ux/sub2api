<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { FolderPlus, LoaderCircle, Save, X } from '@lucide/vue'

import type { UserGroup, UserGroupMutation } from '@/api/user-groups'

const props = defineProps<{
  modelValue: boolean
  group?: UserGroup | null
  saving?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [payload: UserGroupMutation]
}>()

const form = reactive({ name: '', description: '' })

watch(() => [props.modelValue, props.group] as const, ([open]) => {
  if (!open) return
  form.name = props.group?.name ?? ''
  form.description = props.group?.description ?? ''
}, { immediate: true })

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

function submit() {
  const name = form.name.trim()
  if (!name) return
  emit('save', { name, description: form.description.trim() })
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
}

onMounted(() => document.addEventListener('keydown', keydown))
onBeforeUnmount(() => document.removeEventListener('keydown', keydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="ug-dialog">
      <div v-if="modelValue" class="ug-backdrop" data-testid="user-group-editor" @mousedown.self="close">
        <section class="ug-dialog ug-dialog-compact" role="dialog" aria-modal="true" aria-labelledby="user-group-dialog-title">
          <header class="ug-dialog-head">
            <span><FolderPlus :size="20" /></span>
            <div><h2 id="user-group-dialog-title">{{ group ? '编辑用户组' : '新建用户组' }}</h2><p>{{ group ? '更新组织名称和说明' : '创建后可以继续添加成员与查看者' }}</p></div>
            <button type="button" aria-label="关闭" :disabled="saving" @click="close"><X :size="18" /></button>
          </header>
          <form class="ug-form" data-testid="user-group-editor-form" @submit.prevent="submit">
            <label><span>用户组名称</span><input v-model="form.name" data-testid="user-group-name" maxlength="100" placeholder="例如：研发团队" autofocus /></label>
            <label><span>说明</span><textarea v-model="form.description" data-testid="user-group-description" rows="3" placeholder="说明这个用户组的用途" /></label>
            <p class="ug-info">用户组只负责组织人员和汇总数据。计费倍率、平台类型与额度限制仍由“分组管理”维护。</p>
            <p v-if="error" class="ug-error" role="alert">{{ error }}</p>
            <footer><button type="button" class="secondary" @click="close">取消</button><button type="submit" :disabled="saving || !form.name.trim()"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Save v-else :size="16" />{{ saving ? '保存中' : group ? '保存变更' : '创建用户组' }}</button></footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
