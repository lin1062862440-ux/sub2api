# Team Management And Global Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge team membership and quota allocation into one responsive client workspace, rename the visible feature to `团队管理`, and migrate all transient client action feedback to a global semantic Toast system.

**Architecture:** A framework-local reactive Toast store feeds one root `ToastViewport` shared by desktop and Android. Team data remains owned by existing `/user-groups` APIs; the desktop and mobile views compose member identity with quota overview data, while a reusable quota settings sheet owns policy configuration. Legacy quota routes redirect to the combined workspace with an `openQuota=1` query for compatibility.

**Tech Stack:** Vue 3 Composition API, Vue Router, TypeScript, Vitest, Vue Test Utils, Lucide Vue, Tauri 2, scoped CSS and existing LinAI design tokens.

---

### Task 1: Global Toast Store

**Files:**
- Create: `clients/desktop/src/stores/toast.ts`
- Create: `clients/desktop/src/stores/toast.spec.ts`

- [ ] **Step 1: Write failing store tests**

Cover semantic creation, maximum visible stack, duplicate merging, four/seven-second timeout policy, pause/resume, action invocation once, explicit dismissal, and `clearToasts()`.

```ts
toast.success('团队配额已保存', { detail: '新额度将在下一次请求时生效。' })
toast.error('成员配额保存失败', { detail: '分配额度不能超过团队周配额。' })
expect(toastState.items.map((item) => item.type)).toEqual(['error', 'success'])
expect(toastState.items).toHaveLength(2)
```

Use `vi.useFakeTimers()` to prove success/info close at 4,000 ms and warning/error close at 7,000 ms. Repeating the same type/title/detail within 1,000 ms must update the existing item timestamp/count instead of appending another item.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run src/stores/toast.spec.ts`

Expected: FAIL because `@/stores/toast` does not exist.

- [ ] **Step 3: Implement the Toast API**

Define these public contracts:

```ts
export type ToastType = 'success' | 'error' | 'warning' | 'info'
export interface ToastAction { label: string; run: () => void | Promise<void> }
export interface ToastOptions { detail?: string; action?: ToastAction; duration?: number }
export interface ToastItem extends ToastOptions {
  id: number
  type: ToastType
  title: string
  count: number
  paused: boolean
}

export const toast = {
  success(title: string, options?: ToastOptions): number,
  error(title: string, options?: ToastOptions): number,
  warning(title: string, options?: ToastOptions): number,
  info(title: string, options?: ToastOptions): number,
}
export function dismissToast(id: number): void
export function pauseToast(id: number): void
export function resumeToast(id: number): void
export function invokeToastAction(id: number): Promise<void>
export function clearToasts(): void
export const toastState: Readonly<{ items: readonly ToastItem[] }>
```

Keep timer handles outside the reactive public item shape. Prepend new items, cap the stack at three, clear timers whenever an item leaves, and guard action execution by dismissing before awaiting the callback.

- [ ] **Step 4: Run the store test and verify GREEN**

Run: `pnpm vitest run src/stores/toast.spec.ts`

Expected: PASS.

### Task 2: Toast Viewport And Root Integration

**Files:**
- Create: `clients/desktop/src/components/ToastViewport.vue`
- Create: `clients/desktop/src/components/ToastViewport.spec.ts`
- Modify: `clients/desktop/src/App.vue`
- Modify: `clients/desktop/src/App.spec.ts`
- Modify: `clients/desktop/src/stores/session.ts`
- Test: `clients/desktop/src/stores/session.spec.ts`

- [ ] **Step 1: Write failing component and integration tests**

Mount the viewport after calling `toast.success()` and assert a close button, semantic icon, title, detail, optional action, `role="status"`, and `aria-live="polite"`. Assert error notices use `role="alert"`. Assert the root app always contains one viewport and session teardown calls `clearToasts()`.

```ts
toast.success('团队已创建', { detail: '现在可以添加成员。' })
const wrapper = mount(ToastViewport)
expect(wrapper.get('[data-testid="toast-viewport"]').text()).toContain('团队已创建')
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/components/ToastViewport.spec.ts src/App.spec.ts src/stores/session.spec.ts`

Expected: FAIL because the viewport and session clearing do not exist.

- [ ] **Step 3: Implement accessible responsive presentation**

Use `CircleCheck`, `CircleAlert`, `TriangleAlert`, `Info`, and `X` from `@lucide/vue`. Render a fixed three-item stack with stable widths, 8px radius, compact semantic icon surfaces, close/action buttons, and no nested cards. Mouse enter/focus pauses a Toast; mouse leave/focusout resumes it.

Desktop placement uses `right: 20px; bottom: 20px`. Under `html[data-mobile='true']`, use left/right safe-area padding and:

```css
bottom: calc(72px + env(safe-area-inset-bottom));
width: min(360px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));
```

Add 180 ms `TransitionGroup` entry/exit transforms and a reduced-motion override. Mount `<ToastViewport />` after `<RouterView />` in `App.vue`. Call `clearToasts()` whenever the authenticated user ID becomes null or changes.

- [ ] **Step 4: Run tests and build**

Run: `pnpm vitest run src/components/ToastViewport.spec.ts src/App.spec.ts src/stores/session.spec.ts`

Run: `pnpm build`

Expected: PASS and production build exit 0.

### Task 3: Rename Visible Team Terminology And Preserve Routes

**Files:**
- Modify: `clients/desktop/src/layouts/DesktopAppLayout.vue`
- Modify: `clients/desktop/src/layouts/AppLayout.spec.ts`
- Modify: `clients/desktop/src/mobile/navigation.ts`
- Modify: `clients/desktop/src/mobile/navigation.spec.ts`
- Modify: `clients/desktop/src/mobile/MobileAppLayout.vue`
- Modify: `clients/desktop/src/router/index.ts`
- Modify: `clients/desktop/src/router/admin-guard.spec.ts`
- Modify: `clients/desktop/src/views/UserGroupsView.vue`
- Modify: `clients/desktop/src/views/UserGroupsView.spec.ts`
- Modify: `clients/desktop/src/components/user-groups/UserGroupEditorDialog.vue`
- Modify: `clients/desktop/src/components/user-groups/UserGroupEditorDialog.spec.ts`
- Modify: `clients/desktop/src/components/user-groups/UserGroupDetailHeader.vue`
- Modify: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.vue`
- Modify: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.spec.ts`

- [ ] **Step 1: Write failing terminology and redirect tests**

Assert desktop personal/admin navigation and Android `More` navigation show `团队管理`. Assert directory/editor copy contains `团队` and no visible `用户组`. Assert route metadata uses `团队管理`. Assert `user-group-quota` redirects to `user-group-members` with `openQuota: '1'`, and `/user-group-subscriptions?group_id=7` resolves through the same compatibility path.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/layouts/AppLayout.spec.ts src/mobile/navigation.spec.ts src/mobile/views/admin/MobileUserGroupsView.spec.ts src/views/UserGroupsView.spec.ts src/components/user-groups/UserGroupEditorDialog.spec.ts src/router/admin-guard.spec.ts`

