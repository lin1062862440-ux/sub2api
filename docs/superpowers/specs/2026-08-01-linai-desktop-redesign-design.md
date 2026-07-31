# LinAI Desktop Redesign

**Date:** 2026-08-01

**Status:** Approved direction, ready for implementation planning

## Objective

Turn the existing Tauri desktop skeleton into a cohesive LinAI macOS client. Keep the working Rust, authentication, storage, routing, and dashboard API foundations, while replacing the temporary dark template with a distinctive light product interface.

The first release covers login, dashboard, and profile. It targets macOS first from one shared Tauri codebase, with platform-specific behavior isolated behind runtime or bundle configuration.

## Product Identity

- The user-facing product name is **LinAI**.
- No `Sub2API` name, initials, description, window title, package name, or fallback copy may appear in the desktop client.
- The backend remains fixed at `https://lynn.lat`; this origin stays defined in one source file.
- Runtime UI branding reads `site_name`, `site_logo`, and `site_subtitle` from `/api/v1/settings/public`.
- The bundled LinAI name and logo act as the offline fallback.
- The macOS application icon is generated before packaging from the current LinAI platform logo and stored locally so packaging does not depend on a live response after synchronization.

## Visual Direction

The selected direction is **Light Future**: bright, calm, technical, and recognizably LinAI without resembling a generic admin template.

### Palette

- Cool white and pale neutral gray form the application canvas.
- White surfaces use thin neutral borders rather than heavy shadows.
- Graphite provides primary text and structural contrast.
- The platform's blue and cyan logo colors define primary actions and selected states.
- Mint is reserved for healthy or live status.
- Coral is reserved for cost, errors, or destructive feedback.
- Large decorative gradients and one-color blue layouts are avoided.

### Typography And Shape

- Use the native system font stack for a macOS feel and tabular numerals for operational data.
- Keep headings compact and functional; dashboard content must prioritize scanning.
- Use restrained radii, generally 6-8 px for controls and panels.
- Prefer icons for familiar actions such as refresh, logout, and navigation, with accessible labels and tooltips where needed.
- Motion is subtle and functional: brief page entry, loading transitions, and live-status feedback, all disabled by reduced-motion preferences.

## Application Shell

- Retain a left navigation rail because dashboard and profile are repeated desktop workflows.
- Integrate macOS traffic-light spacing into the rail header without hardcoding it into business views.
- Show the LinAI mark and name prominently at the top of the rail.
- Use a quiet tinted selection band for the active route.
- Place the signed-in identity at the bottom with an icon-only logout action and tooltip.
- Keep the content pane independently scrollable and usable at the existing minimum window size of 900 x 620.
- Other operating systems share the same business UI and only adjust native window chrome spacing and bundle targets.

## Login

- Replace the centered dark card with a full-window branded composition.
- Make the LinAI logo, name, and platform subtitle first-viewport signals.
- Keep the form focused and compact, with email, password, visible validation, and a clear primary sign-in action.
- Preserve the existing two-step TOTP stage and dynamically enabled OAuth methods.
- Registration and password-reset entry points appear only when the public settings enable them and open the fixed LinAI web origin in the system browser.
- Offline state is integrated into the page status area instead of appearing as a warning bar detached from the form.
- Loading and error states do not change the form's dimensions.

## Dashboard

- Use an open, data-first layout rather than a grid of identical floating cards.
- Present balance, today's requests, today's tokens, and today's cost in one stable summary band.
- Keep RPM, TPM, latency, concurrency, and active-key health in a compact operational strip.
- Make the seven-day trend the primary visualization with readable axes, hover details, empty state, and responsive sizing.
- Present model usage and platform distribution as two dense, aligned sections below the trend.
- Preserve standard/simple mode behavior: cost and balance details stay hidden in simple mode.
- Refresh is an icon action with tooltip and a non-shifting busy state. Existing one-minute background refresh remains.
- Partial endpoint failures must preserve successful sections and identify which data could not be refreshed.

## Profile

- Treat profile as a settings surface, not another dashboard.
- Lead with the LinAI identity and signed-in user summary.
- Group account, limits, timestamps, and deployment information into clear rows separated by rules rather than nested cards.
- Show the fixed LinAI deployment address as read-only information; do not offer server switching.
- Keep destructive or session actions visually separate from informational content.

## Branding Pipeline

1. A brand-sync script requests `/api/v1/settings/public` from the fixed origin.
2. It validates and decodes the returned `site_logo` data URL or supported remote image.
3. It creates a committed local fallback asset for the Vue interface.
4. It renders the mark into a graphite-backed macOS icon composition with safe padding.
5. It invokes the Tauri icon generator to create `.icns`, `.ico`, and required PNG sizes.
6. The normal package build consumes those local outputs and can complete offline.

Brand synchronization is an explicit command and a packaging precondition, not an implicit network request on every frontend build. This keeps ordinary development deterministic.

## Data And Error Flow

- Existing API wrappers remain the source of backend calls.
- The session bootstrap loads public branding first, then restores the stored session and current user.
- Access-token refresh remains single-flight and persists rotated refresh tokens.
- Network failures retain an offline fallback logo and actionable retry controls.
- Authentication failures clear local credentials and return to login.
- Non-authenticated public branding failures never block rendering.
- Invalid or unsafe logo URLs fall back to the bundled LinAI asset.

## Testing

### Automated

- Add a frontend test runner suitable for Vue components and utilities.
- Test brand normalization and safe fallback behavior.
- Test that no user-facing desktop source contains `Sub2API`.
- Test login credential, TOTP, offline, disabled, and error states.
- Test authenticated route guards and expired-session behavior.
- Test dashboard mapping for live backend field names and standard/simple modes.
- Test brand-sync input validation and deterministic output where practical.
- Keep TypeScript build and Rust `cargo check` as required gates.

### Visual And Runtime

- Verify login, dashboard, and profile at the default window and 900 x 620 minimum.
- Verify light-theme contrast, keyboard focus, long names, large values, empty data, loading, error, and offline states.
- Verify no overlap with macOS traffic lights and no horizontal overflow.
- Verify the live LinAI API settings response and login error envelope without transmitting real credentials.
- Build the macOS `.app` and `.dmg`, inspect bundle metadata and icon resources, then launch the packaged app.

## Scope Boundaries

Included in this iteration:

- LinAI branding and icon pipeline
- Login and TOTP states
- Dashboard
- Profile
- Shared shell and design tokens
- Focused tests and macOS packaging verification

Excluded until requested:

- Native registration or password-reset forms
- API-key management
- Recharge and subscription purchasing
- Admin views
- Windows installer production
- Automatic in-app updates

## Acceptance Criteria

- The app consistently presents itself as LinAI and contains no visible Sub2API branding.
- UI branding follows the platform settings and has a bundled offline fallback.
- The macOS package uses a polished icon derived from the LinAI platform logo.
- Login, TOTP, session restoration, refresh, logout, dashboard, and profile work against the current backend contract.
- All three views share the approved Light Future visual system and remain usable at the minimum window size.
- Automated checks, TypeScript build, Rust check, browser visual verification, and macOS packaging verification complete successfully.
