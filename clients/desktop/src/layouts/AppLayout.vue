<script setup lang="ts">
import DesktopAppLayout from '@/layouts/DesktopAppLayout.vue'
import MobileAppLayout from '@/layouts/MobileAppLayout.vue'
import { appCapabilities } from '@/lib/platform-capabilities'
</script>

<template>
  <MobileAppLayout v-if="appCapabilities.mobile" />
  <DesktopAppLayout v-else />
</template>
