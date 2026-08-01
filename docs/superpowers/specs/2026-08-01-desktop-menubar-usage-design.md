# Desktop Menu Bar Usage Display Design

## Goal

Add an opt-in macOS menu bar usage display to the LinAI Desktop client. The menu bar should show one selected source at a glance and open a compact native-feeling glass popover with more detail. The account menu in the main window provides a separate, application-themed entry point for enabling and configuring the feature.

The first release implements the menu bar integration on macOS. Windows and Linux expose a disabled placeholder in the internal configuration dialog and do not create a system tray item.

## Product Decisions

- The feature is disabled by default. Upgrading the application must not add a menu bar item without the user's action.
- The menu bar expresses remaining capacity rather than accumulated consumption.
- A user selects exactly one source: account balance or one active subscription.
- For a subscription with several quota windows, the menu bar percentage is the smallest remaining percentage across its finite daily, weekly, and monthly limits.
- An invalid selected subscription never causes an automatic switch to another subscription.
- Complete usage analysis remains in the main application. The popover is optimized for quickly deciding whether capacity is becoming constrained.

## Entry Point And Configuration

The avatar menu in `AppLayout.vue` gains a `用量显示` command between `个人资料` and `修改密码`. It opens a standard in-application settings dialog. This dialog follows the main client's existing modal vocabulary and is not the macOS menu bar popover.

The internal settings dialog contains:

1. An `在菜单栏显示` toggle, off by default.
2. A source segmented control with `账户余额` and `订阅组`.
3. An active-subscription selector when `订阅组` is selected.
4. A live menu bar preview such as `余额 $128.60` or `Claude Pro 73%`.

Settings save as the user changes them, and a `完成` button closes the dialog. The dialog does not contain `刷新`, `打开主窗口`, or `退出`, because those commands do not belong to an already-open main application window. Enabling subscription display requires a selected active subscription. Disabled, expired, revoked, and suspended subscriptions are not selectable. On Windows and Linux the same entry opens a platform placeholder; the controls are disabled and no tray integration is initialized.

## Menu Bar Presentation

On macOS the status item uses the LinAI template icon and a short native title:

- Balance: `余额 $128.60`
- Subscription: `Claude Pro 73%`
- Unlimited subscription: `Claude Pro ∞`
- Unavailable data or invalid selection: `用量 --`

Long subscription names are truncated before the value, for example `Claude 专业… 73%`, so the item does not crowd the macOS menu bar. Subscription percentages are clamped to `0%` through `100%`. A value over its quota therefore displays `0%` remaining.

The status item exists only when the session is authenticated, the setting is enabled, and the local configuration is structurally complete. Balance is complete without an additional identifier; subscription mode requires a stored subscription ID. Network validation is not a creation gate: unavailable data and an invalid selected subscription display `用量 --` so the user retains a direct path to inspect or repair the selection.

## Popover Overview

Clicking the status item toggles a single reusable `usage-popover` Webview positioned beneath the clicked status item. The window is approximately 360 pixels wide, borderless, non-resizable, and hidden rather than destroyed when dismissed. Clicking outside it or pressing Escape hides it.

The visual treatment uses macOS native vibrancy for real background blur, with a restrained translucent surface, subtle border and shadow, and an approximately 8-pixel radius. It follows the existing Desktop typography and semantic colors and does not use a large blue-purple gradient.

The header contains the selected source, last successful update time, and a refresh icon. Configuration remains exclusively inside the main client, so the external popover does not contain a settings icon or settings mode.

### Balance Overview

The balance view emphasizes the current available balance and shows:

- Current available balance
- Balance consumption today
- Balance consumption over the last 7 days
- Balance consumption in the current calendar month

### Subscription Overview

The subscription view emphasizes the most constrained quota window and shows each configured finite window:

- Daily, weekly, or monthly label
- Used amount and limit
- Progress bar and remaining percentage
- Time until reset

Quota windows without a finite positive limit are omitted. If all three windows are unlimited, the primary value is `∞`. The subscription expiration date remains visible separately from quota reset times.

The footer provides `打开主窗口` and `退出`. Familiar Lucide icons accompany these commands, with tooltips for icon-only controls.

## Architecture

The feature separates shared usage behavior, internal configuration, external platform surfaces, and native hosting. Internal and external surfaces may share typed state and domain calculations, but they must not share layout shells, footer actions, window dimensions, or CSS.

