# LinAI Authentication Brand Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every desktop authentication page's static left-side grid, slogan, and connection block with one shared particle animation that assembles into the current LinAI platform logo.

**Architecture:** A small TypeScript motion module owns deterministic particle generation, timing phases, logo-mask sampling, and frame projection. `BrandMotion.vue` owns Canvas drawing and browser lifecycle only, while `LoginView.vue` and `AuthShell.vue` consume the component without changing authentication logic.

**Tech Stack:** Vue 3, TypeScript, Canvas 2D, Vitest, Vue Test Utils, Vite, Tauri 2

---

## File Map

- Create `clients/desktop/src/lib/brand-motion.ts`: pure particle model, phase calculation, target sampling, deterministic fallback, and frame projection.
- Create `clients/desktop/src/lib/brand-motion.spec.ts`: pure unit coverage for motion phases, sampling, projection, and fallback behavior.
- Create `clients/desktop/src/components/BrandMotion.vue`: platform-logo loading, Canvas rendering, resize/visibility/focus/reduced-motion lifecycle, and pointer parallax.
- Create `clients/desktop/src/components/BrandMotion.spec.ts`: component lifecycle, fallback, accessibility, and cleanup coverage.
- Create `clients/desktop/src/components/AuthShell.spec.ts`: shared authentication shell integration and removal assertions.
- Modify `clients/desktop/src/components/AuthShell.vue`: replace the old grid, slogan, and connection status with `BrandMotion`.
- Modify `clients/desktop/src/views/LoginView.vue`: make the same replacement in the standalone login composition.
- Modify `clients/desktop/src/views/LoginView.spec.ts`: assert the new component and remove the obsolete status retry expectation.
- Modify `clients/desktop/src/style.css`: remove obsolete shared shell styles and size the animation consistently.

### Task 1: Build the deterministic motion model

**Files:**
- Create: `clients/desktop/src/lib/brand-motion.spec.ts`
- Create: `clients/desktop/src/lib/brand-motion.ts`

- [ ] **Step 1: Write failing tests for phases, logo sampling, fallback targets, and projected frames**

```ts
import { describe, expect, it } from 'vitest'
import {
  createFallbackTargets,
  createParticles,
  motionPhaseAt,
  projectParticles,
  sampleLogoTargets,
} from './brand-motion'

describe('brand motion model', () => {
  it('moves through drift, assemble, hold, and release phases', () => {
    expect(motionPhaseAt(1000).name).toBe('drift')
    expect(motionPhaseAt(3600).name).toBe('assemble')
    expect(motionPhaseAt(5600).name).toBe('hold')
    expect(motionPhaseAt(7800).name).toBe('release')
  })

  it('samples only opaque logo pixels into centered targets', () => {
    const alpha = new Uint8ClampedArray(4 * 4 * 4)
    alpha[(1 * 4 + 1) * 4 + 3] = 255
    alpha[(2 * 4 + 2) * 4 + 3] = 255
    const targets = sampleLogoTargets({ width: 4, height: 4, data: alpha }, 8, 320, 320)
    expect(targets).toHaveLength(8)
    expect(targets.every(({ x, y }) => x > 60 && x < 260 && y > 60 && y < 260)).toBe(true)
  })

  it('creates a deterministic recognizable fallback arrangement', () => {
    expect(createFallbackTargets(24, 320, 320)).toEqual(createFallbackTargets(24, 320, 320))
    expect(new Set(createFallbackTargets(24, 320, 320).map((point) => point.x)).size).toBeGreaterThan(2)
  })

  it('projects particles onto logo targets during hold', () => {
    const targets = createFallbackTargets(12, 320, 320)
    const particles = createParticles(targets, 320, 320, 7)
    const frame = projectParticles(particles, 5600, 320, 320, { x: 0, y: 0 })
    expect(frame).toHaveLength(12)
    expect(frame[0].x).toBeCloseTo(targets[0].x, 0)
  })
})
```

