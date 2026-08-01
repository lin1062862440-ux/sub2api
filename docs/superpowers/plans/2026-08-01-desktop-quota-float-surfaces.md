# Desktop Quota-Float External Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mutually exclusive macOS menu-bar and floating-window usage surfaces with default, dark, and blur appearances while keeping configuration inside the application-themed settings dialog.

**Architecture:** Extend the existing per-user usage configuration and store, replace tray-specific host calls with a unified surface contract, share only external quota presentation under `external/macos/shared/`, and give the menu-bar and floating-window surfaces independent entries and shells. Rust remains authoritative for surface exclusivity, native window lifecycle, floating geometry, dragging, and position persistence.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, Vite multi-page build, Tauri 2, Rust, Tauri Store, window-vibrancy, Lucide Vue.

---

## Working Tree Safety

The branch contains substantial pre-existing uncommitted Desktop work, including the current usage-display implementation. Preserve all unrelated changes. During implementation, do not commit implementation files unless the user explicitly authorizes it; the plan document may be committed independently.

## Final File Map

**Create:**

- `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.vue`
- `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts`
- `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.vue`
- `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts`
- `clients/desktop/src/features/usage-display/external/macos/shared/BalanceOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/shared/SubscriptionOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/shared/QuotaRow.vue`
- `clients/desktop/src/features/usage-display/external/macos/shared/appearance.ts`
- `clients/desktop/src/features/usage-display/external/macos/shared/quota-float-themes.css`
- `clients/desktop/src/features/usage-display/external/macos/floating-window/entry.ts`
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue`
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`
- `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue`
- `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`
- `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`
- `clients/desktop/usage-floating-window.html`

**Modify:**

- `clients/desktop/src/features/usage-display/core/storage.ts`
- `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- `clients/desktop/src/features/usage-display/core/host.ts`
- `clients/desktop/src/features/usage-display/core/host.spec.ts`
- `clients/desktop/src/features/usage-display/core/store.ts`
- `clients/desktop/src/features/usage-display/core/store.spec.ts`
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.vue`
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/entry.ts`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/macos-menu-bar.css`
- `clients/desktop/src/test/visual/usage-display-storage.ts`
- `clients/desktop/vite.config.ts`
- `clients/desktop/src-tauri/src/usage_display/mod.rs`
- `clients/desktop/src-tauri/src/usage_display/macos/mod.rs`
- `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- `clients/desktop/src-tauri/src/lib.rs`
- `clients/desktop/src-tauri/capabilities/default.json`
- `clients/desktop/THIRD_PARTY_NOTICES.md`

**Delete after imports migrate:**

- `clients/desktop/src/features/usage-display/external/macos/menu-bar/BalanceOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/SubscriptionOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/QuotaRow.vue`

## Task 1: Configuration Migration And Unified Frontend Host Contract

**Files:**

- Modify: `clients/desktop/src/features/usage-display/core/storage.ts`
- Modify: `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/core/host.ts`
- Modify: `clients/desktop/src/features/usage-display/core/host.spec.ts`
- Modify: `clients/desktop/src/test/visual/usage-display-storage.ts`

- [ ] **Step 1: Add failing storage migration tests**

Assert the full default and legacy normalization:

```ts
expect(defaultUsageDisplayConfig()).toEqual({
  enabled: false,
  source: 'balance',
  subscriptionId: null,
  surface: 'menu-bar',
  appearance: 'default',
})

mocks.get.mockResolvedValue({ enabled: true, source: 'balance', subscriptionId: null })
await expect(loadUsageDisplayConfig(42)).resolves.toMatchObject({
  enabled: true,
  surface: 'menu-bar',
  appearance: 'default',
})
```

Add cases proving unknown `surface` and `appearance` values normalize independently while invalid enabled subscription data falls back to the complete default.

- [ ] **Step 2: Run the storage test and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run src/features/usage-display/core/storage.spec.ts
```

Expected: FAIL because the new fields do not exist.

- [ ] **Step 3: Implement field-level normalization**

Add exported types and normalize a valid base object:

