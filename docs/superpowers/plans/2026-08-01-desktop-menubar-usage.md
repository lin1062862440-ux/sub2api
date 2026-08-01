# Desktop Menu Bar Usage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in macOS menu bar usage indicator and a compact glass popover for one account-balance or subscription source, with platform placeholders on Windows and Linux.

**Architecture:** A dedicated Vue/Vite secondary entry owns usage-display state, API refresh, local per-user settings, and popover rendering. A focused Tauri Rust module owns the native tray item, title, popover window, positioning, vibrancy, and lifecycle. The main Vue window only opens settings and emits session changes.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite multi-page build, Tauri 2, Rust, `window-vibrancy`, Tauri Store/HTTP/OS APIs.

---

## Working Tree Safety

The branch already contains uncommitted Desktop work, including `AppLayout.vue`, `AppLayout.spec.ts`, the API layer, and session-related files. Preserve those changes and edit them incrementally. Do not stage or commit implementation files unless the user separately authorizes committing the combined Desktop work. The design and this plan may be committed independently because they are new, isolated files.

## File Map

**Create:**

- `clients/desktop/src/lib/usage-display-format.ts`: pure quota, date-range, reset, and tray-title calculations.
- `clients/desktop/src/lib/usage-display-format.spec.ts`: exhaustive pure calculation tests.
- `clients/desktop/src/lib/usage-display-host.ts`: typed Tauri invoke/event bridge with browser-safe fallbacks.
- `clients/desktop/src/lib/usage-display-storage.ts`: per-user Tauri Store configuration.
- `clients/desktop/src/stores/usage-display.ts`: popover state, API coordination, refresh timer, and session cleanup.
- `clients/desktop/src/stores/usage-display.spec.ts`: state and failure behavior tests.
- `clients/desktop/src/components/UsageQuotaRow.vue`: one subscription quota row.
- `clients/desktop/src/components/UsageDisplayOverview.vue`: balance/subscription overview.
- `clients/desktop/src/components/UsageDisplaySettings.vue`: platform placeholder and macOS configuration.
- `clients/desktop/src/components/UsageDisplayPopover.vue`: popover shell, mode switching, actions, dismissal.
- `clients/desktop/src/components/UsageDisplayPopover.spec.ts`: settings and overview component tests.
- `clients/desktop/src/usage-popover.ts`: dedicated secondary-window bootstrap.
- `clients/desktop/src/usage-popover.css`: isolated glass popover styles.
- `clients/desktop/usage-popover.html`: Vite secondary entry.
- `clients/desktop/src-tauri/src/usage_display.rs`: commands, tray lifecycle, popover lifecycle, positioning, and Rust tests.

**Modify:**

- `clients/desktop/src/layouts/AppLayout.vue`: add `用量显示` menu command and open settings.
- `clients/desktop/src/layouts/AppLayout.spec.ts`: verify the new menu item and bridge call.
- `clients/desktop/src/App.vue`: emit authenticated-user changes to the popover host.
- `clients/desktop/src/App.spec.ts`: verify session-change notification wiring.
- `clients/desktop/vite.config.ts`: build `index.html` and `usage-popover.html`.
- `clients/desktop/src-tauri/src/lib.rs`: register the usage-display host and commands.
- `clients/desktop/src-tauri/Cargo.toml`: add macOS vibrancy dependency.
- `clients/desktop/src-tauri/Cargo.lock`: resolve the direct dependency.
- `clients/desktop/src-tauri/capabilities/default.json`: grant Store/HTTP/OS permissions to `usage-popover`.

## Task 1: Pure Usage Calculations

**Files:**

- Create: `clients/desktop/src/lib/usage-display-format.spec.ts`
- Create: `clients/desktop/src/lib/usage-display-format.ts`

- [ ] **Step 1: Write failing tests for constrained quotas and titles**

Cover the approved semantics directly:

