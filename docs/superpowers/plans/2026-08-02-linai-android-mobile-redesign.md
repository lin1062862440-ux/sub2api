# LinAI Android Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compressed desktop Android UI with a small phone-specific LinAI application, fix all mobile navigation transitions, and package the current LinAI Android launcher icon without changing desktop behavior.

**Architecture:** Keep one Tauri/Vue application and one route-name/API contract. Select a dedicated mobile layout and nine mobile route components when `appCapabilities.mobile` is true, while leaving the desktop layout and desktop views intact. Share API modules, session state, authorization, types, and small domain helpers; keep all new presentation and CSS below `src/mobile/`.

**Tech Stack:** Tauri 2, Vue 3 Composition API, Vue Router 4, TypeScript, Vitest 4, Happy DOM, Lucide Vue, Vite visual-preview mocks, Android Gradle project, Android SDK `apksigner` and `zipalign`.

---

## File Map

Create these focused units:

- `clients/desktop/src/mobile/navigation.ts`: mobile workspace destinations, five-slot overflow model, titles, and allowlist.
- `clients/desktop/src/mobile/navigation.spec.ts`: pure navigation and allowlist tests.
- `clients/desktop/src/layouts/MobileAppLayout.vue`: safe-area app bar, avatar popover, workspace switch, bottom navigation, More sheet, and back-layer behavior.
- `clients/desktop/src/layouts/MobileAppLayout.spec.ts`: rendered shell behavior and real RouterLink click coverage.
- `clients/desktop/src/layouts/DesktopAppLayout.vue`: the current desktop shell moved without mobile drawer code.
- `clients/desktop/src/mobile/components/MobilePage.vue`: consistent content width, refresh action, page state, and bottom-navigation clearance.
- `clients/desktop/src/mobile/components/MobileBottomSheet.vue`: reusable filter/action sheet with close/back semantics.
- `clients/desktop/src/mobile/components/MobilePagination.vue`: previous/next pager with a stable page label.
- `clients/desktop/src/mobile/components/mobile-components.spec.ts`: shared mobile primitive tests.
- `clients/desktop/src/mobile/views/MobileDashboardView.vue`: personal home.
- `clients/desktop/src/mobile/views/MobileUsageView.vue`: personal usage records.
- `clients/desktop/src/mobile/views/MobileSubscriptionsView.vue`: personal subscriptions.
- `clients/desktop/src/mobile/views/admin/MobileAdminDashboardView.vue`: administrator overview.
- `clients/desktop/src/mobile/views/admin/MobileAdminAccountsView.vue`: account cards and mobile actions.
- `clients/desktop/src/mobile/views/admin/MobileAdminGroupsView.vue`: group cards and mutations.
- `clients/desktop/src/mobile/views/admin/MobileAdminUsersView.vue`: user cards and existing editor/detail actions.
- `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.vue`: user-group cards and member/viewer actions.
- `clients/desktop/src/mobile/views/admin/MobileAdminSubscriptionsView.vue`: subscription cards and lifecycle actions.
- `clients/desktop/src/mobile/views/**/*.spec.ts`: focused mobile page tests, one file per page.
- `clients/desktop/src/mobile/mobile.css`: mobile tokens and shared phone-only presentation.
- `clients/desktop/scripts/sync-android-icons.mjs`: deterministic launcher resource synchronization.
- `clients/desktop/scripts/sync-android-icons.spec.ts`: temporary-directory synchronization tests.

Modify only these shared boundaries:

- `clients/desktop/src/layouts/AppLayout.vue`: choose mobile or desktop layout.
- `clients/desktop/src/router/index.ts`: mobile allowlist enforcement first, then platform-specific lazy route components after all mobile views exist.
- `clients/desktop/src/router/admin-guard.spec.ts`: excluded mobile route and workspace fallback coverage.
- `clients/desktop/src/main.ts`: import the new mobile stylesheet path.
- `clients/desktop/src/test/visual/session.ts`: query-controlled user role/workspace preview state.
- `clients/desktop/src/test/visual/admin-api.ts`: retain fixtures for the six retained administrator routes.
- `clients/desktop/vite.config.ts`: keep visual aliases aligned with the mobile modules.
- `clients/desktop/package.json`: run Android icon sync before Android builds.
- `clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml`: declare the round launcher icon.

Do not rewrite any desktop page SFC for mobile layout. If a domain helper must be shared, extract it in the same task with its own focused test and keep the existing desktop output unchanged.

### Task 1: Define Mobile Navigation And Route Access

**Files:**
- Create: `clients/desktop/src/mobile/navigation.ts`
- Create: `clients/desktop/src/mobile/navigation.spec.ts`
- Modify: `clients/desktop/src/router/index.ts`
- Modify: `clients/desktop/src/router/admin-guard.spec.ts`

- [ ] **Step 1: Write failing navigation-model tests**

Cover exact personal destinations, exact administrator direct/overflow destinations, overflow active state, ordinary-user denial, and excluded Android routes:

