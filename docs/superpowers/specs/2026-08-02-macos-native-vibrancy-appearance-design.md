# macOS Native Vibrancy Usage Appearance Design

## Goal

Add a fourth macOS-only external usage appearance named `苹果原生风` without replacing or changing the existing sky, meadow, and sunset appearances. The new appearance keeps every existing external usage capability while using native macOS Vibrancy as its surface material.

The appearance covers:

- the menu-bar status item;
- the menu-bar click popover;
- the collapsed floating orb;
- the collapsed floating bar;
- the expanded floating detail window.

The collapsed floating bar uses a system-capsule silhouette. Both expanded surfaces use a landscape detail card instead of the existing square card.

## Approved Product Decisions

- `苹果原生风` is additive. Sky, meadow, and sunset retain their current geometry, CSS, and native-window behavior.
- The appearance is selectable only on macOS. Windows and Linux do not show or persist it as a selectable option.
- The existing `orb` and `bar` floating forms remain independently selectable.
- The native collapsed orb is circular and uses the same compact metric as the other appearances.
- The native collapsed orb and host are exactly 68 by 68 logical pixels.
- The native collapsed bar and host are exactly 196 by 44 logical pixels and use a full capsule radius.
- The native expanded floating card and host are exactly 468 by 276 logical pixels.
- The native menu-bar popover uses the same 468 by 276 landscape information structure and host size, but remains a separate native window.
- Native Vibrancy supplies the surface material. CSS remains responsible for layout, typography, progress tracks, focus treatment, and readable fallback colors, but does not draw a themed gradient or simulated-glass background for this appearance.
- External surfaces contain no settings gear or source controls. Configuration remains in the main client.
- The current shortest-configured-period rule remains authoritative for compact subscription metrics.

## Appearance Contract

Extend `UsageDisplayAppearance` with `native`:

```ts
export type UsageDisplayAppearance = 'sky' | 'meadow' | 'sunset' | 'native'
```

Existing stored values continue to load unchanged. Unknown values continue to fall back through the existing normalization path. `native` is accepted by the Rust host only on macOS builds. The internal appearance chooser filters platform-specific choices so the new option cannot be selected on Windows or Linux.

The default appearance remains the current default. Existing users are never migrated automatically to `native`.

## Surface Behavior

### Menu-Bar Status Item

The status item remains lightweight and owned by macOS. It continues to render the current quota ring or application mark and compact metric text:

- balance: compact available balance;
- subscription: remaining percentage for the shortest configured quota period;
- unlimited subscription: the existing unlimited representation;
- unavailable data: the existing placeholder.

Changing to `native` does not invent a separate menu-bar color theme. The status item continues to use template-aware native rendering so it remains legible in light and dark menu bars.

### Collapsed Floating Orb

The native orb keeps the current drag, hover, click, focus, and metric behavior. Its visible surface is circular and consists of native material with subdued text. The native host matches the visible surface and does not use the CSS shadow gutters required by the existing themed orb.

Balance shows the compact available amount. Subscription shows the shortest configured quota's remaining percentage. Missing data shows `--`.

### Collapsed Floating Bar

The native bar is a 196 by 44 logical-pixel visible capsule. It shows a muted source label on the left and the compact metric on the right:

- balance label: `可用余额`;
- subscription label: `剩余额度`.

The native host matches the visible capsule. The full radius is derived from half the visible height, not copied from the rectangular bars used by the other appearances.

### Expanded Floating Window

Hovering or activating the native orb or capsule expands the native host to a 468 by 276 logical-pixel landscape detail window. Native rounding belongs to the host, so this appearance does not add a transparent CSS shadow gutter.

The window expands from the saved collapsed anchor toward available monitor space. The existing monitor selection, scale-factor conversion, negative-coordinate support, and work-area clamping remain in force. Collapse restores the original anchor.

The expanded native window retains hover re-entry cancellation, delayed collapse, header dragging, data refresh on expansion, reduced-motion behavior, and the current compact native-error accessibility description.

### Menu-Bar Popover

Clicking the status item opens a separate landscape popover with the same information hierarchy as the expanded floating window. It is positioned below the status item, clamped to the active monitor, and closes on focus loss or Escape.

The popover and expanded floating window share Vue content components, not window identity. Menu-bar visibility and floating-window visibility remain mutually exclusive.

## Landscape Detail Content

The landscape card uses a wide information hierarchy modeled on the approved reference:

- top-left: `LINAI · PRO`, source identity, and last-update or stale state;
- top-right: the primary compact metric when that metric has a meaningful denominator;
- middle: source-specific data arranged horizontally;
- bottom: selected source metadata and subscription expiration when applicable.

### Balance

Balance mode shows:

- available balance as the dominant value;
- today's consumption;
- consumption over the last seven days;
- current-month consumption.

Balance has no configured total or denominator. It does not render a fabricated percentage or progress track.

### Subscription

Subscription mode shows the selected group name once in the header. It renders configured finite quotas from the shortest period to the longest, using the current normalized quota values:

- label;
- remaining percentage;
- remaining-progress track;
- used amount and limit;
- reset time.

Weekly and monthly quota rows use progress tracks when present. Daily quota remains supported. The landscape grid adapts from one to three configured quota windows without introducing vertical scrolling at the approved size. Expiration appears once at the bottom-right.

