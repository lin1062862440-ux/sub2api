# LinAI Desktop Registration and Account Recovery Design

**Date:** 2026-08-01
**Status:** Approved direction, pending implementation
**Scope:** `clients/desktop` plus the smallest backend contract change required for desktop password-reset links

## Objective

Complete the desktop authentication surface by adding native account registration, forgot-password, and password-reset flows. The result must stay inside the LinAI desktop application, share the existing light LinAI visual language, preserve the existing web flows, and work from one shared macOS/Windows codebase.

The same delivery also corrects the packaged application icon. The platform mark remains blue, but the desktop icon uses the platform's white background instead of the current hard-coded dark background.

## Confirmed Runtime Configuration

The client continues to load public settings from `https://lynn.lat/api/v1/settings/public` and renders only features enabled by the server. At design time, the live LinAI deployment has:

- registration enabled;
- password reset enabled;
- email verification enabled;
- Turnstile disabled;
- invitation codes, promo codes, affiliate codes, and login agreement disabled;
- registration email suffixes limited to `@qq.com`, `@163.com`, `@gmail.com`, and `@yeah.net`.

These values are not copied into UI logic as permanent constants. The public-settings response remains the source of truth so future server-side changes take effect without a client redesign.

## Routes and Shared Authentication Shell

Add three public hash routes to the desktop router:

- `/register`
- `/forgot-password`
- `/reset-password`

All authentication routes reuse the existing light login composition: platform branding on the left, a focused form surface on the right, fixed native drag regions, and the same typography, control dimensions, focus states, errors, and loading behavior. The forms use LinAI branding from public settings with the bundled LinAI asset as an offline fallback. No Sub2API brand or copy is permitted.

The authentication shell owns only shared presentation and connectivity status. Each view owns its form state and API calls, keeping registration and recovery behavior independently testable.

## Registration Flow

The registration view collects username, email, password, and password confirmation. It applies the server-provided email suffix policy before sending a request and shows the allowed domains as a concise field hint.

When email verification is enabled, registration is a two-stage native flow:

1. Validate account fields, Turnstile when enabled, optional signup codes when enabled, and agreement consent when enabled.
2. Send a six-digit email verification code using `/api/v1/auth/send-verify-code`.
3. Show the verification stage in the same authentication surface, preserving the pending registration data in memory.
4. Submit `/api/v1/auth/register` with `verify_code` and the original registration fields.
5. Persist the returned access and refresh tokens through the existing desktop session store, then enter the dashboard.

The verification stage includes a server-controlled resend countdown, a change-email action, numeric input validation, and safe handling of expired or incorrect codes. If email verification is disabled later, the client registers directly after the first stage.

Invitation codes, promo codes, affiliate codes, Turnstile, and agreement consent remain conditional on public settings. They do not occupy space when disabled. Optional code validation uses the existing public validation endpoints before registration.

## Forgot-Password Flow

The forgot-password view accepts an email address and submits `/api/v1/auth/forgot-password` with a fixed `reset_target: "desktop"` discriminator. Turnstile is included only when enabled.

The result always displays the same neutral success state regardless of whether the address exists. This preserves the backend's account-enumeration protection. The success state provides actions to return to login or resend after the applicable cooldown.

Web requests remain unchanged. Existing web clients omit the discriminator, and the backend treats a missing value as `web`.

## Native Reset Link and Deep Link

The backend forgot-password request gains an optional, enum-like `reset_target` field:

- missing or `web`: use the existing configured frontend reset URL;
- `desktop`: generate `linai://reset-password?email=<encoded>&token=<encoded>`.

The request cannot provide an arbitrary callback URL. The backend constructs the fixed custom-scheme URL itself, preventing an open redirect and keeping the reset token scoped to an approved target.

The Tauri application registers the `linai` URL scheme for packaged macOS and Windows applications. It handles both launch modes:

- cold start: parse the initial URL before routing settles;
- warm start: focus the existing window and route when a new deep-link event arrives.

Only the exact `linai://reset-password` host/path combination is accepted. The client validates and decodes `email` and `token`, then navigates internally to the reset view. Unknown or malformed LinAI URLs are ignored without exposing token values in logs or user-facing errors.

## Reset-Password Flow

The reset view reads the email and one-time token from an in-memory deep-link handoff, not from visible form controls. It asks for a new password and confirmation, enforces the backend minimum of six characters, and submits `/api/v1/auth/reset-password` with `email`, `token`, and `new_password`.

Success replaces the form with a confirmation state and a primary action back to desktop login. Invalid, expired, or already-consumed links show a specific recovery state with an action to request a new email. Network failures preserve the form values and allow retry.

The raw reset token must not be persisted to the Tauri store, local storage, session storage, analytics, or logs. It lives only in runtime memory and is cleared after a successful reset or when the recovery flow is abandoned.

## Application Icon Correction

The current brand synchronization script explicitly composites the transparent blue LinAI mark over `#111827`, which causes the dark Dock icon. Change the generated icon source to a white background while retaining the server-provided blue mark and existing padding. Regenerate all Tauri icon outputs, including macOS `.icns`, Windows `.ico`, and PNG sizes, from the single source.

The packaged icon is build-time branding and cannot use the runtime settings response. Running the existing brand synchronization command before packaging continues to fetch the current LinAI platform logo, so changing the platform logo and rebuilding updates both bundled fallback assets and application icons.

## Error and Offline Behavior

- Registration and recovery controls are disabled when the corresponding public setting is explicitly off.
- If settings cannot be loaded, the page remains visible with the existing offline status and retry action, but state-changing submission is blocked until connectivity returns.
- API validation errors are mapped to concise Chinese messages beside the form.
- Turnstile resets after a rejected request and retains the existing domain-authorization warning behavior.
- Rate limits and resend countdowns prevent duplicate submissions.
- Password-reset responses never reveal whether an account exists.

## Testing and Verification

Implementation follows test-driven development with focused tests for:

- route access and authenticated-user redirects;
- public-settings-driven fields and disabled states;
- email suffix, password confirmation, and verification-code validation;
- verification-code send, countdown, resend, registration, and automatic login;
- neutral forgot-password success behavior and `reset_target: "desktop"`;
- strict deep-link parsing for cold and warm application states;
- reset success, expired token, malformed link, network retry, and token cleanup;
- backend request validation and separate web/desktop reset URL construction;
- white application-icon source generation.

Verification includes the desktop unit suite, frontend type checking and production build, relevant Go handler/service tests, `cargo check`, and a packaged macOS application. Rendered screenshots cover login, registration details, email verification, forgot-password success, reset-password, invalid-link, and compact-window states. The packaged app is launched to verify the custom URL scheme and the regenerated white icon. Windows code paths and bundle configuration are checked in the shared implementation even when a Windows package cannot be built on macOS.

## Out of Scope

- Universal HTTPS links with a browser fallback;
- changing the existing web registration or reset-password UX;
- social/OAuth registration redesign;
- passwordless recovery;
- server deployment or production configuration changes beyond code required for this feature.