```ts
expect(mobileNavigation('personal').direct.map(item => item.routeName))
  .toEqual(['dashboard', 'usage', 'subscriptions'])
expect(mobileNavigation('admin').direct.map(item => item.routeName))
  .toEqual(['admin-dashboard', 'admin-accounts', 'admin-groups', 'admin-users'])
expect(mobileNavigation('admin').overflow.map(item => item.routeName))
  .toEqual(['user-groups', 'admin-subscriptions'])
expect(isMobileRouteAllowed('channels', 'personal')).toBe(false)
expect(isMobileRouteAllowed('admin-usage', 'admin')).toBe(false)
expect(isMobileOverflowActive('user-groups', 'admin')).toBe(true)
```

- [ ] **Step 2: Run the tests and verify the missing module fails**

Run: `pnpm exec vitest run src/mobile/navigation.spec.ts src/router/admin-guard.spec.ts`

Expected: FAIL because `@/mobile/navigation` and the Android allowlist behavior do not exist.

- [ ] **Step 3: Implement the typed navigation model**

Define `MobileWorkspace = 'personal' | 'admin'`, `MobileRouteName`, `MobileNavigationItem`, `mobileNavigation(workspace)`, `isMobileRouteAllowed(routeName, workspace)`, `isMobileOverflowActive(routeName, workspace)`, and `mobileRouteTitle(routeName)`. Use Lucide component references only in the layout; the pure model stores an icon key so the unit remains testable without mounting Vue.

```ts
const personal = ['dashboard', 'usage', 'subscriptions'] as const
const adminDirect = ['admin-dashboard', 'admin-accounts', 'admin-groups', 'admin-users'] as const
const adminOverflow = ['user-groups', 'admin-subscriptions'] as const
const sharedAccountRoutes = ['profile'] as const

export function isMobileRouteAllowed(name: unknown, workspace: MobileWorkspace): boolean {
  if (typeof name !== 'string') return false
  return [...personal, ...sharedAccountRoutes].includes(name as never)
    || (workspace === 'admin' && [...adminDirect, ...adminOverflow].includes(name as never))
}
```

Update `resolveRouteAccess` to accept the current workspace and redirect disallowed Android destinations to `dashboard` or `admin-dashboard`. Keep the existing desktop route components in this task; importing mobile SFCs before those files exist would make Vite fail during module transformation.

After Task 11 has created all nine views, the router will apply platform-specific lazy components with an evaluated platform branch:

```ts
const routeView = (desktop: RouteComponent, mobile: RouteComponent) =>
  appCapabilities.mobile ? mobile : desktop

component: routeView(
  () => import('@/views/DashboardView.vue'),
  () => import('@/mobile/views/MobileDashboardView.vue'),
)
```

- [ ] **Step 4: Run focused access tests**

Run: `pnpm exec vitest run src/mobile/navigation.spec.ts src/router/admin-guard.spec.ts`

Expected: navigation-model and access assertions PASS with no missing-module transform errors.

- [ ] **Step 5: Commit the route policy**

```bash
git add clients/desktop/src/mobile/navigation.ts clients/desktop/src/mobile/navigation.spec.ts clients/desktop/src/router/index.ts clients/desktop/src/router/admin-guard.spec.ts
git commit -m "feat(android): constrain mobile navigation"
```

### Task 2: Split Desktop And Mobile Application Shells

**Files:**
- Create: `clients/desktop/src/layouts/DesktopAppLayout.vue`
- Create: `clients/desktop/src/layouts/MobileAppLayout.vue`
- Create: `clients/desktop/src/layouts/MobileAppLayout.spec.ts`
- Modify: `clients/desktop/src/layouts/AppLayout.vue`
- Modify: `clients/desktop/src/layouts/AppLayout.spec.ts`
- Modify: `clients/desktop/src/mobile-layout.spec.ts`

- [ ] **Step 1: Add failing shell tests**

Mount with a memory router rather than stubbing `RouterLink`. Assert that the top bar has no hamburger, personal mode has three working links, admin mode has four links plus More, overflow routes are in the sheet, and clicking Usage changes `router.currentRoute.value.name` to `usage` without a later rollback.

```ts
await wrapper.get('[data-testid="mobile-nav-usage"]').trigger('click')
await router.isReady()
expect(router.currentRoute.value.name).toBe('usage')
expect(window.history.state?.linaiDrawer).not.toBe(true)
```

Also snapshot the desktop wrapper contract: no mobile app bar, no bottom navigation, and the existing rail remains available when `mobile` is false.

- [ ] **Step 2: Verify the tests fail against the drawer shell**

Run: `pnpm exec vitest run src/layouts/MobileAppLayout.spec.ts src/layouts/AppLayout.spec.ts src/mobile-layout.spec.ts`

Expected: FAIL because the current shell exposes a hamburger/drawer and no bottom navigation.

- [ ] **Step 3: Preserve the desktop shell and add the selector wrapper**

Move the current desktop-only script, template, and scoped styles into `DesktopAppLayout.vue`. Remove all `mobile`, drawer, synthetic history, mobile app bar, and drawer-specific branches from that file. Replace `AppLayout.vue` with a stable platform selector:

