# Desktop Floating Primary Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the macOS floating usage surface show the longest configured quota as a non-duplicated primary metric with remaining-width progress, split percentage typography, comfortable spacing, and restrained motion.

**Architecture:** Keep `UsageQuotaSummary` semantics unchanged and add a floating-only selector that derives a longest-period primary quota plus shorter secondary quotas. A floating metric component owns number/suffix typography for both the expanded card and orb. Shared `QuotaRow` gains an opt-in remaining-fill mode while retaining the menu-bar's existing used-fill default.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, CSS, Tauri 2, Rust.

---

## File Map

**Create:**

- `clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.ts` - floating-only primary/secondary period selection.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.spec.ts` - period-order and fallback coverage.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.vue` - split percentage number/suffix presentation.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.spec.ts` - percentage and non-percentage rendering coverage.

**Modify:**

- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingSubscriptionOverview.vue` - primary quota, primary progress, metadata, secondary rows, and footer.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue` - compose `FloatingMetricValue`.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue` - make orb use the floating primary quota.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts` - expanded hierarchy and progress assertions.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts` - orb period and split typography assertions.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css` - spacing, split percentage sizing, progress, and reduced-motion rules.
- `clients/desktop/src/features/usage-display/external/macos/shared/QuotaRow.vue` - optional remaining-fill progress mode.
- `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts` - preserve menu-bar default fill direction and controls.

### Task 1: Floating Quota Selection

**Files:**

- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.ts`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.spec.ts`

- [ ] **Step 1: Write failing primary-period tests**

Create tests using resolved quota fixtures that assert:

```ts
expect(resolveFloatingQuotaPresentation(summary).primary?.key).toBe('monthly')
expect(resolveFloatingQuotaPresentation(summary).secondary.map((quota) => quota.key))
  .toEqual(['weekly', 'daily'])
```

Add a no-month fixture expecting weekly primary and daily secondary, plus an unlimited fixture expecting `primary: null` and `secondary: []`.

- [ ] **Step 2: Run the selector test and verify RED**

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/floating-window/quota-presentation.spec.ts
```

Expected: fail because `quota-presentation.ts` does not exist.

- [ ] **Step 3: Implement the floating-only selector**

Use an explicit longest-to-shortest order without changing the shared summary:

```ts
const quotaOrder = ['monthly', 'weekly', 'daily'] as const

export function resolveFloatingQuotaPresentation(summary: UsageQuotaSummary | null) {
  const byKey = new Map(summary?.quotas.map((quota) => [quota.key, quota]) ?? [])
  const ordered = quotaOrder.flatMap((key) => {
    const quota = byKey.get(key)
    return quota ? [quota] : []
  })
  return { primary: ordered[0] ?? null, secondary: ordered.slice(1) }
}
```

- [ ] **Step 4: Run the selector test and verify GREEN**

Run the Step 2 command. Expected: all selector tests pass.

- [ ] **Step 5: Commit selector behavior**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.ts \
  clients/desktop/src/features/usage-display/external/macos/floating-window/quota-presentation.spec.ts
git commit -m "feat(desktop): select floating primary quota"
```

### Task 2: Split Percentage Metric And Orb Semantics

**Files:**

- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`

- [ ] **Step 1: Write failing metric and orb tests**

Assert that `100%` renders separate elements while currency stays intact:

```ts
expect(wrapper.get('[data-testid="floating-metric-number"]').text()).toBe('100')
expect(wrapper.get('[data-testid="floating-metric-suffix"]').text()).toBe('%')
expect(balanceWrapper.get('[data-testid="floating-metric-number"]').text()).toBe('$129')
expect(balanceWrapper.find('[data-testid="floating-metric-suffix"]').exists()).toBe(false)
```

Extend the floating-window subscription fixture so weekly is most constrained but monthly is configured, then assert the orb number equals the monthly remaining percentage.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/floating-window/FloatingMetricValue.spec.ts \
  src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
```

Expected: metric component missing and orb still uses `quotaSummary.remainingPercent`.

- [ ] **Step 3: Implement split metric rendering**

`FloatingMetricValue.vue` parses only whole-number percentages:

```vue
<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: string }>()
const percentage = computed(() => props.value.match(/^(\d+)(%)$/))
</script>

<template>
  <strong class="floating-metric-value" :class="{ 'is-percentage': percentage }">
    <span data-testid="floating-metric-number">{{ percentage?.[1] ?? value }}</span>
    <small v-if="percentage" data-testid="floating-metric-suffix">{{ percentage[2] }}</small>
  </strong>
</template>
```

Compose it in `FloatingUsageOrb.vue`. In `MacOSFloatingWindow.vue`, resolve the floating primary quota and pass its remaining percentage to `formatUsageOrbValue`; preserve `∞` and `--` fallbacks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: metric and floating-window tests pass.

- [ ] **Step 5: Commit metric and orb behavior**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.vue \
  clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingMetricValue.spec.ts \
  clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue \
  clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue \
  clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
git commit -m "feat(desktop): clarify floating quota metric"
```

### Task 3: Expanded Primary Quota And Remaining Progress

**Files:**

- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingSubscriptionOverview.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/QuotaRow.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts`

- [ ] **Step 1: Replace hierarchy tests with the approved contract**

Use a summary where weekly has 42% remaining and monthly has 76% remaining. Assert:

```ts
expect(wrapper.get('[data-testid="floating-primary-label"]').text()).toBe('月额度剩余')
expect(wrapper.get('[data-testid="floating-metric-number"]').text()).toBe('76')
expect(wrapper.get('[data-testid="floating-primary-progress"] span').attributes('style'))
  .toContain('width: 76%')
