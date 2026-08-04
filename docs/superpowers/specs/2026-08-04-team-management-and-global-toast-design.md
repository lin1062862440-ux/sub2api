# Team Management And Global Toast Design

**Date:** 2026-08-04

**Status:** Approved for implementation

## Goal

Simplify the LinAI client team workspace by presenting membership and quota allocation as one operational list, and add a reusable semantic Toast system for user-triggered action feedback across the desktop and Android client.

The change is client-only. Existing backend APIs, authorization checks, database entities, API field names, and billing enforcement remain unchanged.

## Confirmed Decisions

- Replace the visible product term `用户组` with `团队管理` throughout client navigation, page headings, actions, empty states, and operation feedback.
- Keep internal route names, API paths, TypeScript types, and backend terminology unchanged for compatibility.
- Merge the existing `成员` and `套餐与配额` team-detail tabs into one `成员与配额` workspace.
- Use a unified member table on desktop. Each row shows member identity, access role, weekly usage, usage progress, and allocated weekly quota.
- Move team quota policy configuration behind a `设置周配额` button.
- Use a semantic Toast stack for client-wide action results.
- Migrate all existing user-triggered action results in the client during this implementation, not only the team workspace.

## Team Navigation And Compatibility

The desktop rail and Android administrator navigation use the visible label `团队管理`. The team directory page title and user-facing copy use the same term.

Team detail navigation contains two destinations:

1. `成员与配额`
2. `用量分析`

The existing member route remains the canonical combined workspace route. The existing quota route remains recognized and redirects to the combined route. A direct legacy quota link may request that the quota settings panel open after redirect, but it must not render the old standalone quota page.

Existing permission guards remain authoritative. Administrators and delegated managers keep their current mutation capabilities; read-only viewers see the same combined information without editing controls.

## Combined Member And Quota Workspace

### Header And Summary

The existing team detail header remains compact. Its action area contains:

- `管理成员`, when permitted
- `管理查看者`, when permitted
- `设置周配额`, when quota configuration is permitted
- Refresh and existing team actions where applicable

Below the header, a continuous summary band shows:

- Member count
- Team weekly quota
- Weekly usage
- Allocated member quota
- Remaining unallocated quota

Configured OpenAI and Anthropic team subscription sources appear as compact metadata beside the summary or command bar. They are team-level data and are not repeated in every member row.

### Unified Member Table

The desktop table uses one row per member with these columns:

- Member: avatar, username, and email
- Access: member status or management role where provided by the existing API
- Weekly usage: formatted USD amount
- Progress: usage against the member's allocated weekly quota
- Member weekly quota: editable numeric control for users with management permission, read-only formatted value otherwise
- Actions: focused member operations already supported by the workspace

Quota values remain batch-editable. Unsaved changes are visible, invalid values are explained inline, and the save command is disabled when any allocation is negative or total allocation exceeds the team weekly quota. Saving member quotas produces a Toast and refreshes authoritative data without clearing the current search or filter state.

Member and viewer selection continue to use the existing people dialogs. Prompt settings and other existing team controls remain available from the combined workspace and are not removed by the merge.

### Weekly Quota Settings

`设置周配额` opens a right-side settings sheet on desktop and a safe-area-aware bottom sheet or near-full-screen sheet on Android. The sheet contains:

- Enable or disable team quota enforcement
- Team weekly quota in USD
- OpenAI team subscription source
- Anthropic team subscription source
- Quota manager selection
- Current reset schedule metadata
- Destructive `重置本周用量` action with explicit confirmation

Saving validates that an enabled policy has a positive weekly quota and at least one team subscription source. Field validation remains inside the sheet. Successful or failed submission produces a Toast. Closing the sheet with dirty values requires confirmation.

### Responsive Behavior

At wide desktop widths the workspace uses a dense semantic table. Before columns become unreadable, rows switch to a stacked structure that keeps identity, usage, progress, and quota editing together without horizontal page overflow.

On Android, the same data renders as full-width member rows. Identity and weekly usage remain visible; quota and secondary controls expand within the row or open a focused sheet. The `设置周配额` command remains reachable without placing a wide toolbar above the list.

## Global Toast System

### Architecture

Add one client-wide Toast store/API and one `ToastViewport` mounted at the application root so desktop and mobile layouts share the same notification source. Call sites use semantic commands such as `toast.success`, `toast.error`, `toast.warning`, and `toast.info`, with an optional action descriptor.

