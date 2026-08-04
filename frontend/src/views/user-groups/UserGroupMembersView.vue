<template>
  <AppLayout>
    <UserGroupDetailShell :group="group" :read-only="!canManage">
      <template #actions>
        <button
          v-if="canManage"
          data-test="manage-members"
          type="button"
          class="btn btn-primary"
          :disabled="loadingData"
          @click="openPeople('members')"
        >
          <Icon name="users" size="sm" class="mr-2" />
          {{ t('userGroups.groups.manageMembers') }}
        </button>
        <button
          type="button"
          class="btn btn-secondary !px-2.5"
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          :disabled="loadingData"
          @click="loadGroupData"
        >
          <Icon name="refresh" size="sm" :class="loadingData ? 'animate-spin' : ''" />
        </button>
      </template>

      <section v-if="dataError" data-test="member-detail-error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <p class="text-sm text-red-700 dark:text-red-300">{{ dataError }}</p>
        <button class="btn btn-secondary mt-4" type="button" @click="loadGroupData">{{ t('userGroups.common.retry') }}</button>
      </section>

      <template v-else-if="group">
        <section data-test="member-summary" class="grid grid-cols-3 divide-x divide-gray-200 border-y border-gray-200 dark:divide-dark-700 dark:border-dark-700">
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.members') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ group.member_count }}</p>
          </div>
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.viewers') }}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ group.viewer_count }}</p>
          </div>
          <div class="px-4 py-4 sm:px-5">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.promptCapture') }}</p>
            <p class="mt-2 text-sm font-semibold" :class="group.prompt_capture_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'">
              {{ group.prompt_capture_enabled ? t('common.enabled') : t('common.disabled') }}
            </p>
          </div>
        </section>

        <div v-if="canManage" class="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-dark-700">
          <button data-test="manage-viewers" type="button" class="btn btn-secondary" @click="openPeople('viewers')">
            <Icon name="eye" size="sm" class="mr-2" />
            {{ t('userGroups.groups.manageViewers') }}
          </button>
          <button data-test="manage-prompt" type="button" class="btn btn-secondary" @click="openPromptSettings">
            <Icon name="shield" size="sm" class="mr-2" />
            {{ t('userGroups.promptSettings.open') }}
          </button>
          <button data-test="edit-group" type="button" class="btn btn-secondary" @click="editorOpen = true">
            <Icon name="edit" size="sm" class="mr-2" />
            {{ t('common.edit') }}
          </button>
          <button data-test="archive-group" type="button" class="btn btn-secondary text-red-600 dark:text-red-400" @click="archiveOpen = true">
            <Icon name="trash" size="sm" class="mr-2" />
            {{ t('userGroups.groups.archive') }}
          </button>
        </div>

        <section class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div class="border-b border-gray-200 px-5 py-4 dark:border-dark-700">
            <h2 class="text-base font-semibold text-gray-950 dark:text-white">{{ t('userGroups.groups.rosterTitle') }}</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ t('userGroups.groups.rosterHint') }}</p>
          </div>
          <div v-if="loadingData" class="px-5 py-14 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
          <div v-else-if="members.length === 0" class="px-5 py-14 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('userGroups.groups.noMembers') }}</div>
          <div v-else>
            <div class="hidden grid-cols-[minmax(240px,1fr)_140px_180px] gap-4 bg-gray-50 px-5 py-3 text-xs font-medium text-gray-500 dark:bg-dark-800 dark:text-gray-400 md:grid">
              <span>{{ t('userGroups.groups.members') }}</span>
              <span>{{ t('userGroups.groups.status') }}</span>
              <span>{{ t('userGroups.groups.joinedAt') }}</span>
            </div>
            <article v-for="member in members" :key="member.user_id" class="grid gap-3 border-t border-gray-100 px-5 py-4 first:border-t-0 dark:border-dark-700 md:grid-cols-[minmax(240px,1fr)_140px_180px] md:items-center md:gap-4">
              <div class="flex min-w-0 items-center gap-3">
                <img :src="resolveAvatarUrl(member.avatar_url)" :alt="member.username || member.email" class="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5 dark:bg-dark-800 dark:ring-white/10" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-950 dark:text-white">{{ member.username || member.email }}</p>
                  <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
                </div>
              </div>
              <span class="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{{ member.status }}</span>
              <span class="text-sm text-gray-600 dark:text-gray-300">{{ formatDate(member.joined_at) }}</span>
            </article>
          </div>
        </section>
      </template>

      <div v-else-if="loadingData" class="px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</div>
    </UserGroupDetailShell>

    <UserGroupEditorDialog :show="editorOpen" :group="group" :saving="savingGroup" @close="editorOpen = false" @save="saveGroup" />
    <UserGroupPeopleDialog
      :show="peopleOpen"
      :mode="peopleMode"
      :group-name="group?.name || ''"
      :selected-ids="peopleMode === 'members' ? members.map(item => item.user_id) : viewers.map(item => item.user_id)"
      :saving="savingPeople"
      @close="peopleOpen = false"
      @save="savePeople"
    />
    <UserGroupPromptSettingsDialog
      :show="promptSettingsOpen"
      :group-name="group?.name || ''"
      :capture-enabled="Boolean(group?.prompt_capture_enabled)"
      :selected-ids="promptViewers.map(item => item.user_id)"
      :saving="savingPromptSettings"
      @close="promptSettingsOpen = false"
      @save="savePromptSettings"
    />
    <ConfirmDialog
      :show="archiveOpen"
      :title="t('userGroups.groups.archive')"
      :message="t('userGroups.groups.archiveConfirm')"
      danger
      @confirm="archiveGroup"
      @cancel="archiveOpen = false"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { userGroupAPI } from '@/api/userGroups'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { resolveAvatarUrl } from '@/utils/avatar'
