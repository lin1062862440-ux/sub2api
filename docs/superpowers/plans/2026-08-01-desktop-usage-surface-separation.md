# Desktop Usage Surface Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared settings/overview popover with an application-themed internal configuration dialog and a separately owned macOS menu bar display surface.

**Architecture:** Shared configuration, persistence, calculations, and refresh state live under `features/usage-display/core/`. The main Webview owns `internal/settings/`, while the secondary Webview imports only `external/macos/menu-bar/`; configuration changes cross the Webview boundary through one typed Tauri event. Native code follows the same platform-to-surface boundary under `src-tauri/src/usage_display/macos/menu_bar.rs`.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, Vite multi-page build, Tauri 2, Rust, `window-vibrancy`.

---

## Working Tree Safety

The branch contains pre-existing uncommitted Desktop work and the current usage-display implementation overlaps some of those files. Preserve every unrelated change. Do not stage or commit implementation files unless the user separately authorizes the combined Desktop commit. This plan document may be committed independently.

## Final File Map

**Create or move into core:**

- `clients/desktop/src/features/usage-display/core/format.ts`
- `clients/desktop/src/features/usage-display/core/format.spec.ts`
- `clients/desktop/src/features/usage-display/core/host.ts`
- `clients/desktop/src/features/usage-display/core/host.spec.ts`
- `clients/desktop/src/features/usage-display/core/storage.ts`
- `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- `clients/desktop/src/features/usage-display/core/store.ts`
- `clients/desktop/src/features/usage-display/core/store.spec.ts`

**Create internal settings:**

- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.vue`
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`

**Move into the macOS menu bar surface:**

- `clients/desktop/src/features/usage-display/external/macos/menu-bar/entry.ts`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/BalanceOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/SubscriptionOverview.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/QuotaRow.vue`
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/macos-menu-bar.css`

**Modify:**

- `clients/desktop/src/layouts/AppLayout.vue`
- `clients/desktop/src/layouts/AppLayout.spec.ts`
- `clients/desktop/src/App.vue`
- `clients/desktop/src/App.spec.ts`
- `clients/desktop/usage-popover.html`
- `clients/desktop/src-tauri/src/lib.rs`

**Move native host:**

- `clients/desktop/src-tauri/src/usage_display.rs` to `clients/desktop/src-tauri/src/usage_display/mod.rs`
- Native menu bar details to `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`

No empty Windows, Linux, or floating-window directories are created in this change.

## Task 1: Shared Core And Configuration Event

**Files:**

- Move: `clients/desktop/src/lib/usage-display-format.ts` to `clients/desktop/src/features/usage-display/core/format.ts`
- Move: `clients/desktop/src/lib/usage-display-format.spec.ts` to `clients/desktop/src/features/usage-display/core/format.spec.ts`
- Move: `clients/desktop/src/lib/usage-display-host.ts` to `clients/desktop/src/features/usage-display/core/host.ts`
- Move: `clients/desktop/src/lib/usage-display-host.spec.ts` to `clients/desktop/src/features/usage-display/core/host.spec.ts`
- Move: `clients/desktop/src/lib/usage-display-storage.ts` to `clients/desktop/src/features/usage-display/core/storage.ts`
- Move: `clients/desktop/src/lib/usage-display-storage.spec.ts` to `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- Move: `clients/desktop/src/stores/usage-display.ts` to `clients/desktop/src/features/usage-display/core/store.ts`
- Move: `clients/desktop/src/stores/usage-display.spec.ts` to `clients/desktop/src/features/usage-display/core/store.spec.ts`

- [ ] **Step 1: Add failing host-event and settings-store tests**

Add a host assertion:

```ts
await notifyUsageConfigChanged(42)
expect(emit).toHaveBeenCalledWith('usage-display://config-changed', 42)
```

Add a store assertion proving the internal settings instance does not create a scheduler while attaching an enabled user:

