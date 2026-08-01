# Desktop Dashboard Motion Design

## Goal

Add a coherent motion system to the LinAI desktop dashboard and usage page. Motion should make loading and data changes feel intentional and polished without competing with operational data or running continuously while the user reads.

## Direction

Use the approved balanced motion direction:

- Motion concentrates around initial loading, refresh completion, navigation, and direct hover/focus interactions.
- Resting screens remain visually quiet.
- Blue, violet, and teal highlights reuse the existing data-series colors rather than introducing a new decorative palette.
- Movement stays short and shallow: approximately 160-700ms with 2-6px travel.

## Shared Motion Tokens

Define reusable CSS custom properties for fast, standard, and reveal durations plus a shared deceleration curve. Shared keyframes cover:

- skeleton shimmer;
- short upward reveal;
- soft highlight sweep;
- progress growth;
- refresh rotation.

All animations stop or collapse to near-instant transitions under `prefers-reduced-motion: reduce`.

## Loading And Refresh

### Initial Loading

- Replace flat breathing blocks with structured skeletons that approximate the final chart, ranking, and table layout.
- A restrained diagonal highlight travels across skeleton surfaces.
- Skeleton sections enter in a short stagger so the page structure becomes legible immediately.
- Avoid indefinite pulsing that makes the whole page appear unstable.

### Refresh

- Keep the last successful data visible.
- Rotate the refresh icon and apply one low-opacity highlight sweep to affected panels.
- Do not replace populated content with full-page skeletons during a manual or automatic refresh.
- Failed secondary endpoints retain successful data and continue using the existing partial-update notice.

## Dashboard Motion

- Headline metric cards reveal with a 55ms stagger and a small upward translation.
- Hover and keyboard focus raise a metric or data panel by 2px, strengthen its border, and reveal a soft internal highlight.
- The trend line keeps its existing draw animation; chart points settle after the line finishes.
- Model bars grow from zero after data arrives.
- The platform donut reveals with a short masked rotation while the legend rows stagger in.
- Empty states use a single fade-in and remain static afterward.

## Usage Motion

- Summary items reveal in sequence and use the same hover language as dashboard metrics.
- Trend, model ranking, and group ranking enter as one coordinated analysis workspace.
- Ranking bars grow from zero with row-level delays.
- Usage and error rows use a subtle stagger on first load or tab change; pagination does not replay the entire page entrance.
- The advanced-filter popover uses a short opacity and 4px vertical reveal.
- The error drawer keeps its directional slide but uses the shared duration and easing tokens.

## Interaction Rules

- Hover movement applies only to pointer-capable environments.
- Focus-visible states receive the same emphasis without requiring motion.
- No looping glow, particle background, bouncing metrics, or continuously moving gradients are introduced.
- Animations do not change layout dimensions, table column widths, chart framing, or scroll position.

## Implementation Shape

- Shared motion tokens and keyframes live in `clients/desktop/src/style.css`.
- Dashboard-specific orchestration stays in `DashboardView.vue`.
- Usage-specific orchestration stays in `UsageView.vue` and the existing usage display components.
- Data-fetching contracts and backend behavior remain unchanged.

## Verification

- Existing dashboard and usage tests continue to pass.
- Focused tests verify loading and refreshing state classes where behavior depends on state.
- Browser checks cover populated and loading states at desktop sizes, hover behavior, filter popover, reduced-motion CSS, scroll preservation, and console errors.
- Verification uses Vite visual preview only; it does not build Rust, Tauri, or a DMG.
