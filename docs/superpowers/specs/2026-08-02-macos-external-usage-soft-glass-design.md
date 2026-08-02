# macOS External Usage Soft Glass Design

## Goal

Reduce the visual intensity of all three macOS external usage themes while preserving their identity and data readability. The menu bar popover, expanded floating window, collapsed orb, and collapsed bar should feel like quiet macOS utility surfaces rather than opaque colored cards.

## Scope

- macOS menu bar usage popover.
- macOS expanded floating usage window.
- macOS collapsed floating orb and bar.
- Sky, meadow, and sunset appearances.
- Balance and subscription sources.

The internal client settings dialog, usage data selection, layout, and native window behavior remain unchanged.

## Visual Direction

Use a restrained system-glass treatment:

- Build each theme from a translucent neutral base plus a low-concentration theme tint.
- Apply background blur and modest saturation so desktop content is softly visible through the surface without harming legibility.
- Replace the current opaque edge with a subtle white highlight.
- Use a short, low-opacity shadow that separates the surface without making it float aggressively.
- Keep sky, meadow, and sunset recognizable, but limit theme color to the background tint and progress accent.

## Detail Card

- Preserve the current 336 by 336 card inside the 352 by 352 native host.
- Keep the current information hierarchy, quota ordering, spacing, and corner geometry.
- Use translucent theme gradients rather than solid pastel gradients.
- Retain readable dark text. Muted text must use a darker theme-relative tone rather than generic light gray.
- Make separators and progress tracks quieter through lower opacity.
- Desaturate progress fills while retaining sufficient contrast for white percentage labels.
- Keep constrained-quota warning styling recognizable, with a softer red than the current alert fill.

## Collapsed Orb And Bar

- Reuse the same theme palette as the expanded card.
- Use a translucent neutral base, a small theme tint, and background blur.
- Reduce the shadow footprint and opacity.
- Preserve current dimensions, typography, percentage treatment, drag behavior, and expansion behavior.
- Keep focus-visible styling accessible.

## Accessibility And Resilience

- Primary text and metrics remain readable over all supported desktop backgrounds.
- Glass effects must have a translucent color fallback when backdrop filtering is unavailable.
- No information relies on theme color alone.
- Existing reduced-motion behavior remains intact.

## Verification

- Run the focused external usage component tests.
- Run the complete desktop test suite and production build.
- Run the Rust usage display tests.
- Inspect sky, meadow, and sunset at the native 352 by 352 expanded size.
- Inspect orb and bar collapsed states for balance and subscription sources.
- Confirm there is no clipping, overflow, internal settings regression, or unreadable text.
