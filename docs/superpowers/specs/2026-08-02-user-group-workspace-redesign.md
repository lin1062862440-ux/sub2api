# User Group Workspace Redesign

## Goal

Redesign the three H5 user-group surfaces as one coherent operational workspace. The redesign removes the unbalanced split-pane group page, reduces three sidebar entries to one, and keeps group context stable while users move between group management, member subscriptions, and usage reporting.

This is a frontend-only redesign. Existing backend APIs, authorization rules, database entities, and capability loading remain unchanged.

## User And Job

The primary user is a Sub2API operator who repeatedly answers three related questions:

1. Which organizational groups exist, and who can access them?
2. What subscription state does each member currently have?
3. How much has the selected group and each member consumed?

The workspace must make these tasks feel like views of one selected business group rather than unrelated destinations.

## Approved Direction

Use a single sidebar entry named `用户组` / `User groups`. Inside the workspace, a shared horizontal tab bar exposes:

- `组列表` / `Groups`
- `成员订阅` / `Member subscriptions`
- `组用量` / `Group usage`

The existing routes remain available for deep links and bookmarks:

- `/user-groups`
- `/user-group-subscriptions`
- `/user-group-usage`

The internal tabs use router links to these routes. The sidebar treats all three routes as belonging to the single `/user-groups` navigation entry so the user-group item stays selected on every workspace view.

## Design System

Preserve the existing LinAI/Sub2API product register and Tailwind theme.

### Color

- Primary action and active state: `primary-600` (`#0d9488`)
- Active tint: `primary-50` (`#f0fdfa`)
- Main ink: `gray-950`
- Supporting ink: `gray-600`
- Rules and dividers: `gray-200`
- Surface: white on `gray-50`; existing `dark-*` equivalents in dark mode
- Semantic colors remain emerald for active/success, amber for warning, and red for destructive/error states

Primary color is limited to the active workspace tab, selected rows, focus states, and primary commands. Summary values use semantic color only when it communicates state. There are no decorative gradients, glass effects, wide shadows, or new global theme tokens.

### Type And Density

- Continue the existing system sans stack.
- Page title: `text-2xl font-semibold`.
- Section title: `text-base font-semibold`.
- Table body and controls: `text-sm`.
- Supporting labels: `text-xs` or `text-sm`, sentence case where copy permits.
- Use tabular numerals for balances, usage, counts, and dates.

Tables and command bars remain dense enough for repeated operations. The design does not introduce marketing-scale headings or repeated card grids.

### Layout Signature

The signature element is a stable group context bar beneath the workspace tabs. It shows the selected group's monogram, name, selector, and view-specific controls on one horizontal reading axis. It is a bordered band, not a floating card.

The initial split-pane idea was rejected because it made a short member list occupy a permanent narrow column and left large areas of unused space. The approved layout gives the primary table the full content width and moves related actions into row commands and dialogs.

## Shared Workspace Shell

Create `UserGroupWorkspaceShell.vue` to own:

- The consistent page title and concise description.
- The read-only badge for delegated viewers.
- The workspace tab navigation.
- An optional action slot for commands such as `新建用户组`.
- A default slot for route-specific content.

The shell derives the active tab from the current route. It does not fetch data or own business state.

Create or reshape `GroupContextRail.vue` into a compact context bar used by subscription and usage views. It receives accessible groups, selected ID, loading state, access mode, and a controls slot. It emits only the selected group ID.

## Group Context Persistence

Use the `group_id` route query parameter as the cross-view context contract.

- When subscription or usage data loads, prefer a valid accessible `group_id` from the route.
- If it is missing or inaccessible, select the first accessible group and replace the query value.
- Changing the group selector updates `group_id` with `router.replace` and reloads only the active view's data.
- Workspace tab links preserve the current valid `group_id`.
- Row actions from the group list link to subscription or usage views with that row's group ID.

The query parameter keeps browser history, copied URLs, refresh behavior, and tab switching predictable without introducing a new global store.

## View Specifications

### Groups

The groups view becomes a full-width directory.

- Header action: `新建用户组`, administrators only.
- Command row: group-name search, result count, and any future status filter. Search is client-side over the already loaded active groups.
- Desktop: one full-width table with name/description, member count, viewer count, updated date, and actions.
- Mobile: each group renders as a compact unframed row with counts below the name; commands wrap without horizontal page overflow.
- Selecting a row only highlights it. It does not load a permanent side panel.
- Administrator row commands: edit group, manage members, configure viewers, open subscriptions, open usage, archive.
- Delegated viewers see open-subscriptions and open-usage commands only.
- `UserGroupPeopleDialog` remains the focused editing surface for member/viewer replacement. Member or viewer data is fetched when the corresponding command opens the dialog, not for every group during initial page load.

The empty state keeps the workspace shell visible. Administrators receive the `新建用户组` action; delegated users receive the existing no-authorized-groups guidance.

### Member Subscriptions