Expected: FAIL on old labels and quota component routing.

- [ ] **Step 3: Implement visible-copy and route changes**

Replace user-facing `用户组` with `团队管理` or grammatically appropriate `团队` copy. Do not rename API paths, route names, filenames, data-test IDs, or TypeScript interfaces. Change the quota route record to a redirect:

```ts
redirect: (to) => ({
  name: 'user-group-members',
  params: { id: String(to.params.id) },
  query: { ...to.query, openQuota: '1' },
})
```

Change `UserGroupDetailHeader` tabs to exactly `成员与配额` and `用量分析`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same command from Step 2.

Expected: PASS.

### Task 4: Reusable Weekly Quota Settings Sheet

**Files:**
- Create: `clients/desktop/src/components/user-groups/TeamQuotaSettingsSheet.vue`
- Create: `clients/desktop/src/components/user-groups/TeamQuotaSettingsSheet.spec.ts`
- Modify: `clients/desktop/src/components/user-groups/user-groups.css`

- [ ] **Step 1: Write failing sheet tests**

Cover closed state, desktop sheet structure, mobile safe-area class, initial draft hydration, policy validation, team-source selection, quota-manager handoff, dirty-close confirmation, successful save, failed save preserving draft, and confirmed reset.

```ts
await wrapper.get('[data-testid="save-team-policy"]').trigger('click')
expect(mocks.save).toHaveBeenCalledWith({
  enabled: true,
  weeklyLimit: 100,
  teamSubscriptionIds: [11, 12],
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run src/components/user-groups/TeamQuotaSettingsSheet.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the sheet**

Accept `modelValue`, `overview`, `mobile`, `saving`, `resetting`, and `error` props. Emit `update:modelValue`, `save`, `manage`, and `reset`. Keep request orchestration in the parent. Render the enable toggle, numeric weekly quota, OpenAI/Anthropic selects, manager summary/action, reset metadata, inline validation, and confirmed reset button. Teleport the fixed backdrop to `body`; use a right sheet on desktop and bottom/near-full-screen sheet on mobile.

- [ ] **Step 4: Run the sheet tests and verify GREEN**

Run: `pnpm vitest run src/components/user-groups/TeamQuotaSettingsSheet.spec.ts`

Expected: PASS.

### Task 5: Desktop Combined Member And Quota Workspace

**Files:**
- Modify: `clients/desktop/src/views/UserGroupMembersView.vue`
- Modify: `clients/desktop/src/views/UserGroupMembersView.spec.ts`
- Delete after route migration: `clients/desktop/src/views/UserGroupQuotasView.vue`
- Delete after behavior migration: `clients/desktop/src/views/UserGroupQuotasView.spec.ts`
- Modify: `clients/desktop/src/views/UserGroupsView.vue`

- [ ] **Step 1: Extend member-view tests to reproduce the combined workspace**

Mock `getUserGroupQuotaOverview`, `replaceUserGroupTeamSubscriptions`, `setUserGroupQuotaPolicy`, `updateUserGroupMemberQuotas`, `replaceUserGroupQuotaManagers`, and `resetUserGroupQuotaUsage`. Assert one row contains identity, weekly usage, progress, and quota input. Assert summary totals and team sources. Assert `openQuota=1` opens the settings sheet. Assert read-only users cannot edit or save.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run src/views/UserGroupMembersView.spec.ts`