```ts
const store = createUsageDisplayStore(deps, { backgroundRefresh: false, syncTrayOnAttach: false })
await store.attachUser(user())
await store.loadSubscriptions()

expect(deps.setInterval).not.toHaveBeenCalled()
expect(deps.configureTray).not.toHaveBeenCalled()
expect(store.state.trayTitle).toBe('Claude Pro 20%')
```

- [ ] **Step 2: Run focused tests and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/core/host.spec.ts \
  src/features/usage-display/core/store.spec.ts
```

Expected: FAIL because `notifyUsageConfigChanged` and the store options do not exist.

- [ ] **Step 3: Implement the narrow core contract**

Add to `host.ts`:

```ts
export function notifyUsageConfigChanged(userId: number): Promise<void> {
  return safeEmit('usage-display://config-changed', userId)
}
```

Extend the factory without changing default external behavior:

```ts
export interface UsageDisplayStoreOptions {
  backgroundRefresh?: boolean
  syncTrayOnAttach?: boolean
}

export function createUsageDisplayStore(
  deps: UsageDisplayDependencies = defaultDependencies,
  options: UsageDisplayStoreOptions = {},
) {
  const backgroundRefresh = options.backgroundRefresh ?? true
  const syncTrayOnAttach = options.syncTrayOnAttach ?? true
  // Existing state and functions remain unchanged.
}
```

`attachUser()` calls `syncTray()` only when `syncTrayOnAttach` is true and calls `start()` only when `backgroundRefresh` is true. `updateConfig()` still persists and synchronizes the tray, but starts the scheduler only when `backgroundRefresh` is true. `loadSubscriptions()` recomputes `state.trayTitle` after selecting the stored subscription so the internal preview is current without touching the tray.

- [ ] **Step 4: Move core files and update imports mechanically**

Update all imports to the new feature paths. Remove the old `src/lib/usage-display-*` and `src/stores/usage-display*` locations after no references remain.

- [ ] **Step 5: Run focused tests and verify green**

Run the Task 1 command again.

Expected: all focused tests PASS and `rg -n "@/lib/usage-display|@/stores/usage-display" clients/desktop/src` returns no matches.

## Task 2: Application-Themed Internal Settings Dialog

**Files:**

- Create: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.vue`
- Create: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`
- Create: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`
- Modify: `clients/desktop/src/layouts/AppLayout.vue`
- Modify: `clients/desktop/src/layouts/AppLayout.spec.ts`

- [ ] **Step 1: Write failing dialog tests**

Mount the dialog with a mocked core store and assert:

```ts
expect(wrapper.get('[data-testid="usage-display-dialog"]').attributes('role')).toBe('dialog')
expect(wrapper.text()).toContain('设置菜单栏常驻信息')
expect(wrapper.text()).toContain('在菜单栏显示')
expect(wrapper.text()).toContain('账户余额')
expect(wrapper.text()).toContain('订阅组')
expect(wrapper.text()).toContain('完成')
expect(wrapper.text()).not.toContain('打开主窗口')
expect(wrapper.text()).not.toContain('退出')
expect(wrapper.text()).not.toContain('刷新')
```

Verify an enabled balance source stages subscription selection without an invalid update, then emits one complete subscription configuration after selection. Verify successful changes call `notifyUsageConfigChanged(user.id)`. Verify close button, `完成`, Escape, and backdrop click emit `update:modelValue(false)`.

- [ ] **Step 2: Update the AppLayout test in red state**

Remove the `openUsageDisplaySettings` host mock. Click the avatar-menu item and assert:

```ts
expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false)
expect(wrapper.get('[data-testid="usage-display-dialog"]').text()).toContain('用量显示')
```

Expected: FAIL because the menu still opens the secondary Webview.

- [ ] **Step 3: Run dialog and layout tests to verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts \
  src/layouts/AppLayout.spec.ts