- [ ] **Step 2: Run the model test and verify it fails because the module does not exist**

Run: `cd clients/desktop && pnpm vitest run src/lib/brand-motion.spec.ts`

Expected: FAIL with a module resolution error for `./brand-motion`.

- [ ] **Step 3: Implement the pure model with explicit phase timing and seeded particle properties**

```ts
export interface MotionPoint { x: number; y: number }
export interface AlphaMask { width: number; height: number; data: Uint8ClampedArray }
export interface MotionParticle {
  target: MotionPoint
  origin: MotionPoint
  radius: number
  speed: number
  offset: number
  color: string
}

const CYCLE_MS = 10_000

export function motionPhaseAt(elapsedMs: number) {
  const time = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS
  if (time < 2800) return { name: 'drift' as const, progress: time / 2800 }
  if (time < 4800) return { name: 'assemble' as const, progress: (time - 2800) / 2000 }
  if (time < 7000) return { name: 'hold' as const, progress: (time - 4800) / 2200 }
  if (time < 9000) return { name: 'release' as const, progress: (time - 7000) / 2000 }
  return { name: 'drift' as const, progress: (time - 9000) / 1000 }
}
```

Complete the module with a local seeded PRNG, alpha-threshold sampling, an L-shaped deterministic fallback, smoothstep easing, bounded drift coordinates, and `projectParticles`. Use `#2563eb` for most particles, `#0891b2` for cyan accents, and `#e56b6f` only for a sparse accent set.

- [ ] **Step 4: Run the focused model test and verify it passes**

Run: `cd clients/desktop && pnpm vitest run src/lib/brand-motion.spec.ts`

Expected: PASS with 4 tests.

- [ ] **Step 5: Commit the motion model**

```bash
git add clients/desktop/src/lib/brand-motion.ts clients/desktop/src/lib/brand-motion.spec.ts
git commit -m "feat(desktop): add LinAI brand motion model"
```

### Task 2: Add the Canvas lifecycle component

**Files:**
- Create: `clients/desktop/src/components/BrandMotion.spec.ts`
- Create: `clients/desktop/src/components/BrandMotion.vue`

- [ ] **Step 1: Write a failing component test with controlled Canvas, image, ResizeObserver, RAF, and reduced-motion mocks**

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BrandMotion from './BrandMotion.vue'

