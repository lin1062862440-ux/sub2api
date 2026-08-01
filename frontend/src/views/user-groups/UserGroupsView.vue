<template>
  <AppLayout>
    <div class="space-y-6">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-semibold text-gray-950 dark:text-white">{{ t('userGroups.groups.title') }}</h1>
            <span
              v-if="!canManage"
              data-test="read-only-badge"
              class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800"
            >
              {{ t('userGroups.common.readOnly') }}
            </span>
          </div>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.description') }}</p>
        </div>
        <button v-if="canManage" data-test="create-group" type="button" class="btn btn-primary" @click="openCreate">
          <Icon name="plus" size="sm" class="mr-2" />
          {{ t('userGroups.groups.create') }}
        </button>
      </header>

      <section v-if="loadError" data-test="load-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm font-medium text-red-700 dark:text-red-300">{{ loadError }}</p>
        <button data-test="retry-groups" type="button" class="btn btn-secondary mt-4" @click="loadGroups">{{ t('userGroups.common.retry') }}</button>
      </section>

      <section v-else-if="loadingGroups" class="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div class="h-72 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-800"></div>
        <div class="h-72 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-800"></div>
      </section>

      <section v-else-if="groups.length === 0" class="rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-dark-600">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('userGroups.groups.empty') }}</h2>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ canManage ? t('userGroups.groups.emptyHint') : t('userGroups.common.noAccessibleGroupsHint') }}</p>
      </section>

      <section v-else class="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
        <div class="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[700px] text-left">
              <thead class="bg-gray-50 text-xs font-medium uppercase text-gray-500 dark:bg-dark-800 dark:text-gray-400">
                <tr>
                  <th class="px-5 py-3">{{ t('userGroups.groups.name') }}</th>
                  <th class="px-5 py-3">{{ t('userGroups.groups.members') }}</th>
                  <th class="px-5 py-3">{{ t('userGroups.groups.viewers') }}</th>
                  <th class="px-5 py-3">{{ t('userGroups.groups.updatedAt') }}</th>
                  <th v-if="canManage" class="px-5 py-3 text-right">{{ t('common.actions') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
                <tr
                  v-for="groupItem in groups"
                  :key="groupItem.id"
                  class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-dark-800/70"
                  :class="selectedGroup?.id === groupItem.id ? 'bg-primary-50/60 dark:bg-primary-950/20' : ''"
                  @click="selectGroup(groupItem)"
                >
                  <td class="px-5 py-4">
                    <p class="font-medium text-gray-950 dark:text-white">{{ groupItem.name }}</p>
                    <p class="mt-1 max-w-md truncate text-xs text-gray-500 dark:text-gray-400">{{ groupItem.description || '-' }}</p>
                  </td>
                  <td class="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{{ groupItem.member_count }}</td>
                  <td class="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{{ groupItem.viewer_count }}</td>
                  <td class="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{{ formatDate(groupItem.updated_at) }}</td>
                  <td v-if="canManage" class="px-5 py-4">
                    <div class="flex justify-end gap-2" @click.stop>
                      <button data-test="edit-group" type="button" class="btn btn-ghost btn-sm" @click="openEdit(groupItem)">{{ t('common.edit') }}</button>
                      <button data-test="archive-group" type="button" class="btn btn-ghost btn-sm text-red-600 dark:text-red-400" @click="requestArchive(groupItem)">{{ t('userGroups.groups.archive') }}</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div class="border-b border-gray-100 px-5 py-4 dark:border-dark-700">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-medium uppercase text-primary-600 dark:text-primary-400">{{ t('userGroups.groups.rosterTitle') }}</p>
                <h2 class="mt-1 truncate text-lg font-semibold text-gray-950 dark:text-white">{{ selectedGroup?.name }}</h2>
              </div>
              <span class="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-dark-700 dark:text-gray-300">{{ members.length }}</span>
            </div>
            <div v-if="canManage" class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn btn-secondary btn-sm" @click="openPeople('members')">{{ t('userGroups.groups.manageMembers') }}</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="openPeople('viewers')">{{ t('userGroups.groups.manageViewers') }}</button>
            </div>
          </div>
          <div v-if="loadingPeople" class="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
          <div v-else-if="members.length === 0" class="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.noMembers') }}</div>
          <ul v-else class="max-h-[56vh] divide-y divide-gray-100 overflow-y-auto dark:divide-dark-700">
            <li v-for="member in members" :key="member.user_id" class="flex items-center gap-3 px-5 py-3.5">
              <img :src="resolveAvatarUrl(member.avatar_url)" :alt="member.username || member.email" class="h-9 w-9 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5 dark:bg-dark-800 dark:ring-white/10" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ member.username || member.email }}</p>
                <p class="truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
              </div>
              <span class="text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ formatCurrency(member.balance) }}</span>
            </li>
          </ul>
        </aside>
      </section>
    </div>

    <UserGroupEditorDialog :show="editorOpen" :group="editingGroup" :saving="saving" @close="editorOpen = false" @save="saveGroup" />
    <UserGroupPeopleDialog
      :show="peopleOpen"
      :mode="peopleMode"
      :group-name="selectedGroup?.name || ''"
      :selected-ids="peopleMode === 'members' ? members.map(item => item.user_id) : viewers.map(item => item.user_id)"
      :saving="savingPeople"
      @close="peopleOpen = false"
      @save="savePeople"
    />
    <ConfirmDialog
      :show="archiveTarget !== null"
      :title="t('userGroups.groups.archive')"
      :message="t('userGroups.groups.archiveConfirm')"
      danger
      @confirm="archiveGroup"
      @cancel="archiveTarget = null"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { UserGroup, UserGroupMember, UserGroupMutation, UserGroupViewer } from '@/types/userGroups'