import type { UserGroup, UserGroupMember, UserGroupMutation, UserGroupViewer } from '@/types/userGroups'
import UserGroupDetailShell from './components/UserGroupDetailShell.vue'
import UserGroupEditorDialog from './components/UserGroupEditorDialog.vue'
import UserGroupPeopleDialog from './components/UserGroupPeopleDialog.vue'
import UserGroupPromptSettingsDialog from './components/UserGroupPromptSettingsDialog.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const canManage = computed(() => authStore.canManageUserGroups)
const groupId = computed(() => Number(route.params.id))
const group = ref<UserGroup | null>(null)
const members = ref<UserGroupMember[]>([])
const viewers = ref<UserGroupViewer[]>([])
const promptViewers = ref<UserGroupViewer[]>([])
const loadingData = ref(false)
const dataError = ref('')
const editorOpen = ref(false)
const peopleOpen = ref(false)
const peopleMode = ref<'members' | 'viewers'>('members')
const promptSettingsOpen = ref(false)
const archiveOpen = ref(false)
const savingGroup = ref(false)
const savingPeople = ref(false)
const savingPromptSettings = ref(false)

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : t('userGroups.common.loadFailed')
}

async function loadGroupData() {
  if (!Number.isInteger(groupId.value) || groupId.value <= 0) {
    dataError.value = t('userGroups.detail.notFound')
    return
  }
  loadingData.value = true
  dataError.value = ''
  try {
    const [groups, memberRows] = await Promise.all([
      userGroupAPI.list(),
      userGroupAPI.getMembers(groupId.value),
    ])
    group.value = groups.find(item => item.id === groupId.value) ?? null
    members.value = memberRows
    if (!group.value) dataError.value = t('userGroups.detail.notFound')
  } catch (error) {
    group.value = null
    members.value = []
    dataError.value = errorMessage(error)
  } finally {
    loadingData.value = false
  }
}

async function openPeople(mode: 'members' | 'viewers') {
  peopleMode.value = mode
  if (mode === 'viewers') {
    try {
      viewers.value = await userGroupAPI.getViewers(groupId.value)
    } catch (error) {
      appStore.showError(errorMessage(error))
      return
    }
  }
  peopleOpen.value = true
}

async function savePeople(userIds: number[]) {
  savingPeople.value = true
  try {
    if (peopleMode.value === 'members') await userGroupAPI.replaceMembers(groupId.value, userIds)
    else await userGroupAPI.replaceViewers(groupId.value, userIds)
    peopleOpen.value = false
    appStore.showSuccess(t('userGroups.groups.peopleSaved'))
    await loadGroupData()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPeople.value = false
  }
}

async function openPromptSettings() {
  try {
    promptViewers.value = await userGroupAPI.getPromptViewers(groupId.value)
    promptSettingsOpen.value = true
  } catch (error) {
    appStore.showError(errorMessage(error))
  }
}

async function savePromptSettings(payload: { enabled: boolean; userIds: number[] }) {
  savingPromptSettings.value = true
  try {
    await Promise.all([
      userGroupAPI.setPromptCapture(groupId.value, payload.enabled),
      userGroupAPI.replacePromptViewers(groupId.value, payload.userIds),
    ])
    promptSettingsOpen.value = false
    appStore.showSuccess(t('userGroups.promptSettings.saveSuccess'))
    await loadGroupData()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingPromptSettings.value = false
  }
}

async function saveGroup(payload: UserGroupMutation) {
  savingGroup.value = true
  try {
    await userGroupAPI.update(groupId.value, payload)
    editorOpen.value = false
    appStore.showSuccess(t('userGroups.groups.saveSuccess'))
    await loadGroupData()
  } catch (error) {
    appStore.showError(errorMessage(error))
  } finally {
    savingGroup.value = false
  }
}

async function archiveGroup() {
  try {
    await userGroupAPI.archive(groupId.value)
    archiveOpen.value = false
    appStore.showSuccess(t('userGroups.groups.archiveSuccess'))
    await router.push({ name: 'UserGroups' })
  } catch (error) {
    appStore.showError(errorMessage(error))
  }
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

onMounted(loadGroupData)
</script>
