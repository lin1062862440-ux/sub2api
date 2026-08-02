# LinAI Android Mobile Redesign

**Date:** 2026-08-02

**Status:** Direction approved; written specification awaiting review

## Goal

Replace the current Android presentation, which compresses the desktop rail and desktop pages into a drawer, with a deliberately smaller phone application. Android keeps the existing Tauri host, authentication, session, API, role, and permission behavior, but receives its own application shell and mobile page presentations. Desktop behavior and styling remain unchanged.

This specification supersedes the navigation and Android feature-scope sections of `2026-08-02-linai-android-companion-design.md`.

## Confirmed Scope

The personal workspace contains only:

1. Home (`dashboard`)
2. Usage records (`usage`)
3. My subscriptions (`subscriptions`)

The administrator workspace contains only:

1. Administration overview (`admin-dashboard`)
2. Account management (`admin-accounts`)
3. Group management (`admin-groups`)
4. User management (`admin-users`)
5. User groups (`user-groups`)
6. Subscription management (`admin-subscriptions`)

Profile, password change, workspace switching, and logout remain account-menu actions rather than bottom-navigation destinations. API keys, channel status, redemption, global usage, channel monitoring, audit logs, redeem codes, announcements, local configuration, external usage display, and desktop export are absent from Android navigation and rejected by Android route access.

## Chosen Architecture

Use a separate mobile presentation layer while sharing business infrastructure.

- Keep desktop views and desktop layout behavior intact.
- Add a dedicated `MobileAppLayout` selected only when the platform capability reports mobile.
- Add mobile views for the nine confirmed destinations. They reuse the existing API modules, authenticated HTTP client, session store, types, formatting rules, and authorization behavior.
- Extract a composable or focused domain helper only when desktop and mobile genuinely share non-trivial state orchestration. Do not copy API calls into a second endpoint layer.
- Keep mobile styles under mobile components or a mobile-only stylesheet rooted at `html[data-mobile='true']`. No unscoped mobile selector may change desktop output.

This is preferred over CSS-only compression because the current desktop pages contain wide toolbars, tables, and desktop drawers. It is preferred over copying the complete desktop client because duplicated endpoint and mutation logic would drift.

## Mobile Shell

### Top App Bar

- Fixed to the top safe area.
- Shows the current route title centered.
- Shows the signed-in user's avatar on the right.
- Does not show a hamburger button or desktop brand rail.
- Keeps a stable 44 CSS pixel touch target and does not resize as titles change.

### Bottom Navigation

- Fixed above the bottom safe area.
- Contains at most five equally sized destinations.
- Uses Lucide icons with short labels and a clear active state.
- Preserves one content scroll owner and adds enough bottom padding that the last record is never hidden behind navigation.

Personal navigation shows three direct destinations: Home, Usage, and Subscriptions.

Administrator navigation shows four direct destinations: Overview, Accounts, Groups, and Users. The fifth destination is `More`, represented by a three-dot icon. `More` opens a bottom sheet containing User groups and Subscription management. When either overflow destination is active, `More` receives the active treatment.

Navigation uses Vue Router directly. It must not push a synthetic browser-history entry and must not call `history.back()` as part of a route click. Android back closes an open account popover or `More` sheet first, then follows route history.

### Administrator Workspace Switching

- Only administrator users receive a workspace command in the avatar menu.
- In personal mode it reads `Switch to administration`; in administrator mode it reads `Switch to personal`.
- Selecting it saves the existing workspace preference, replaces the current route with the destination workspace home, closes the menu, and reactively replaces the bottom-navigation model.
- It does not reload the WebView or require another login.
- Ordinary users never see the command and cannot enter administrator routes directly.

### Account Menu

The avatar opens a compact anchored popover below the top-right control. It contains identity, Profile, Change password, the administrator workspace switch when allowed, and Logout. Desktop-only usage-display and web-admin shortcuts are omitted on Android.

## Mobile Page Presentation

Mobile views favor scanning and repeated touch actions rather than preserving desktop composition.

- Home: compact balance/quota/request summary, current subscription status, one readable usage trend, and primary alerts. Secondary desktop analytics are omitted.
- Usage records: date preset and essential filters, summary totals, record cards, error status where enabled, and previous/next pagination. Advanced filters open in a bottom sheet.
- My subscriptions: subscription cards showing state, validity, quota progress, and renewal/reset information.
- Administration overview: core totals, account health, active requests, cost, and attention items. Dense rankings are shortened.
- Account management: searchable account cards, status, scheduling state, primary actions, and a mobile detail/editor surface.
- Group management: searchable group cards with platform, status, quota, rate, edit, and enable/disable actions.
- User management: searchable user cards with role, status, balance, groups, and an overflow action menu. Editors and destructive confirmation remain explicit.
- User groups: group cards and member/viewer management using full-width mobile sheets.
- Subscription management: searchable subscription cards, assignment, extend/reset/revoke/restore actions, and compact pagination.