expect(wrapper.findAll('[data-testid="usage-quota-row"]')).toHaveLength(1)
expect(wrapper.get('[data-testid="usage-quota-row"]').text()).toContain('周额度')
expect(wrapper.get('[data-testid="usage-quota-row"]').text()).not.toContain('月额度')
```

Use a 100%-remaining secondary quota to prove its track exists with `width: 100%`. In `UsageQuotaCard.spec.ts`, assert the shared default still fills used percentage (`width: 0%` at 100% remaining).

- [ ] **Step 2: Run overview and shared tests and verify RED**

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts \
  src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts
```

Expected: old generic label, duplicated monthly row, missing primary track, hidden 100% track, and used-width secondary progress.

- [ ] **Step 3: Add opt-in remaining progress to `QuotaRow`**

Replace `hideUnusedTrack` with a default-preserving mode:

```ts
const props = withDefaults(defineProps<{
  quota: ResolvedUsageQuota
  showIcon?: boolean
  fillMode?: 'used' | 'remaining'
}>(), { showIcon: true, fillMode: 'used' })

const progressStyle = computed(() => ({
  width: `${props.fillMode === 'remaining'
    ? props.quota.remainingPercent
    : 100 - props.quota.remainingPercent}%`,
}))
```

Always render the semantic track. Menu-bar callers keep `fillMode='used'`; floating secondary rows pass `fill-mode="remaining"`.

- [ ] **Step 4: Implement the expanded primary block**

Resolve `primary` and `secondary`, then render:

```vue
<div v-if="primary" class="subscription-primary" :class="{ constrained: primary.remainingPercent <= 20 }">
  <div class="external-primary">
    <span data-testid="floating-primary-label">{{ primary.label }}剩余</span>
    <FloatingMetricValue :value="`${primary.remainingPercent}%`" />
    <div class="floating-primary-track" data-testid="floating-primary-progress">
      <span :style="{ width: `${primary.remainingPercent}%` }" />
    </div>
    <div class="floating-primary-meta">
      <span>${{ primary.used.toFixed(2) }} / ${{ primary.limit.toFixed(2) }}</span>
      <small>{{ resetLabel(primary.resetAt) }}</small>
    </div>
  </div>
</div>
```

Render only `secondary` through `QuotaRow`. Preserve unlimited, unavailable, and expiration behavior.

- [ ] **Step 5: Run overview and shared tests and verify GREEN**

Run the Step 2 command. Expected: both test files pass and menu-bar defaults remain intact.

- [ ] **Step 6: Commit expanded hierarchy**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingSubscriptionOverview.vue \
  clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts \
  clients/desktop/src/features/usage-display/external/macos/shared/QuotaRow.vue \
  clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts
git commit -m "feat(desktop): promote longest floating quota"
```

### Task 4: Spacing, Motion, Visual Verification, And Push

**Files:**

- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`

- [ ] **Step 1: Implement the approved floating-only visual rules**

Add a clear primary rhythm, split suffix sizing, remaining progress styles, and finite motion:

```css
.floating-metric-value small { margin-left: 3px; font-size: 0.45em; font-weight: 560; }
.floating-primary-track,
.floating-usage-card .quota-track { height: 4px; border-radius: 2px; }
.floating-primary-track span,
.floating-usage-card .quota-track span { transition: width 200ms ease-out; }
.floating-metric-value { animation: floating-metric-enter 180ms ease-out both; }

@keyframes floating-metric-enter {
  from { opacity: 0.55; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .floating-metric-value { animation: none; }
  .floating-primary-track span,
  .floating-usage-card .quota-track span { transition: none; }
}
```

Use spacing that fits the 336-pixel card with one primary block, up to two secondary rows, and the expiration footer. Do not add dividers, SVGs, `zoom`, or `transform: scale(...)`.

- [ ] **Step 2: Run complete automated verification**

```bash
pnpm --dir clients/desktop test:run
pnpm --dir clients/desktop run build
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo fmt --manifest-path clients/desktop/src-tauri/Cargo.toml -- --check
git diff --check
```

Expected: all frontend and Rust tests pass; build, type checking, formatting, and diff checks exit 0.

- [ ] **Step 3: Verify all floating appearances at native geometry**

Run the visual server and inspect subscription floating pages at a 352-by-352 viewport for `default`, `dark`, and `blur`. Confirm:

- monthly primary and no duplicated monthly row;
- primary and weekly/daily progress tracks are visible;
- number and percent sign have distinct sizes and lighter weight;
- comfortable vertical spacing with no clipped reset or expiration text;
- `clientHeight === scrollHeight`, no SVGs, and zero console warnings/errors;
- reduced-motion rules report `animation-name: none` and `transition-duration: 0s` under reduced-motion emulation.

Also inspect the menu-bar popover and confirm its controls, icons, constrained metric, and used-width tracks are unchanged.

- [ ] **Step 4: Commit visual styling**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css
git commit -m "style(desktop): space floating quota progress"
```

- [ ] **Step 5: Push all completed commits**

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git push origin main
git rev-list --left-right --count origin/main...HEAD
```

Expected: `.superpowers/` remains the only untracked path, `cc-switch/` and `ccs/` are absent, and final origin divergence is `0 0`.
