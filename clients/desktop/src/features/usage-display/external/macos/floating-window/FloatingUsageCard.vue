<script setup lang="ts">
import type { UserSubscription } from '@/api'
import type { UsageQuotaSummary } from '@/features/usage-display/core/format'
import type { BalanceDisplaySnapshot } from '@/features/usage-display/core/store'
import type { UsageDisplayAppearance } from '@/features/usage-display/core/storage'
import ExternalUsageDetailCard from '@/features/usage-display/external/macos/shared/ExternalUsageDetailCard.vue'

const props = defineProps<{
  source: 'balance' | 'subscription'
  appearance: UsageDisplayAppearance
  balance: BalanceDisplaySnapshot | null
  subscription: UserSubscription | null
  quotaSummary: UsageQuotaSummary | null
  loading: boolean
  error: string
  lastUpdatedAt: Date | null
}>()

const emit = defineEmits<{ drag: [] }>()
</script>

<template>
  <ExternalUsageDetailCard v-bind="props" draggable @drag="emit('drag')" />
</template>
