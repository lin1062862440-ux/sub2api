# Desktop Floating Usage Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a pearl-styled macOS floating usage orb and detail card without rectangular/clipped native shadows, header icons, or source-switch content squeezing.

**Architecture:** Give the floating surface its own `FloatingUsageCard.vue` and local CSS while retaining shared data formatters and overview components. A synchronous Vue configuration watcher collapses the renderer before native resize, while Rust expands the transparent host footprints and disables the native rectangular shadow.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, CSS, Tauri 2, Rust.

---

## File Map

**Create:**

- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.vue` — floating-only detail shell with no lifecycle actions.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts` — floating hierarchy, appearance, and no-icon contract.

**Modify:**

- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue` — single-value orb without brand or rendered errors.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue` — floating card composition and synchronous configuration collapse.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts` — source-switch and transition race coverage.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/entry.ts` — stop importing menu-bar/shared visual CSS.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css` — local pearl theme, stable orb, inset card, and all nested overview rules.
- `clients/desktop/src/features/usage-display/external/macos/shared/SubscriptionOverview.vue` — optional decorative-icon rendering, defaulting on for the menu bar.
- `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts` — prove menu-bar/shared card actions and icons are preserved.
- `clients/desktop/src-tauri/src/usage_display/mod.rs` — disable native shadow on the floating builder.
- `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs` — 88/352 host footprints and updated geometry expectations.

### Task 1: Floating-Only Card And Icon-Free Orb

**Files:**

- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/SubscriptionOverview.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts`

- [ ] **Step 1: Write failing floating presentation tests**

Add a test that mounts `FloatingUsageCard` with balance and subscription props and asserts the surface contract:

```ts
expect(wrapper.get('[data-testid="floating-usage-card"]').attributes('data-appearance')).toBe('default')
expect(wrapper.text()).toContain('本周剩余用量')
expect(wrapper.find('[data-testid="usage-refresh"]').exists()).toBe(false)
expect(wrapper.find('[data-testid="usage-open-main"]').exists()).toBe(false)
expect(wrapper.find('[data-testid="usage-quit"]').exists()).toBe(false)
expect(wrapper.find('svg').exists()).toBe(false)
```

Extend the orb assertion in `MacOSFloatingWindow.spec.ts`:

```ts
expect(orb.text()).toBe('$129')
expect(orb.find('.orb-brand').exists()).toBe(false)
expect(orb.find('[data-testid="floating-native-error"]').exists()).toBe(false)
```

Keep a shared-card assertion proving its existing action buttons still render so menu-bar behavior cannot be removed accidentally.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts \
  src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts \
  src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts
```

Expected: failure because `FloatingUsageCard.vue` does not exist and the orb still renders `.orb-brand` and native error copy.

- [ ] **Step 3: Implement the dedicated floating card**

Create a props-driven card with no action emits:

```vue
<section class="floating-usage-card" :data-appearance="appearance" data-testid="floating-usage-card">
  <header class="floating-card-head" @mousedown="startDrag">
    <p>LINAI · {{ source === 'subscription' ? 'PRO' : 'BALANCE' }}</p>
    <strong>{{ sourceName }}</strong>
    <span><i :class="{ stale: error }" />{{ error ? '数据可能已过期' : updateLabel }}</span>
  </header>
  <p v-if="error" class="floating-notice">{{ error }}</p>
  <BalanceOverview v-if="source === 'balance'" :balance="balance" />
  <SubscriptionOverview v-else :subscription="subscription" :quota-summary="quotaSummary" :show-icons="false" />
</section>
```

Add `showIcons?: boolean` to `SubscriptionOverview.vue`, default it to `true` with `withDefaults`, and wrap its three Lucide instances in `v-if="showIcons"`. This preserves the shared/menu-bar default while allowing a fully icon-free floating card.

Remove `.orb-brand` and the rendered `<small>` error from `FloatingUsageOrb.vue`. Retain `nativeError` as an accessibility-only `aria-description` value if present so failures do not affect geometry.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the command from Step 2. Expected: all three files pass.

- [ ] **Step 5: Commit the presentation boundary**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window \
  clients/desktop/src/features/usage-display/external/macos/shared/SubscriptionOverview.vue \
  clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts
git commit -m "feat(desktop): isolate floating usage presentation"
```

### Task 2: Source-Switch Collapse Transaction

**Files:**

- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`

- [ ] **Step 1: Make the mocked store reactive and add failing race tests**

Return `reactive(mocks.state)` from the store mock and mutate that shared reactive state during the test. Cover an expanded balance-to-subscription switch:

```ts
await wrapper.get('[data-testid="floating-usage-orb"]').trigger('mouseenter')
await flushPromises()
expect(wrapper.find('[data-testid="floating-usage-card"]').exists()).toBe(true)

mocks.state.config.source = 'subscription'
mocks.state.config.subscriptionId = 9
await nextTick()

expect(wrapper.find('[data-testid="floating-usage-card"]').exists()).toBe(false)
expect(wrapper.get('[data-testid="floating-usage-orb"]').text()).toBe('--')
expect(mocks.setExpanded).toHaveBeenLastCalledWith(false)
```

Add a subscription mismatch case where `state.subscription.id` is `8` while `config.subscriptionId` is `9`; the orb must show `--`, not the old quota percentage.

- [ ] **Step 2: Run the floating-window test and verify it fails**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
```

Expected: the existing component remains expanded or exposes the old subscription value.

