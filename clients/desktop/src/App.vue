<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { notifyUsageSessionChanged } from '@/features/usage-display/core/host'
import { session } from '@/stores/session'

const router = useRouter()

// A token that expires mid-session clears the user from the store; that is our
// signal to leave whatever page is open and return to login.
watch(
  () => session.user,
  (user) => {
    if (session.ready && !user && router.currentRoute.value.meta.public !== true) {
      router.replace({ name: 'login' })
    }
  }
)

watch(
  () => session.user?.id ?? null,
  (userId) => void notifyUsageSessionChanged(userId),
  { immediate: true },
)
</script>

<template>
  <div
    class="window-drag-region"
    data-testid="window-drag-region"
    data-tauri-drag-region
    aria-hidden="true"
  />
  <RouterView />
</template>