```ts
expect(resolveQuotaSummary([
  { key: 'daily', label: '日额度', used: 2, limit: 10, windowStart: '2026-08-01T00:00:00Z', windowHours: 24 },
  { key: 'weekly', label: '周额度', used: 8, limit: 10, windowStart: '2026-07-28T00:00:00Z', windowHours: 168 },
])).toMatchObject({ remainingPercent: 20, constrainedKey: 'weekly' })

expect(resolveQuotaSummary([])).toMatchObject({ remainingPercent: null, unlimited: true })
expect(formatUsageTrayTitle({ kind: 'balance', balance: 128.6 })).toBe('余额 $128.60')
expect(formatUsageTrayTitle({ kind: 'subscription', name: 'Claude 专业旗舰订阅', remainingPercent: 73 })).toBe('Claude 专业… 73%')
expect(formatUsageTrayTitle({ kind: 'unavailable' })).toBe('用量 --')
```

Also test clamping below zero and above 100, missing window starts, reset timestamps at 24/168/720 hours, and local date ranges for today, rolling seven days, and calendar month.

- [ ] **Step 2: Run the focused test and confirm red state**

Run: `pnpm --dir clients/desktop test:run -- src/lib/usage-display-format.spec.ts`

Expected: FAIL because `usage-display-format.ts` does not exist.

- [ ] **Step 3: Implement pure types and functions**

Define stable interfaces and functions:

```ts
export type UsageQuotaKey = 'daily' | 'weekly' | 'monthly'

export interface UsageQuotaInput {
  key: UsageQuotaKey
  label: string
  used: number
  limit: number
  windowStart: string | null
  windowHours: 24 | 168 | 720
}

export function remainingPercent(used: number, limit: number): number
export function resolveQuotaSummary(quotas: UsageQuotaInput[]): UsageQuotaSummary
export function quotaResetAt(windowStart: string | null, windowHours: number): Date | null
export function formatUsageTrayTitle(input: UsageTrayTitleInput): string
export function resolveBalanceRanges(now?: Date): BalanceUsageRanges
```

Use finite positive limits only, `Math.round((1 - used / limit) * 100)`, and clamp to `0..100`. Truncate the subscription name by Unicode code points so Chinese names are not split incorrectly.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm --dir clients/desktop test:run -- src/lib/usage-display-format.spec.ts`

Expected: PASS.

## Task 2: Per-User Configuration And Host Bridge

**Files:**

- Create: `clients/desktop/src/lib/usage-display-storage.ts`
- Create: `clients/desktop/src/lib/usage-display-host.ts`
- Test: `clients/desktop/src/stores/usage-display.spec.ts`

- [ ] **Step 1: Write failing configuration and host tests**

Mock `LazyStore`, `invoke`, and `emit`, then assert:

```ts
expect(await loadUsageDisplayConfig(42)).toEqual({
  enabled: false,
  source: 'balance',
  subscriptionId: null,
})

await saveUsageDisplayConfig(42, { enabled: true, source: 'subscription', subscriptionId: 9 })
expect(storeSet).toHaveBeenCalledWith('usage_display:42', expect.objectContaining({ subscriptionId: 9 }))

await openUsageDisplaySettings()
expect(invoke).toHaveBeenCalledWith('open_usage_display', { mode: 'settings', anchor: 'main' })
```

- [ ] **Step 2: Run the focused test and confirm red state**

Run: `pnpm --dir clients/desktop test:run -- src/stores/usage-display.spec.ts`

Expected: FAIL because the storage and host modules do not exist.

- [ ] **Step 3: Implement the configuration repository**

Use the existing `linai.json` Tauri store and a user-scoped key:

```ts
export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
}

const defaultConfig = (): UsageDisplayConfig => ({
  enabled: false,
  source: 'balance',
  subscriptionId: null,
})
```

Validate loaded values before returning them; an invalid payload returns the default without throwing.

- [ ] **Step 4: Implement the narrow Tauri bridge**

Expose these functions and catch missing-Tauri errors for Vite/browser tests:

```ts
export function configureUsageTray(enabled: boolean, title: string): Promise<void>
export function setUsageTrayTitle(title: string): Promise<void>
export function openUsageDisplaySettings(): Promise<void>
export function hideUsageDisplay(): Promise<void>
export function openMainWindow(): Promise<void>
export function quitDesktopApp(): Promise<void>
export function notifyUsageSessionChanged(userId: number | null): Promise<void>
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm --dir clients/desktop test:run -- src/stores/usage-display.spec.ts`

Expected: configuration and bridge tests PASS; state tests added in Task 3 may remain pending until their implementation is present.

## Task 3: Usage Display State And Refresh

**Files:**

- Create: `clients/desktop/src/stores/usage-display.ts`
- Modify: `clients/desktop/src/stores/usage-display.spec.ts`
- Read existing API bindings: `clients/desktop/src/api/index.ts`
- Read existing types: `clients/desktop/src/api/types.ts`

- [ ] **Step 1: Add failing state tests**

Mock `getCurrentUser`, `getUsageStats`, `getSubscriptions`, configuration storage, and host bridge. Verify:

```ts
await state.attachUser({ id: 42, balance: 128.6 })
expect(state.config.enabled).toBe(false)

