<template>
  <span :class="['product-icon', sizeClass, toneClass, { 'product-icon--bare': bare }]" aria-hidden="true">
    <svg class="product-icon__svg" viewBox="0 0 24 24" fill="none">
      <template v-if="name === 'wallet'">
        <path class="product-icon__fill" d="M5.5 6.25h11.25A2.75 2.75 0 0 1 19.5 9v8A2.5 2.5 0 0 1 17 19.5H5.75A3.25 3.25 0 0 1 2.5 16.25V8.75a2.5 2.5 0 0 1 3-2.5Z" />
        <path class="product-icon__line" d="M5.6 6.25 15.9 4.4a1.55 1.55 0 0 1 1.83 1.35l.13.94M2.75 9.25h15.1a2.15 2.15 0 0 1 2.15 2.15v1.7a2.15 2.15 0 0 1-2.15 2.15h-2.6a3 3 0 1 1 0-6h2.6" />
        <path class="product-icon__dot" d="M15.15 12.25a.7.7 0 1 0 1.4 0 .7.7 0 0 0-1.4 0Z" />
      </template>

      <template v-else-if="name === 'key'">
        <path class="product-icon__fill" d="M8.75 14.5a4.75 4.75 0 1 1 4.36-6.64l6.24 6.24v2.65h-2.6v2.5h-2.7l-4.05-4.05c-.4.1-.82.15-1.25.15Z" />
        <path class="product-icon__line" d="M8.75 14.5a4.75 4.75 0 1 1 4.36-6.64l6.24 6.24v2.65h-2.6v2.5h-2.7l-4.05-4.05c-.4.1-.82.15-1.25.15Z" />
        <path class="product-icon__dot" d="M7.45 10.05a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z" />
      </template>

      <template v-else-if="name === 'chart'">
        <path class="product-icon__fill" d="M5.25 13.25h2.5a1 1 0 0 1 1 1v4.5h-4.5v-4.5a1 1 0 0 1 1-1ZM10.75 9.25h2.5a1 1 0 0 1 1 1v8.5h-4.5v-8.5a1 1 0 0 1 1-1ZM16.25 5.25h2.5a1 1 0 0 1 1 1v12.5h-4.5V6.25a1 1 0 0 1 1-1Z" />
        <path class="product-icon__line" d="M4 19.25h16M6.5 13.25v5.5M12 9.25v9.5M17.5 5.25v13.5" />
      </template>

      <template v-else-if="name === 'gift'">
        <path class="product-icon__fill" d="M4.25 10h15.5v8.25a1.5 1.5 0 0 1-1.5 1.5H5.75a1.5 1.5 0 0 1-1.5-1.5V10Z" />
        <path class="product-icon__line" d="M3.5 10h17M5 10v8.25a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V10M12 7.75v12M12 7.75H8.95a2 2 0 1 1 2-2c0 1.1 1.05 2 1.05 2Zm0 0h3.05a2 2 0 1 0-2-2c0 1.1-1.05 2-1.05 2Z" />
      </template>

      <template v-else-if="name === 'cube'">
        <path class="product-icon__fill" d="m12 3.75 7.25 4.15v8.2L12 20.25 4.75 16.1V7.9L12 3.75Z" />
        <path class="product-icon__line" d="m12 3.75 7.25 4.15M12 3.75 4.75 7.9M12 20.25v-8.3m7.25-4.05L12 11.95 4.75 7.9m14.5 0v8.2L12 20.25 4.75 16.1V7.9" />
      </template>

      <template v-else-if="name === 'database'">
        <path class="product-icon__fill" d="M12 4c4.28 0 7.75 1.57 7.75 3.5v9c0 1.93-3.47 3.5-7.75 3.5s-7.75-1.57-7.75-3.5v-9C4.25 5.57 7.72 4 12 4Z" />
        <path class="product-icon__line" d="M19.75 7.5c0 1.93-3.47 3.5-7.75 3.5S4.25 9.43 4.25 7.5m15.5 4.5c0 1.93-3.47 3.5-7.75 3.5S4.25 13.93 4.25 12m15.5-4.5v9c0 1.93-3.47 3.5-7.75 3.5s-7.75-1.57-7.75-3.5v-9" />
      </template>

      <template v-else-if="name === 'bolt'">
        <path class="product-icon__fill" d="M13.25 2.75 4.75 13h6l-1 8.25 8.5-10.75h-6l1-7.75Z" />
        <path class="product-icon__line" d="M13.25 2.75 4.75 13h6l-1 8.25 8.5-10.75h-6l1-7.75Z" />
      </template>

      <template v-else-if="name === 'clock'">
        <path class="product-icon__fill" d="M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" />
        <path class="product-icon__line" d="M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5ZM12 7.25v5.05l3.35 2.05" />
      </template>

      <template v-else-if="name === 'document'">
        <path class="product-icon__fill" d="M6.25 3.75h7.1l4.4 4.4v10.1a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" />
        <path class="product-icon__line" d="M6.25 3.75h7.1l4.4 4.4v10.1a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Zm7 .25v3.15a1 1 0 0 0 1 1h3.15M7.75 11.5h6.5M7.75 15h5" />
      </template>

      <template v-else-if="name === 'subscription'">
        <path class="product-icon__fill" d="M5.25 4.75h3.1c6.3 0 11.4 5.1 11.4 11.4v3.1h-3.2v-3.1a8.2 8.2 0 0 0-8.2-8.2h-3.1v-3.2Z" />
        <path class="product-icon__line" d="M5.25 4.75h3.1c6.3 0 11.4 5.1 11.4 11.4v3.1M5.25 10.15h2.15a6.45 6.45 0 0 1 6.45 6.45v2.65M6.4 18.95a1.85 1.85 0 1 0 0-3.7 1.85 1.85 0 0 0 0 3.7Z" />
      </template>

      <template v-else-if="name === 'profile'">
        <path class="product-icon__fill" d="M12 11.75a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.35 20.25a7.65 7.65 0 0 1 15.3 0H4.35Z" />
        <path class="product-icon__line" d="M12 11.75a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.35 20.25a7.65 7.65 0 0 1 15.3 0H4.35Z" />
      </template>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: 'wallet' | 'key' | 'chart' | 'gift' | 'cube' | 'database' | 'bolt' | 'clock' | 'document' | 'subscription' | 'profile'
  tone?: 'teal' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  bare?: boolean
}>(), {
  tone: 'slate',
  size: 'md',
  bare: false,
})

