# Desktop Floating Usage Polish Design

## Scope

Polish only the macOS floating usage window and fix its balance/subscription switching race. The in-client usage settings and macOS menu-bar popover keep their current components, layout, controls, and styling.

This document supersedes only the floating-window visual and interaction sections of `2026-08-01-desktop-quota-float-surfaces-design.md`. Configuration storage, source selection, surface exclusivity, menu-bar behavior, Windows/Linux placeholders, refresh APIs, and backend behavior remain unchanged.

## Approved Outcome

- Use visual direction A: a restrained pearl surface transitioning from cool blue through pale green to warm white.
- Remove the `L` mark from the collapsed orb.
- Remove all header icons from the expanded floating card.
- Keep refresh automatic when the card expands and through the existing refresh scheduler.
- Keep application opening, quitting, and all display settings inside the main client; the floating card does not expose those commands.
- Remove the rectangular native shadow visible behind the collapsed orb.
- Prevent the expanded card's rounded corners and shadow from being clipped by the transparent native window.
- When the source or selected subscription changes, render a collapsed placeholder before the native window shrinks or new data arrives. Expanded content must never be squeezed into the orb-sized window.

## Ownership And Isolation

The floating window receives a presentation component owned by its existing surface folder:

```text
clients/desktop/src/features/usage-display/external/macos/
  floating-window/
    FloatingUsageOrb.vue
    FloatingUsageCard.vue
    MacOSFloatingWindow.vue
    macos-floating-window.css
  menu-bar/
    MacOSMenuBarPopover.vue
    macos-menu-bar.css
  shared/
    BalanceOverview.vue
    SubscriptionOverview.vue
    QuotaRow.vue
    UsageQuotaCard.vue
    quota-float-themes.css
```

`FloatingUsageCard.vue` owns the floating-only shell, header hierarchy, and absence of actions. It may compose the existing balance and subscription overview components, but all floating geometry and material rules live in `macos-floating-window.css` under floating-specific selectors.

`MacOSMenuBarPopover.vue`, `UsageQuotaCard.vue`, `macos-menu-bar.css`, and the internal settings components are not restyled by this change. Shared core formatters and usage data remain reusable; shared visual CSS is not expanded to carry floating-only decisions.

## Collapsed Orb

The native collapsed window becomes 88 by 88 logical pixels. A 66-pixel circular orb is centered inside it, leaving 11 pixels of transparent breathing room on every side for the CSS shadow.

The orb contains exactly one centered value:

- balance: the existing compact value such as `$25`, `$1.2K`, or `$1M`;
- subscription: the selected subscription's most constrained remaining percentage such as `42%`;
- unlimited subscription: `∞`;
- loading, invalid selection, or unavailable data: `--`.

The orb contains no logo letter, source name, group name, status icon, error text, or secondary line. Its content box has a fixed width and height, centered alignment, no wrapping, and overflow clipping as a final guard. A source change cannot alter the orb or native window dimensions.

The default appearance uses the approved pearl palette. Existing dark and blur appearance choices remain supported, but they use the same corrected geometry and single-value contract.

## Expanded Floating Card

The native expanded window becomes 352 by 352 logical pixels. The visible card is inset by 8 pixels and occupies 336 by 336 pixels. This transparent outer gutter contains the CSS shadow and prevents corner clipping.

The visible card uses a 16-pixel radius. Its default material is a subtle pearl blend with dark charcoal text, muted secondary text, low-contrast separators, and one solid blue progress accent. It does not use striped progress, oversized decorative circles, or icon ornaments.

The header contains only:

- `LinAI · Pro` or the relevant LinAI/source identity;
- the selected source label;
- the last successful update time or a short stale state.

There are no refresh, open-main, quit, settings, or provider icons. The complete header remains a drag region. Opening the card still triggers an immediate refresh; periodic refresh continues unchanged.

Balance content keeps available balance plus today, last-seven-days, and current-month consumption. Subscription content keeps the primary remaining percentage, reset information, selected subscription identity, and finite quota rows. Long values truncate or compact within fixed tracks and cannot resize the card.

## Source And Subscription Switching

`MacOSFloatingWindow.vue` observes the configuration identity formed from `source` and `subscriptionId`.

When that identity changes:

1. Cancel any pending collapse timer and invalidate any in-flight expand/collapse interaction.
2. Synchronize the renderer to collapsed mode immediately so the expanded card leaves the DOM before the native host applies collapsed geometry.
3. Request native collapse as an idempotent operation.
4. Render `--` whenever the currently loaded subscription ID does not match the newly selected subscription ID.
5. Let the existing configuration event and sequence-protected store refresh load the new source.
6. Replace `--` with the new compact value only when the matching snapshot is available.

Native `configure` continues to restore the collapsed window for an enabled floating surface. Both frontend and native transitions are intentionally idempotent so event ordering cannot expose expanded content inside an orb-sized host.

If native collapse fails, the renderer remains collapsed and records a non-layout-breaking diagnostic for logs. Error copy is not rendered inside the 66-pixel orb.

## Native Window Changes

The macOS floating `WebviewWindowBuilder` disables the native window shadow. The visible orb and card provide their own CSS shadows inside transparent gutters.

Rust constants represent host footprints rather than visible surface sizes:

- collapsed host: 88 logical pixels;
- expanded host: 352 logical pixels;
- default work-area margin: 20 logical pixels.

The existing anchor, expansion direction, monitor scaling, negative-coordinate handling, clamping, and position persistence remain intact. Geometry unit-test expectations update to the new host sizes. The visible surface remains completely inside the host at every scale factor.

## Failure Behavior

- Missing or changing data displays `--` without showing stale content from a different source or subscription.
- Rapid hover and configuration changes invalidate earlier transition completions.
- Expand failure leaves the single-value orb visible.
- Collapse failure does not restore the expanded DOM into a collapsed native window.
- Stale network data may remain visible only when it belongs to the current source and subscription identity.
- Long currency values continue through the compact formatter and never wrap.

## Testing And Acceptance

Frontend tests cover:

- no `L` mark in the collapsed orb;
- one fixed metric value and no rendered orb error copy;
- floating detail card has no refresh, open-main, quit, or settings actions;
- menu-bar action behavior remains unchanged;
- changing source or subscription while expanded synchronously renders the orb and requests native collapse;
- a selected subscription never renders another subscription's quota summary;
- rapid source changes cannot restore stale expanded state.

Rust tests cover 88-pixel collapsed and 352-pixel expanded geometry, bottom-right placement, expansion up and left, clamping, and negative-coordinate monitors.

Build verification includes focused Vitest files, the complete Desktop frontend test suite, `pnpm` build, focused Rust tests, and `cargo check` for the Tauri crate.

Visual acceptance uses both the browser visual harness and the real macOS Tauri window. Acceptance requires:

- no rectangular boundary behind the collapsed orb;
- no clipped orb shadow;
- no `L` or accidental secondary content;
- no clipped expanded corners or shadow;
- no header icons in the floating card;
- visual direction A for the default appearance;
- balance-to-subscription and subscription-to-subscription switches never squeeze expanded content into the orb;
- menu-bar popover and internal settings remain visually unchanged.