```ts
export type UsageDisplaySurface = 'menu-bar' | 'floating-window'
export type UsageDisplayAppearance = 'default' | 'dark' | 'blur'

function normalizeConfig(value: unknown): UsageDisplayConfig {
  const fallback = defaultUsageDisplayConfig()
  if (!hasValidBaseFields(value)) return fallback
  return {
    enabled: value.enabled,
    source: value.source,
    subscriptionId: value.subscriptionId,
    surface: value.surface === 'floating-window' || value.surface === 'menu-bar'
      ? value.surface
      : fallback.surface,
    appearance: value.appearance === 'dark' || value.appearance === 'blur' || value.appearance === 'default'
      ? value.appearance
      : fallback.appearance,
  }
}
```

Validate the normalized complete value before saving. Update the browser visual storage mock to return the new default shape.

- [ ] **Step 4: Add failing unified bridge tests**

Replace tray-only assertions with:

```ts
await configureUsageDisplay({
  enabled: true,
  surface: 'floating-window',
  title: '余额 $12.50',
  appearance: 'blur',
})
await setUsageDisplayTitle('Claude Pro 73%')
await setFloatingUsageExpanded(true)
await startFloatingUsageDrag()

expect(mocks.invoke.mock.calls).toContainEqual([
  'configure_usage_display',
  { enabled: true, surface: 'floating-window', title: '余额 $12.50', appearance: 'blur' },
])
```

- [ ] **Step 5: Implement the unified bridge and verify green**

Expose `configureUsageDisplay`, `setUsageDisplayTitle`, `setFloatingUsageExpanded`, and `startFloatingUsageDrag`. Retain `hideUsageDisplay`, `openMainWindow`, and `quitDesktopApp`. Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/core/storage.spec.ts \
  src/features/usage-display/core/host.spec.ts
```

Expected: both files PASS.

## Task 2: Store Surface Coordination And Compact Orb Values

**Files:**

- Modify: `clients/desktop/src/features/usage-display/core/store.ts`
- Modify: `clients/desktop/src/features/usage-display/core/store.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/core/format.ts`
- Modify: `clients/desktop/src/features/usage-display/core/format.spec.ts`

- [ ] **Step 1: Write failing store tests for complete host configuration**

Change the dependency to:

```ts
configureDisplay: (config: {
  enabled: boolean
  surface: UsageDisplaySurface
  title: string
  appearance: UsageDisplayAppearance
}) => Promise<void>
```

Assert enabled floating configuration calls:

```ts
expect(deps.configureDisplay).toHaveBeenLastCalledWith({
  enabled: true,
  surface: 'floating-window',
  title: '余额 $128.60',
  appearance: 'dark',
})
```

Assert detach sends a disabled configuration while retaining a valid surface and appearance payload. Assert the settings-only store never calls `configureDisplay`.

- [ ] **Step 2: Add compact value formatter tests**

Cover `$129`, `$1.2K`, `26%`, `∞`, and `--` through one `formatUsageOrbValue` function. Values must stay at or below six visible characters for finite currency output.

- [ ] **Step 3: Run focused tests and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/core/format.spec.ts \
  src/features/usage-display/core/store.spec.ts
```

Expected: FAIL on the old tray dependency and missing orb formatter.

- [ ] **Step 4: Implement surface-aware synchronization**

Replace `syncTray()` with `syncDisplay()` and send the complete native configuration. Refresh updates the title through `setUsageDisplayTitle` only when the selected surface is `menu-bar`; the unified configure call remains responsible for visibility and appearance transitions. Preserve sequence invalidation, partial data retention, and the settings-store options.

- [ ] **Step 5: Run focused tests and verify green**

Run the Task 2 command. Expected: PASS.

## Task 3: Shared External Quota Card And Three Themes

**Files:**

- Create: `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts`
- Move: balance, subscription, and quota-row components into `external/macos/shared/`
- Create: `clients/desktop/src/features/usage-display/external/macos/shared/appearance.ts`
- Create: `clients/desktop/src/features/usage-display/external/macos/shared/quota-float-themes.css`

- [ ] **Step 1: Write failing shared-card tests**

Mount a props-driven card instead of importing the singleton store. Assert:

```ts
expect(wrapper.attributes('data-appearance')).toBe('default')
expect(wrapper.text()).toContain('$128.60')
expect(wrapper.text()).toContain('今日消费')
expect(wrapper.find('[data-testid="usage-settings-action"]').exists()).toBe(false)
```

Add table-driven `default`, `dark`, and `blur` cases, balance without a progress element, constrained subscription progress, unlimited `∞`, stale notice, and action emissions for `refresh`, `open-main`, and `quit`.

