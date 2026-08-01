# H5 User Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add business user groups, delegated group-scoped read access, and three H5 pages for members, subscriptions, and usage.

**Architecture:** A dedicated SQL repository persists organizational groups and performs group-scoped reporting. A service layer is the sole authorization boundary, allowing administrators full management and ordinary users read-only access only to granted groups. The Vue application loads a backend capability, guards the three routes, and shares the same pages between admin and delegated modes.

**Tech Stack:** Go 1.26, Gin, PostgreSQL migrations and `database/sql`, Wire, Testify/sqlmock; Vue 3, TypeScript, Pinia, Vue Router, Tailwind, Vitest.

---

### Task 1: Database contract and repository types

**Files:**
- Create: `backend/migrations/192_user_groups.sql`
- Modify: `backend/migrations/migrations.go`
- Create: `backend/internal/service/user_group.go`
- Create: `backend/internal/repository/user_group_repo_test.go`

- [ ] Write SQL-mock tests for list scoping, member replacement transactions, subscription left joins, and usage aggregation split by `billing_type`.
- [ ] Run `cd backend && go test ./internal/repository -run UserGroup -count=1`; expect compilation failure because `NewUserGroupRepository` and service contracts do not exist.
- [ ] Add the migration with `user_groups`, `user_group_members`, and `user_group_viewer_grants`, constraints, and relationship indexes; reuse the existing usage-log user/time index.
- [ ] Define `UserGroup`, `UserGroupMember`, `UserGroupViewer`, `UserGroupSubscriptionRow`, `UserGroupUsageQuery`, `UserGroupUsageSummary`, `UserGroupUsageByUser`, `UserGroupUsageItem`, paginated result types, and the `UserGroupRepository` interface.
- [ ] Implement parameterized SQL repository methods and transactional replace operations in `backend/internal/repository/user_group_repo.go`.
- [ ] Run the focused repository tests; expect PASS.
- [ ] Register `NewUserGroupRepository` in `backend/internal/repository/wire.go` and commit the database/repository slice.

### Task 2: Authorization and application service

**Files:**
- Create: `backend/internal/service/user_group_service_test.go`
- Create: `backend/internal/service/user_group_service.go`
- Modify: `backend/internal/service/wire.go`

- [ ] Write tests proving administrators can manage all groups, granted users can only read granted groups, ungranted users are denied, archived groups are hidden, replacement IDs are deduplicated, names are validated, and usage ranges over 366 days are rejected.
- [ ] Run `cd backend && go test ./internal/service -run UserGroup -count=1`; expect failure because `UserGroupService` does not exist.
- [ ] Implement `UserGroupActor`, capability calculation, CRUD, member/viewer replacement, scoped subscription reads, scoped usage reads, and stable forbidden/not-found errors.
- [ ] Run the focused service tests; expect PASS.
- [ ] Register `NewUserGroupService` in the service provider set and commit the service slice.

### Task 3: Authenticated API surface

**Files:**
- Create: `backend/internal/handler/user_group_handler_test.go`
- Create: `backend/internal/handler/user_group_handler.go`
- Modify: `backend/internal/handler/handler.go`
- Modify: `backend/internal/handler/wire.go`
- Modify: `backend/internal/server/routes/user.go`
- Modify: generated Wire output used by the backend entry point

- [ ] Write handler tests for capability output, invalid IDs, forbidden mutations, replacing members, subscription responses, and usage filters.
- [ ] Write route coverage proving unauthenticated requests receive 401 and ordinary JWT-authenticated requests reach the user-group handler without admin middleware.
- [ ] Run focused handler and route tests; expect failure because the handler/routes do not exist.
- [ ] Implement request DTO validation, actor extraction from Gin context, consistent response envelopes, pagination parsing, and all endpoints from the design.
- [ ] Wire the handler into `Handlers` and mount the routes under the authenticated user router, applying the heavy rate limiter to subscription and usage reports.
- [ ] Run Wire generation using the repository's generation command, then run focused tests; expect PASS.
- [ ] Commit the HTTP API slice.

### Task 4: Frontend API, capability state, routes, and navigation

**Files:**
- Create: `frontend/src/api/userGroups.ts`
- Create: `frontend/src/api/__tests__/userGroups.spec.ts`
- Modify: `frontend/src/api/index.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/stores/auth.ts`
- Modify: `frontend/src/stores/__tests__/auth.spec.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/__tests__/guards.spec.ts`
- Modify: `frontend/src/components/layout/AppSidebar.vue`
- Create: `frontend/src/components/layout/__tests__/AppSidebar.userGroups.spec.ts`
- Create: `frontend/src/i18n/locales/zh/userGroups.ts`
- Create: `frontend/src/i18n/locales/en/userGroups.ts`
- Modify: locale index files