await state.updateConfig({ enabled: true, source: 'balance', subscriptionId: null })
expect(configureUsageTray).toHaveBeenCalledWith(true, '余额 $128.60')

await state.updateConfig({ enabled: true, source: 'subscription', subscriptionId: 9 })
expect(state.trayTitle).toBe('Claude Pro 20%')

await state.detachUser()
expect(configureUsageTray).toHaveBeenLastCalledWith(false, '')
```

Test stale-response rejection, a missing selected subscription, runtime refresh failure retaining prior data, cold-start failure producing `用量 --`, and partial balance-period failure.

- [ ] **Step 2: Run tests and confirm red state**

Run: `pnpm --dir clients/desktop test:run -- src/stores/usage-display.spec.ts`

Expected: FAIL because the state module is missing.

- [ ] **Step 3: Implement the reactive state module**

Provide a single factory so tests do not share timers:

```ts
export function createUsageDisplayStore(deps = defaultDependencies) {
  const state = reactive({
    userId: null as number | null,
    platform: platform(),
    config: defaultUsageDisplayConfig(),
    subscriptions: [] as UserSubscription[],
    balance: null as BalanceSnapshot | null,
    loading: false,
    refreshing: false,
    error: '',
    lastUpdatedAt: null as Date | null,
    trayTitle: '用量 --',
  })

  return { state: readonly(state), attachUser, detachUser, updateConfig, refresh, start, stop }
}
```

Fetch only the selected source. Balance refresh uses `Promise.allSettled` for `/auth/me` and the three `billing_type=0` stats ranges. Subscription refresh calls `/subscriptions`, then validates the fixed ID. A monotonically increasing sequence prevents old results from overwriting new user/source state.

- [ ] **Step 4: Add the 60-second scheduler**

`start()` performs an immediate refresh and uses `window.setInterval(refresh, 60_000)`. `stop()` clears the interval, increments the sequence, and clears runtime snapshots. Timer creation is skipped when not authenticated, disabled, or running on a non-macOS platform.

- [ ] **Step 5: Run state tests**

Run: `pnpm --dir clients/desktop test:run -- src/stores/usage-display.spec.ts`

Expected: PASS with fake timers cleaned up after every test.

## Task 4: Popover Components

**Files:**

- Create: `clients/desktop/src/components/UsageQuotaRow.vue`
- Create: `clients/desktop/src/components/UsageDisplayOverview.vue`
- Create: `clients/desktop/src/components/UsageDisplaySettings.vue`
- Create: `clients/desktop/src/components/UsageDisplayPopover.vue`
- Create: `clients/desktop/src/components/UsageDisplayPopover.spec.ts`

- [ ] **Step 1: Write failing component tests**

Mount with a mocked store and assert:

```ts
expect(wrapper.get('[data-testid="usage-display-toggle"]').attributes('aria-checked')).toBe('false')
expect(wrapper.text()).toContain('账户余额')
expect(wrapper.text()).toContain('订阅组')

await wrapper.get('[data-testid="usage-source-subscription"]').trigger('click')
expect(wrapper.get('[data-testid="usage-subscription-select"]').exists()).toBe(true)

expect(balanceOverview.text()).toContain('$128.60')
expect(subscriptionOverview.text()).toContain('周额度')
expect(linuxPlaceholder.text()).toContain('当前平台暂未支持')
```

Also verify refresh, settings, open-main, quit, Escape dismissal, invalid subscription guidance, and partial `--` values.

- [ ] **Step 2: Run the component tests and confirm red state**

Run: `pnpm --dir clients/desktop test:run -- src/components/UsageDisplayPopover.spec.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the focused components**