- [ ] **Step 2: Run the shared-card test and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts
```

Expected: FAIL because the shared component does not exist.

- [ ] **Step 3: Implement external appearance metadata**

Export a frozen record:

```ts
export const usageAppearances = [
  { id: 'default', label: '默认浅色' },
  { id: 'dark', label: '深色' },
  { id: 'blur', label: 'Blur' },
] as const
```

The CSS defines complete variable records under `[data-appearance='default']`, `[data-appearance='dark']`, and `[data-appearance='blur']`. Do not use filter inversion or import main application modal styles.

- [ ] **Step 4: Implement the shared card and move source views**

`UsageQuotaCard.vue` receives source, appearance, snapshots, update state, and `draggable` props. It emits only `refresh`, `open-main`, `quit`, and `drag`. The header uses Lucide `RefreshCw`, `ExternalLink`, and `Power` buttons with tooltips. Balance renders no fake percentage. Subscription reuses the existing quota calculation and rows.

- [ ] **Step 5: Run the shared-card tests and verify green**

Run the Task 3 command. Expected: PASS.

## Task 4: Internal Surface And Appearance Controls

**Files:**

- Create: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.vue`
- Create: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.vue`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`

- [ ] **Step 1: Write failing appearance chooser tests**

Assert three fixed thumbnail buttons, names, `aria-pressed`, a visible check icon for the active choice, and `update:modelValue` on click. Verify the component imports no external CSS and renders samples without mounting `UsageQuotaCard`.

- [ ] **Step 2: Update dialog tests in red state**

Assert the dialog contains `启用外部用量显示`, `展示位置`, `菜单栏`, `悬浮窗`, `展示样式`, `默认浅色`, `深色`, and `Blur`. Assert it still excludes `刷新`, `打开主窗口`, `退出`, and settings gear actions.

Exercise surface and appearance changes and expect complete configs:

```ts
expect(mocks.updateConfig).toHaveBeenCalledWith({
  enabled: true,
  source: 'balance',
  subscriptionId: null,
  surface: 'floating-window',
  appearance: 'blur',
})
```

- [ ] **Step 3: Run settings tests and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts \
  src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts
```

- [ ] **Step 4: Implement application-themed controls**

Rename the toggle and supporting text, add a two-option surface segmented control, preserve the staged subscription-source behavior, and mount the thumbnail chooser. Menu-bar preview uses `trayTitle`; floating preview uses `formatUsageOrbValue`. Keep dialog width responsive and give all fixed controls stable grid tracks.

- [ ] **Step 5: Verify settings tests green**

Run the Task 4 command. Expected: PASS.

## Task 5: Native Surface Coordinator And Floating Geometry

**Files:**

- Modify: `clients/desktop/src-tauri/src/usage_display/mod.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/mod.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Create: `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing pure Rust transition and geometry tests**

Define and test `UsageSurface`, `HostTransition`, and pure geometry helpers. Cover:

```rust
assert_eq!(bottom_right(work_area(0, 0, 1440, 900), size(72, 72), 20), point(1348, 808));
assert_eq!(expand_from_anchor(rect(1348, 808, 72, 72), size(336, 336), work_area(0, 0, 1440, 900)), point(1084, 544));
assert_eq!(clamp(point(-1400, 720), size(72, 72), work_area(-1280, 0, 1280, 800)), point(-1280, 720));
```

Add a transition truth table proving disabled hides both, menu-bar removes floating, and floating removes the tray and hides the popover.

- [ ] **Step 2: Run Rust tests and verify red**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display --lib
```

Expected: FAIL because the new coordinator and floating module do not exist.

- [ ] **Step 3: Implement the unified host state and commands**

Add active-surface state guarded by a mutex plus enabled state. Replace `configure_usage_tray` with `configure_usage_display`, rename the title command, and add `set_floating_usage_expanded` and `start_floating_usage_drag`. Validate `surface` and `appearance` strings at the command boundary. Validate window labels inside floating-only commands.

- [ ] **Step 4: Implement lazy floating-window creation**

Create `usage-floating-window` from `usage-floating-window.html` with collapsed size, decorations off, transparent, non-resizable, always on top, skip taskbar, and hidden initially. Apply or clear macOS vibrancy according to appearance, with CSS fallback on failure.

- [ ] **Step 5: Implement geometry, dragging, and persistence**

Use pure physical-coordinate helpers for bottom-right placement, nearest-monitor selection, scale conversion, clamping, and edge-aware expansion. Persist the collapsed anchor under `usage_display:floating_position` after debounced move completion. The header and orb invoke native dragging; action buttons never do. Collapse returns to the confirmed collapsed anchor.