- [ ] Write API contract tests for every endpoint and query serialization.
- [ ] Write auth-store tests for unknown/loading/granted/admin capability states and clearing state on logout.
- [ ] Write route-guard tests proving unauthorized users are redirected and granted users are allowed.
- [ ] Write sidebar tests proving the three items are visible only to admin/granted users.
- [ ] Run the focused Vitest files; expect failures because the modules and capability logic do not exist.
- [ ] Add frontend types and API calls, then capability state/actions in the auth store.
- [ ] Add the three lazy routes with `requiresUserGroupAccess`, enforce that meta in the router guard, and add the menu items to both admin and eligible regular-user navigation.
- [ ] Add complete Chinese and English copy and merge the locale modules.
- [ ] Run focused tests; expect PASS.
- [ ] Commit the frontend access slice.

### Task 5: User group management page

**Files:**
- Create: `frontend/src/views/user-groups/UserGroupsView.vue`
- Create: `frontend/src/views/user-groups/components/UserGroupEditorDialog.vue`
- Create: `frontend/src/views/user-groups/components/UserGroupPeopleDialog.vue`
- Create: `frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts`
- Create: `frontend/src/views/user-groups/components/__tests__/UserGroupPeopleDialog.spec.ts`

- [ ] Write tests for read-only rendering, create/edit/archive actions, member selection, viewer selection, empty groups, and request failures.
- [ ] Run the focused tests; expect failure because the views do not exist.
- [ ] Build a dense group table with member/viewer counts, status, updated time, and a selected-group roster.
- [ ] Add administrator-only edit and people dialogs using existing inputs/dialog/buttons; search users through the existing admin user API and save complete ID sets.
- [ ] Ensure delegated users receive the same roster information with a read-only badge and no mutation controls.
- [ ] Run focused tests; expect PASS.
- [ ] Commit the group management page.

### Task 6: Group member subscription page

**Files:**
- Create: `frontend/src/views/user-groups/UserGroupSubscriptionsView.vue`
- Create: `frontend/src/views/user-groups/components/GroupContextRail.vue`
- Create: `frontend/src/views/user-groups/components/QuotaProgress.vue`
- Create: `frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts`

- [ ] Write tests for accessible-group selection, summary totals, members without subscriptions, active/expired states, quota bars, pagination, and forbidden errors.
- [ ] Run the focused test; expect failure because the page does not exist.
- [ ] Build the group context rail, restrained summary band, and responsive subscription table with daily/weekly/monthly progress.
- [ ] Keep current balance distinct from subscription usage and show an explicit no-subscription state per member.
- [ ] Run the focused test; expect PASS.
- [ ] Commit the subscription page.

### Task 7: Group usage summary and details page

**Files:**
- Create: `frontend/src/views/user-groups/UserGroupUsageView.vue`
- Create: `frontend/src/views/user-groups/components/GroupUsageSummary.vue`
- Create: `frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`

- [ ] Write tests for default dates, filters, balance/subscription split, per-user totals, detail rows, pagination, empty usage, and access errors.
- [ ] Run the focused test; expect failure because the page does not exist.
- [ ] Build group/date/member/model/billing filters, the summary band, per-member summary table, and paginated request details.
- [ ] Use locale-aware date and currency formatting and preserve compact mobile scanning without page-level horizontal overflow.
- [ ] Run the focused test; expect PASS.
- [ ] Commit the usage page.

### Task 8: Full verification and release hygiene

**Files:**
- Modify only files required by failures found during verification.

- [ ] Run migration regression tests and focused backend tests.
- [ ] Run `cd backend && go test ./...`; expect PASS.
- [ ] Run `pnpm --dir frontend test:run`; expect PASS.
- [ ] Run `pnpm --dir frontend typecheck`; expect PASS.
- [ ] Run `pnpm --dir frontend build`; expect PASS.
- [ ] Start the H5 dev server and verify all three routes as administrator and delegated user at desktop and mobile widths. Confirm menu visibility, mutation visibility, empty/loading/error states, dark mode, no console errors, and no page overflow.
- [ ] Audit each requirement against migration, policy tests, route tests, frontend tests, and screenshots. Confirm no desktop files and no `.superpowers/` files are staged.
- [ ] Commit any verification fixes, push the completed branch to GitHub and Gitee, and verify both remote tips match the local commit.