```vue
<script setup lang="ts">
import DesktopAppLayout from '@/layouts/DesktopAppLayout.vue'
import MobileAppLayout from '@/layouts/MobileAppLayout.vue'
import { appCapabilities } from '@/lib/platform-capabilities'
</script>

<template>
  <MobileAppLayout v-if="appCapabilities.mobile" />
  <DesktopAppLayout v-else />
</template>
```

- [ ] **Step 4: Implement `MobileAppLayout`**

Use `mobileNavigation`, `readWorkspaceMode`, `saveWorkspaceMode`, `workspaceDestination`, `UserAvatar`, `ChangePasswordDialog`, and `signOut`. Render a fixed top bar, fixed bottom navigation, anchored account popover, and More bottom sheet. Resolve icons through a local `Record<MobileIconKey, Component>` using `House`, `ChartNoAxesCombined`, `Layers3`, `Gauge`, `Globe2`, `Boxes`, `UsersRound`, `Ellipsis`, `FolderKanban`, and `CreditCard`.

Layer closing is state-only:

```ts
function closeLayers() {
  accountMenuOpen.value = false
  moreOpen.value = false
}

async function switchWorkspace() {
  const next = workspaceMode.value === 'admin' ? 'personal' : 'admin'
  saveWorkspaceMode(next, user.value)
  workspaceMode.value = next
  closeLayers()
  await router.replace({ name: workspaceDestination(next) })
}
```

Do not call `pushState`, `history.back`, or `location.reload`. On `popstate`, close an open layer without adding or consuming a history entry.

- [ ] **Step 5: Run shell and desktop regression tests**

Run: `pnpm exec vitest run src/layouts/MobileAppLayout.spec.ts src/layouts/AppLayout.spec.ts src/mobile-layout.spec.ts`

Expected: PASS, including a real route change for every visible navigation item.

- [ ] **Step 6: Commit the shell split**

```bash
git add clients/desktop/src/layouts/AppLayout.vue clients/desktop/src/layouts/DesktopAppLayout.vue clients/desktop/src/layouts/MobileAppLayout.vue clients/desktop/src/layouts/AppLayout.spec.ts clients/desktop/src/layouts/MobileAppLayout.spec.ts clients/desktop/src/mobile-layout.spec.ts
git commit -m "feat(android): add mobile app shell"
```

### Task 3: Add Shared Mobile Presentation Primitives

**Files:**
- Create: `clients/desktop/src/mobile/components/MobilePage.vue`
- Create: `clients/desktop/src/mobile/components/MobileBottomSheet.vue`
- Create: `clients/desktop/src/mobile/components/MobilePagination.vue`
- Create: `clients/desktop/src/mobile/components/mobile-components.spec.ts`
- Create: `clients/desktop/src/mobile/mobile.css`
- Modify: `clients/desktop/src/main.ts`
- Delete: `clients/desktop/src/mobile.css`

- [ ] **Step 1: Write failing primitive tests**

Assert `MobilePage` exposes loading/error/empty/content slots without resizing its action area, `MobileBottomSheet` emits `close` on scrim/Escape and traps its accessible dialog label, and `MobilePagination` disables previous/next at boundaries and emits exact page numbers.

- [ ] **Step 2: Verify missing primitives fail**

Run: `pnpm exec vitest run src/mobile/components/mobile-components.spec.ts`

Expected: FAIL because the three components do not exist.

- [ ] **Step 3: Implement the primitives and phone-only CSS**

`MobilePage` owns page padding and a stable state region; `MobileBottomSheet` uses `Teleport`, `role="dialog"`, and `aria-modal="true"`; `MobilePagination` exposes `page`, `pageCount`, and `change`.

Define mobile tokens under the platform root only:

```css
html[data-mobile='true'] {
  --mobile-app-bar: 56px;
  --mobile-bottom-nav: 64px;
  --mobile-gutter: 16px;
}

html[data-mobile='true'] .mobile-page-scroll {
  min-height: 100dvh;
  padding: calc(var(--mobile-app-bar) + env(safe-area-inset-top) + 14px)
    var(--mobile-gutter)
    calc(var(--mobile-bottom-nav) + env(safe-area-inset-bottom) + 20px);
}
```

Keep cards at 8px or less radius, 44px touch targets, 16px form inputs, no page-level horizontal overflow, reduced-motion support, and no rules that match desktop when `data-mobile` is false.

- [ ] **Step 4: Run primitive and mobile contract tests**

Run: `pnpm exec vitest run src/mobile/components/mobile-components.spec.ts src/mobile-layout.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit shared mobile presentation**

```bash
git add clients/desktop/src/mobile/components clients/desktop/src/mobile/mobile.css clients/desktop/src/main.ts clients/desktop/src/mobile.css clients/desktop/src/mobile-layout.spec.ts
git commit -m "feat(android): add mobile presentation primitives"
```

### Task 4: Build The Personal Mobile Home

**Files:**
- Create: `clients/desktop/src/mobile/views/MobileDashboardView.vue`
- Create: `clients/desktop/src/mobile/views/MobileDashboardView.spec.ts`
- Optional shared extraction when tests prove it is needed: `clients/desktop/src/lib/dashboard-summary.ts`
- Test shared extraction: `clients/desktop/src/lib/dashboard-summary.spec.ts`

- [ ] **Step 1: Write failing home tests**

Mock `getDashboardStats`, `getDashboardTrend`, and `getSubscriptionSummary`. Assert one request/cost/token summary, balance/quota state, one trend, current subscriptions, refresh, partial-failure notice, and empty subscription state. Assert desktop-only model/platform ranking copy is absent.

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run src/mobile/views/MobileDashboardView.spec.ts`

