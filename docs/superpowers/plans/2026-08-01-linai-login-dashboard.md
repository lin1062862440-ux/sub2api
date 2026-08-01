# LinAI Login And Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a macOS-ready LinAI desktop loop from login through authenticated dashboard and logout, using the approved Light Future interface and the live `https://lynn.lat` contract.

**Architecture:** Keep the existing Tauri 2, Vue 3, session storage, router, and API modules. Add a small branding boundary that validates runtime settings and supplies bundled fallbacks, then redesign the login and authenticated shell/dashboard around shared tokens and focused components. Tests exercise pure contracts and mounted Vue states; browser and packaged-app checks cover the visual/runtime boundary.

**Tech Stack:** Tauri 2, Rust 2021, Vue 3, TypeScript 6, Vite 8, Vue Router 4, Vitest, Vue Test Utils, happy-dom, Lucide Vue Next, Sharp.

---

## File Map

- `clients/desktop/src/config.ts`: fixed backend origin and bundled LinAI identity.
- `clients/desktop/src/lib/brand.ts`: normalize platform branding and reject unsafe logo values.
- `clients/desktop/src/assets/linai-logo.svg`: offline LinAI logo copied from the live platform mark.
- `clients/desktop/scripts/sync-brand.mjs`: fetch current public settings and generate local branding/icon source.
- `clients/desktop/src/components/BrandLogo.vue`: render runtime logo with bundled fallback.
- `clients/desktop/src/components/AppIcon.vue`: stable Lucide icon wrapper for UI commands.
- `clients/desktop/src/components/MetricStrip.vue`: stable dashboard headline metrics.
- `clients/desktop/src/components/TrendChart.vue`: responsive seven-day chart with axes, hover detail, and empty state.
- `clients/desktop/src/views/LoginView.vue`: credential/TOTP/offline login experience.
- `clients/desktop/src/layouts/AppLayout.vue`: LinAI navigation rail, window chrome, identity, and logout.
- `clients/desktop/src/views/DashboardView.vue`: data loading, partial errors, summary, trend, models, and platform distribution.
- `clients/desktop/src/style.css`: shared Light Future tokens and primitives.
- `clients/desktop/src-tauri/tauri.conf.json`: LinAI title, product name, identifier, and macOS bundle.
- `clients/desktop/src-tauri/Cargo.toml`: LinAI Rust package metadata.
- `clients/desktop/src-tauri/src/main.rs`: renamed library entrypoint.
- `clients/desktop/src/**/*.spec.ts`: regression and component tests.

## Task 1: Establish The Test And Brand Contract

**Files:**
- Modify: `clients/desktop/package.json`
- Modify: `clients/desktop/vite.config.ts`
- Create: `clients/desktop/src/test/setup.ts`
- Create: `clients/desktop/src/lib/brand.spec.ts`
- Create: `clients/desktop/src/lib/brand.ts`
- Create: `clients/desktop/src/assets/linai-logo.svg`
- Modify: `clients/desktop/src/config.ts`

- [ ] **Step 1: Add the failing branding tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeBrand } from './brand'