- [ ] **Step 3: Implement synchronous configuration collapse**

Replace `UsageQuotaCard` with `FloatingUsageCard`, remove imports for `openMainWindow` and `quitDesktopApp`, and add:

```ts
const configIdentity = computed(() => `${state.config.source}:${state.config.subscriptionId ?? ''}`)

watch(configIdentity, () => {
  cancelCollapse()
  interactionSequence += 1
  mode.value = 'collapsed'
  nativeError.value = ''
  void setFloatingUsageExpanded(false).catch(() => {
    nativeError.value = '收起失败'
  })
}, { flush: 'sync' })
```

Guard the subscription orb value before formatting:

```ts
if (!state.subscription || state.subscription.id !== state.config.subscriptionId || !state.quotaSummary) {
  return formatUsageOrbValue({ kind: 'unavailable' })
}
```

Keep the existing sequence check in `expand()` so an expansion promise resolving after a configuration change cannot restore expanded mode.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the command from Step 2. Expected: all floating-window transition tests pass.

- [ ] **Step 5: Commit the race fix**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue \
  clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
git commit -m "fix(desktop): collapse floating usage on source changes"
```

### Task 3: Pearl Geometry And Native Transparent Gutters

**Files:**

- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/entry.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`
- Modify: `clients/desktop/src-tauri/src/usage_display/mod.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`

- [ ] **Step 1: Update Rust geometry tests first**

Change expected host footprints and anchors:

```rust
assert_eq!(
    bottom_right(WorkArea::new(0, 0, 1440, 900), WindowSize::new(88, 88), 20),
    WindowPoint::new(1332, 792),
);

assert_eq!(
    expand_from_anchor(
        WindowRect::new(1332, 792, 88, 88),
        WindowSize::new(352, 352),
        WorkArea::new(0, 0, 1440, 900),
    ),
    WindowPoint::new(1068, 528),
);
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display::macos::floating_window::tests
```

Expected: geometry expectations fail while constants remain 72 and 336.

- [ ] **Step 3: Implement native host geometry and shadow behavior**

Set:

```rust
pub(in crate::usage_display) const COLLAPSED_LOGICAL_SIZE: f64 = 88.0;
pub(in crate::usage_display) const EXPANDED_LOGICAL_SIZE: f64 = 352.0;
```

Add `.shadow(false)` to only the floating `WebviewWindowBuilder`; do not change the menu-bar popover builder.

- [ ] **Step 4: Implement the local floating visual system**

Remove the shared theme import from `floating-window/entry.ts`. Rewrite `macos-floating-window.css` so the host remains fully transparent and owns these stable dimensions:

```css
.floating-usage-orb { width: 66px; height: 66px; border-radius: 50%; }
.macos-floating-window > .floating-usage-card {
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  border-radius: 16px;
}
.floating-usage-card[data-appearance='default'] {
  background: linear-gradient(145deg, #dceaf7 0%, #eaf1e9 58%, #f6edd4 100%);
}
```

Define floating-local tokens for default, dark, and blur, then scope every reused overview selector below `.floating-usage-card`. Use a solid blue quota fill in all appearances. Constrain primary values with `min-width: 0`, `overflow: hidden`, and `text-overflow: ellipsis`.

- [ ] **Step 5: Verify Rust and frontend builds**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display::macos::floating_window::tests
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
pnpm --dir clients/desktop run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit geometry and visual styling**

```bash
git add clients/desktop/src/features/usage-display/external/macos/floating-window/entry.ts \
  clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css \
  clients/desktop/src-tauri/src/usage_display/mod.rs \
  clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs
git commit -m "style(desktop): polish macOS floating usage window"
```

### Task 4: Regression And Native Visual Acceptance

**Files:**

- Verify only; fix failures in the files owned by Tasks 1-3.

- [ ] **Step 1: Run complete frontend tests**

```bash
pnpm --dir clients/desktop test:run
```

Expected: every Vitest suite passes.

- [ ] **Step 2: Run formatting and diff checks**

```bash
cargo fmt --manifest-path clients/desktop/src-tauri/Cargo.toml -- --check
git diff --check
git status --short
```

Expected: formatting and diff checks exit 0; only intentional source changes and the untracked `.superpowers/` preview directory appear.

- [ ] **Step 3: Verify the browser visual harness**

Open the floating entry through the visual Vite server for balance and subscription sources in default, dark, and blur appearances. Capture desktop screenshots and confirm fixed 88/352 host geometry, one centered orb value, 8-pixel card gutter, intact corners, no header/body icons, no text overlap, and no console errors.

- [ ] **Step 4: Verify the real Tauri macOS window**

Use the running Desktop Dev client. Confirm the collapsed orb has no rectangular native shadow, the expanded pearl card has intact corners and shadow, dragging still works, hover collapse remains stable, and balance-to-subscription plus subscription-to-subscription changes never render an expanded card inside the collapsed host.

- [ ] **Step 5: Confirm isolation**

Open the main-client usage settings and the macOS menu-bar popover. Compare them with their pre-change behavior and confirm their layout, actions, theme selection, and controls are unchanged.

- [ ] **Step 6: Push the completed branch**

```bash
git status --short
git log --oneline origin/main..HEAD
git push origin main
git rev-list --left-right --count origin/main...HEAD
```

Expected: push succeeds and final divergence is `0 0`; `.superpowers/` remains untracked and is not pushed.
