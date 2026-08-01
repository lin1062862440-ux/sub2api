# Desktop Quota-Float External Surfaces Design

## Goal

Extend the existing Desktop usage-display feature with two mutually exclusive macOS external surfaces and three selectable appearances inspired by [change-42-yhmm/quota-float](https://github.com/change-42-yhmm/quota-float). The main application remains the only place where users configure the feature. External surfaces only present usage data and lifecycle actions.

This change builds on the current separation between:

- shared usage state under `features/usage-display/core/`;
- application-themed controls under `features/usage-display/internal/settings/`;
- platform-specific presentation under `features/usage-display/external/`;
- native window and status-item behavior under `src-tauri/src/usage_display/`.

The first implementation remains macOS-only. Windows and Linux continue to show a disabled placeholder in the internal settings dialog and create no external window or tray item.

## Approved Product Decisions

- The feature remains disabled by default.
- The user chooses exactly one external surface: `menu-bar` or `floating-window`.
- The user chooses exactly one source: account balance or one fixed active subscription.
- The user chooses one of three appearances: `default`, `dark`, or `blur`.
- `default` is the default appearance for both new and migrated configurations.
- Existing configurations migrate to `menu-bar` without changing their enabled state or selected source.
- Menu bar and floating window never run at the same time.
- Appearance and surface controls exist only in the main client settings dialog.
- External surfaces contain no gear, settings link, source selector, surface selector, or appearance selector.
- The floating window starts at the bottom-right of the visible work area, approximately 20 pixels from the right and bottom edges.
- The floating window is always on top, draggable, and restores its last valid position.
- The floating window is normally a compact 72-pixel orb and expands to an approximately 336 by 336 pixel detail card on hover.
- Leaving the expanded floating card starts a 180-millisecond collapse delay.

## Configuration Contract And Migration

The per-user configuration stored in `linai.json` becomes:

```ts
export interface UsageDisplayConfig {
  enabled: boolean
  source: 'balance' | 'subscription'
  subscriptionId: number | null
  surface: 'menu-bar' | 'floating-window'
  appearance: 'default' | 'dark' | 'blur'
}
```

`defaultUsageDisplayConfig()` returns:

```ts
{
  enabled: false,
  source: 'balance',
  subscriptionId: null,
  surface: 'menu-bar',
  appearance: 'default',
}
```

Loading uses normalization rather than rejecting the whole stored object. A structurally valid legacy object without `surface` or `appearance` receives the two defaults. An unknown surface or appearance falls back only that field. Existing source validation remains unchanged: an enabled subscription source requires a positive subscription ID, while a disabled subscription draft may have no selection. Invalid base fields fall back to the complete default configuration.

The floating position is a device preference rather than an account preference. Rust owns it under a separate `usage_display:floating_position` key in the same Tauri Store. It is not added to `UsageDisplayConfig`, is not reset on logout, and is never sent to the backend.

## Internal Settings Experience

The avatar-menu `用量显示` command continues to open the main application's teleported settings dialog. The dialog uses existing Desktop colors, typography, 7-8 pixel control radii, spacing, backdrop, focus behavior, and footer treatment. It must not import the external card CSS or use the external floating-card shell.

The dialog changes from a menu-bar-specific form to an external-display configuration form:

1. `启用外部用量显示` switch.
2. `展示位置` segmented control with `菜单栏` and `悬浮窗`.
3. `显示来源` segmented control with `账户余额` and `订阅组`.
4. Active-subscription selector when `订阅组` is selected.
5. `展示样式` chooser containing three visual thumbnail cards.
6. A compact context-aware preview.

The approved thumbnail layout is three cards in one row. Each card contains a small, non-interactive sample of its palette and metric treatment plus the labels `默认浅色`, `深色`, and `Blur`. Selection uses a clear border, check mark, and `aria-pressed`; color alone is not the selection signal. On narrow dialog widths the cards remain three stable equal-width tracks and simplify their sample detail rather than changing to a select menu.

The preview follows the selected surface. Menu-bar mode shows the short status-item title. Floating-window mode shows a scaled orb using the selected source and appearance. These are previews authored inside the internal settings feature; they do not mount or reuse an external window component.

Settings continue to save immediately after a complete valid change. Switching an enabled balance configuration to subscription first reveals the selector without emitting an invalid subscription configuration. Selecting a subscription then saves the complete change. The footer contains only the existing `完成` command. It does not contain refresh, open-main, or quit actions.

On Windows and Linux, the platform placeholder remains visible and all external-display controls remain disabled. The form may show the saved values for consistency, but it cannot enable an unsupported external surface.

## External Visual System

The external menu-bar popover and floating window share a presentation-only quota card and a set of theme tokens. They do not share a shell with the internal settings dialog.

The visual language adapts the reference project's compact hierarchy:

- a strong source identity at the top;
- a large primary remaining value;
- a small health or refresh-state indicator;
- restrained icon actions;
- compact progress and secondary metrics;
- one self-contained external surface with no explanatory copy.

The implementation uses Vue and new LinAI CSS. It does not copy the reference React components, bundled images, private supporter logic, fonts, provider data model, or application behavior.

### Default Appearance

`default` uses a quiet light blue-gray surface, dark text, blue progress emphasis, subtle separators, and a soft outer shadow. The primary metric is the strongest visual element. Status colors appear only in progress, update state, and constrained quota indicators.

### Dark Appearance

`dark` uses a near-black neutral surface with clear white primary text, muted cool secondary text, and the same semantic progress colors as the default appearance. It is a separate token record rather than an inversion filter, so contrast and shadows are explicitly defined.

### Blur Appearance

`blur` uses a translucent cool surface, macOS vibrancy, rounded system typography, a restrained cyan-green highlight, and a dot or segmented progress treatment. It must remain readable when the content behind it is bright or dark. If native vibrancy cannot be applied, the CSS fallback becomes more opaque rather than transparent.

All appearances use identical geometry and information hierarchy. Switching appearance changes visual tokens and progress treatment only; it does not resize windows, move controls, or alter which data is shown.

## Shared External Quota Card

`UsageQuotaCard.vue` renders the expanded content used by both macOS external surfaces. A host variant prop changes only host-specific affordances such as the menu-bar pointer treatment; source components and data semantics remain shared.

The top area contains:

- LinAI mark and selected source identity;
- last successful update or stale state;
- refresh icon button;
- open-main icon button;
- quit icon button.

All unfamiliar icon buttons have tooltips and accessible labels. There is no settings icon. Dragging is attached to an inert region of the floating card header, not to its action buttons.

### Balance Content

The balance card shows:

- available balance as the large primary value;
- balance consumption today;
- balance consumption over the last 7 days;
- balance consumption in the current calendar month.

Balance has no meaningful denominator, so the card does not fabricate a progress percentage, gauge, or health tier. The collapsed floating orb shows a rounded currency value such as `$129`; values that do not fit use the existing compact currency formatter. Missing balance shows `--`.

### Subscription Content

The subscription card shows:

- the most constrained remaining percentage as the large primary value;
- the selected subscription name and expiration state;
- one row for each finite positive daily, weekly, and monthly quota;
- used amount, limit, remaining percentage, progress, and reset time for each row.

The primary percentage is the smallest remaining percentage among the finite quota windows. Percentages are clamped to `0` through `100`. If all configured windows are unlimited, the primary value is `∞`. The collapsed floating orb shows the same primary percentage, such as `26%`; unavailable or invalid subscription data shows `--`.

## macOS Menu-Bar Surface

The existing macOS status item remains the compact always-visible signal for `surface: 'menu-bar'`:

- Balance: `余额 $128.60`
- Subscription: `Claude Pro 73%`
- Unlimited subscription: `Claude Pro ∞`
- Missing data: `用量 --`

Clicking the status item toggles the dedicated `usage-popover` Webview. The popover is resized from the current tall settings-like layout to the compact quota-card footprint, approximately 336 pixels wide with content-driven height bounded to the visible work area. It is positioned below the clicked item and clamped within the active monitor work area, including monitors with negative coordinates.

The popover imports the shared external quota-card themes plus menu-bar-only window chrome. It hides on click outside, Escape, or focus loss and is reused rather than destroyed. Opening it requests an immediate refresh. Its native window remains borderless, non-resizable, transparent, always on top, and excluded from the Dock/task switcher.

The status-item title is independent of the selected appearance because macOS owns menu-bar text rendering. Appearance applies to the clicked popover only.

## macOS Floating-Window Surface

The new floating-window Vite entry mounts a dedicated `MacOSFloatingWindow.vue` in a borderless transparent Tauri window. When `surface: 'floating-window'` is active, no status item exists and the menu-bar popover is hidden.

### Collapsed State

The visible orb is approximately 72 by 72 pixels, with a stable square host footprint and a circular visual surface. It shows the LinAI mark, the compact balance amount or remaining subscription percentage, and a small stale/error indicator when needed. Hover effects may change shadow or emphasis but cannot resize the host before the native expansion command succeeds.

The orb starts expanding on pointer enter. Vue asks Rust to resize and reposition the native window; after success, Vue reveals the expanded card. If the native resize fails, the orb stays usable and exposes a compact error state instead of rendering clipped card content.

### Expanded State

The expanded card is approximately 336 by 336 pixels. It uses the same `UsageQuotaCard` content as the menu-bar popover. The card grows toward available space so a bottom-right orb expands up and left rather than leaving the screen. Pointer leave starts a 180-millisecond timer; re-entry cancels it. After the timer, Vue hides the card content and Rust restores the collapsed geometry.

The window is always on top. Users can drag from the orb and the inert header region of the expanded card. Refresh, open-main, and quit remain clickable and must not initiate dragging. There is no pin, lock, click-through, stay-expanded, auto-rotate, or settings control in this release.

### Positioning And Persistence

On first activation, Rust chooses the monitor containing the main window, falling back to the primary monitor, and places the collapsed orb 20 logical pixels from the right and bottom of that monitor's work area.

After a native move ends, Rust debounces persistence and stores the collapsed anchor position. Position records use physical coordinates plus the scale factor and last work-area geometry needed to restore safely. On startup or monitor changes, Rust:

1. finds the monitor containing the stored orb center;
2. otherwise chooses the nearest available monitor;
3. converts for the current scale factor;
4. clamps the complete visible orb inside the selected work area;
5. falls back to bottom-right placement if the stored record is invalid.

Expansion derives a temporary expanded rectangle from the collapsed anchor. It prefers preserving the nearest horizontal and vertical edges, then clamps the full card into the work area. Collapse returns to the original collapsed anchor unless the user deliberately dragged the expanded card; in that case Rust derives and persists a new valid collapsed anchor from the final card position.

This logic supports negative monitor coordinates and monitor removal. Geometry calculations are pure functions covered by Rust unit tests.

## Architecture And File Ownership

The frontend hierarchy becomes:

```text
clients/desktop/src/features/usage-display/
  core/
    format.ts
    host.ts
    storage.ts
    store.ts
  internal/settings/
    UsageDisplayDialog.vue
    UsageDisplaySettingsForm.vue
    UsageAppearanceChooser.vue
  external/macos/
    shared/
      UsageQuotaCard.vue
      BalanceOverview.vue
      SubscriptionOverview.vue
      QuotaRow.vue
      appearance.ts
      quota-float-themes.css
    menu-bar/
      entry.ts
      MacOSMenuBarPopover.vue
      macos-menu-bar.css
    floating-window/
      entry.ts
      MacOSFloatingWindow.vue
      FloatingUsageOrb.vue
      macos-floating-window.css
```

The build has two external HTML entries:

- `usage-popover.html` for `external/macos/menu-bar/entry.ts`;
- `usage-floating-window.html` for `external/macos/floating-window/entry.ts`.

No empty Windows or Linux external directories are committed.

Native ownership becomes:

```text
clients/desktop/src-tauri/src/usage_display/
  mod.rs
  macos/
    mod.rs
    menu_bar.rs
    floating_window.rs
```

`mod.rs` owns unified commands, shared host state, main-window close behavior, and surface mutual exclusion. `menu_bar.rs` owns only the status item and anchored popover. `floating_window.rs` owns only floating-window creation, expand/collapse geometry, dragging, persistence, and monitor clamping.

## Native Host Contract

The existing tray-specific configuration command is replaced by a unified command conceptually equivalent to:

```ts
configureUsageDisplay({
  enabled,
  surface,
  title,
  appearance,
})
```

Rust applies the transition atomically:

- disabled: remove the status item and hide both external windows;
- menu bar: hide the floating window, create or update the status item, and keep the popover hidden until clicked;
- floating window: remove the status item, hide the menu-bar popover, restore or create the collapsed floating window.

The host records the active surface so stale commands from an old renderer cannot re-enable the wrong one. Title updates are accepted only while menu-bar mode is active. Expand, collapse, drag, and position commands are accepted only from the floating-window label.

Both external entries use the existing session and configuration events, but only the selected surface owns a refresh scheduler. When an entry learns it is no longer selected, it stops requests and timers immediately. Rust is the final authority that guarantees only one external surface is visible.

The main-window close button hides the main window while either external surface is enabled. Cmd+Q and the external quit action terminate the application. Disabling the feature restores the existing main-window close behavior.

## Data Flow And Refresh

No backend endpoint changes are required.

Balance mode continues to use:

- `GET /auth/me` for available balance;
- `GET /usage/stats` with balance billing and the user's timezone for today, the last 7 days, and the current calendar month.

Subscription mode continues to use `GET /subscriptions` for active subscriptions, quota limits and usage, reset-window starts, expiration, and group identity.

The selected external entry performs an immediate refresh when activated, when opened or expanded, when the user explicitly refreshes, and every 60 seconds while authenticated and enabled. A sequence token prevents results for a previous user, source, subscription, surface, or appearance configuration from overwriting current state.

Configuration changes follow this sequence:

1. The internal dialog validates and saves the complete per-user configuration.
2. It calls the unified native configuration command so surface visibility changes immediately.
3. It emits `usage-display://config-changed` with the current user ID.
4. The selected external entry reloads configuration, refreshes its source, and applies the appearance.
5. The old entry stops its scheduler and clears its visible state.

Logout stops both entries, hides both external windows, removes the status item, cancels pending collapse and refresh work, and clears in-memory snapshots. Device-level floating position remains stored for the next login.

## Failure And Edge States

- A cold start without data shows `--` and a loading or unavailable state; it never invents a value.
- A network failure keeps the last successful in-memory snapshot for the current session, marks it stale, and exposes refresh.
- Partial balance failures preserve successful values and render failed period totals as `--`.
- An expired, revoked, suspended, deleted, or otherwise missing selected subscription remains selected in storage, displays `--`, and asks the user to repair it when the internal settings dialog opens.
- An account with no active subscriptions cannot enable subscription display.
- Missing quota window starts render reset time as unavailable.
- Over-limit quota percentages clamp to `0%`; overfilled progress never overflows its track.
- Very large currency values use compact formatting so the orb cannot grow or clip.
- Long subscription names truncate in the menu bar and wrap or truncate within fixed external card bounds.
- If native blur fails, `blur` uses its opaque CSS fallback and remains legible.
- If floating geometry restoration fails, the window returns to bottom-right on the active monitor.
- If expand or collapse fails, the renderer returns to the last native-confirmed mode and does not show clipped content.
- Rapid hover, source switching, account switching, or appearance switching invalidates earlier async operations.

## Reference And License Handling

Quota Float is MIT licensed with copyright `2026 Quota Float contributors`. This feature independently reproduces the approved visual language and interaction pattern in Vue, CSS, and the existing LinAI domain model. It does not import the reference package or copy its application code, assets, fonts, provider integrations, licensing system, or private data structures.

`clients/desktop/THIRD_PARTY_NOTICES.md` records the project name, source URL, MIT copyright notice, and permission text as attribution for the design and interaction reference. If implementation later copies any substantial source fragment, that file must also identify the adapted source in a concise comment and remain covered by the same notice.

## Testing And Verification

Frontend unit tests cover:

- legacy configuration migration to `menu-bar` and `default`;
- invalid surface and appearance fallback;
- immediate-save behavior for surface and appearance;
- subscription selection validation while enabled;
- the three accessible thumbnail choices and default selection;
- internal dialog isolation from external CSS and lifecycle actions;
- menu-bar and floating entry activation being mutually exclusive;
- balance, subscription, unlimited, unavailable, stale, and partial-failure states;
- all three appearances on the shared external card and floating orb;
- compact formatting that cannot resize the orb;
- hover expansion ordering and 180-millisecond delayed collapse;
- refresh, open-main, and quit actions without a settings action;
- stale request cancellation after configuration or account changes.

Rust unit tests cover:

- unified surface transition truth table;
- rejection of window commands from the wrong label or inactive surface;
- first bottom-right placement;
- restore and clamp on the same monitor;
- nearest-monitor recovery after monitor removal;
- negative monitor coordinates;
- scale-factor changes;
- bottom-right expansion growing up and left;
- edge-aware expansion at each corner and screen edge;
- drag persistence and expanded-to-collapsed anchor derivation;
- main-window close behavior for disabled, menu-bar, and floating modes.

Browser visual fixtures render both balance and subscription data without native dependencies. Screenshot coverage includes:

- menu-bar popover in `default`, `dark`, and `blur`;
- collapsed floating orb in all three appearances;
- expanded floating card in all three appearances;
- unavailable and stale states;
- long names and large balance values;
- compact and narrow host bounds without text overlap.

Native macOS verification covers real status-item positioning, click-outside dismissal, native vibrancy, always-on-top behavior, bottom-right first placement, hover expansion, delayed collapse, drag restore after restart, multi-monitor clamping, main-window reopening, logout cleanup, and explicit quit.

Required automated checks are:

```bash
pnpm --dir clients/desktop test:run
pnpm --dir clients/desktop build
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo check --manifest-path clients/desktop/src-tauri/Cargo.toml
```

## Out Of Scope

- Showing menu bar and floating window simultaneously.
- Showing balance and subscription simultaneously.
- Rotating among several subscriptions.
- Floating-window pinning, click-through, lock, manual stay-expanded mode, or auto-rotation.
- Low-usage notifications or threshold configuration.
- User-defined colors, typography, dimensions, opacity, refresh intervals, or metric layouts.
- Persisting usage snapshots or history locally.
- Windows notification-area, Windows floating-window, Linux status-item, or Linux floating-window implementations.
- Copying Quota Float provider integrations, update system, supporter licensing, fonts, images, or settings model.