```

- [ ] **Step 4: Implement the internal form**

`UsageDisplaySettingsForm.vue` owns application-themed markup only. It receives `config`, `platform`, `subscriptions`, and `trayTitle`, and emits complete `UsageDisplayConfig` values. Keep a local selected-source draft so clicking subscription while an enabled balance source is active displays the selector without emitting an invalid configuration.

Use the existing Desktop tokens and control vocabulary:

```css
.settings-segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 3px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.settings-segmented button[aria-pressed='true'] {
  background: var(--bg-surface);
  color: var(--accent-strong);
}
```

- [ ] **Step 5: Implement the internal dialog shell and state lifecycle**

Use `Teleport`, `Transition`, `role="dialog"`, `aria-modal="true"`, focus-on-open, Escape, and backdrop dismissal following `ChangePasswordDialog.vue`. Create the local store as:

```ts
const settingsStore = createUsageDisplayStore(undefined, {
  backgroundRefresh: false,
  syncTrayOnAttach: false,
})
```

On open, attach `session.user` and load subscriptions. On a successful form update, call `settingsStore.updateConfig(config)` and then `notifyUsageConfigChanged(user.id)`. On close or unmount call `settingsStore.stop(false)` without removing the active tray.

The dialog uses content-driven height, a maximum width of 468 pixels, an `X` icon, and a footer with only `完成`.

- [ ] **Step 6: Wire the avatar menu to the internal dialog**

Replace the bridge call with local state:

```ts
const usageDisplayDialogOpen = ref(false)

function openUsageDisplay() {
  closeAccountMenu()
  usageDisplayDialogOpen.value = true
}
```

Render:

```vue
<UsageDisplayDialog v-model="usageDisplayDialogOpen" :user="user" />
```

- [ ] **Step 7: Run focused tests and verify green**

Run the Task 2 test command.

Expected: both files PASS, and the internal dialog contains no external lifecycle actions.

## Task 3: Isolated macOS Menu Bar Surface

**Files:**

- Move: `clients/desktop/src/usage-popover.ts` to `clients/desktop/src/features/usage-display/external/macos/menu-bar/entry.ts`
- Move: `clients/desktop/src/components/UsageDisplayPopover.vue` to `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.vue`
- Move: `clients/desktop/src/components/UsageDisplayPopover.spec.ts` to `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- Split: `clients/desktop/src/components/UsageDisplayOverview.vue` into `BalanceOverview.vue` and `SubscriptionOverview.vue` under the macOS menu bar folder, then remove the original shared component.
- Move: `clients/desktop/src/components/UsageQuotaRow.vue` to `clients/desktop/src/features/usage-display/external/macos/menu-bar/QuotaRow.vue`
- Move: `clients/desktop/src/usage-popover.css` to `clients/desktop/src/features/usage-display/external/macos/menu-bar/macos-menu-bar.css`
- Delete after migration: `clients/desktop/src/components/UsageDisplaySettings.vue`
- Modify: `clients/desktop/usage-popover.html`

- [ ] **Step 1: Rewrite the external component test in red state**

Assert the macOS surface always renders overview content and actions:

```ts
expect(wrapper.get('[data-testid="macos-menu-bar-popover"]').exists()).toBe(true)
expect(wrapper.get('[data-testid="usage-refresh"]').exists()).toBe(true)
expect(wrapper.get('[data-testid="usage-open-main"]').exists()).toBe(true)
expect(wrapper.get('[data-testid="usage-quit"]').exists()).toBe(true)
expect(wrapper.find('[data-testid="usage-settings-action"]').exists()).toBe(false)
expect(wrapper.text()).not.toContain('在菜单栏显示')
```

Keep balance, constrained subscription, partial data, Escape, refresh, open-main, and quit assertions.

- [ ] **Step 2: Run the external test and verify red**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts
```

Expected: FAIL because the existing popover still has a settings mode and gear action.

- [ ] **Step 3: Implement the overview-only macOS shell**

Remove the `mode` prop, settings component, settings icon, settings loading, and mode event handling. The shell contains only:

```vue
<header>
  <!-- selected source, update time, refresh icon -->