Use Lucide icons and keep ownership narrow:

```vue
<UsageDisplayOverview v-if="mode === 'overview'" :snapshot="snapshot" />
<UsageDisplaySettings v-else :config="config" :subscriptions="subscriptions" />
```

`UsageQuotaRow.vue` receives already calculated display data and performs no API or persistence work. The settings component uses a switch, a two-option segmented control, a native select/menu, and a live tray-title preview.

- [ ] **Step 4: Run the component tests**

Run: `pnpm --dir clients/desktop test:run -- src/components/UsageDisplayPopover.spec.ts`

Expected: PASS.

## Task 5: Dedicated Vite Popover Entry

**Files:**

- Create: `clients/desktop/usage-popover.html`
- Create: `clients/desktop/src/usage-popover.ts`
- Create: `clients/desktop/src/usage-popover.css`
- Modify: `clients/desktop/vite.config.ts`

- [ ] **Step 1: Add the secondary HTML and bootstrap**

The HTML contains only `<div id="usage-popover"></div>` and imports `/src/usage-popover.ts`. The bootstrap listens for `usage-display://mode` and `usage-display://session-changed`, attaches or detaches the state user, then mounts `UsageDisplayPopover`.

```ts
await listen<UsageDisplayMode>('usage-display://mode', ({ payload }) => setMode(payload))
await listen<number | null>('usage-display://session-changed', ({ payload }) => syncUser(payload))
createApp(UsageDisplayPopover).mount('#usage-popover')
```

- [ ] **Step 2: Add isolated popover styling**

Define a stable 360-pixel surface, 8-pixel radius, compact type, fixed icon-button dimensions, quota bars, segmented source control, switch, error notice, and footer. The HTML/body background stays transparent so native vibrancy remains visible. Include reduced-motion handling and prevent text overflow for the longest labels.

- [ ] **Step 3: Configure Vite multi-page output**

Use explicit inputs:

```ts
build: {
  rollupOptions: {
    input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      usagePopover: fileURLToPath(new URL('./usage-popover.html', import.meta.url)),
    },
  },
},
```

- [ ] **Step 4: Build the frontend**

Run: `pnpm --dir clients/desktop build`

Expected: TypeScript and Vite succeed and `clients/desktop/dist/usage-popover.html` exists.

## Task 6: Main Window Entry And Session Events

**Files:**

- Modify: `clients/desktop/src/layouts/AppLayout.spec.ts`
- Modify: `clients/desktop/src/layouts/AppLayout.vue`
- Modify: `clients/desktop/src/App.spec.ts`
- Modify: `clients/desktop/src/App.vue`

- [ ] **Step 1: Extend the account-menu test in red state**

Mock `openUsageDisplaySettings`, click the new item, and assert the menu closes:

```ts
expect(wrapper.get('[data-testid="account-menu"]').text()).toContain('用量显示')
await wrapper.get('[data-testid="usage-display-menu-item"]').trigger('click')
expect(mocks.openUsageDisplaySettings).toHaveBeenCalledOnce()
expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false)
```

- [ ] **Step 2: Add the menu command**

Use the Lucide `ChartNoAxesCombined` icon already present in the layout and call the bridge asynchronously after closing the menu.

- [ ] **Step 3: Extend the App test for session changes**

Mock `notifyUsageSessionChanged` and change `session.user` from null to user ID 42 and back. Assert the helper receives `42` and `null` with an immediate watcher.

- [ ] **Step 4: Add the immediate session watcher**

```ts
watch(
  () => session.user?.id ?? null,
  (userId) => void notifyUsageSessionChanged(userId),
  { immediate: true },
)
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm --dir clients/desktop test:run -- src/layouts/AppLayout.spec.ts src/App.spec.ts`

Expected: PASS without changing existing navigation, password, logout, or auth-redirect assertions.

## Task 7: Tauri Tray And Popover Host

**Files:**

- Create: `clients/desktop/src-tauri/src/usage_display.rs`
- Modify: `clients/desktop/src-tauri/src/lib.rs`
- Modify: `clients/desktop/src-tauri/Cargo.toml`
- Modify: `clients/desktop/src-tauri/Cargo.lock`
- Modify: `clients/desktop/src-tauri/capabilities/default.json`