- Shared context bar: group monogram/name and selector on the left; subscription status filter and refresh icon button on the right.
- Summary is a continuous four-column metric band: members, active subscriptions, total balance, and subscription usage.
- The metric band collapses to two columns on narrow screens without becoming four separate cards.
- The member table remains full width. Member identity includes the stored avatar with the existing fallback behavior.
- Quota details keep daily, weekly, and monthly progress bars, but align within one quota column on desktop and stack beneath the plan on mobile.
- Status, empty, error, pagination, and refresh behavior remain functionally equivalent to the current implementation.

### Group Usage

- Shared context bar: selected group on the left; date range, more-filters toggle, and `查询用量` on the right.
- Default date range remains the last seven local calendar days.
- Start/end date remain visible. Member, model, and billing-type controls live in an inline expandable filter row opened by `更多筛选`; active hidden filters are reflected by a count on the control.
- Summary uses a continuous metric band for requests, total tokens, total cost, balance consumption, and subscription consumption. At wide widths it uses five columns; at smaller widths it wraps to two columns.
- Below the summary, a compact segmented control switches between `成员汇总` and `请求明细`.
- `成员汇总` is the default view and shows per-member requests, tokens, balance consumption, and subscription consumption.
- `请求明细` shows the paginated usage-log rows. Pagination is visible only in this view because the backend pagination applies to details.
- Changing presentation view does not make another API request.

## Loading, Error, And Empty States

- Group list and report areas use shape-matched skeleton rows during initial loading.
- A group-list failure replaces the view content with the existing focused error state and retry command while preserving the workspace shell.
- Subscription or usage failures preserve the selected group context and filters so retry does not erase the operator's task.
- Empty subscriptions and empty usage results retain summary/context controls and provide one direct explanation.
- Refresh buttons expose disabled and rotating-icon states without resizing.
- Data errors continue to use the existing application toast for mutations and inline error surfaces for route data.

## Responsive Behavior

- Desktop content uses the existing `AppLayout` width; no permanent inner sidebar is added.
- Workspace tabs are horizontally scrollable on narrow widths and keep their intrinsic labels.
- Command bars wrap controls in priority order. Primary commands remain visible; secondary filters move to the next line.
- Metric bands use two columns below `sm` and their wide column count at `xl` or `2xl` according to available content width.
- Desktop tables switch to semantic stacked rows before fixed columns would cause page overflow.
- Dialogs retain existing mobile behavior.
- No text scales with viewport width, and no fixed-format control changes size when labels or loading icons change.

## Accessibility

- Workspace tabs use route links with an `aria-current="page"` state.
- Group rows remain keyboard navigable through explicit links and buttons; row selection is not the only route to an action.
- Icon-only refresh and overflow controls have tooltips and screen-reader labels.
- Focus treatment uses existing primary focus rings.
- Selected rows and active tabs use color plus border/weight changes.
- All body copy and controls must retain at least 4.5:1 contrast in light and dark themes.
- Reduced motion disables nonessential transitions; loading state remains understandable without animation.

## Component And File Scope

Expected implementation files:

- `frontend/src/components/layout/AppSidebar.vue`
- `frontend/src/router/index.ts` only if route metadata is needed for shared sidebar selection
- `frontend/src/views/user-groups/UserGroupsView.vue`
- `frontend/src/views/user-groups/UserGroupSubscriptionsView.vue`
- `frontend/src/views/user-groups/UserGroupUsageView.vue`
- `frontend/src/views/user-groups/components/UserGroupWorkspaceShell.vue`
- `frontend/src/views/user-groups/components/GroupContextRail.vue`
- `frontend/src/views/user-groups/components/GroupUsageSummary.vue`
- `frontend/src/i18n/locales/zh/userGroups.ts`
- `frontend/src/i18n/locales/en/userGroups.ts`
- Focused tests beside the existing sidebar, router, and user-group view tests

Do not change backend APIs, backend authorization, database migrations, desktop-client navigation, unrelated global button/input styles, or other admin pages.

## Testing

Write failing frontend tests before implementation for:

- Sidebar renders one user-group entry and marks it active on all three routes.
- Shared shell renders three route links and preserves `group_id` across tabs.
- Groups view no longer renders the split roster layout and fetches people only when a management command opens.
- Subscription and usage views initialize from a valid `group_id`, fall back safely, and update the route query on selection.
- Usage summary/detail segmented control changes presentation without another usage request.
- Advanced usage filters retain their existing request parameters.
- Administrator and delegated-viewer actions remain correctly scoped.
- Loading, error, empty, and mobile structure remain available and readable.

Verification commands:

- Focused Vitest files for sidebar, router, and all user-group views/components.
- Frontend typecheck.
- Frontend production build.
- Browser verification at desktop and mobile widths in light and dark themes.

## Acceptance Criteria

- The sidebar exposes one user-group entry instead of three.
- All three original URLs remain directly accessible and authorized as before.
- The three views share one visually identical title/tab/context structure.
- The groups page has no side-by-side roster panel.
- Switching between subscription and usage views preserves the selected group.
- Every existing member, viewer, subscription, usage, filtering, pagination, and archive workflow remains usable.
- No route produces horizontal page overflow at 375 px, 768 px, 1280 px, or 1920 px viewport widths.
- Light and dark screenshots show coherent proportions, readable text, stable controls, and no overlapping content.
- Focused tests, typecheck, and production build complete successfully, or unrelated pre-existing failures are identified with exact evidence.