describe('BrandMotion', () => {
  beforeEach(() => installMotionBrowserMocks())

  it('renders a decorative canvas from the supplied platform logo', async () => {
    const wrapper = mount(BrandMotion, { props: { logo: 'data:image/png;base64,brand' } })
    await flushPromises()
    expect(wrapper.get('canvas').attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('data-motion-state')).toBe('running')
    expect(seenImageSources).toContain('data:image/png;base64,brand')
  })

  it('renders one static frame when reduced motion is requested', async () => {
    reducedMotion = true
    const wrapper = mount(BrandMotion, { props: { logo: 'data:image/png;base64,brand' } })
    await flushPromises()
    expect(wrapper.attributes('data-motion-state')).toBe('static')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('falls back to the bundled logo after a configured-logo failure', async () => {
    failFirstImage = true
    mount(BrandMotion, { props: { logo: 'broken-logo' } })
    await flushPromises()
    expect(seenImageSources[0]).toBe('broken-logo')
    expect(seenImageSources[1]).toContain('linai-logo')
  })

  it('cancels animation and disconnects observers on unmount', async () => {
    const wrapper = mount(BrandMotion, { props: { logo: 'data:image/png;base64,brand' } })
    await flushPromises()
    wrapper.unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(disconnectResizeObserver).toHaveBeenCalled()
  })
})
```

The test helper creates an opaque 16 by 16 `ImageData` result, reports a 320 by 320 resize entry, and records queued RAF callbacks without recursively executing them.

- [ ] **Step 2: Run the component test and verify it fails because `BrandMotion.vue` does not exist**

Run: `cd clients/desktop && pnpm vitest run src/components/BrandMotion.spec.ts`

Expected: FAIL with a module resolution error for `./BrandMotion.vue`.

- [ ] **Step 3: Implement `BrandMotion.vue` with no animation dependency**

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import fallbackLogo from '@/assets/linai-logo.png'
import {
  createFallbackTargets,
  createParticles,
  projectParticles,
  sampleLogoTargets,
} from '@/lib/brand-motion'

const props = defineProps<{ logo?: string | null }>()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const state = ref<'loading' | 'running' | 'paused' | 'static'>('loading')

// Load the configured logo into an offscreen canvas, retry the bundled logo,
// then create particle targets. Resize and lifecycle handlers redraw safely.
</script>

<template>
  <div ref="root" class="brand-motion" :data-motion-state="state">
    <canvas ref="canvas" aria-hidden="true" />
  </div>
</template>
```

Implement these concrete lifecycle rules:

- load `props.logo` first and `fallbackLogo` second, with `crossOrigin = 'anonymous'` for HTTP sources and a four-second decode timeout;
- sample an offscreen 96 by 96 alpha mask and use 90 to 140 particles based on the rendered area;
- cap backing resolution at device pixel ratio `2`;
- draw nearby connections with a maximum of 36 strokes per frame;
- listen passively for pointer movement on the root and apply no more than 8 pixels of parallax;
- use `matchMedia('(prefers-reduced-motion: reduce)')` and draw a single assembled frame when enabled;
- pause RAF on `document.hidden`, window blur, a zero-size pane, or unmount;
- clean up RAF, ResizeObserver, media-query, visibility, focus, blur, and pointer listeners;
- keep the Canvas transparent, `pointer-events: none`, and inside the inherited drag region.

- [ ] **Step 4: Run model and component tests and verify they pass**

Run: `cd clients/desktop && pnpm vitest run src/lib/brand-motion.spec.ts src/components/BrandMotion.spec.ts`

Expected: PASS with all motion tests green and no leaked timer warnings.

- [ ] **Step 5: Commit the Canvas component**

```bash
git add clients/desktop/src/components/BrandMotion.vue clients/desktop/src/components/BrandMotion.spec.ts
git commit -m "feat(desktop): render animated LinAI brand field"
```

### Task 3: Integrate every authentication route

**Files:**
- Create: `clients/desktop/src/components/AuthShell.spec.ts`
- Modify: `clients/desktop/src/components/AuthShell.vue`
- Modify: `clients/desktop/src/views/LoginView.vue`
- Modify: `clients/desktop/src/views/LoginView.spec.ts`
- Modify: `clients/desktop/src/style.css`

- [ ] **Step 1: Write failing integration assertions for the shared motion component and removed content**

```ts
it('uses shared brand motion without the old slogan or connection status', () => {
  const wrapper = mountAuthShell()
  expect(wrapper.get('[data-testid="brand-motion"]').attributes('data-logo')).toBe(settings.site_logo)
  expect(wrapper.text()).not.toContain(settings.site_subtitle)
  expect(wrapper.text()).not.toContain('安全连接已就绪')
  expect(wrapper.text()).not.toContain('lynn.lat')
  expect(wrapper.get('.auth-shell').classes()).toContain('drag-region')
  expect(wrapper.get('.auth-shell__form-wrap').classes()).toContain('no-drag')
})
```

Update the login test to make the same assertions and delete the former `shows a retryable offline status` test. Stub `BrandMotion` as a simple element that exposes its `logo` prop so authentication tests do not depend on Canvas.

- [ ] **Step 2: Run the focused integration tests and verify they fail on the old markup**

Run: `cd clients/desktop && pnpm vitest run src/components/AuthShell.spec.ts src/views/LoginView.spec.ts`

Expected: FAIL because the old slogan and connection block still render and the shared motion component is absent.

- [ ] **Step 3: Replace both old brand-pane implementations with `BrandMotion`**

Use this structure in both owners:

```vue
<div class="brand-lockup">
  <BrandLogo :src="brand.logo" :alt="brand.name" :size="42" />
  <span data-testid="brand-name">{{ brand.name }}</span>
</div>
<BrandMotion :logo="brand.logo" />
```

`AuthShell.vue` uses the equivalent `auth-shell__lockup` class. Remove `WifiOff`, obsolete status-only `RefreshCw` or `ShieldCheck` imports where no longer used, `retrying`, and `retryConnection` only when they are not used by the form flow. Keep login's `reloadSettings` import because successful authentication still refreshes settings.

- [ ] **Step 4: Remove obsolete styles and add stable motion layout styles**

```css
.brand-motion {
  align-self: center;
  width: min(360px, 100%);
  aspect-ratio: 1;
  min-height: 260px;
  margin: auto 0;
  pointer-events: none;
}

.brand-motion canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

Delete all `brand-message`, `signal-field`, `signal-axis`, `connection-status`, `auth-shell__message`, `auth-shell__mark`, `auth-shell__axis`, and `auth-shell__status` rules. Preserve the existing two-column sizing and the `max-width: 900px` behavior that hides the complete brand pane.

- [ ] **Step 5: Run integration tests and the complete desktop unit suite**

Run: `cd clients/desktop && pnpm vitest run src/components/AuthShell.spec.ts src/views/LoginView.spec.ts`

Expected: PASS.

Run: `cd clients/desktop && pnpm test:run`

Expected: PASS with the complete suite green.

- [ ] **Step 6: Commit authentication integration**

```bash
git add clients/desktop/src/components/AuthShell.vue clients/desktop/src/components/AuthShell.spec.ts clients/desktop/src/views/LoginView.vue clients/desktop/src/views/LoginView.spec.ts clients/desktop/src/style.css
git commit -m "feat(desktop): unify authentication brand motion"
```

### Task 4: Build and visually verify the desktop surface

**Files:**
- Verify only; no expected source changes unless the checks expose a defect.

- [ ] **Step 1: Run static and Rust validation**

Run: `cd clients/desktop && pnpm build`

Expected: Vue type checking and Vite production build both succeed.

Run: `cd clients/desktop/src-tauri && cargo check`

Expected: Rust validation succeeds.

- [ ] **Step 2: Start the deterministic visual-preview server**

Run: `cd clients/desktop && pnpm dev:visual --host 127.0.0.1`

Expected: Vite serves the desktop preview at `http://127.0.0.1:1421/`.

- [ ] **Step 3: Verify the desktop two-column state at 1180 by 780**

Open `http://127.0.0.1:1421/#/login`, set the viewport to `1180 x 780`, and wait through the assemble phase. Capture a screenshot and verify:

- the Canvas contains non-background pixels in the left center;
- particles visibly resolve into the LinAI Logo;
- the top lockup, animation, form, and native traffic-light inset do not overlap;
- the old grid, slogan, connection copy, and `lynn.lat` are absent;
- dragging remains assigned to the outer auth surface while form controls remain interactive.

- [ ] **Step 4: Verify a shared-shell route and compact state**

Open `http://127.0.0.1:1421/#/register` at `1180 x 780` and confirm the same animation and alignment. Then set `900 x 620` for both login and registration and verify the brand pane is hidden, forms remain usable, no controls clip, and there is no horizontal overflow.

- [ ] **Step 5: Verify reduced motion and idle resource behavior**

Emulate `prefers-reduced-motion: reduce` and confirm the Canvas displays a stable assembled Logo without recurring frames. Background and restore the preview window and confirm the scene pauses and resumes without going blank or accelerating.

- [ ] **Step 6: Record the final repository state**

Run: `git status --short`

Expected: no uncommitted source changes. Keep the preview server running for user inspection and report its URL.