Expected: FAIL because the mobile home does not exist.

- [ ] **Step 3: Implement the compact home**

Load the three endpoints concurrently with `Promise.allSettled`, retain successful sections on partial failure, and render the selected mobile hierarchy:

```vue
<MobilePage title="首页" :loading="loading" :error="fatalError" @refresh="load(true)">
  <section class="mobile-balance-band">...</section>
  <section class="mobile-metric-grid" aria-label="用量概览">...</section>
  <section class="mobile-trend-panel"><TrendChart :points="trend" /></section>
  <section class="mobile-subscription-summary">...</section>
</MobilePage>
```

Reuse existing formatters/components where their contracts already fit; do not import the desktop view.

- [ ] **Step 4: Run focused home and desktop dashboard tests**

Run: `pnpm exec vitest run src/mobile/views/MobileDashboardView.spec.ts src/views/DashboardView.spec.ts`

Expected: PASS with no desktop snapshot or text change.

- [ ] **Step 5: Commit personal home**

```bash
git add clients/desktop/src/mobile/views/MobileDashboardView.vue clients/desktop/src/mobile/views/MobileDashboardView.spec.ts clients/desktop/src/lib/dashboard-summary.ts clients/desktop/src/lib/dashboard-summary.spec.ts
git commit -m "feat(android): add mobile personal home"
```

Omit optional paths from `git add` when no extraction was needed.

### Task 5: Build Mobile Usage Records

**Files:**
- Create: `clients/desktop/src/mobile/views/MobileUsageView.vue`
- Create: `clients/desktop/src/mobile/views/MobileUsageView.spec.ts`

- [ ] **Step 1: Write failing usage tests**

Mock `getUsageStats`, `getUsageRecords`, `getUsageErrors`, and the existing date-range helper. Assert date preset controls, total requests/tokens/cost, record cards, error tab when enabled, filter sheet, reset, refresh, empty/error states, and previous/next pagination. Assert API-key management actions are absent.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run src/mobile/views/MobileUsageView.spec.ts`

Expected: FAIL because the mobile usage view does not exist.

- [ ] **Step 3: Implement phone-first record cards**

Use page size 20 and call the existing usage endpoints. The default surface contains only date range, model, request type, and record/error tabs. Put group and billing filters in `MobileBottomSheet`. Each record card must expose time, model, request type, tokens, cost, duration, and status without a horizontal table.

```ts
async function loadRecords() {
  const response = await api.getUsageRecords({ ...filters.value, page: page.value, page_size: 20 })
  records.value = response.items
  total.value = response.total
}
```

- [ ] **Step 4: Run mobile usage and desktop usage tests**

Run: `pnpm exec vitest run src/mobile/views/MobileUsageView.spec.ts src/views/UsageView.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit usage records**

```bash
git add clients/desktop/src/mobile/views/MobileUsageView.vue clients/desktop/src/mobile/views/MobileUsageView.spec.ts
git commit -m "feat(android): add mobile usage records"
```

### Task 6: Build Mobile Personal Subscriptions

**Files:**
- Create: `clients/desktop/src/mobile/views/MobileSubscriptionsView.vue`
- Create: `clients/desktop/src/mobile/views/MobileSubscriptionsView.spec.ts`
- Create: `clients/desktop/src/lib/subscription-display.ts`
- Create: `clients/desktop/src/lib/subscription-display.spec.ts`
- Modify: `clients/desktop/src/views/SubscriptionsView.vue`

- [ ] **Step 1: Extract and test subscription display rules**

Write tests for finite limits, exhaustion, percentage clamping, status labels, expiry formatting, and daily/weekly/monthly reset labels. Verify the test fails before moving the pure helpers out of the desktop SFC.

Run: `pnpm exec vitest run src/lib/subscription-display.spec.ts`

Expected: FAIL because `subscription-display.ts` does not exist.

- [ ] **Step 2: Implement the shared pure helper and preserve desktop behavior**

Export `isSubscriptionExhausted`, `subscriptionProgress`, `subscriptionQuotaWindows`, `subscriptionStatusLabel`, and `formatSubscriptionDate`. Update the desktop view to import them without changing its rendered copy or classes.

- [ ] **Step 3: Write failing mobile subscription tests**

Assert active/exhausted totals, ordered subscription cards, all finite quota windows, no-limit state, expiry, refresh, loading, error, and empty states. The mobile empty state must not link to the excluded Redeem route.

- [ ] **Step 4: Implement `MobileSubscriptionsView`**

Use `getSubscriptions()` and the shared helper. Render one unframed summary band followed by individual subscription cards with stable progress tracks and no desktop two-column composition.