Expected: FAIL because quota data and controls are still isolated in `UserGroupQuotasView`.

- [ ] **Step 3: Merge quota orchestration into the member view**

Load group, members/viewers, and quota overview without discarding successful datasets when one request fails. Build quota drafts keyed by `user_id`. Render the continuous summary band, team-source metadata, search/filters, and one unified member table. Keep member/viewer and Prompt controls intact.

Use the existing validation invariant:

```ts
const allocationsValid = computed(() =>
  Object.values(memberLimits.value).every(isNonNegativeFinite) &&
  allocated.value <= weeklyLimit.value + 0.000001
)
```

Open `TeamQuotaSettingsSheet` from `设置周配额`. Parent handlers call existing API functions, retain failed drafts, refresh after success, and issue semantic Toasts. Remove the directory's separate `配额` link. After tests pass, remove the now-unreachable standalone quota view and its test.

- [ ] **Step 4: Run desktop team tests and verify GREEN**

Run: `pnpm vitest run src/views/UserGroupMembersView.spec.ts src/views/UserGroupsView.spec.ts src/components/user-groups/TeamQuotaSettingsSheet.spec.ts src/router/admin-guard.spec.ts`

Expected: PASS.

### Task 6: Android Combined Team Workspace

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileTeamWorkspaceView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileTeamWorkspaceView.spec.ts`
- Modify: `clients/desktop/src/router/index.ts`
- Modify: `clients/desktop/src/mobile/navigation.ts`
- Modify: `clients/desktop/src/mobile/navigation.spec.ts`
- Modify: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.vue`
- Modify: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.spec.ts`

- [ ] **Step 1: Write failing mobile navigation and workspace tests**

Assert a team card opens `user-group-members`, the route selects `MobileTeamWorkspaceView` on mobile, detail route names are allowed as contextual children, member rows show weekly usage/allocation without horizontal overflow classes, and `设置周配额` opens the same reusable sheet in mobile mode.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/mobile/navigation.spec.ts src/mobile/views/admin/MobileUserGroupsView.spec.ts src/mobile/views/admin/MobileTeamWorkspaceView.spec.ts`

Expected: FAIL because mobile currently has no quota-aware team detail route.

- [ ] **Step 3: Implement the mobile detail presentation**

Use `routeView(UserGroupMembersView, MobileTeamWorkspaceView)` for the canonical member route. Keep detail routes contextual rather than adding bottom-navigation items. Render full-width member rows with visible identity and weekly usage; expand quota editing within the row. Reuse `TeamQuotaSettingsSheet` with `mobile=true`, existing people dialogs/sheets, and global Toasts. Add `成员与配额` to each team card's actions.

- [ ] **Step 4: Run mobile tests and verify GREEN**

Run the same command from Step 2.

Expected: PASS.

### Task 7: Migrate Desktop Action Feedback To Global Toasts

**Files:**
- Modify mutation feedback in `clients/desktop/src/views/ApiKeysView.vue`
- Modify: `clients/desktop/src/views/RedeemView.vue`
- Modify: `clients/desktop/src/views/ProfileView.vue`
- Modify: `clients/desktop/src/views/UserGroupsView.vue`
- Modify: `clients/desktop/src/views/UserGroupMembersView.vue`
- Modify: `clients/desktop/src/views/admin/AdminAnnouncementsView.vue`
- Modify: `clients/desktop/src/views/admin/AdminAuditLogsView.vue`
- Modify: `clients/desktop/src/views/admin/AdminChannelMonitorsView.vue`
- Modify: `clients/desktop/src/views/admin/AdminGroupsView.vue`
- Modify: `clients/desktop/src/views/admin/AdminRedeemCodesView.vue`
- Modify: `clients/desktop/src/views/admin/AdminSubscriptionsView.vue`
- Modify: `clients/desktop/src/views/admin/AdminUsersView.vue`
- Modify action feedback in `clients/desktop/src/components/admin/*.vue`
- Modify action feedback in `clients/desktop/src/components/ChangePasswordDialog.vue`
- Modify action feedback in `clients/desktop/src/components/SettingsDialog.vue`
- Add/update colocated view/component specs

