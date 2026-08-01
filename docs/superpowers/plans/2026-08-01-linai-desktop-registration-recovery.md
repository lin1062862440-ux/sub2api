# LinAI Desktop Registration and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native registration, email verification, forgot-password, deep-link password reset, and the white LinAI application icon to the shared macOS/Windows desktop client without changing the existing web flow.

**Architecture:** Extend the existing anonymous API module and public-settings type, then add three public hash routes and focused Vue views. A small runtime deep-link module owns URL parsing and handoff; Tauri registers the `linai` scheme and forwards cold/warm URLs. The backend accepts a fixed `reset_target` enum and constructs either the current web URL or the fixed desktop scheme.

**Tech Stack:** Vue 3, TypeScript 6, Vue Router 4, Vitest/Vue Test Utils, Tauri 2, Rust, Gin/Go, Sharp.

---

## File Map

- Modify `clients/desktop/src/api/types.ts`: public settings and auth request/response types.
- Modify `clients/desktop/src/api/index.ts`: registration, verification-code, forgot/reset API calls.
- Create `clients/desktop/src/lib/auth.ts`: email/password/suffix validation helpers.
- Create `clients/desktop/src/lib/auth.spec.ts`: pure validation tests.
- Create `clients/desktop/src/lib/deep-link.ts`: strict `linai://reset-password` parser and in-memory handoff.
- Create `clients/desktop/src/lib/deep-link.spec.ts`: parser and token cleanup tests.
- Modify `clients/desktop/src/router/index.ts`: register, forgot, and reset routes.
- Create `clients/desktop/src/components/AuthShell.vue`: shared light LinAI authentication frame.
- Create `clients/desktop/src/views/RegisterView.vue`: registration details and email verification stages.
- Create `clients/desktop/src/views/RegisterView.spec.ts`: settings, validation, send-code, registration, and resend tests.
- Create `clients/desktop/src/views/ForgotPasswordView.vue`: desktop reset request and neutral success state.
- Create `clients/desktop/src/views/ForgotPasswordView.spec.ts`: request payload and success/error tests.
- Create `clients/desktop/src/views/ResetPasswordView.vue`: token-backed password reset form.
- Create `clients/desktop/src/views/ResetPasswordView.spec.ts`: valid, invalid, expired, success, and cleanup tests.
- Modify `clients/desktop/src/views/LoginView.vue` and spec: native links to the new routes, preserving OAuth browser links.
- Modify `clients/desktop/src/style.css`: shared auth-shell tokens and responsive form states.
- Modify `clients/desktop/package.json`: deep-link package and test/build scripts if needed.
- Modify `clients/desktop/src-tauri/Cargo.toml`: `tauri-plugin-deep-link` and `tauri-plugin-single-instance` dependencies.
- Modify `clients/desktop/src-tauri/src/lib.rs`: initialize single-instance and deep-link plugins.
- Modify `clients/desktop/src-tauri/tauri.conf.json`: desktop `linai` scheme registration.
- Modify `clients/desktop/src/App.vue` and `src/main.ts`: hand off cold/warm deep-link URLs before route display.
- Modify `clients/desktop/scripts/sync-brand.mjs`: white icon background.
- Regenerate `clients/desktop/src-tauri/icons/*` from the synchronized LinAI mark.
- Modify `backend/internal/handler/auth_handler.go`: validate and pass `reset_target`.
- Modify `backend/internal/service/auth_service.go`: select fixed web or desktop reset base URL.
- Add focused Go tests beside auth handler/service tests for web/desktop URL selection.

## Task 1: API Types, Validation, and Routes

**Files:**
- Modify `clients/desktop/src/api/types.ts` and `src/api/index.ts`.
- Create `clients/desktop/src/lib/auth.ts` and `src/lib/auth.spec.ts`.
- Modify `clients/desktop/src/router/index.ts`.