The compact orb, bar, and menu-bar metric continue to use the shortest configured quota. The expanded card may show all configured quota periods; it does not replace them with the most constrained quota.

## Native Material Lifecycle

Rust owns native material application because CSS cannot create actual macOS Vibrancy.

The host records the active appearance alongside the floating state. Configuration follows this order:

1. hide or collapse the affected window;
2. clear any previously applied native material;
3. set the appearance-specific host size and transparent-window properties;
4. apply Vibrancy only when the requested appearance is `native`;
5. position and show the window;
6. let Vue render the matching content after native geometry succeeds.

Expansion and collapse reuse the active appearance to select the correct geometry. A source, subscription, appearance, surface, or floating-form change first returns the renderer to its collapsed state, invalidates stale transitions, and then reconfigures the host.

Sky, meadow, and sunset always clear native Vibrancy before showing. This prevents material leakage when switching away from `native`.

The macOS material is `NSVisualEffectMaterial::Popover` with `NSVisualEffectState::Active`, applied through the existing `window-vibrancy` 0.6 dependency. The native radius matches the visible surface: 34 pixels for the orb, 22 pixels for the capsule, and 23 pixels for landscape cards.

## CSS Boundary

The native appearance receives a dedicated token branch rather than modifying shared theme defaults.

It may define:

- transparent or neutral fallback surface color;
- dark and muted system text colors;
- progress-track and progress-fill colors;
- borders used only to preserve readable geometry when Vibrancy is unavailable;
- landscape grid, spacing, radii, and typography;
- focus-visible and reduced-motion behavior.

It must not define:

- a themed multi-color gradient;
- CSS `backdrop-filter` as the primary material;
- decorative glow or high-contrast outer border;
- appearance-specific data semantics;
- settings or action controls on the external surface.

The fallback background is deliberately more opaque than the Vibrancy path so an API failure never produces invisible text over the desktop.

## Failure And Transition Handling

- A data refresh failure preserves the last successful snapshot and shows the existing stale indicator.
- A missing or deleted subscription shows the existing instruction to reselect it in the client.
- If expansion resizing fails, the compact orb or capsule remains visible and usable.
- If native Vibrancy application fails, the host continues with the neutral CSS fallback and does not hide the external usage surface.
- Rapid appearance or floating-form changes invalidate older expand/collapse operations through the existing interaction sequence.
- Window material is cleared during disabling and when switching to a non-native appearance.

## Architecture And Ownership

Frontend ownership remains separated:

```text
clients/desktop/src/features/usage-display/
  core/
    storage.ts                 # appearance type and normalized persistence
    store.ts                   # data and host configuration flow
  internal/settings/
    UsageAppearanceChooser.vue # macOS-only native choice
    UsageDisplaySettingsForm.vue
  external/macos/
    shared/
      appearance.ts            # appearance metadata
      ExternalUsageDetailCard.vue
      BalanceOverview.vue
      ExternalSubscriptionOverview.vue
      QuotaRow.vue
      quota-float-themes.css    # native layout/tokens, existing themes preserved
    menu-bar/
      MacOSMenuBarPopover.vue
      macos-menu-bar.css
    floating-window/
      MacOSFloatingWindow.vue
      FloatingUsageOrb.vue
      FloatingUsageBar.vue
      macos-floating-window.css
```

Native ownership remains under:

```text
clients/desktop/src-tauri/src/usage_display/
  mod.rs                        # validation, window creation, popover geometry
  macos/
    menu_bar.rs                 # status item and popover material configuration
    floating_window.rs          # material lifecycle and appearance geometry
```

No Windows or Linux external implementation directories are added in this change.

## Testing And Acceptance

Frontend tests cover:

- storage normalization accepts `native` and preserves existing defaults;
- the chooser exposes `native` only for macOS;
- all four appearance values render without changing existing theme contracts;
- native orb and capsule show correct balance, subscription, unlimited, and missing values;
- native expanded content uses the landscape variant;
- balance never fabricates progress;
- subscription quota order, progress, reset time, and expiration remain correct;
- configuration changes collapse before host reconfiguration.

Rust tests cover:

- `native` appearance validation on macOS;
- old appearance validation remains unchanged;
- native orb, bar, and expanded logical host sizes exactly match their visible surfaces;
- existing appearances retain their current logical sizes;
- landscape expansion grows toward available space and clamps on standard, Retina, and negative-coordinate monitors;
- material lifecycle selects apply or clear behavior deterministically;
- the menu-bar popover uses the landscape host size.

Build and runtime acceptance requires:

1. focused usage-display Vitest coverage passes;
2. Rust usage-display unit tests pass;
3. the desktop frontend production build passes, with unrelated pre-existing failures reported separately;
4. the native macOS dev client launches;
5. real-device inspection confirms a circular native orb, a 196 by 44 capsule, a landscape expanded floating card, and a landscape menu-bar popover;
6. switching among native, sky, meadow, and sunset leaves no stale Vibrancy, black rectangle, clipped shadow, square expanded host, or transient transparent disappearance;
7. balance and subscription sources both remain readable at the monitor's active scale factor.

## Out Of Scope

- changing the internal settings dialog into an external-style card;
- adding settings controls to the menu-bar popover or floating window;
- replacing existing appearances;
- implementing Windows or Linux external surfaces;
- adding pinning, click-through, always-expanded, arbitrary resizing, or independent popover and floating appearance settings;
- changing backend usage endpoints or quota calculations.