const sizeClass = computed(() => `product-icon--${props.size}`)
const toneClass = computed(() => `product-icon--${props.tone}`)
</script>

<style scoped>
.product-icon {
  --icon-rgb: 51 65 85;
  --icon-bg: rgb(248 250 252);
  --icon-fill-alpha: 0.16;
  --icon-line-alpha: 0.92;
  --icon-dot-alpha: 1;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(var(--icon-rgb) / 0.08);
  background: var(--icon-bg);
  color: rgb(var(--icon-rgb));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.72), 0 1px 2px rgb(15 23 42 / 0.04);
}

.product-icon--xs {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
}

.product-icon--sm {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
}

.product-icon--md {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.875rem;
}

.product-icon--lg {
  width: 3rem;
  height: 3rem;
  border-radius: 0.875rem;
}

.product-icon--bare {
  width: 1.25rem;
  height: 1.25rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.product-icon__svg {
  width: 58%;
  height: 58%;
}

.product-icon--bare .product-icon__svg {
  width: 100%;
  height: 100%;
}

.product-icon__fill {
  fill: rgb(var(--icon-rgb) / var(--icon-fill-alpha));
}

.product-icon__line {
  stroke: rgb(var(--icon-rgb) / var(--icon-line-alpha));
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.product-icon__dot {
  fill: rgb(var(--icon-rgb) / var(--icon-dot-alpha));
}

.product-icon--slate {
  --icon-rgb: 71 85 105;
  --icon-bg: rgb(248 250 252);
}

.product-icon--teal {
  --icon-rgb: 13 148 136;
  --icon-bg: rgb(204 251 241 / 0.72);
}

.product-icon--blue {
  --icon-rgb: 37 99 235;
  --icon-bg: rgb(219 234 254 / 0.76);
}

.product-icon--emerald {
  --icon-rgb: 5 150 105;
  --icon-bg: rgb(209 250 229 / 0.76);
}

.product-icon--amber {
  --icon-rgb: 217 119 6;
  --icon-bg: rgb(254 243 199 / 0.8);
}

.product-icon--violet {
  --icon-rgb: 124 58 237;
  --icon-bg: rgb(237 233 254 / 0.78);
}

.product-icon--rose {
  --icon-rgb: 225 29 72;
  --icon-bg: rgb(255 228 230 / 0.78);
}

:global(.dark) .product-icon {
  --icon-bg: rgb(var(--icon-rgb) / 0.14);
  border-color: rgb(var(--icon-rgb) / 0.18);
  box-shadow: none;
}
</style>