### Shared Core

The shared core owns configuration types, persistence, requests, quota calculations, refresh scheduling, and short display-title formatting. It communicates platform actions to Rust through narrow Tauri commands and does not place request or quota calculations in view components.

Local configuration is stored through Tauri Store and scoped by authenticated user ID:

```text
enabled: boolean
source: "balance" | "subscription"
subscriptionId: number | null
```

Only preferences are persisted. Usage snapshots are kept in memory, not written to disk.

### Internal Configuration

The main Vue application owns the only configuration UI. The avatar-menu command opens a teleported dialog inside the main Webview, using the same backdrop, spacing, typography, controls, 8-pixel radius, and close behavior as the existing password dialog. Its height follows its content instead of inheriting the external popover's fixed dimensions.

The internal dialog contains only configuration controls and a menu bar title preview. It has its own components and scoped styles under `features/usage-display/internal/settings/`. Opening, closing, or restyling it must not modify the external macOS surface.

The dialog loads the current user's persisted configuration and active subscriptions when opened. After a successful change it saves the configuration and emits a narrow `usage-display://config-changed` event containing the user ID. It does not start the external surface's periodic usage refresh loop.

### External Platform Surfaces

External presentation is organized first by operating system and then by display surface:

```text
features/usage-display/external/
  macos/
    menu-bar/          # current status item and glass popover
    floating-window/   # reserved path for a future floating display
  windows/
    system-tray/       # future implementation
    floating-window/   # future implementation
  linux/
    status-item/       # future implementation
    floating-window/   # future implementation
```

Only `macos/menu-bar/` is created in this release. Empty future directories are not committed. Each future surface owns its window geometry, interaction model, entry module, components, and styles, allowing a floating window to add dragging, pinning, opacity, layout, and position persistence without changing the menu bar implementation.

The current macOS menu bar surface uses the dedicated `usage-popover.html` Vite entry and a surface-specific bootstrap under `external/macos/menu-bar/`. It renders only the balance or subscription overview. Its native-vibrancy CSS is imported only by this entry and cannot style the main application.

The macOS entry remains the owner of the 60-second usage refresh timer and tray-title synchronization. It listens for authenticated-session and configuration-change events, reloads the persisted selection, and refreshes the chosen source without importing the internal dialog.

### Tauri Host

Rust owns platform behavior:

- Create, update, and remove the macOS status item.
- Set the native menu bar title.
- Receive status-item click events and retain the click rectangle.
- Create and position the reusable macOS menu bar popover within the active monitor bounds.
- Show, hide, focus, and close application windows.
- Apply macOS native vibrancy to the external popover only.
- Hide the main window on close while the menu bar feature is active, while preserving Cmd+Q and explicit `退出` as real application termination.

The native source follows the same platform and surface boundary: `src-tauri/src/usage_display/macos/menu_bar.rs` owns the current status-item host, while `usage_display/mod.rs` retains shared commands and state. A future floating window receives a separate module instead of extending the menu bar module. The existing single-instance, deep-link, HTTP, store, opener, and OS plugins remain intact.

## Data Sources And Refresh

No backend changes are required for the first release.

Balance mode uses:

- `GET /auth/me` for the current available balance.
- `GET /usage/stats` with `billing_type=0` and the user's timezone for today, the last 7 days, and the current calendar month.

Subscription mode uses:

- `GET /subscriptions` for active status, quota usage, limits, window starts, expiration, and group metadata.

The monthly subscription reset follows the backend's rolling 30-day window, not a calendar-month boundary. Reset timestamps are calculated from the returned window starts using 24 hours, 7 days, and 30 days respectively.

Data refreshes every 60 seconds while the user is authenticated and the feature is enabled. Opening the popover and pressing refresh trigger an immediate update. Requests for the previous account, source, or selection must not overwrite newer state; the implementation uses a sequence token or cancellation mechanism.

After each successful update, Vue generates the short display title and sends it to the Tauri host. Source changes update the title immediately after validation rather than waiting for the next scheduled refresh.

## Session And Lifecycle Rules