The store owns identity, ordering, deduplication, timeout, dismissal, and action invocation. Route components do not implement their own timers or fixed-position notification containers.

### Presentation And Behavior

- Desktop placement: fixed to the bottom-right content safe area.
- Android placement: centered above bottom navigation and `env(safe-area-inset-bottom)`.
- Maximum visible stack: three notifications.
- Success and informational timeout: four seconds.
- Warning and error timeout: seven seconds.
- Duplicate notifications with the same semantic type and message merge within a short window instead of stacking.
- Every Toast has a semantic Lucide icon and close control.
- An optional action button supports commands such as `查看团队`, `重试`, or `撤销`.
- Hover or keyboard focus pauses automatic dismissal on desktop.
- New notifications use `aria-live`; errors use an assertive announcement only when immediate attention is required.
- Motion lasts approximately 180 milliseconds, communicates entry and dismissal, and is disabled or reduced under `prefers-reduced-motion`.

The visual treatment follows the current light LinAI product surface: restrained white surface, compact 8px-or-less radius, semantic icon background, readable title and detail, and no decorative gradients or glass effects.

### Migration Boundary

This implementation migrates action-result feedback across all current client routes, including desktop and mobile operations such as create, save, update, delete, archive, copy, redeem, refresh, assignment, lifecycle actions, and update checks.

The following states do not become transient Toasts:

- Field-level validation remains adjacent to its input.
- Initial and refresh load failures that replace or materially affect page data remain inline and retryable.
- Authentication errors that determine page access remain in the authentication surface.
- Destructive confirmation remains an explicit confirmation dialog.
- Persistent permission-loss or service-health notices remain visible until resolved or dismissed.

When an operation has both a dialog-local validation error and a request failure, validation stays local while the request failure uses a Toast and the dialog remains open.

## Error And State Handling

- Team member and quota requests may complete independently; a failure preserves whichever dataset loaded successfully and exposes a targeted retry.
- Saving is idempotent from the UI perspective: buttons disable while pending and repeated clicks cannot enqueue duplicate requests or Toasts.
- A failed quota save does not overwrite the user's draft.
- A successful save refreshes authoritative values before reporting completion when the API contract requires refreshed totals.
- Toast action callbacks are guarded so dismissal or route changes cannot invoke an action twice.
- Session teardown clears queued notifications to avoid leaking one user's operation details into the next session.

## Testing

Write failing tests before implementation for:

- Desktop and Android navigation render `团队管理` and no longer render the visible `用户组` label.
- Team detail exposes only `成员与配额` and `用量分析` tabs.
- The legacy quota route resolves to the combined workspace and can open quota settings.
- The combined table loads member and quota data, renders usage/allocation together, enforces allocation limits, and preserves read-only behavior.
- The weekly quota settings sheet validates, saves, resets usage with confirmation, and preserves a failed draft.
- Toast store ordering, maximum stack, deduplication, timeout, pause, dismissal, action invocation, and session clearing.
- Toast viewport desktop placement, Android safe-area placement, keyboard behavior, live-region semantics, and reduced motion.
- Representative mutation flows across desktop and mobile call the global Toast API while inline load and validation errors remain inline.
- A source-level migration audit rejects legacy transient success-message patterns in migrated client views.

Verification includes focused Vitest suites, complete client Vitest execution, Vue type checking, production build, and rendered checks at desktop low-height/wide layouts plus Android 360, 390, and 412 CSS pixel widths. Visual checks must confirm that Toasts do not cover navigation, dialogs, destructive confirmations, or the last actionable list row.

## Acceptance Criteria

- All visible client navigation and team-workspace terminology uses `团队管理`.
- Members and quota allocation are managed from one combined workspace.
- Team weekly quota configuration is hidden until `设置周配额` is invoked.
- The old standalone quota page is no longer presented, while legacy links remain functional.
- Desktop and Android layouts remain usable without horizontal overflow or occluded controls.
- A single semantic Toast system handles all existing transient action-result feedback across the client.
- Inline validation, load failures, confirmations, and persistent notices retain appropriate non-Toast presentation.
- Automated tests, type checking, production build, and rendered verification pass, with any unrelated pre-existing failure reported using exact evidence.