- [ ] **Step 1: Write failing pure validation tests.** Cover `isValidEmail`, `passwordsMatch`, `isValidVerificationCode`, and suffix whitelist matching for both allowed and rejected domains.
- [ ] **Step 2: Run `pnpm test:run src/lib/auth.spec.ts` and verify RED.** The command must fail because the helpers do not exist.
- [ ] **Step 3: Add the helpers and auth API methods.** Add typed methods for `/auth/register`, `/auth/send-verify-code`, `/auth/forgot-password` with `{ email, turnstile_token?, reset_target?: 'web'|'desktop' }`, and `/auth/reset-password`; add `email_verify_enabled`, `registration_email_suffix_whitelist`, and all conditional registration settings to `PublicSettings`.
- [ ] **Step 4: Add public routes.** Register named `register`, `forgot-password`, and `reset-password` routes with `meta.public: true`; preserve the existing authenticated guard behavior.
- [ ] **Step 5: Run focused tests and `pnpm build`.** Expected: validation tests pass and TypeScript compilation succeeds.
- [ ] **Step 6: Commit `feat(desktop): add auth contracts and routes`.**

## Task 2: Shared Auth Shell and Registration

**Files:**
- Create `clients/desktop/src/components/AuthShell.vue`.
- Create `clients/desktop/src/views/RegisterView.vue` and its spec.
- Modify `clients/desktop/src/style.css` and `src/views/LoginView.vue`.

- [ ] **Step 1: Write mounted registration tests.** Assert registration-disabled state, suffix rejection, password confirmation, email-verification stage, send-code payload, registration payload, resend countdown, and automatic session/dashboard navigation. Mock only API, router, and session boundaries.
- [ ] **Step 2: Run `pnpm test:run src/views/RegisterView.spec.ts` and verify RED.**
- [ ] **Step 3: Implement `AuthShell.vue`.** Move the shared brand pane, connection status/retry, form pane, and slot-based header/footer into this component. Keep the 28px drag region and mark all form controls `no-drag`.
- [ ] **Step 4: Implement registration details stage.** Read `session.settings`, hide/show optional fields by settings, validate the server suffix list, send a verification code when `email_verify_enabled`, and preserve pending registration data only in component memory.
- [ ] **Step 5: Implement verification stage.** Add six-digit input, resend countdown, change-email action, Turnstile reset/error handling, and call `register` with `verify_code`; call `completeLogin` on success and replace the route with `dashboard`.
- [ ] **Step 6: Refactor login links to `router.push`.** Registration and password-reset links stay native; OAuth and documentation links continue to use `openUrl`.
- [ ] **Step 7: Run registration/login tests and `pnpm build`.** Expected: all focused tests pass, no duplicate brand layout remains, and the build exits 0.
- [ ] **Step 8: Commit `feat(desktop): add native registration flow`.**

## Task 3: Forgot and Reset Views

**Files:**
- Create `clients/desktop/src/views/ForgotPasswordView.vue` and spec.
- Create `clients/desktop/src/views/ResetPasswordView.vue` and spec.
- Modify `clients/desktop/src/style.css`.

- [ ] **Step 1: Write failing forgot/reset view tests.** Assert desktop forgot payload, neutral success message, disabled settings state, new-password confirmation, API payload, success return action, and invalid-token recovery action.
- [ ] **Step 2: Run `pnpm test:run src/views/ForgotPasswordView.spec.ts src/views/ResetPasswordView.spec.ts` and verify RED.**
- [ ] **Step 3: Implement forgot-password.** Submit `{ email, reset_target: 'desktop' }`, include Turnstile only when required, show the same success copy for all accepted emails, and provide native return/resend actions.
- [ ] **Step 4: Implement reset-password.** Read the deep-link handoff, keep token/email in memory, validate two matching six-character passwords, submit reset, clear the handoff after success, and expose retry/request-new-link states without logging token data.
- [ ] **Step 5: Run focused tests and `pnpm build`.** Expected: both views pass and the production build succeeds.
- [ ] **Step 6: Commit `feat(desktop): add password recovery views`.**

## Task 4: Deep-Link Runtime and Tauri Packaging

**Files:**
- Create `clients/desktop/src/lib/deep-link.ts` and spec.
- Modify `clients/desktop/src/App.vue`, `src/main.ts`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, and `src-tauri/tauri.conf.json`.