- [ ] **Step 5: Run mobile, helper, and desktop subscription tests**

Run: `pnpm exec vitest run src/lib/subscription-display.spec.ts src/mobile/views/MobileSubscriptionsView.spec.ts src/views/SubscriptionsView.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit personal subscriptions**

```bash
git add clients/desktop/src/lib/subscription-display.ts clients/desktop/src/lib/subscription-display.spec.ts clients/desktop/src/mobile/views/MobileSubscriptionsView.vue clients/desktop/src/mobile/views/MobileSubscriptionsView.spec.ts clients/desktop/src/views/SubscriptionsView.vue
git commit -m "feat(android): add mobile subscriptions"
```

### Task 7: Build Mobile Administrator Overview

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminDashboardView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminDashboardView.spec.ts`

- [ ] **Step 1: Write failing overview tests**

Mock `getAdminDashboardSnapshot` and `getAdminDashboardRealtime`. Assert total users, account health, active requests, today cost, one trend, top three attention items, 7/30-day selection, refresh, partial failure, and full error.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminDashboardView.spec.ts`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement the overview**

Use the existing snapshot and realtime APIs. Render a two-column metric grid, one health row, one trend, and shortened attention content. Omit the desktop eyebrow, dense rankings, and multi-panel grid.

- [ ] **Step 4: Run mobile and desktop overview tests**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminDashboardView.spec.ts src/views/admin/AdminDashboardView.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the administrator overview**

```bash
git add clients/desktop/src/mobile/views/admin/MobileAdminDashboardView.vue clients/desktop/src/mobile/views/admin/MobileAdminDashboardView.spec.ts
git commit -m "feat(android): add mobile admin overview"
```

### Task 8: Build Mobile Account And Group Management

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminAccountsView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminAccountsView.spec.ts`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminGroupsView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminGroupsView.spec.ts`
- Modify only if mobile layout needs explicit mode props: `clients/desktop/src/components/admin/AccountDetailDrawer.vue`
- Modify only if mobile layout needs explicit mode props: `clients/desktop/src/components/admin/AccountEditorDialog.vue`
- Modify only if mobile layout needs explicit mode props: `clients/desktop/src/components/admin/GroupEditorDialog.vue`

- [ ] **Step 1: Write failing account-card tests**

Assert search/status/platform filters, account cards, schedulable toggle, test, recover/clear-error/refresh actions, detail/editor opening, loading, empty, error, and previous/next pagination. Verify each card action calls its existing API with the exact account ID.

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminAccountsView.spec.ts`

Expected: FAIL because the mobile account view does not exist.

- [ ] **Step 2: Implement account management**

Use `listAdminAccounts` with `page_size: 20`. Place secondary filters in a sheet and secondary record actions behind an overflow menu. Reuse existing detail/editor components only if their mobile state is readable; otherwise pass an explicit `mobile` prop that changes layout but not desktop defaults.

- [ ] **Step 3: Write failing group-card tests**

Assert search, status/platform filters, group cards, create/edit, enable/disable confirmation, loading, empty, error, and pagination. Verify `updateAdminGroupStatus(id, nextStatus)`.

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminGroupsView.spec.ts`

Expected: FAIL because the mobile group view does not exist.

- [ ] **Step 4: Implement group management**

Use `listAdminGroups`, `createAdminGroup`, `updateAdminGroup`, and `updateAdminGroupStatus`. Each card shows name, platform, status, rate multiplier, RPM, quota summary, account health, and primary edit action.

- [ ] **Step 5: Run focused mobile and desktop management tests**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminAccountsView.spec.ts src/mobile/views/admin/MobileAdminGroupsView.spec.ts src/views/admin/AdminAccountsView.spec.ts src/views/admin/AdminGroupsView.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit account and group management**

```bash
git add clients/desktop/src/mobile/views/admin/MobileAdminAccountsView.vue clients/desktop/src/mobile/views/admin/MobileAdminAccountsView.spec.ts clients/desktop/src/mobile/views/admin/MobileAdminGroupsView.vue clients/desktop/src/mobile/views/admin/MobileAdminGroupsView.spec.ts clients/desktop/src/components/admin/AccountDetailDrawer.vue clients/desktop/src/components/admin/AccountEditorDialog.vue clients/desktop/src/components/admin/GroupEditorDialog.vue
git commit -m "feat(android): add mobile account and group management"
```

Omit unchanged shared components from staging.

### Task 9: Build Mobile User Management

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminUsersView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminUsersView.spec.ts`
- Modify only for explicit mobile mode: `clients/desktop/src/components/admin/UserDetailDrawer.vue`
- Modify only for explicit mobile mode: `clients/desktop/src/components/admin/UserEditorDialog.vue`
- Modify only for explicit mobile mode: `clients/desktop/src/components/admin/UserBalanceDialog.vue`
- Modify only for explicit mobile mode: `clients/desktop/src/components/admin/UserGroupsDialog.vue`
- Modify only for explicit mobile mode: `clients/desktop/src/components/admin/UserDeleteDialog.vue`

- [ ] **Step 1: Write failing user-management tests**

