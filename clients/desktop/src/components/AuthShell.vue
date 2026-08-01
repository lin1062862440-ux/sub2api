<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from '@lucide/vue'

import BrandMotion from '@/components/BrandMotion.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { normalizeBrand } from '@/lib/brand'
import { session } from '@/stores/session'

withDefaults(
  defineProps<{
    title: string
    subtitle: string
    backLabel?: string
  }>(),
  { backLabel: '返回登录' },
)

const emit = defineEmits<{ back: [] }>()
const brand = computed(() => normalizeBrand(session.settings))
</script>

<template>
  <div class="auth-shell drag-region">
    <section class="auth-shell__brand">
      <div class="auth-shell__lockup">
        <BrandLogo :src="brand.logo" :alt="brand.name" :size="42" />
        <span data-testid="brand-name">{{ brand.name }}</span>
      </div>

      <BrandMotion wordmark="L AI" />
    </section>

    <main class="auth-shell__form-pane">
      <div class="auth-shell__form-wrap no-drag">
        <header class="auth-shell__head">
          <button class="back-action" type="button" @click="emit('back')">
            <ArrowLeft :size="16" />
            {{ backLabel }}
          </button>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </header>
        <slot />
      </div>
    </main>
  </div>
</template>
