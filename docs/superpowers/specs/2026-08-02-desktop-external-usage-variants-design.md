# Desktop External Usage Variants Design

## Goal

Refine the macOS external usage display into one coherent quota product while keeping the in-client surface strictly focused on configuration. Users can choose a pearl color theme and, for floating display, either an orb or compact bar. The menu-bar popover and expanded floating window use the same detail presentation.

## Boundaries

- `internal/settings/` owns switches, source selection, subscription selection, surface selection, style selection, and previews. It never renders external lifecycle actions such as quit.
- `external/macos/shared/` owns external palette tokens and the reusable detail card.
- `external/macos/menu-bar/` owns only the menu-bar host page and menu-specific behavior.
- `external/macos/floating-window/` owns the collapsed orb/bar, expansion behavior, drag behavior, and floating host page.
- Windows and Linux remain unsupported placeholders. The persisted schema is platform-neutral so later external hosts can reuse it.

## Configuration And Migration

`UsageDisplayConfig` adds `floatingStyle: 'orb' | 'bar'`. The three appearances become:

- `sky`: cool pearl blue, and the default.
- `meadow`: pale yellow-green pearl.
- `sunset`: warm peach-red pearl.

Stored legacy appearances migrate deterministically: `default` to `sky`, `dark` to `meadow`, and `blur` to `sunset`. Missing `floatingStyle` migrates to `orb`. Invalid individual fields fall back independently without discarding otherwise valid source or surface values.

## Client Settings

The settings dialog remains part of the normal client theme. It contains no quit, refresh, or open-main actions. The appearance chooser shows three faithful miniature pearl previews named `清透蓝`, `青柠黄`, and `珊瑚红`.

When `悬浮窗` is selected, a two-option segmented control chooses `圆形` or `横条`. The preview renders both the selected theme and selected floating form. Menu-bar preview renders the compact status representation rather than the expanded card.

## External Detail Card

One shared detail-card component is used by the menu-bar popover and the expanded floating window. The floating host adds dragging; the menu host adds Escape-to-close. Neither card includes a gear or quit icon. The card has a 20px corner radius, a small transparent outer gutter, and matching native window geometry so all four corners remain visibly rounded.

The header is a spacious three-line hierarchy:

1. `LINAI · PRO`
2. selected subscription name or `账户余额`
3. status dot plus last update state

No decorative logo or right-side action icon is shown. Data refresh remains automatic.

For subscription usage, the primary value is `剩余额度`. It is the remaining percentage of the longest configured quota period: monthly, then weekly, then daily. The value uses a large numeral and smaller `%`. A primary progress track sits directly beneath it. Each configured quota row also has its own progress track, usage summary, and reset time. The primary quota is not repeated as a second oversized monthly block; the compact quota rows provide period detail. Expiry sits below the quota rows, aligned to the lower right. Vertical spacing expands when only one or two quota rows exist so the body does not crowd the header or leave a dead lower half.

For balance usage, the primary value is available balance and the lower row shows today, last seven days, and current month spend.

## Floating Window

Collapsed forms:

- Orb: 88 by 88 logical pixels, with a soft edge, large numeric value, smaller percent sign, restrained weight, and a brief value-change animation.
- Bar: 176 by 52 logical pixels, with the source label and value in a compact horizontal pearl.

Both sit at the lower-right of the active monitor, support dragging, and expand on click into the shared 352 by 352 detail card. Switching source, theme, or floating form reconfigures native geometry immediately without producing a clipped or empty surface.

## Menu-Bar Item

Balance display omits the word `余额` and shows the LinAI template mark followed by a subdued currency value. Subscription display omits the subscription name and `用量`; it shows the mark followed by a compact percentage metric. The percentage color moves from green at high remaining quota through amber to red at low quota; zero is represented as a hollow metric. macOS owns final status-item ordering, so the implementation assigns a stable native autosave identifier and creates the item consistently, preserving the user's Command-drag placement instead of promising forced arbitrary ordering.

## Motion And Accessibility

Metric changes use a short opacity/vertical transition and progress tracks animate width changes. `prefers-reduced-motion` disables both. Settings controls expose `aria-pressed`, switch state, labels, and visible keyboard focus.

## Verification

- Unit tests cover storage migration, appearance choices, floating-style propagation, shared detail hierarchy, collapsed variants, and tray metric formatting/color selection.
- Vue type checking and production build must succeed.
- Rust tests cover appearance/style validation, geometry, tray metric parsing, color interpolation, and existing popover positioning.
- Browser/native screenshots must cover all three themes, orb and bar, balance and subscription, at their real logical dimensions. The screenshots are inspected for clipped corners, overlapping text, missing progress tracks, excessive empty space, and stale theme previews.