Assert search/status/role filters, user cards, create/edit/detail, balance, groups, enable/disable, delete confirmation, loading, empty, error, and compact pagination. Verify destructive operations require the existing confirmation contract and ordinary text never exposes a password or credential.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminUsersView.spec.ts`

Expected: FAIL because the mobile view does not exist.

- [ ] **Step 3: Implement user cards and mobile action surfaces**

Use `listAdminUsers({ page, page_size: 20, search, status, role })`. Each card shows avatar, username/email, role, status, balance, concurrency, and group count. Keep Edit visible; put Detail, Balance, Groups, Enable/disable, and Delete in a per-card menu. Use the existing dialogs with an explicit mobile prop only where required.

- [ ] **Step 4: Run mobile and desktop user tests**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminUsersView.spec.ts src/views/admin/AdminUsersView.spec.ts src/components/admin/UserDetailDrawer.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit user management**

```bash
git add clients/desktop/src/mobile/views/admin/MobileAdminUsersView.vue clients/desktop/src/mobile/views/admin/MobileAdminUsersView.spec.ts clients/desktop/src/components/admin/UserDetailDrawer.vue clients/desktop/src/components/admin/UserEditorDialog.vue clients/desktop/src/components/admin/UserBalanceDialog.vue clients/desktop/src/components/admin/UserGroupsDialog.vue clients/desktop/src/components/admin/UserDeleteDialog.vue
git commit -m "feat(android): add mobile user management"
```

Omit unchanged shared components from staging.

### Task 10: Build Mobile User Groups

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileUserGroupsView.spec.ts`
- Modify only for explicit mobile mode: `clients/desktop/src/components/user-groups/UserGroupEditorDialog.vue`
- Modify only for explicit mobile mode: `clients/desktop/src/components/user-groups/UserGroupPeopleDialog.vue`

- [ ] **Step 1: Write failing user-group tests**

Assert search, group cards, create/edit/archive, members, viewers, counts, refresh, loading, empty, error, and permission-revoked behavior. Verify replacement calls use the selected IDs and that archive requires confirmation.

Run: `pnpm exec vitest run src/mobile/views/admin/MobileUserGroupsView.spec.ts`

Expected: FAIL because the mobile user-group view does not exist.

- [ ] **Step 2: Implement the user-group mobile directory**

Use `listUserGroups`, `createUserGroup`, `updateUserGroup`, `archiveUserGroup`, `getUserGroupMembers`, `replaceUserGroupMembers`, `getUserGroupViewers`, and `replaceUserGroupViewers`. Render member/viewer editors as full-width mobile sheets or explicit mobile dialog mode. Do not show the desktop user-group subscription/usage tabs because Subscription management is a separate administrator destination.

- [ ] **Step 3: Run mobile and existing user-group tests**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileUserGroupsView.spec.ts src/views/UserGroupsView.spec.ts src/components/user-groups/UserGroupEditorDialog.spec.ts src/components/user-groups/UserGroupPeopleDialog.spec.ts`

Expected: PASS.

- [ ] **Step 4: Commit user groups**

```bash
git add clients/desktop/src/mobile/views/admin/MobileUserGroupsView.vue clients/desktop/src/mobile/views/admin/MobileUserGroupsView.spec.ts clients/desktop/src/components/user-groups/UserGroupEditorDialog.vue clients/desktop/src/components/user-groups/UserGroupPeopleDialog.vue
git commit -m "feat(android): add mobile user groups"
```

Omit unchanged shared components from staging.

### Task 11: Build Mobile Subscription Management

**Files:**
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminSubscriptionsView.vue`
- Create: `clients/desktop/src/mobile/views/admin/MobileAdminSubscriptionsView.spec.ts`
- Modify: `clients/desktop/src/router/index.ts`
- Modify: `clients/desktop/src/router/admin-guard.spec.ts`

- [ ] **Step 1: Write failing administrator-subscription tests**

Assert search/status/group filters, cards, progress, single and bulk assignment, extend, quota reset, revoke, restore, loading, empty, error, and previous/next pagination. Verify lifecycle APIs receive exact IDs and payloads.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminSubscriptionsView.spec.ts`

Expected: FAIL because the mobile view does not exist.

- [ ] **Step 3: Implement subscription cards and action sheets**

Use `listAdminSubscriptions`, `getAdminSubscriptionProgress`, `assignAdminSubscription`, `bulkAssignAdminSubscriptions`, `extendAdminSubscription`, `resetAdminSubscriptionQuota`, `revokeAdminSubscription`, and `restoreAdminSubscription`. Keep Assign visible and place lifecycle actions in each card's overflow menu. Use `MobileBottomSheet` for assignment and lifecycle forms.

- [ ] **Step 4: Run mobile and desktop subscription-management tests**

Run: `pnpm exec vitest run src/mobile/views/admin/MobileAdminSubscriptionsView.spec.ts src/views/admin/AdminSubscriptionsView.spec.ts src/api/admin/subscriptions.spec.ts`

Expected: PASS.

- [ ] **Step 5: Wire all nine mobile views into the shared router**

Import `type RouteComponent` from `vue-router` and define:

```ts
const routeView = (desktop: RouteComponent, mobile: RouteComponent): RouteComponent =>
  appCapabilities.mobile ? mobile : desktop