</header>
<BalanceOverview v-if="state.config.source === 'balance'" />
<SubscriptionOverview v-else />
<footer>
  <!-- open main window and quit -->
</footer>
```

Use `data-testid="macos-menu-bar-popover"` on the root. Preserve native glass styling, fixed external dimensions, click-outside hiding, Escape dismissal, and current overview content.

- [ ] **Step 4: Isolate the external entry and CSS**

`entry.ts` imports only the core store, macOS menu bar component, global tokens, and `macos-menu-bar.css`. Listen to both events:

```ts
await listen<number | null>('usage-display://session-changed', ({ payload }) => {
  void syncSession(payload)
})
await listen<number>('usage-display://config-changed', ({ payload }) => {
  void syncSession(payload)
})
```

Remove all settings-form selectors from `macos-menu-bar.css`. Update `usage-popover.html` to import `/src/features/usage-display/external/macos/menu-bar/entry.ts`.

- [ ] **Step 5: Run the external test and production build**

Run:

```bash
pnpm --dir clients/desktop exec vitest run \
  src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts
pnpm --dir clients/desktop build
```

Expected: PASS and `dist/usage-popover.html` exists.

## Task 4: Native Platform-To-Surface Boundary

**Files:**

- Move: `clients/desktop/src-tauri/src/usage_display.rs` to `clients/desktop/src-tauri/src/usage_display/mod.rs`
- Create: `clients/desktop/src-tauri/src/usage_display/macos/mod.rs`
- Create: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs` only if module visibility requires it.

- [ ] **Step 1: Move the existing Rust positioning tests with the menu bar host**

Keep tests for right-edge, left-edge, negative-monitor coordinates, and application-icon template masking in `macos/menu_bar.rs`. Run before completing module wiring:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display
```

Expected: compilation FAIL until the new module exports are wired.

- [ ] **Step 2: Split shared commands from macOS menu bar behavior**

`usage_display/mod.rs` owns `UsageDisplayHost`, Tauri commands, main-window open/quit, session-independent popover show/hide, and setup dispatch. `macos/menu_bar.rs` owns status-item creation/removal, title updates, click rectangles, monitor clamping, popover anchoring, template-icon conversion, vibrancy, and macOS-specific tests.

The external Webview accepts only overview mode. Simplify the open command contract to remove settings behavior; the avatar menu no longer invokes it.

- [ ] **Step 3: Run Rust tests and checks**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
rustfmt --edition 2021 --check \
  clients/desktop/src-tauri/src/usage_display/mod.rs \
  clients/desktop/src-tauri/src/usage_display/macos/mod.rs \
  clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs
```

Expected: all commands PASS without changing unrelated Rust formatting.

## Task 5: Full Verification And Visual Acceptance

**Files:** all files above.

- [ ] **Step 1: Run all automated checks**

```bash
pnpm --dir clients/desktop test:run
pnpm --dir clients/desktop build
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
git diff --check
```

Expected: all tests and builds PASS with no whitespace errors.

- [ ] **Step 2: Verify boundary searches**

```bash
rg -n "UsageDisplaySettings|usage-popover\.css|usage-display://mode|openUsageDisplaySettings" clients/desktop/src clients/desktop/src-tauri/src
```

Expected: no obsolete shared settings shell, CSS import, mode event, or native settings-open bridge remains.

- [ ] **Step 3: Verify internal UI visually**

From the avatar menu, open `用量显示` and confirm the dialog matches the main client theme, uses content-driven height, supports balance and subscription configuration, and contains only `完成` plus the close icon. Confirm it has no refresh, open-main, or quit commands.

- [ ] **Step 4: Verify the macOS external surface visually**

Click the menu bar item and confirm the native-vibrancy overview is unchanged apart from removal of the gear. Confirm refresh, open-main, quit, balance overview, subscription overview, click-outside dismissal, and close-to-menu-bar lifecycle still work.

- [ ] **Step 5: Inspect the final worktree**

Run `git status --short` and review only the feature-related paths. Do not stage or commit implementation files without explicit user authorization.
