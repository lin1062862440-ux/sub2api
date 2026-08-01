# LinAI Desktop Authentication Brand Motion Design

**Date:** 2026-08-01
**Status:** Approved direction, pending implementation
**Scope:** The left brand pane shared by desktop login, registration, forgot-password, and reset-password views

## Objective

Replace the authentication pane's static logo grid and slogan with a polished, lightweight particle animation built around the LinAI platform logo. Remove the bottom connection-status block entirely. The result keeps the current light LinAI visual language, gives the desktop client a stronger first impression, and preserves form behavior, native window dragging, and one shared macOS/Windows codebase.

## Confirmed Visual Direction

The left pane keeps only two visual layers:

1. The existing compact LinAI logo and platform name at the top.
2. A large, unframed motion field centered in the remaining pane.

The current bordered square, crosshair axes, corner markers, enlarged static logo, platform slogan, and `安全连接已就绪 / lynn.lat` block are removed. No replacement slogan or status copy is introduced.

The animation uses a restrained mix of LinAI blue, cyan, and a small amount of coral. Blue remains dominant. The background stays light and quiet; the design does not add gradients, blurred blobs, decorative cards, purple effects, or a visible animation frame.

## Shared Component Architecture

Add a focused `BrandMotion.vue` component under `clients/desktop/src/components`. It receives the normalized platform logo source and owns only the visual animation lifecycle. It does not read session state, call APIs, navigate, or own authentication behavior.

Both authentication compositions use the same component:

- `LoginView.vue` replaces its `brand-message` and `connection-status` markup with `BrandMotion`.
- `AuthShell.vue` replaces its `auth-shell__message` and `auth-shell__status` markup with `BrandMotion`.

This makes login, registration, forgot-password, and reset-password visually consistent without moving their form logic. The duplicated obsolete left-pane styles and connectivity imports are removed from their current owners.

## Motion Behavior

The animation is a borderless Canvas 2D scene occupying a stable, responsive square-like region in the center of the left pane. It contains approximately 90 to 140 particles plus a limited number of short connecting strokes. The precise count scales down with the rendered area to keep motion smooth.

The scene runs as a calm repeating sequence:

1. **Drift:** particles move slowly through the field with subtle directional variation.
2. **Assemble:** particles ease toward sampled points in the LinAI logo silhouette.
3. **Hold:** the assembled mark remains recognizable while particles breathe by a few pixels.
4. **Release:** particles separate smoothly and return to the drifting field.

The cycle must not flash, rapidly pulse, or produce abrupt direction changes. A small parallax offset follows pointer position over the left pane, but the Canvas itself has no pointer hit target. Pointer observation must not call `preventDefault`, capture the pointer, or interfere with dragging the frameless window.

Particles are mostly solid blue with cyan accents and sparse coral accents. Connecting strokes use low-opacity blue or cyan and are drawn only between nearby particles with a strict per-frame cap. The Canvas background remains transparent so the existing light pane color carries the composition.

## Platform Logo Source and Fallback

`BrandMotion` receives the same normalized `site_logo` used by the visible brand lockup. It loads that image into an offscreen Canvas, scales it without cropping, and samples opaque pixels into particle target positions. This lets a future platform-logo update affect the animation after the public settings load.

If the configured logo cannot be decoded, violates Canvas cross-origin rules, contains no usable opaque pixels, or times out, the component retries with the bundled `linai-logo.png`. If both sources fail, it renders a deterministic static LinAI-blue particle arrangement rather than a blank pane. Image failures are not surfaced as authentication errors because the animation is decorative.

The component never persists the logo or particle data and does not introduce a new animation dependency.

## Layout and Responsive Behavior

The current two-column authentication layout remains unchanged at desktop widths. The motion field is centered below the top lockup, with stable dimensions based on its container rather than viewport-scaled font sizing. It must not overlap the lockup, the right-side form, or the macOS traffic-light inset.

At the existing `max-width: 900px` breakpoint, the left brand pane remains hidden and the form fills the window. The Canvas must stop and release its resources when hidden or unmounted. This preserves the compact authentication experience and prevents offscreen work.

The required rendered checks are:

- `1180 x 780`: two-column layout, centered nonblank animation, clear LinAI silhouette during assembly, and no overlap.
- `900 x 620`: single-column form layout, no horizontal overflow, no clipped controls, and no offscreen animation workload.

## Accessibility and Runtime Controls

The motion field is decorative and excluded from the accessibility tree. The visible top lockup continues to provide the platform identity.

When `prefers-reduced-motion: reduce` is active, the component renders one stable assembled Logo frame and does not start a repeating animation. When the document becomes hidden, the window loses focus, or the pane is not rendered, animation frames stop. They resume from a valid state when visibility returns.

Canvas resolution follows the rendered CSS size and device pixel ratio, capped at `2` to limit GPU and memory cost. A `ResizeObserver` updates the backing resolution without changing layout. All animation frames, observers, image handlers, visibility listeners, focus listeners, and pointer listeners are cleaned up on unmount.

## Authentication and Offline Behavior

This is a presentation-only change. Login, TOTP, registration, verification-code, forgot-password, reset-password, Turnstile, OAuth, routing, and deep-link behavior remain unchanged.

Removing the left connection-status block removes only its always-visible presentation and retry button. Existing request-level errors continue to appear next to the relevant form. The animation must never block form submission or turn a logo-loading failure into an offline application state.

## Testing and Verification

Implementation follows test-driven development with focused coverage for:

- `BrandMotion` mounting as a decorative Canvas with the supplied platform logo;
- platform-logo decoding and bundled-logo fallback;
- deterministic fallback output when no image can be sampled;
- reduced-motion static rendering;
- pausing and resuming on visibility or focus changes;
- ResizeObserver handling and complete lifecycle cleanup;
- removal of the static grid, slogan, and connection-status markup from both authentication compositions;
- continued visibility of the platform name and unchanged form interactions;
- preservation of the draggable outer authentication surface and non-draggable form controls.

Verification includes the desktop unit suite, Vue type checking, the production frontend build, and `cargo check`. Rendered visual checks cover the login page and one `AuthShell` route at `1180 x 780`, plus compact authentication states at `900 x 620`. Screenshots and Canvas pixel checks confirm that the animation is nonblank, correctly framed, and visually active before the final result is accepted.

## Out of Scope

- changes to dashboard styling or authenticated application layout;
- sound, WebGL, Three.js, or a new animation library;
- interactive particle dragging, clicks, or hidden controls;
- changes to authentication API contracts or backend deployment;
- restoring the removed slogan or connection-status block elsewhere in the pane;
- platform-specific macOS and Windows business-component forks.