```

Apply it to the three personal and six administrator destinations only. Add a router contract assertion for every mapping and rerun:

Run: `pnpm exec vitest run src/router/admin-guard.spec.ts src/mobile/navigation.spec.ts`

Expected: PASS; excluded Android routes still redirect and all approved routes point to mobile lazy components in Android mode.

- [ ] **Step 6: Commit subscription management and route presentation**

```bash
git add clients/desktop/src/mobile/views/admin/MobileAdminSubscriptionsView.vue clients/desktop/src/mobile/views/admin/MobileAdminSubscriptionsView.spec.ts clients/desktop/src/router/index.ts clients/desktop/src/router/admin-guard.spec.ts
git commit -m "feat(android): add mobile subscription management"
```

### Task 12: Synchronize And Verify Android Launcher Icons

**Files:**
- Create: `clients/desktop/scripts/sync-android-icons.mjs`
- Create: `clients/desktop/scripts/sync-android-icons.spec.ts`
- Modify: `clients/desktop/package.json`
- Modify: `clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Write a failing temporary-directory synchronization test**

Export `syncAndroidIcons({ sourceRoot, androidResRoot })`. Create source and generated fixtures for all five density buckets and three launcher filenames. Assert every generated byte sequence equals its source after sync and missing source files fail with an actionable filename.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run scripts/sync-android-icons.spec.ts`

Expected: FAIL because the synchronization module does not exist.

- [ ] **Step 3: Implement deterministic icon and manifest synchronization**

Use `node:fs/promises` APIs, structured arrays, and byte copies:

```js
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
const names = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']

