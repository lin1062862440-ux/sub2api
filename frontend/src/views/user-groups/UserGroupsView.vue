<template>
  <AppLayout>
    <UserGroupWorkspaceShell>
      <template #actions>
        <button v-if="canManage" data-test="create-group" type="button" class="btn btn-primary" @click="openCreate">
          <Icon name="plus" size="sm" class="mr-2" />
          {{ t('userGroups.groups.create') }}
        </button>
      </template>

      <section v-if="loadError" data-test="load-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm font-medium text-red-700 dark:text-red-300">{{ loadError }}</p>
        <button data-test="retry-groups" type="button" class="btn btn-secondary mt-4" @click="loadGroups">{{ t('userGroups.common.retry') }}</button>
      </section>

      <section v-else-if="loadingGroups" class="overflow-hidden border-y border-gray-200 dark:border-dark-700">
        <div v-for="index in 5" :key="index" class="flex animate-pulse items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-dark-700">
          <div class="h-9 w-9 rounded-lg bg-gray-100 dark:bg-dark-800"></div>
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-3 w-32 rounded bg-gray-100 dark:bg-dark-800"></div>
            <div class="h-2.5 w-56 max-w-full rounded bg-gray-100 dark:bg-dark-800"></div>
          </div>
          <div class="hidden h-7 w-48 rounded bg-gray-100 dark:bg-dark-800 sm:block"></div>
        </div>
      </section>

      <section v-else-if="groups.length === 0" class="rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-dark-600">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ canManage ? t('userGroups.groups.empty') : t('userGroups.common.noAccessibleGroups') }}</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ canManage ? t('userGroups.groups.emptyHint') : t('userGroups.common.noAccessibleGroupsHint') }}</p>
      </section>

      <section v-else data-test="group-directory" class="min-w-0">
        <div class="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
          <label class="relative block w-full sm:max-w-sm">
            <span class="sr-only">{{ t('userGroups.groups.search') }}</span>
            <Icon name="search" size="sm" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input v-model="search" data-test="group-search" type="search" class="input pl-9" :placeholder="t('userGroups.groups.searchPlaceholder')" />
          </label>
          <p class="shrink-0 text-sm tabular-nums text-gray-600 dark:text-gray-300">
            {{ t('userGroups.groups.resultCount', { count: filteredGroups.length }) }}
          </p>
        </div>

        <div v-if="filteredGroups.length === 0" data-test="group-search-empty" class="border-b border-gray-200 px-5 py-14 text-center dark:border-dark-700">
          <p class="text-sm font-medium text-gray-900 dark:text-white">{{ t('userGroups.groups.noSearchResults') }}</p>
          <button type="button" class="btn btn-ghost btn-sm mt-3" @click="search = ''">{{ t('userGroups.groups.clearSearch') }}</button>
        </div>

        <div v-else class="overflow-hidden border-b border-gray-200 dark:border-dark-700">
          <div class="hidden xl:block">
            <table class="w-full table-fixed text-left">
              <thead class="bg-gray-50 text-xs font-medium text-gray-600 dark:bg-dark-800 dark:text-gray-300">
                <tr>
                  <th class="w-[34%] px-5 py-3">{{ t('userGroups.groups.name') }}</th>
                  <th class="w-[10%] px-4 py-3">{{ t('userGroups.groups.members') }}</th>
                  <th class="w-[11%] px-4 py-3">{{ t('userGroups.groups.viewers') }}</th>
                  <th class="w-[15%] px-4 py-3">{{ t('userGroups.groups.updatedAt') }}</th>
                  <th class="w-[30%] px-5 py-3 text-right">{{ t('common.actions') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
                <tr v-for="groupItem in filteredGroups" :key="groupItem.id" class="hover:bg-gray-50/80 dark:hover:bg-dark-800/60">
                  <td class="px-5 py-4">
                    <div class="flex min-w-0 items-center gap-3">
                      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        {{ groupMonogram(groupItem) }}
                      </span>
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-gray-950 dark:text-white">{{ groupItem.name }}</p>
                        <p class="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">{{ groupItem.description || '-' }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-4 text-sm tabular-nums text-gray-700 dark:text-gray-200">{{ groupItem.member_count }}</td>
                  <td class="px-4 py-4 text-sm tabular-nums text-gray-700 dark:text-gray-200">{{ groupItem.viewer_count }}</td>
                  <td class="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{{ formatDate(groupItem.updated_at) }}</td>
                  <td class="px-5 py-4">
                    <GroupActions :group="groupItem" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-dark-700 xl:hidden">
            <article v-for="groupItem in filteredGroups" :key="groupItem.id" class="px-4 py-4 sm:px-5">
              <div class="flex min-w-0 items-start gap-3">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  {{ groupMonogram(groupItem) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="break-words text-sm font-semibold text-gray-950 dark:text-white">{{ groupItem.name }}</p>
                  <p class="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">{{ groupItem.description || '-' }}</p>
                  <dl class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                    <div class="flex gap-1.5"><dt>{{ t('userGroups.groups.members') }}</dt><dd class="font-medium tabular-nums text-gray-900 dark:text-white">{{ groupItem.member_count }}</dd></div>
                    <div class="flex gap-1.5"><dt>{{ t('userGroups.groups.viewers') }}</dt><dd class="font-medium tabular-nums text-gray-900 dark:text-white">{{ groupItem.viewer_count }}</dd></div>
                    <div class="flex gap-1.5"><dt>{{ t('userGroups.groups.updatedAt') }}</dt><dd>{{ formatDate(groupItem.updated_at) }}</dd></div>
                  </dl>
                </div>
              </div>
              <div class="mt-3 border-t border-gray-100 pt-3 dark:border-dark-700">
                <GroupActions :group="groupItem" justify="start" />
              </div>
            </article>
          </div>
        </div>
      </section>
    </UserGroupWorkspaceShell>

    <UserGroupEditorDialog :show="editorOpen" :group="editingGroup" :saving="saving" @close="editorOpen = false" @save="saveGroup" />
    <UserGroupPeopleDialog
      :show="peopleOpen"
      :mode="peopleMode"
      :group-name="peopleTarget?.name || ''"
      :selected-ids="peopleMode === 'members' ? members.map(item => item.user_id) : viewers.map(item => item.user_id)"
      :saving="savingPeople"
      @close="peopleOpen = false"
      @save="savePeople"
    />
    <UserGroupPromptSettingsDialog
      :show="promptSettingsOpen"
      :group-name="promptSettingsTarget?.name || ''"
      :capture-enabled="Boolean(promptSettingsTarget?.prompt_capture_enabled)"
      :selected-ids="promptViewers.map(item => item.user_id)"
      :saving="savingPromptSettings"
      @close="promptSettingsOpen = false"
      @save="savePromptSettings"
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
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import type { UserGroup, UserGroupMember, UserGroupMutation, UserGroupViewer } from '@/types/userGroups'
import UserGroupWorkspaceShell from './components/UserGroupWorkspaceShell.vue'
import UserGroupEditorDialog from './components/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from './components/UserGroupPeopleDialog.vue'
import UserGroupPromptSettingsDialog from './components/UserGroupPromptSettingsDialog.vue'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()
const canManage = computed(() => authStore.canManageUserGroups)

const groups = ref<UserGroup[]>([])
const search = ref('')
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const loadingGroups = ref(false)
const loadError = ref('')
const editorOpen = ref(false)
const editingGroup = ref<UserGroup | null>(null)
const saving = ref(false)
const archiveTarget = ref<UserGroup | null>(null)
const peopleTarget = ref<UserGroup | null>(null)
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const savingPeople = ref(false)
const promptSettingsTarget = ref<UserGroup | null>(null)
const promptSettingsOpen = ref(false)
const promptViewers = ref<UserGroupViewer[]>([])
const savingPromptSettings = ref(false)

const filteredGroups = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return groups.value
  return groups.value.filter(group => `${group.name} ${group.description || ''}`.toLocaleLowerCase().includes(query))
})

const GroupActions = defineComponent({
  props: {
    group: { type: Object as () => UserGroup, required: true },
    justify: { type: String as () => 'start' | 'end', default: 'end' },
  },
  setup(props) {
    return () => h('div', { class: ['flex flex-wrap items-center gap-1', props.justify === 'end' ? 'justify-end' : 'justify-start'] }, [
      h(RouterLink, {
        to: { name: 'UserGroupSubscriptions', query: { group_id: String(props.group.id) } },
        'data-test': `open-subscriptions-${props.group.id}`,
        class: 'btn btn-ghost btn-sm',
      }, () => t('userGroups.groups.openSubscriptions')),
      h(RouterLink, {
        to: { name: 'UserGroupUsage', query: { group_id: String(props.group.id) } },
        'data-test': `open-usage-${props.group.id}`,
        class: 'btn btn-ghost btn-sm',
      }, () => t('userGroups.groups.openUsage')),
      ...(canManage.value ? [
        actionButton('users', t('userGroups.groups.manageMembers'), `manage-members-${props.group.id}`, () => openPeople(props.group, 'members')),
        actionButton('eye', t('userGroups.groups.manageViewers'), `manage-viewers-${props.group.id}`, () => openPeople(props.group, 'viewers')),
        actionButton('shield', t('userGroups.promptSettings.open'), `manage-prompt-${props.group.id}`, () => openPromptSettings(props.group), false, Boolean(props.group.prompt_capture_enabled)),
        actionButton('edit', t('common.edit'), 'edit-group', () => openEdit(props.group)),
        actionButton('trash', t('userGroups.groups.archive'), 'archive-group', () => requestArchive(props.group), true),
      ] : []),
    ])
  },
})

function actionButton(icon: 'users' | 'eye' | 'shield' | 'edit' | 'trash', label: string, dataTest: string, action: () => void, danger = false, active = false) {
  return h('button', {
    type: 'button',
    title: label,
    'aria-label': label,
    'data-test': dataTest,
    class: ['btn btn-ghost btn-sm !px-2', danger ? 'text-red-600 dark:text-red-400' : '', active ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : ''],
    onClick: action,
  }, [h(Icon, { name: icon, size: 'sm' })])
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : t('common.loadFailed')
}

async function loadGroups() {
  loadingGroups.value = true
  loadError.value = ''
  try {
    groups.value = await userGroupAPI.list()
  } catch (error) {
    groups.value = []
    loadError.value = errorMessage(error)
  } finally {
    loadingGroups.value = false
  }
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

async function openPeople(group: UserGroup, mode: 'members' | 'viewers') {
  peopleTarget.value = group
  peopleMode.value = mode
  try {
    const [memberRows, viewerRows] = await Promise.all([
      userGroupAPI.getMembers(group.id),
      mode === 'viewers' ? userGroupAPI.getViewers(group.id) : Promise.resolve([]),
    ])
    members.value = memberRows
    viewers.value = viewerRows
    peopleOpen.value = true
  } catch (error) {
    members.value = []
    viewers.value = []
    appStore.showError(errorMessage(error))
  }
}

async function savePeople(userIds: number[]) {
  if (!peopleTarget.value) return
  savingPeople.value = true
  try {
    if (peopleMode.value === 'members') await userGroupAPI.replaceMembers(peopleTarget.value.id, userIds)
    else await userGroupAPI.replaceViewers(peopleTarget.value.id, userIds)
    peopleOpen.value = false
    appStore.showSuccess(t('userGroups.groups.peopleSaved'))
    await loadGroups()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPeople.value = false
  }
}

async function openPromptSettings(group: UserGroup) {
  promptSettingsTarget.value = group
  try {
    promptViewers.value = await userGroupAPI.getPromptViewers(group.id)
    promptSettingsOpen.value = true
  } catch (error) {
    promptViewers.value = []
    appStore.showError(errorMessage(error))
  }
}

async function savePromptSettings(payload: { enabled: boolean; userIds: number[] }) {
  if (!promptSettingsTarget.value) return
  savingPromptSettings.value = true
  try {
    await Promise.all([
      userGroupAPI.setPromptCapture(promptSettingsTarget.value.id, payload.enabled),
      userGroupAPI.replacePromptViewers(promptSettingsTarget.value.id, payload.userIds),
    ])
    promptSettingsOpen.value = false
    appStore.showSuccess(t('userGroups.promptSettings.saveSuccess'))
    await loadGroups()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPromptSettings.value = false
  }
}

function groupMonogram(group: UserGroup) {
  return group.name.trim().slice(0, 1) || '#'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

onMounted(loadGroups)
</script>