Desktop tables are not horizontally squeezed into phone width. Repeated rows become list cards; filters become compact controls or sheets; editors use near-full-screen dialogs or bottom sheets. Loading, empty, failure, mutation, and confirmation states remain feature-complete.

## Android Launcher Icon

The reported incorrect logo is the icon shown by the Android launcher after installation, not the in-app brand image.

The current source and packaged resources are inconsistent: every generated `src-tauri/gen/android/app/src/main/res/mipmap-*` launcher bitmap differs from its corresponding `src-tauri/icons/android/mipmap-*` LinAI source bitmap. The APK therefore packages Android-project initialization assets rather than the current LinAI icon.

The implementation will:

1. Keep one LinAI launcher source under `src-tauri/icons`.
2. Synchronize `ic_launcher.png`, `ic_launcher_round.png`, and `ic_launcher_foreground.png` for every Android density into the generated Android project before each Android build.
3. Configure both normal and round launcher resources in the Android manifest where supported.
4. Make Android build scripts depend on the icon synchronization step so deleting and regenerating `gen/android` cannot silently restore an old logo.
5. Verify the packaged APK resources rather than checking only the source directory.

The in-app logo continues to use platform branding and its bundled fallback; this launcher correction does not change desktop or website icons.

## Routing And Authorization

- Existing route names and backend endpoints remain stable.
- Mobile route presentation is chosen at the route/layout boundary, not by copying the router.
- Android route access gains an explicit allowlist for the three personal and six administrator destinations plus profile and authentication flows.
- Hidden desktop routes redirect to the current workspace home when opened through a hash URL.
- Existing `requiresAdmin`, `standardOnly`, and user-group permissions remain authoritative in addition to the mobile allowlist.
- A failed administrator request removes administrator mode and returns to the personal Home with a visible explanation.

## Desktop Isolation

- Desktop keeps its current rail, workspace switch, account menu, pages, desktop capabilities, window chrome, and keyboard behavior.
- Existing desktop view files should require no layout rewrite for this Android redesign.
- Shared refactors must preserve the same desktop public component/API contract and are covered by desktop regression tests.
- Android-only styles are never activated when `appCapabilities.mobile` is false.

## Testing

Automated coverage must prove:

- Personal bottom navigation contains exactly the three approved destinations.
- Administrator bottom navigation contains four direct destinations plus `More`; the sheet contains exactly User groups and Subscription management.
- Ordinary users cannot see or invoke administrator switching.
- Administrator switching updates the route, preference, menu label, and bottom navigation.
- Every visible mobile navigation control completes its intended route transition without a history rollback.
- Android rejects excluded routes even when opened directly.
- Mobile views expose their required loading, success, empty, error, pagination, and primary mutation states.
- Mobile styles and components do not alter desktop navigation or desktop route access.
- Android launcher source resources match generated build inputs before packaging.

Rendered verification uses Android mode at 360, 390, and 412 CSS pixel widths. It checks top/bottom safe areas, no document-level horizontal overflow, no occluded controls, visible active navigation, account switching, the `More` sheet, representative list/detail/edit flows, and long Chinese labels.

APK verification builds a fresh ARM64 debug APK, inspects the manifest and packaged launcher resources, checks signature and ZIP alignment, and installs it on a connected device or emulator when available. Installation verification includes launcher appearance, cold start, login/session restore, every bottom-navigation destination, both workspace directions, Android back behavior, and logout.

## Acceptance Criteria

- The installed application uses the current LinAI launcher icon instead of the generated project's old icon.
- Android personal mode exposes only Home, Usage records, and My subscriptions.
- Android administrator mode exposes only Overview, Accounts, Groups, Users, User groups, and Subscription management through four direct tabs and `More`.
- Avatar-menu workspace switching works in both directions and immediately updates bottom navigation.
- Every displayed menu destination is clickable and reaches the correct page.
- All nine mobile destinations use phone-specific presentation rather than compressed desktop tables and toolbars.
- Desktop rendering, navigation, capabilities, and interactions remain unchanged.
- Automated, rendered, build, APK, and available device checks pass; any unavailable device check is reported explicitly rather than inferred.