for (const density of densities) {
  for (const name of names) {
    const source = join(sourceRoot, `mipmap-${density}`, name)
    const destination = join(androidResRoot, `mipmap-${density}`, name)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}
```

When invoked directly, resolve paths from the script location and fail if `gen/android` is absent with guidance to run `pnpm android:init`.

The same function reads `app/src/main/AndroidManifest.xml` and ensures the application tag contains both launcher attributes. Match the exact existing `android:icon` attribute, insert `android:roundIcon` only when absent, and fail if the expected application anchor is missing:

```js
const manifest = await readFile(manifestPath, 'utf8')
const nextManifest = manifest.includes('android:roundIcon=')
  ? manifest
  : manifest.replace(
      'android:icon="@mipmap/ic_launcher"',
      'android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round"',
    )
if (nextManifest === manifest && !manifest.includes('android:roundIcon=')) {
  throw new Error('Android manifest launcher icon anchor was not found')
}
await writeFile(manifestPath, nextManifest)
```

- [ ] **Step 4: Wire builds and round icon metadata**

Add scripts:

```json
"android:icons": "node scripts/sync-android-icons.mjs",
"android:apk": "pnpm android:icons && tauri android build --debug --apk --target aarch64 --ci"
```

The synchronization script adds `android:roundIcon="@mipmap/ic_launcher_round"` beside the existing `android:icon` after project regeneration. Do not change macOS/Windows icon generation.

- [ ] **Step 5: Verify tests and real generated resources**

Run:

```bash
pnpm exec vitest run scripts/sync-android-icons.spec.ts
pnpm android:icons
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cmp "src-tauri/icons/android/mipmap-$density/ic_launcher.png" "src-tauri/gen/android/app/src/main/res/mipmap-$density/ic_launcher.png"
  cmp "src-tauri/icons/android/mipmap-$density/ic_launcher_round.png" "src-tauri/gen/android/app/src/main/res/mipmap-$density/ic_launcher_round.png"
  cmp "src-tauri/icons/android/mipmap-$density/ic_launcher_foreground.png" "src-tauri/gen/android/app/src/main/res/mipmap-$density/ic_launcher_foreground.png"
done
```

Expected: PASS with no `cmp` output.

- [ ] **Step 6: Commit icon synchronization**

```bash
git add clients/desktop/scripts/sync-android-icons.mjs clients/desktop/scripts/sync-android-icons.spec.ts clients/desktop/package.json clients/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml clients/desktop/src-tauri/gen/android/app/src/main/res/mipmap-*/ic_launcher*.png
git commit -m "fix(android): package current launcher icon"
```

### Task 13: Update Visual Preview Fixtures And Render Every Mobile Surface

**Files:**
- Modify: `clients/desktop/src/test/visual/session.ts`
- Modify: `clients/desktop/src/test/visual/admin-api.ts`
- Modify: `clients/desktop/src/test/visual/user-groups.ts`
- Modify: `clients/desktop/vite.config.ts`
- Create: `clients/desktop/src/mobile/visual-preview.spec.ts`

- [ ] **Step 1: Add failing visual-preview contract tests**

Assert query parameters can choose `platform=android`, `role=user|admin`, and `workspace=personal|admin`; every retained route resolves against its visual API fixture; excluded mobile routes redirect to the proper home.

- [ ] **Step 2: Implement deterministic preview controls**

Read role/workspace from `URLSearchParams`, set the visual session role before bootstrap, and persist the requested workspace key. Keep fixture data long enough to exercise Chinese label wrapping, empty/error states through query flags, and two-page pagination.

- [ ] **Step 3: Run the visual contract test and full type build**

Run:

```bash
pnpm exec vitest run src/mobile/visual-preview.spec.ts
pnpm build
```

Expected: PASS; `vue-tsc -b` and Vite production build exit 0.

- [ ] **Step 4: Start the visual server and inspect rendered pages**

Run: `pnpm dev:visual --host 127.0.0.1`

Use Playwright at 360x800, 390x844, and 412x915 for all nine destinations. Capture top/bottom screenshots and verify with DOM measurements:

```js
({
  horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  topBar: document.querySelector('[data-testid="mobile-app-bar"]')?.getBoundingClientRect().toJSON(),
  bottomNav: document.querySelector('[data-testid="mobile-bottom-nav"]')?.getBoundingClientRect().toJSON(),
})
```

Expected: `horizontalOverflow <= 0`; no content is under either fixed bar; account popover and More sheet fit each viewport; all direct and overflow route clicks change the hash and visible title.

- [ ] **Step 5: Verify desktop visual isolation**

At 1440x900 with `platform=macos`, inspect Login, Dashboard, Usage, Subscriptions, desktop admin overview, accounts, groups, users, user groups, and subscriptions. Compare the desktop shell dimensions and confirm there is no mobile app bar, bottom nav, mobile page padding, or mobile-only copy.

- [ ] **Step 6: Commit preview support and any evidence-backed layout fixes**

```bash
git add clients/desktop/src/test/visual/session.ts clients/desktop/src/test/visual/admin-api.ts clients/desktop/src/test/visual/user-groups.ts clients/desktop/vite.config.ts clients/desktop/src/mobile/visual-preview.spec.ts clients/desktop/src/mobile clients/desktop/src/layouts
git commit -m "test(android): cover mobile visual surfaces"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated file.

### Task 14: Full Regression, Android Build, And APK Audit

**Files:**
- Modify only for verified defects: files introduced or explicitly listed in Tasks 1-13.

- [ ] **Step 1: Run the complete frontend suite**

Run:

```bash
pnpm test:run
pnpm build
```

Expected: all test files and tests PASS; TypeScript and production bundle exit 0.

- [ ] **Step 2: Run source hygiene and desktop Tauri build**

Run:

```bash
git diff --check
pnpm exec tauri build --debug --no-bundle --ci
```

Expected: exit 0. Report unrelated pre-existing formatting only if the exact current diff proves it is outside this work.

- [ ] **Step 3: Clean and build the Android APK**

Run:

```bash
cd src-tauri/gen/android
./gradlew clean
cd ../../../..
pnpm android:apk
```

Expected: one ARM64 debug APK at `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.

- [ ] **Step 4: Audit the final APK**

Run:

```bash
apk_path='src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
stat -f 'bytes=%z' "$apk_path"
shasum -a 256 "$apk_path"
unzip -l "$apk_path" | rg 'lib/[^/]+/.*\.so$|AndroidManifest.xml|mipmap.*/ic_launcher'
"$ANDROID_HOME/build-tools/36.1.0/apksigner" verify --verbose "$apk_path"
"$ANDROID_HOME/build-tools/36.1.0/zipalign" -c 4 "$apk_path"
```

Expected: ARM64 is the only native ABI, manifest and launcher resources are present, APK v2 signature verifies, and ZIP alignment exits 0.

- [ ] **Step 5: Verify packaged launcher pixels**

Use `aapt2 dump resources` or `apkanalyzer resources value` to resolve `@mipmap/ic_launcher`, extract the selected APK bitmap, and compare its visible LinAI mark with `src-tauri/icons/android`. A source-directory hash alone is not acceptance evidence.

- [ ] **Step 6: Install and smoke test when a target exists**

Run:

```bash
adb devices -l
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell monkey -p ai.lin.android 1
adb shell am start -a android.intent.action.VIEW -d 'linai://reset-password?token=smoke&email=test%40example.com'
```

Verify the launcher icon, cold start, login, session restore, three personal destinations, administrator switching both ways, all six administrator destinations, More sheet, back behavior, and logout. If no device or emulator is listed, report this runtime gate as unavailable and do not claim it passed.

- [ ] **Step 7: Review exact repository state**

Run:

```bash
git status --short
git log --oneline -15
git diff --check
```

Confirm no unrelated user changes were staged, reverted, reformatted, or committed. Record final APK path, exact bytes, SHA-256, test totals, build results, visual viewport results, desktop regression result, signature/alignment result, and device limitation.

---

## Completion Gate

Do not mark the Android mobile redesign complete until current evidence proves every acceptance criterion in `docs/superpowers/specs/2026-08-02-linai-android-mobile-redesign-design.md`. In particular, a successful build does not prove route clicks, desktop isolation, phone presentation, or the installed launcher icon. A browser preview does not prove the packaged APK resources. Keep those verification results separate and explicit.
