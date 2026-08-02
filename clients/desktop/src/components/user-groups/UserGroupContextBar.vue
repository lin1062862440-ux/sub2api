<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck } from '@lucide/vue'
import type { UserGroup } from '@/api/user-groups'

const props = defineProps<{ groups: UserGroup[]; modelValue: number | null; canManage: boolean; loading?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: number] }>()
const selected = computed(() => props.groups.find((group) => group.id === props.modelValue) ?? null)

function change(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isInteger(value) && value > 0) emit('update:modelValue', value)
}
</script>

<template>
  <section class="ug-context">
    <div class="ug-context-group"><span>{{ selected?.name.trim().slice(0, 1) || '#' }}</span><div><strong>{{ selected?.name || '选择用户组' }}</strong><select :value="modelValue ?? ''" :disabled="loading || !groups.length" data-testid="user-group-select" @change="change"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></div></div>
    <div class="ug-context-access"><ShieldCheck :size="15" /><span>{{ canManage ? '管理员权限' : '只读访问' }}</span></div>
    <slot />
  </section>
</template>