- [ ] **Step 6: Register commands and verify Rust green**

Update `generate_handler!`, run the Task 5 command, then run:

```bash
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
```

Expected: tests PASS and check exits 0.

## Task 6: Menu-Bar Migration And Floating Vue Entry

**Files:**

- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/entry.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/macos-menu-bar.css`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/entry.ts`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`

- [ ] **Step 1: Rewrite the menu-bar test in red state**

Assert the popover delegates balance, subscription, actions, and appearance to `UsageQuotaCard`, has no settings action, requests refresh on mount, and hides on Escape after the shared card emits open-main.

- [ ] **Step 2: Write failing floating-window tests**

Use fake timers. Assert collapsed orb content, native expand-before-card ordering, pointer-leave delay of 180 milliseconds, re-entry cancellation, drag bridge calls, all three appearance attributes, and fallback to the confirmed mode when expand fails.

- [ ] **Step 3: Run both surface tests and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts \
  src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
```

- [ ] **Step 4: Migrate the menu-bar shell**

Render `UsageQuotaCard` with store state and current appearance. Keep only anchored-popover behaviors in `macos-menu-bar.css`. The entry starts only when loaded configuration selects `menu-bar`; otherwise it stops and remains hidden.

- [ ] **Step 5: Implement the floating orb and window state machine**

The orb receives only display value, appearance, state, and drag events. `MacOSFloatingWindow.vue` owns `collapsed`, `expanding`, `expanded`, and `collapsing` confirmed states. It awaits `setFloatingUsageExpanded(true)` before showing the card, and hides card content before awaiting collapse. A monotonic interaction sequence rejects late native responses.

- [ ] **Step 6: Implement the floating entry and verify green**

The entry listens to session and config events exactly like the menu-bar entry but remains active only for `floating-window`. Run the Task 6 command. Expected: PASS.

## Task 7: Build Entries, Permissions, Attribution, And Full Verification

**Files:**

- Create: `clients/desktop/usage-floating-window.html`
- Modify: `clients/desktop/vite.config.ts`
- Modify: `clients/desktop/src-tauri/capabilities/default.json`
- Modify: `clients/desktop/THIRD_PARTY_NOTICES.md`
- Modify: `clients/desktop/src/test/visual/usage-display-storage.ts`

- [ ] **Step 1: Add the floating Vite entry and Tauri capability**

Add `usageFloatingWindow` to `build.rollupOptions.input`, mount it into `#usage-floating-window`, add the window label to capabilities, and retain only the native window permissions required by the explicit bridge.

- [ ] **Step 2: Add Quota Float attribution**

Record the source URL, `Copyright (c) 2026 Quota Float contributors`, and complete MIT permission and warranty text in `clients/desktop/THIRD_PARTY_NOTICES.md`. Do not copy its fonts, images, provider code, updater, or supporter license logic.

- [ ] **Step 3: Run focused and full frontend tests**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/core/format.spec.ts \
  src/features/usage-display/core/storage.spec.ts \
  src/features/usage-display/core/host.spec.ts \
  src/features/usage-display/core/store.spec.ts \
  src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts \
  src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts \
  src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts \
  src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts \
  src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts
pnpm --dir clients/desktop test:run
```

Expected: all tests PASS.

- [ ] **Step 4: Run production and native checks**

Run:

```bash
pnpm --dir clients/desktop build
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
```

Expected: all commands exit 0.

- [ ] **Step 5: Run browser visual verification**

Start the visual Vite server and capture screenshots for menu-bar balance/subscription and floating collapsed/expanded states under `default`, `dark`, and `blur`. Check desktop and narrow viewports for nonblank content, stable geometry, no text overlap, no unintended settings controls, and no console errors. Use canvas or screenshot pixel checks to reject blank external surfaces.

- [ ] **Step 6: Run native macOS smoke verification**

Verify one surface at a time: first menu-bar title and anchored popover, then floating bottom-right placement, hover expansion, 180-millisecond collapse, dragging, restart restore, main-window open, logout cleanup, and explicit quit. Confirm switching surfaces removes the previous surface immediately.

- [ ] **Step 7: Inspect the final diff without committing implementation**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Report implementation files separately from the branch's unrelated dirty changes. Do not stage or commit implementation without explicit user authorization.
