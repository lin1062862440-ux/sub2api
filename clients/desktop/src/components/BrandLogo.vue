<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { FALLBACK_BRAND, normalizeBrand } from '@/lib/brand'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    size?: number
  }>(),
  {
    src: '',
    alt: 'LinAI',
    size: 40,
  },
)

const failed = ref(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

const imageSource = computed(() => {
  if (failed.value) return FALLBACK_BRAND.logo
  return normalizeBrand({ site_logo: props.src ?? '' }).logo
})
</script>

<template>
  <img
    class="brand-logo"
    :src="imageSource"
    :alt="alt"
    :width="size"
    :height="size"
    @error="failed = true"
  />
</template>

<style scoped>
.brand-logo {
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}
</style>
