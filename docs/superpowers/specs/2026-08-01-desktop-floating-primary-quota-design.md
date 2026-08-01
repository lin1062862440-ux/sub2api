# Desktop Floating Primary Quota Design

## Scope

Refine only the macOS floating usage orb and its expanded subscription card. The main-client settings, macOS menu-bar title and popover, balance presentation, data fetching, native window geometry, source switching, and Windows/Linux placeholders keep their current behavior.

This document supersedes the subscription metric, progress-track, spacing, and motion rules in `2026-08-01-desktop-floating-usage-polish-design.md`. The previously approved pearl material, icon-free floating surface, bottom-right expiration, and 88/352 logical-pixel host sizes remain unchanged.

## Primary Quota Meaning

The floating surface defines one explicit primary quota from the selected subscription's configured finite periods. It chooses the longest available period in this order:

1. monthly;
2. weekly;
3. daily.

When a monthly limit exists, the primary metric is the monthly remaining percentage. When monthly is absent but weekly exists, it is the weekly remaining percentage. Daily becomes primary only when neither monthly nor weekly is configured.

The primary label names the period instead of saying only `剩余额度`: `月额度剩余`, `周额度剩余`, or `日额度剩余`. The percentage is calculated from the existing resolved quota data as `(limit - used) / limit`, clamped to 0-100 and rounded by the existing quota resolver.

This is a floating-only presentation rule. `UsageQuotaSummary.remainingPercent` and `constrainedKey` continue to represent the most constrained quota for the menu-bar title, menu-bar popover, and main-client settings. No shared data contract changes meaning.

## Expanded Hierarchy

The subscription card shows:

- the existing floating header with the subscription name once;
- the primary period label;
- one large primary percentage;
- one primary progress track;
- the primary usage amount and reset time;
- remaining shorter-period quota rows;
- the subscription expiration once at the bottom right.

The primary period is removed from the lower list. For a monthly primary quota, the lower list contains weekly and daily quotas when configured. For a weekly primary quota, it contains daily only. Secondary periods are ordered from longest to shortest, so weekly appears before daily. This prevents the same monthly or weekly quota from appearing twice.

All finite quota periods retain a progress track, including a period with 100% remaining. Tracks are semantic progress indicators, not separators. They receive clear vertical spacing from labels and reset text, a quiet neutral rail, and one accent fill.

The fill width represents the remaining percentage, matching the `剩余` wording and the approved reference: 74% remaining produces a 74%-wide fill. A value at or below 20% may use the existing warning accent. The menu-bar popover retains its current progress calculation and visual behavior.

## Percentage Typography

Primary and orb subscription percentages render as separate number and suffix elements:

```text
100 %
^^^ ^
large number / smaller percent sign
```

The primary number keeps the existing large scale while its percent sign is approximately 42-48% of the number size and aligned near the baseline. The orb uses the same proportion at its smaller scale. Both use a slightly lighter weight than the current solid text while preserving contrast.

Non-percentage orb values such as balance currency, `∞`, and `--` remain a single value and keep the same fixed orb geometry.

## Spacing And Motion

The card follows the reference's vertical rhythm rather than compressing labels, values, tracks, and reset text against one another. Spacing is allocated in this order:

- compact header;
- distinct gap before the primary label;
- percentage with breathing room above the track;
- reset and usage metadata below the track;
- secondary quota block;
- bottom-right expiration footer.

The 336-by-336 visible card must fit up to three configured quota periods without scrolling or clipping. Removing the duplicated primary row creates the vertical room needed for larger gaps.

Motion is restrained and finite:

- the orb and expanded primary value enter with a short opacity and 2-pixel vertical-settle animation;
- progress fills transition to their resolved widths over approximately 180-220 ms;
- no pulsing, bouncing, looping glow, or continuous movement;
- `prefers-reduced-motion: reduce` disables the entrance and width transitions.

## Component Boundary

Add floating-only presentation helpers under `external/macos/floating-window/`:

- a quota-presentation helper selects the longest primary quota and returns the remaining shorter quotas;
- a small metric-value component splits percentage values into number and suffix while leaving currency and fallback values intact;
- `FloatingSubscriptionOverview.vue` owns the primary track, metadata, secondary rows, and footer;
- `FloatingUsageOrb.vue` uses the metric-value component but keeps its existing events and accessibility label.

`QuotaRow.vue` may expose an optional floating presentation mode for remaining-width fills, defaulting to its current menu-bar behavior. Floating callers explicitly enable that mode. Shared defaults do not change.

## Edge Cases

- No finite periods: show the existing unlimited state and `∞` orb.
- One finite period: show it only as the primary block; the lower list is omitted.
- Missing or mismatched subscription data: preserve the `--` orb and unavailable card behavior.
- A quota over its limit: show 0% and an empty accent fill inside the visible rail.
- A quota with no reset timestamp: show the existing unknown-reset copy.
- Long subscription names remain confined to the header and truncate there.

## Testing And Acceptance

Automated tests must prove:

- monthly is primary when monthly, weekly, and daily exist;
- weekly is primary when monthly is absent;
- the primary label names its period and the lower list excludes that period;
- primary and secondary fill widths use remaining percentage;
- a 100%-remaining period still renders a track;
- primary and orb percentages contain separate number and suffix elements;
- balance, unlimited, and unavailable orb values remain intact;
- shared menu-bar rows keep their existing default progress behavior and controls.

At a 352-by-352 viewport, default, dark, and blur appearances must show the complete header, primary track, secondary rows, and expiration without overflow. The layout must have no ornamental divider lines, no SVG icons, no scrollbar, and no console warnings or errors. Reduced-motion emulation must remove the entrance and progress transitions.

The real macOS Tauri client must preserve the 88-pixel orb and 352-pixel expanded host, crisp monitor-aware scaling, dragging, hover expansion, collapse behavior, and source/subscription switching safety.
