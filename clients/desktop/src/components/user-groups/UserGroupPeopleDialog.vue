<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, LoaderCircle, Search, UserRoundCheck, X } from '@lucide/vue'

import { listAdminUsers } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'
import type { UserGroupMember, UserGroupViewer } from '@/api/user-groups'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatCost } from '@/lib/format'

type SelectedPerson = UserGroupMember | UserGroupViewer

const props = defineProps<{
  modelValue: boolean
  mode: 'members' | 'viewers'
  groupName: string
  selectedPeople: SelectedPerson[]
  saving?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [ids: number[]]
}>()

const users = ref<AdminUser[]>([])
const selected = ref<number[]>([])
const search = ref('')
const loading = ref(false)
const loadError = ref('')

const candidates = computed(() => {
  const existing = new Map<number, AdminUser>()
  props.selectedPeople.forEach((person) => existing.set(person.user_id, {
    id: person.user_id,
    username: person.username,
    email: person.email,
    avatar_url: person.avatar_url,
    role: 'user',
    balance: 'balance' in person ? person.balance : 0,
    concurrency: 0,
    status: person.status === 'disabled' ? 'disabled' : 'active',
    allowed_groups: [],
    notes: '',
    created_at: '',
    updated_at: '',
  }))
  users.value.forEach((user) => existing.set(user.id, user))
  return [...existing.values()]
})

async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await listAdminUsers({ page: 1, page_size: 100, search: search.value.trim() || undefined })
    users.value = result.items
  } catch (caught) {
    loadError.value = caught instanceof Error && caught.message ? caught.message : '用户列表加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  selected.value = props.selectedPeople.map((person) => person.user_id)
  search.value = ''
  void loadUsers()
}, { immediate: true })

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

function toggle(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((value) => value !== id)
    : [...selected.value, id]
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
      <div v-if="modelValue" class="ug-backdrop" data-testid="user-group-people-dialog" @mousedown.self="close">
        <section class="ug-dialog ug-dialog-wide" role="dialog" aria-modal="true">
          <header class="ug-dialog-head">
            <span><UserRoundCheck :size="20" /></span>
            <div><h2>管理{{ mode === 'members' ? '成员' : '查看者' }}</h2><p>{{ groupName }} · 已选择 {{ selected.length }} 人</p></div>
            <button type="button" aria-label="关闭" :disabled="saving" @click="close"><X :size="18" /></button>
          </header>
          <div class="ug-people-body">
            <form class="ug-people-search" @submit.prevent="loadUsers"><Search :size="16" /><input v-model="search" data-testid="people-search" placeholder="搜索用户名称、邮箱或 ID" /><button type="submit">搜索</button></form>
            <p v-if="loadError || error" class="ug-error">{{ loadError || error }}</p>
            <div v-if="loading" class="ug-people-loading"><i v-for="n in 6" :key="n" /></div>
            <div v-else class="ug-people-grid">
              <button v-for="user in candidates" :key="user.id" type="button" class="ug-person" :class="{ selected: selected.includes(user.id) }" :aria-pressed="selected.includes(user.id)" @click="toggle(user.id)">
                <UserAvatar :name="user.username" :src="user.avatar_url" />
                <span><strong>{{ user.username || user.email }}</strong><small>{{ user.email }} · #{{ user.id }}</small><em>{{ formatCost(user.balance) }} · {{ user.status === 'disabled' ? '已停用' : '正常' }}</em></span>
                <i><Check :size="12" /></i>
              </button>
              <p v-if="!candidates.length" class="ug-people-empty">没有符合条件的用户</p>
            </div>
            <p class="ug-info">{{ mode === 'members' ? '成员会进入该用户组的订阅与用量统计。' : '查看者仅获得只读访问权限，不计入成员订阅和用量统计。' }}</p>
          </div>
          <footer class="ug-dialog-actions"><button type="button" class="secondary" @click="close">取消</button><button type="button" :disabled="saving" data-testid="save-people" @click="emit('save', selected)"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Check v-else :size="16" />{{ saving ? '保存中' : `保存${mode === 'members' ? '成员' : '查看者'}` }}</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