- [ ] **Step 1: Write Rust tests for position clamping**

Keep geometry pure and test normal, right-edge, left-edge, and multi-monitor negative coordinates:

```rust
assert_eq!(
    clamp_popover_position(Point { x: 1400.0, y: 24.0 }, Size { width: 28.0, height: 22.0 }, Rect { x: 0.0, y: 0.0, width: 1440.0, height: 900.0 }, Size { width: 360.0, height: 500.0 }),
    Point { x: 1072.0, y: 50.0 },
);
```

- [ ] **Step 2: Run the Rust test and confirm red state**

Run: `cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement host state and commands**

Create a `UsageDisplayHost` state containing whether main-window close should hide, the last tray rectangle, and the optional macOS tray handle. Register commands:

```rust
#[tauri::command]
fn configure_usage_tray(app: AppHandle, state: State<UsageDisplayHost>, enabled: bool, title: String) -> Result<(), String>

#[tauri::command]
fn set_usage_tray_title(app: AppHandle, title: String) -> Result<(), String>

#[tauri::command]
fn open_usage_display(app: AppHandle, mode: String, anchor: String) -> Result<(), String>

#[tauri::command]
fn hide_usage_display(app: AppHandle) -> Result<(), String>

#[tauri::command]
fn open_usage_main_window(app: AppHandle) -> Result<(), String>

#[tauri::command]
fn quit_usage_display(app: AppHandle)
```

Build the `usage-popover` Webview once with `usage-popover.html`, no decorations, transparent background, fixed size, always-on-top behavior, and taskbar exclusion. On macOS apply `NSVisualEffectMaterial::Popover` vibrancy and build a template tray icon with native title support and left-click events.

- [ ] **Step 4: Implement dismissal and close lifecycle**

Hide the popover on `WindowEvent::Focused(false)`. When close is requested for `main` and the host state is enabled, prevent close and hide the window. Do not intercept explicit app exit.

- [ ] **Step 5: Register the module without disturbing existing plugins**

Keep plugin order intact in `lib.rs`, call `usage_display::setup(app)` from the existing setup closure, manage host state, and add the commands with `tauri::generate_handler!`. Add `usage-popover` to the capability window list so its HTTP, Store, and OS calls are authorized.

- [ ] **Step 6: Add macOS vibrancy dependency**

```toml
[target.'cfg(target_os = "macos")'.dependencies]
window-vibrancy = "0.6"
```

- [ ] **Step 7: Run Rust checks**

Run: `cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display`

Expected: PASS.

Run: `cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml`

Expected: PASS on macOS with no unused imports or dead command wiring.

## Task 8: End-To-End Integration And Verification

**Files:** all files above, with no unrelated cleanup.

- [ ] **Step 1: Run the complete Desktop test suite**

Run: `pnpm --dir clients/desktop test:run`

Expected: all existing and new Vitest tests PASS.

- [ ] **Step 2: Run frontend and Rust builds**

Run: `pnpm --dir clients/desktop build`

Expected: Vue TypeScript and Vite build PASS with both HTML entries.

Run: `cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 3: Start the macOS application**

Run: `pnpm --dir clients/desktop exec tauri dev`

Expected: the existing main window opens normally and no usage tray appears for a default-off account.

- [ ] **Step 4: Verify settings and menu bar behavior visually**

Verify in order: avatar menu entry, settings popover, default-off state, balance preview, subscription selector, tray creation, short native title, anchored overview, manual refresh, click-outside/Escape dismissal, long-name truncation, and screen-edge clamping. Capture screenshots of the collapsed menu bar and both popover modes.

- [ ] **Step 5: Verify lifecycle and failures**

Verify main-window close/hide while enabled, reopening from the popover, logout tray removal, explicit quit, invalid stored subscription behavior, runtime offline stale notice, and cold-start unavailable display.

- [ ] **Step 6: Verify non-macOS source behavior through tests**

Set the platform mock to Windows and Linux, mount settings, and confirm `当前平台暂未支持`, disabled controls, and no `configure_usage_tray(true, ...)` invocation.

- [ ] **Step 7: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; all pre-existing unrelated changes remain present and untouched. Do not stage or commit the implementation in the dirty worktree without explicit user authorization.
