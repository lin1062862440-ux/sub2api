<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import defaultAvatarUrl from '../../../../frontend/src/assets/default-avatar.svg'

const props = defineProps<{
  name?: string | null
  src?: string | null
}>()

const imageFailed = ref(false)
const requestedImageUrl = computed(() => props.src?.trim() || '')
const imageUrl = computed(() => {
  return requestedImageUrl.value && !imageFailed.value ? requestedImageUrl.value : defaultAvatarUrl
})
const displayName = computed(() => props.name?.trim() || '用户')

watch(requestedImageUrl, () => {
  imageFailed.value = false
})
</script>

<template>
  <span class="user-avatar" :aria-label="`${displayName} 的头像`">
    <img
      :src="imageUrl"
      :alt="`${displayName} 的头像`"
      @error="imageFailed = true"
    >
  </span>
</template>

<style scoped>
.user-avatar {
  display: grid;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  place-items: center;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
