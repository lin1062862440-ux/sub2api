<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const groupQuery = computed(() => {
  const value = route.query.group_id
  return typeof value === 'string' && /^\d+$/.test(value) ? { group_id: value } : {}
})

const tabs = computed(() => [
  { name: 'user-groups', label: '用户组' },
  { name: 'user-group-subscriptions', label: '订阅概览' },
  { name: 'user-group-usage', label: '用量分析' },
])
</script>

<template>
  <nav class="ug-tabs" aria-label="用户组工作区">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="{ name: tab.name, query: groupQuery }"
      :aria-current="route.name === tab.name ? 'page' : undefined"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>