- [ ] **Step 1: Write parser tests.** Accept only `linai://reset-password` with non-empty decoded `email` and `token`; reject other schemes, hosts, paths, duplicate/empty parameters, malformed encoding, and query values that contain loggable secrets.
- [ ] **Step 2: Run `pnpm test:run src/lib/deep-link.spec.ts` and verify RED.**
- [ ] **Step 3: Implement the in-memory handoff.** Export `parseResetDeepLink`, `setResetHandoff`, `consumeResetHandoff`, and `clearResetHandoff`; never persist or log the token.
- [ ] **Step 4: Add Tauri dependencies and registration.** Use the Tauri v2 deep-link and single-instance plugins, initialize single-instance before deep-link, and configure the desktop `linai` scheme for packaged macOS and Windows.
- [ ] **Step 5: Wire cold and warm URLs.** On startup consume the initial URL before mounting the router; on warm events focus the main window, set the handoff, and navigate to `reset-password`.
- [ ] **Step 6: Run parser tests, `cargo check`, and `pnpm build`.** Expected: strict parser tests pass and both Rust/TypeScript checks succeed.
- [ ] **Step 7: Commit `feat(desktop): handle native reset deep links`.**

## Task 5: Backend Desktop Reset Target

**Files:**
- Modify `backend/internal/handler/auth_handler.go` and `backend/internal/service/auth_service.go`.
- Add focused tests in the nearest existing auth handler/service test files.

- [ ] **Step 1: Write failing Go tests.** Assert missing/`web` target uses the configured frontend URL, `desktop` uses exactly `linai://reset-password`, and any other target returns a 400 without queueing mail.
- [ ] **Step 2: Run the focused Go tests and verify RED.**
- [ ] **Step 3: Add a closed request discriminator.** Define `ResetTarget string` in `ForgotPasswordRequest`; accept only `""`, `"web"`, or `"desktop"`; pass a fixed reset base URL into the existing async password-reset service. Do not accept a caller-provided URL.
- [ ] **Step 4: Preserve web behavior.** Keep the current configured frontend URL for omitted/`web` requests and keep the enumeration-safe success response.
- [ ] **Step 5: Run focused Go tests and `go test ./backend/internal/handler/... ./backend/internal/service/...`.** Expected: all pass.
- [ ] **Step 6: Commit `feat(auth): support desktop password reset links`.**

## Task 6: White LinAI Application Icon

**Files:**
- Modify `clients/desktop/scripts/sync-brand.mjs`.
- Regenerate `clients/desktop/src-tauri/icons/*`.

- [ ] **Step 1: Add a deterministic script assertion or image check.** Verify the generated 1024px source has an opaque white corner pixel and retains non-white LinAI mark pixels.
- [ ] **Step 2: Run the check against the current source and verify RED.** The current corner is `#111827`.
- [ ] **Step 3: Change only the icon composite background to `#FFFFFF`.** Keep transparent runtime fallback logo and current mark padding unchanged.
- [ ] **Step 4: Run `pnpm brand:sync` and verify with `file`/pixel inspection.** Regenerated PNG, ICNS, and ICO outputs must exist and the source corner must be white.
- [ ] **Step 5: Commit `fix(desktop): use white LinAI application icon`.**

## Task 7: Full Verification and Package

**Files:**
- Modify only files required by failing verification.

- [ ] **Step 1: Run all desktop tests and checks.** `pnpm test:run && pnpm build && cargo check --manifest-path src-tauri/Cargo.toml && git diff --check` must pass.
- [ ] **Step 2: Run focused backend checks.** `go test ./backend/internal/handler/... ./backend/internal/service/...` must pass.
- [ ] **Step 3: Render every auth state.** Verify login, registration, email verification, forgot success, reset form, invalid-link, offline, and compact-window states at 1180x780 and 900x620; confirm no overlap, overflow, stale Sub2API fallback, or console errors.
- [ ] **Step 4: Build macOS artifacts.** Run `pnpm bundle:macos`; verify `LinAI.app`, DMG contents, bundle identifier, white icon, and SHA256. Check Windows scheme configuration statically on macOS.
- [ ] **Step 5: Run `git status --short` and review the complete diff.** Confirm only the approved desktop, backend, generated icon, and plan/spec files changed.
