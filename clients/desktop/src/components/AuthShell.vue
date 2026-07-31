<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, RefreshCw, ShieldCheck, WifiOff } from '@lucide/vue'

import BrandLogo from '@/components/BrandLogo.vue'
import { normalizeBrand } from '@/lib/brand'
import { reloadSettings, session } from '@/stores/session'

withDefaults(
  defineProps<{
    title: string
    subtitle: string
    backLabel?: string
  }>(),
  { backLabel: '返回登录' },
)

const emit = defineEmits<{ back: [] }>()
const retrying = ref(false)
const brand = computed(() => normalizeBrand(session.settings))

async function retryConnection() {
  retrying.value = true
  await reloadSettings()
  retrying.value = false
}
</script>

<template>
  <div class="auth-shell drag-region">
    <section class="auth-shell__brand">
      <div class="auth-shell__lockup">
        <BrandLogo :src="brand.logo" :alt="brand.name" :size="42" />
        <span data-testid="brand-name">{{ brand.name }}</span>
      </div>

      <div class="auth-shell__message">
        <div class="auth-shell__mark" aria-hidden="true">
          <span class="auth-shell__axis auth-shell__axis--x" />
          <span class="auth-shell__axis auth-shell__axis--y" />
          <BrandLogo :src="brand.logo" alt="" :size="112" />
        </div>
        <p>{{ brand.subtitle }}</p>
      </div>

      <div class="auth-shell__status" :class="{ 'auth-shell__status--offline': session.offline }">
        <component :is="session.offline ? WifiOff : ShieldCheck" :size="17" aria-hidden="true" />
        <div>
          <strong>{{ session.offline ? '暂时无法连接' : '安全连接已就绪' }}</strong>
          <span>lynn.lat</span>
        </div>
        <button
          v-if="session.offline"
          class="icon-action no-drag"
          type="button"
          title="重新连接"
          aria-label="重新连接"
          data-testid="offline-retry"
          :disabled="retrying"
          @click="retryConnection"
        >
          <RefreshCw :size="16" :class="{ spinning: retrying }" />
        </button>
      </div>
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