describe('normalizeBrand', () => {
  it('uses valid platform branding', () => {
    expect(normalizeBrand({ site_name: 'LinAI', site_logo: 'data:image/svg+xml;base64,AAA', site_subtitle: 'AI for everyone' })).toMatchObject({ name: 'LinAI', logo: 'data:image/svg+xml;base64,AAA' })
  })

  it('falls back for missing or unsafe branding', () => {
    expect(normalizeBrand({ site_name: '', site_logo: 'javascript:alert(1)', site_subtitle: '' }).name).toBe('LinAI')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test --run src/lib/brand.spec.ts`

Expected: FAIL because the test script, Vitest dependencies, and `brand.ts` do not exist.

- [ ] **Step 3: Install focused test and icon dependencies**

Run: `pnpm add lucide-vue-next && pnpm add -D vitest @vue/test-utils happy-dom sharp`

Add scripts:

```json
"test": "vitest",
"test:run": "vitest run",
"brand:sync": "node scripts/sync-brand.mjs"
```

- [ ] **Step 4: Implement the minimal brand normalizer and fallback**

```ts
import fallbackLogo from '@/assets/linai-logo.svg'

export const FALLBACK_BRAND = { name: 'LinAI', subtitle: '让每一位上帝感受 AI 的爱', logo: fallbackLogo } as const

export function normalizeBrand(input?: { site_name?: string; site_logo?: string; site_subtitle?: string } | null) {
  const logo = input?.site_logo?.trim() ?? ''
  const safeLogo = /^(data:image\/(?:svg\+xml|png|jpeg|webp);base64,|https:\/\/)/i.test(logo)
  return {
    name: input?.site_name?.trim() || FALLBACK_BRAND.name,
    subtitle: input?.site_subtitle?.trim() || FALLBACK_BRAND.subtitle,
    logo: safeLogo ? logo : FALLBACK_BRAND.logo,
  }
}
```

- [ ] **Step 5: Run tests and typecheck for GREEN**

Run: `pnpm test:run src/lib/brand.spec.ts && pnpm build`

Expected: all branding tests pass and the frontend build exits 0.

## Task 2: Synchronize LinAI Branding And Bundle Metadata

**Files:**
- Create: `clients/desktop/scripts/sync-brand.mjs`
- Create: `clients/desktop/src/components/BrandLogo.vue`
- Create: `clients/desktop/src/components/BrandLogo.spec.ts`
- Modify: `clients/desktop/src-tauri/tauri.conf.json`
- Modify: `clients/desktop/src-tauri/Cargo.toml`
- Modify: `clients/desktop/src-tauri/src/main.rs`
- Regenerate: `clients/desktop/src-tauri/icons/*`
- Modify: `clients/desktop/README.md`

- [ ] **Step 1: Add a failing component fallback test**

```ts
const wrapper = mount(BrandLogo, { props: { src: 'javascript:bad', alt: 'LinAI' } })
expect(wrapper.get('img').attributes('src')).toContain('linai-logo')
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `pnpm test:run src/components/BrandLogo.spec.ts`

Expected: FAIL because `BrandLogo.vue` does not exist.

- [ ] **Step 3: Implement runtime fallback and brand synchronization**

`BrandLogo.vue` uses `normalizeBrand`, swaps to the bundled asset on image error, and preserves fixed dimensions. `sync-brand.mjs` fetches `${BACKEND_ORIGIN}/api/v1/settings/public`, validates the envelope and data-image payload, writes `linai-logo.svg`, composites a 1024 px graphite icon with safe padding through Sharp, then runs `pnpm tauri icon`.

- [ ] **Step 4: Remove desktop-template branding**

Set:

```json
"productName": "LinAI",
"identifier": "ai.lin.desktop",
"title": "LinAI"
```

Rename the Rust package to `linai-desktop` and library to `linai_desktop_lib`. Replace the template README with LinAI development, brand-sync, build, and packaging commands. Delete unused Vite starter assets.

- [ ] **Step 5: Generate icons and verify GREEN**

Run: `pnpm brand:sync && pnpm test:run src/components/BrandLogo.spec.ts && rg -n -i 'sub2api' src src-tauri/tauri.conf.json src-tauri/Cargo.toml README.md`

Expected: brand sync succeeds, the component test passes, and `rg` returns no matches.

## Task 3: Close The Login And Session Loop

**Files:**
- Create: `clients/desktop/src/views/LoginView.spec.ts`
- Modify: `clients/desktop/src/views/LoginView.vue`
- Modify: `clients/desktop/src/stores/session.ts`
- Modify: `clients/desktop/src/router/index.ts`
- Create: `clients/desktop/src/components/AppIcon.vue`

- [ ] **Step 1: Add failing login state tests**

Cover empty validation, email/password submission, disabled loading controls, TOTP transition, platform-controlled registration/reset links, and offline retry. Mock only API and opener boundaries; mount the real component.

```ts
expect(wrapper.get('[data-testid="login-submit"]').attributes('disabled')).toBeDefined()
expect(wrapper.find('[data-testid="offline-status"]').exists()).toBe(true)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test:run src/views/LoginView.spec.ts`

Expected: FAIL because stable controls and the redesigned states are absent.

- [ ] **Step 3: Implement the Light Future login**

Build a full-window branded canvas with an inspectable LinAI logo and status field, a stable form region, email/password controls, password-reset and registration links gated by public settings, TOTP state, OAuth section, inline error region, and retry action. Use icon components for back, external link, retry, and password visibility.

- [ ] **Step 4: Harden bootstrap and redirect behavior**

Ensure bootstrap completes once, route guards wait on readiness, offline startup retains stored credentials, invalid sessions clear them, unauthorized events redirect to login, successful login replaces history with dashboard, and logout always clears the local session.

- [ ] **Step 5: Run login tests and build for GREEN**

Run: `pnpm test:run src/views/LoginView.spec.ts && pnpm build`

Expected: login tests pass and the frontend build exits 0.

## Task 4: Redesign The Shell And Dashboard

**Files:**
- Create: `clients/desktop/src/components/MetricStrip.vue`
- Create: `clients/desktop/src/components/MetricStrip.spec.ts`
- Modify: `clients/desktop/src/components/TrendChart.vue`
- Create: `clients/desktop/src/components/TrendChart.spec.ts`
- Modify: `clients/desktop/src/layouts/AppLayout.vue`
- Modify: `clients/desktop/src/views/DashboardView.vue`
- Create: `clients/desktop/src/views/DashboardView.spec.ts`
- Modify: `clients/desktop/src/style.css`

- [ ] **Step 1: Add failing metric, chart, and dashboard tests**

```ts
expect(wrapper.get('[data-testid="metric-today-requests"]').text()).toContain('1,240')
expect(wrapper.find('[data-testid="trend-empty"]').exists()).toBe(true)
expect(wrapper.find('[data-testid="cost-metric"]').exists()).toBe(false) // simple mode
```

Also verify partial endpoint failures preserve successful stats and expose a scoped refresh message.

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `pnpm test:run src/components/MetricStrip.spec.ts src/components/TrendChart.spec.ts src/views/DashboardView.spec.ts`

Expected: FAIL because the new component contracts and states are absent.

- [ ] **Step 3: Implement the LinAI shell**

Use a pale navigation rail with native traffic-light inset, runtime LinAI logo/name, a single dashboard destination for this release, a compact user identity, and icon-only logout with accessible label and tooltip. The content canvas uses cool white bands, graphite type, thin borders, and restrained 6-8 px radii.

- [ ] **Step 4: Implement the data-first dashboard**

Add a stable headline metric strip, compact operational health row, responsive trend visualization with axes and pointer detail, model usage ranking, platform distribution table, loading skeletons, empty states, standard/simple mode behavior, and partial refresh errors. Preserve the one-minute refresh interval and clear it on unmount.

- [ ] **Step 5: Run dashboard tests and build for GREEN**

Run: `pnpm test:run src/components/MetricStrip.spec.ts src/components/TrendChart.spec.ts src/views/DashboardView.spec.ts && pnpm build`

Expected: focused tests pass and build exits 0.

## Task 5: End-To-End Verification And macOS Package

**Files:**
- Modify as failures require: `clients/desktop/src/**`
- Output: `clients/desktop/src-tauri/target/release/bundle/macos/LinAI.app`
- Output: `clients/desktop/src-tauri/target/release/bundle/dmg/*.dmg`

- [ ] **Step 1: Run all automated gates**

Run: `pnpm test:run && pnpm build && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: zero failing tests and both TypeScript/Vite and Rust checks exit 0.

- [ ] **Step 2: Probe the live anonymous contract**

Run read-only requests against `/api/v1/settings/public` and an intentionally invalid `/api/v1/auth/login` payload. Confirm LinAI branding and the expected API envelope without transmitting real credentials.

- [ ] **Step 3: Verify browser rendering**

Inspect login at 1180 x 780 and 900 x 620. Use controlled test state or fixture interception to inspect the authenticated dashboard at both sizes. Confirm no overlap, no horizontal overflow, stable loading/error states, keyboard focus, rendered logo, and no console errors.

- [ ] **Step 4: Build and inspect the macOS package**

Run: `pnpm tauri build --bundles app,dmg`

Verify bundle identifier, display name, icons, architecture, `.app` launch, and DMG contents. Record the final artifact paths and SHA256 checksums.

- [ ] **Step 5: Review repository state**

Run: `git status --short`, `git diff --check`, and an explicit `rg -n -i 'sub2api' clients/desktop` with generated dependency/build directories excluded. Confirm only intended client and planning files are part of this work.