- [ ] **Step 1: Add failing representative mutation tests**

Mock `@/stores/toast` and assert success/failure semantic calls for create, save, delete/archive, copy, update check, lifecycle action, and retryable request failure. Keep editor validation errors and route-load errors asserted inline.

```ts
expect(mocks.toastSuccess).toHaveBeenCalledWith('团队已创建')
expect(mocks.toastError).toHaveBeenCalledWith('团队归档失败', expect.any(Object))
```

- [ ] **Step 2: Run affected tests and verify RED**

Run the focused specs for every modified view/component using `pnpm vitest run <spec paths>`.

Expected: FAIL because action results still render local `message` blocks.

- [ ] **Step 3: Replace transient local messages**

Import `toast` and replace only user-triggered action-result assignments. Remove dead `message` refs and `.message`/`.ug-message` markup when no longer used. Preserve `loadError`, `editorError`, field errors, confirmation dialogs, and persistent notices. Use stable concise titles and optional detail text from caught errors.

- [ ] **Step 4: Run all desktop view/component tests**

Run: `pnpm vitest run src/views src/components`

Expected: PASS except any explicitly documented unrelated pre-existing test.

### Task 8: Migrate Android Action Feedback And Add Source Audit

**Files:**
- Modify action feedback in `clients/desktop/src/mobile/views/*.vue`
- Modify action feedback in `clients/desktop/src/mobile/views/admin/*.vue`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.vue`
- Modify: `clients/desktop/src/layouts/DesktopAppLayout.vue`
- Create: `clients/desktop/src/toast-migration.spec.ts`
- Update affected mobile and settings specs

- [ ] **Step 1: Write failing mobile mutation tests and migration audit**

Test representative mobile create/save/archive/update/lifecycle flows against the Toast API. In `toast-migration.spec.ts`, load Vue source files with `import.meta.glob(..., { query: '?raw' })` and reject known transient containers/identifiers such as `action-message`, mutation-only `successMessage`, and `message.value = '...已...'`. Maintain a short explicit allowlist only for persistent or inline states identified in the design.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/mobile src/features/usage-display/internal/settings src/toast-migration.spec.ts`

Expected: FAIL with the remaining legacy action-feedback files listed.

- [ ] **Step 3: Complete migration and remove dead styles**

Replace transient operation results with the global Toast API across all remaining client sources. Keep inline load, validation, authentication, confirmation, and persistent permission/service notices. Re-run the audit after each batch until it reports no unapproved legacy action-result surface.

- [ ] **Step 4: Run client tests and build**

Run: `pnpm test:run`

Run: `pnpm build`

Expected: all client tests and production build pass; if the known local `Cargo.toml` boundary expectation remains the only failure, report it separately and run all non-boundary tests to prove the feature set.

### Task 9: Rendered Verification And Completion Audit

**Files:**
- Update visual harness data only if required: `clients/desktop/src/test/visual/api.ts`
- Update visual harness data only if required: `clients/desktop/src/test/visual/user-groups.ts`

- [ ] **Step 1: Start or reuse the Tauri development client**

Confirm the running process and Vite HMR session. Do not replace it with a browser-only server for final native verification.

- [ ] **Step 2: Verify desktop team workflows**

At approximately 1440x900, 1024x700, and the previously reported low-height window, verify the `团队管理` label, unified member/quota rows, quota settings sheet, legacy route redirect, member quota save, Toast stacking, and no overlap with the account area.

- [ ] **Step 3: Verify Android-responsive rendering**

Using the existing visual harness at 360, 390, and 412 CSS pixels, verify the team directory/detail flow, safe-area sheet, member row expansion, Toast placement above bottom navigation, long Chinese labels, and no document-level horizontal overflow.

- [ ] **Step 4: Run completion audit**

Search client sources for remaining visible `用户组`, standalone quota links/components, and legacy transient action message containers. Confirm each remaining match is an internal identifier, API contract, test fixture, or intentionally persistent/inline state.

Run: `git diff --check`

Run: `pnpm test:run`

Run: `pnpm build`

Expected: acceptance criteria in the design spec are evidenced by source, tests, build, and rendered output. Do not commit or push unrelated backend or Cargo changes.