- Login loads only the configuration scoped to the authenticated user.
- Logout immediately hides the popover, removes the status item, stops refresh work, and clears in-memory usage data.
- Account switching completes the old-account cleanup before reading the new account's configuration.
- Closing the main window while the menu bar feature is active hides the window so the status item continues running.
- Cmd+Q and the popover's `退出` command terminate the application.
- Disabling the feature removes the status item and returns main-window close behavior to the existing application behavior.

## Failure And Edge States

- If a selected subscription expires, is revoked, is suspended, or disappears, the application keeps the stored selection, displays `用量 --`, and shows a clear request to select another subscription when the internal settings dialog is opened.
- A network failure retains the last successful snapshot from the current application run and labels it with its update time and an update-failed notice.
- A cold start without a successful request displays `用量 --`; it never presents a persisted historical number as current.
- Partial failures retain useful data. For example, current balance can remain visible while failed period totals display `--`.
- An account with no active subscriptions receives an empty selector state and cannot enable subscription display.
- Missing window starts render reset time as unavailable instead of inventing a reset timestamp.
- Positioning always clamps the popover to the active monitor so it remains fully visible near screen edges and on multi-monitor setups.

## Components And Modules

Expected focused units include:

- `features/usage-display/core/`: configuration, persistence, reactive state, requests, refresh, and display calculations.
- `features/usage-display/internal/settings/UsageDisplayDialog.vue`: main-application modal shell and completion action.
- `features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`: toggle, source control, subscription selection, and preview using application-theme controls.
- `features/usage-display/external/macos/menu-bar/entry.ts`: dedicated secondary-window bootstrap.
- `features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.vue`: external popover shell, refresh, open-main, and quit actions.
- `features/usage-display/external/macos/menu-bar/BalanceOverview.vue`: compact balance display.
- `features/usage-display/external/macos/menu-bar/SubscriptionOverview.vue`: compact subscription and quota display.
- `features/usage-display/external/macos/menu-bar/QuotaRow.vue`: one finite quota window.
- `features/usage-display/external/macos/menu-bar/macos-menu-bar.css`: CSS imported only by the secondary macOS entry.
- `usage-popover.html`: Vite HTML entry that delegates to the macOS menu bar bootstrap.
- `src-tauri/src/usage_display/mod.rs`: shared commands and host state.
- `src-tauri/src/usage_display/macos/menu_bar.rs`: macOS status-item and popover lifecycle.

The state calculations, internal configuration, platform host behavior, and external presentation components remain separate responsibilities. A planning change may adjust exact filenames when required by the existing build structure, but it must preserve the platform-to-surface hierarchy and CSS isolation.

## Verification

Vue tests cover:

- The avatar-menu command opening an internal dialog rather than a secondary Webview.
- The internal dialog containing configuration controls and no `刷新`, `打开主窗口`, or `退出` actions.
- The external macOS popover containing overview actions and no settings control or settings mode.
- CSS and entry imports remaining isolated between the internal and external surfaces.
- Default-off configuration and per-user persistence.
- Balance and subscription source switching.
- Required fixed subscription selection.
- Most-constrained daily, weekly, and monthly quota calculation.
- Over-limit clamping and fully unlimited subscriptions.
- Long status-title truncation.
- Expired or missing selected subscriptions.
- Partial request failure, runtime stale data, and cold-start offline behavior.
- Logout and account-switch cleanup.

Rust tests cover title updates, tray enable/disable lifecycle, overview events, and monitor-bound positioning calculations where they can be isolated from AppKit.

Required automated checks are:

- `pnpm test:run` in `clients/desktop`
- `pnpm build` in `clients/desktop`
- `cargo check` in `clients/desktop/src-tauri`

macOS visual verification separately covers the application-themed internal settings dialog and the native-vibrancy external surface. External checks include the collapsed menu bar item, balance overview, subscription overview, long subscription names, screen-edge positioning, click-outside dismissal, main-window reopening, logout, and explicit quit. Internal checks confirm content-driven height, theme consistency, configuration interactions, and the absence of external lifecycle actions. Windows and Linux checks confirm the internal placeholder is visible and the external path is not initialized.

## Out Of Scope

- Simultaneously showing balance and a subscription in the menu bar.
- Rotating automatically among several subscriptions.
- Persisting historical usage snapshots locally.
- Notifications for low balance or low subscription capacity.
- User-configurable refresh intervals, colors, metric layouts, or menu bar formats.
- Windows notification-area and Linux status-notifier implementations.