import UserGroupEditorDialog from './components/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from './components/UserGroupPeopleDialog.vue'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()
const canManage = computed(() => authStore.canManageUserGroups)

const groups = ref<UserGroup[]>([])
const selectedGroup = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const loadingGroups = ref(false)
const loadingPeople = ref(false)
const loadError = ref('')
const editorOpen = ref(false)
const editingGroup = ref<UserGroup | null>(null)
const saving = ref(false)
const archiveTarget = ref<UserGroup | null>(null)
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const savingPeople = ref(false)

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : t('common.loadFailed')
}

async function loadGroups() {
  loadingGroups.value = true
  loadError.value = ''
  try {
    groups.value = await userGroupAPI.list()
    const current = selectedGroup.value ? groups.value.find(item => item.id === selectedGroup.value?.id) : undefined
    selectedGroup.value = current ?? groups.value[0] ?? null
    if (selectedGroup.value) await loadPeople(selectedGroup.value.id)
    else {
      members.value = []
      viewers.value = []
    }
  } catch (error) {
    groups.value = []
    selectedGroup.value = null
    loadError.value = errorMessage(error)
  } finally {
    loadingGroups.value = false
  }
}

async function loadPeople(groupId: number) {
  loadingPeople.value = true
  try {
    const [memberRows, viewerRows] = await Promise.all([
      userGroupAPI.getMembers(groupId),
      canManage.value ? userGroupAPI.getViewers(groupId) : Promise.resolve([]),
    ])
    members.value = memberRows
    viewers.value = viewerRows
  } catch (error) {
    members.value = []
    viewers.value = []
    appStore.showError(errorMessage(error))
  } finally {
    loadingPeople.value = false
  }
}

async function selectGroup(group: UserGroup) {
  if (selectedGroup.value?.id === group.id) return
  selectedGroup.value = group
  await loadPeople(group.id)
}

function openCreate() {
  editingGroup.value = null
  editorOpen.value = true
}

function openEdit(group: UserGroup) {
  editingGroup.value = group
  editorOpen.value = true
}

async function saveGroup(payload: UserGroupMutation) {
  saving.value = true
  try {
    if (editingGroup.value) await userGroupAPI.update(editingGroup.value.id, payload)
    else await userGroupAPI.create(payload)
    editorOpen.value = false
    appStore.showSuccess(t('userGroups.groups.saveSuccess'))
    await loadGroups()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    saving.value = false
  }
}

function requestArchive(group: UserGroup) {
  archiveTarget.value = group
}

async function archiveGroup() {
  if (!archiveTarget.value) return
  try {
    await userGroupAPI.archive(archiveTarget.value.id)
    archiveTarget.value = null
    appStore.showSuccess(t('userGroups.groups.archiveSuccess'))
    await loadGroups()
  } catch (error) {
    appStore.showError(errorMessage(error))
  }
}

function openPeople(mode: 'members' | 'viewers') {
  peopleMode.value = mode
  peopleOpen.value = true
}

async function savePeople(userIds: number[]) {
  if (!selectedGroup.value) return
  savingPeople.value = true
  try {
    if (peopleMode.value === 'members') await userGroupAPI.replaceMembers(selectedGroup.value.id, userIds)
    else await userGroupAPI.replaceViewers(selectedGroup.value.id, userIds)
    peopleOpen.value = false
    appStore.showSuccess(t('userGroups.groups.peopleSaved'))
    await loadGroups()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPeople.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(value || 0)
}

onMounted(loadGroups)
</script>
