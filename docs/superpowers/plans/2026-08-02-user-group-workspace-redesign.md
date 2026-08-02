# User Group Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the three H5 user-group destinations into one coherent workspace with a single sidebar entry, shared route tabs, persistent group context, full-width operational tables, and balanced report views.

**Architecture:** Keep the three existing routes and backend contracts. Add a presentation-only workspace shell and use `group_id` in the route query as the cross-view context contract; each report view retains ownership of its own API calls and filters. Reshape existing user-group components rather than introducing a new global store or changing unrelated app-wide styles.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, TypeScript, Tailwind CSS, Vue I18n, Vitest, Vue Test Utils, Vite.

---

## File Map

- Create `frontend/src/views/user-groups/components/UserGroupWorkspaceShell.vue`: shared title, access badge, route tabs, and action/content slots.
- Create `frontend/src/views/user-groups/components/__tests__/UserGroupWorkspaceShell.spec.ts`: route-tab and query-preservation contract.
- Modify `frontend/src/components/layout/AppSidebar.vue`: expose one user-group navigation item and keep it active for all workspace routes.
- Modify `frontend/src/components/layout/__tests__/AppSidebar.userGroups.spec.ts`: assert the single-entry contract.
- Modify `frontend/src/views/user-groups/components/GroupContextRail.vue`: turn the selector rail into the approved compact context bar with a controls slot.
- Modify `frontend/src/views/user-groups/UserGroupsView.vue`: full-width directory, client-side search, on-demand people loading, row actions, responsive rows.
- Modify `frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts`: remove split-pane assumptions and prove on-demand loading/action scoping.
- Modify `frontend/src/views/user-groups/UserGroupSubscriptionsView.vue`: shared shell, query-backed group selection, metric band, compact command row, responsive subscription rows.
- Modify `frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts`: query initialization/persistence and retained subscription workflows.
- Modify `frontend/src/views/user-groups/UserGroupUsageView.vue`: shared shell, query-backed context, expandable filters, summary/detail presentation switch.
- Modify `frontend/src/views/user-groups/components/GroupUsageSummary.vue`: responsive continuous metric band.
- Modify `frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`: query context, advanced filters, and no-refetch view switching.
- Modify `frontend/src/i18n/locales/zh/userGroups.ts`: workspace, tab, search, context, filter, and action copy.
- Modify `frontend/src/i18n/locales/en/userGroups.ts`: matching English copy.

### Task 1: Shared Workspace Navigation

**Files:**
- Create: `frontend/src/views/user-groups/components/UserGroupWorkspaceShell.vue`
- Create: `frontend/src/views/user-groups/components/__tests__/UserGroupWorkspaceShell.spec.ts`
- Modify: `frontend/src/components/layout/AppSidebar.vue`
- Modify: `frontend/src/components/layout/__tests__/AppSidebar.userGroups.spec.ts`
- Modify: `frontend/src/i18n/locales/zh/userGroups.ts`
- Modify: `frontend/src/i18n/locales/en/userGroups.ts`

- [ ] **Step 1: Write failing shell and sidebar tests**

Add a shell test that mounts with a mocked route containing `query: { group_id: '7' }` and asserts three links:

```ts
expect(wrapper.get('[data-test="workspace-tab-groups"]').attributes('to')).toContain('/user-groups')
expect(wrapper.get('[data-test="workspace-tab-subscriptions"]').attributes('to')).toContain('group_id=7')
expect(wrapper.get('[data-test="workspace-tab-usage"]').attributes('to')).toContain('group_id=7')
```

Replace the sidebar source assertion with:

```ts
expect(source.match(/path: '\/user-groups'/g)).toHaveLength(1)
expect(source).not.toContain("path: '/user-group-subscriptions'")
expect(source).not.toContain("path: '/user-group-usage'")
expect(source).toContain('userGroupWorkspacePaths')
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --dir frontend test:run \
  src/components/layout/__tests__/AppSidebar.userGroups.spec.ts \
  src/views/user-groups/components/__tests__/UserGroupWorkspaceShell.spec.ts
```

Expected: FAIL because the shell does not exist and the sidebar still declares three entries.

- [ ] **Step 3: Implement the shared shell and one sidebar entry**

The shell uses route names and preserves the current group query:

```ts
const tabs = computed(() => [
  { key: 'groups', to: { name: 'UserGroups', query: preservedGroupQuery.value } },
  { key: 'subscriptions', to: { name: 'UserGroupSubscriptions', query: preservedGroupQuery.value } },
  { key: 'usage', to: { name: 'UserGroupUsage', query: preservedGroupQuery.value } },
])
```

Render tabs as `RouterLink` controls with `aria-current`, stable `data-test` attributes, a horizontally scrollable tab row, an optional `actions` slot, and the existing delegated read-only badge.

Replace `buildUserGroupNavItems()` with one item:

```ts
const userGroupWorkspacePaths = ['/user-groups', '/user-group-subscriptions', '/user-group-usage']

function buildUserGroupNavItems(): NavItem[] {
  return [{ path: '/user-groups', label: t('userGroups.nav.workspace'), icon: FolderIcon }]
}
```

Extend the sidebar's active-path predicate so `/user-groups` is active when `route.path` is any `userGroupWorkspacePaths` value.

- [ ] **Step 4: Add matching i18n labels**

Add these keys in both locales:

```ts
nav: { workspace: '用户组' },
workspace: {
  title: '用户组工作区',
  description: '维护业务组、成员订阅和用量记录',
  tabs: { groups: '组列表', subscriptions: '成员订阅', usage: '组用量' },
},
```

Use equivalent direct English copy.

- [ ] **Step 5: Run tests and verify GREEN**

Run the same focused command from Step 2. Expected: both files pass.

- [ ] **Step 6: Commit the navigation unit**

```bash
git add frontend/src/components/layout/AppSidebar.vue \
  frontend/src/components/layout/__tests__/AppSidebar.userGroups.spec.ts \
  frontend/src/views/user-groups/components/UserGroupWorkspaceShell.vue \
  frontend/src/views/user-groups/components/__tests__/UserGroupWorkspaceShell.spec.ts \
  frontend/src/i18n/locales/zh/userGroups.ts \
  frontend/src/i18n/locales/en/userGroups.ts
git commit -m "feat(h5): unify user group workspace navigation"
```

### Task 2: Query-Backed Group Context Bar

**Files:**
- Modify: `frontend/src/views/user-groups/components/GroupContextRail.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`

- [ ] **Step 1: Add failing route-context tests**

Mock `useRoute` and `useRouter` in both report specs:

```ts
const route = reactive({ query: { group_id: '8' } })
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))
```

Assert initial API calls use group `8`, selector changes call `replace({ query: expect.objectContaining({ group_id: '7' }) })`, and an invalid query falls back to the first accessible ID.

- [ ] **Step 2: Run report specs and verify RED**

```bash
pnpm --dir frontend test:run \
  src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts \
  src/views/user-groups/__tests__/UserGroupUsageView.spec.ts
```

Expected: FAIL because both views currently always pick the first group and do not update the URL.

- [ ] **Step 3: Reshape the context rail presentation**

Keep the existing props/emits contract, add a named `controls` slot, and render:

```vue
<div class="flex min-w-0 items-center gap-3">
  <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-700">
    {{ selectedGroup?.name.trim().slice(0, 1) || '#' }}
  </span>
  <div class="min-w-0">
    <p class="truncate text-sm font-semibold">{{ selectedGroup?.name }}</p>
    <select data-test="group-select" ... />
  </div>
</div>
<div class="flex flex-wrap items-center gap-2"><slot name="controls" /></div>
```

Use a full-width border band, no shadow, and stacked mobile layout.

- [ ] **Step 4: Add route-query helpers in each report view**

Use the same local helper shape in both pages:

```ts
function routeGroupId(): number | null {
  const value = Number(route.query.group_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

function resolveSelectedGroupId(): number | null {
  const requested = routeGroupId()
  return groups.value.some(group => group.id === requested) ? requested : groups.value[0]?.id ?? null
}

async function syncGroupQuery(groupId: number) {
  await router.replace({ query: { ...route.query, group_id: String(groupId) } })
}
```

Initialize from the query, replace invalid/missing values, and update the query before reloading after selection.

- [ ] **Step 5: Run report specs and verify GREEN**

Run the Step 2 command. Expected: both files pass.

- [ ] **Step 6: Commit the context unit**

```bash
git add frontend/src/views/user-groups/components/GroupContextRail.vue \
  frontend/src/views/user-groups/UserGroupSubscriptionsView.vue \
  frontend/src/views/user-groups/UserGroupUsageView.vue \
  frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts \
  frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts
git commit -m "feat(h5): persist user group report context"
```

### Task 3: Full-Width Group Directory

**Files:**
- Modify: `frontend/src/views/user-groups/UserGroupsView.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts`
- Modify: `frontend/src/i18n/locales/zh/userGroups.ts`
- Modify: `frontend/src/i18n/locales/en/userGroups.ts`

- [ ] **Step 1: Replace split-pane tests with failing directory tests**

Assert the new structure and behavior:

```ts
expect(wrapper.get('[data-test="group-directory"]').exists()).toBe(true)
expect(wrapper.find('[data-test="group-roster-panel"]').exists()).toBe(false)
expect(mocks.getMembers).not.toHaveBeenCalled()
await wrapper.get('[data-test="manage-members-7"]').trigger('click')
await flushPromises()
expect(mocks.getMembers).toHaveBeenCalledWith(7)
```

Also assert delegated users receive report links but no create/edit/archive/member-management controls.

- [ ] **Step 2: Run the group view spec and verify RED**

```bash
pnpm --dir frontend test:run src/views/user-groups/__tests__/UserGroupsView.spec.ts
```

Expected: FAIL because the current view auto-loads people and renders the permanent roster panel.

- [ ] **Step 3: Implement directory state and on-demand people loading**

Remove `selectedGroup`, automatic `loadPeople`, and the split grid. Add:

```ts
const search = ref('')
const peopleTarget = ref<UserGroup | null>(null)
const filteredGroups = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query ? groups.value.filter(group => `${group.name} ${group.description}`.toLocaleLowerCase().includes(query)) : groups.value
})

async function openPeople(group: UserGroup, mode: 'members' | 'viewers') {
  peopleTarget.value = group
  peopleMode.value = mode
  const [memberRows, viewerRows] = await Promise.all([
    userGroupAPI.getMembers(group.id),
    mode === 'viewers' ? userGroupAPI.getViewers(group.id) : Promise.resolve([]),
  ])
  members.value = memberRows
  viewers.value = viewerRows
  peopleOpen.value = true
}
```

Wrap content in `UserGroupWorkspaceShell`. Render a full-width desktop table and compact mobile rows. Provide explicit router links with `{ name, query: { group_id: group.id } }` for subscriptions and usage.

- [ ] **Step 4: Add focused directory copy**

Add keys for search, result count, manage action, open subscriptions, open usage, and the no-search-result state in both locales.

- [ ] **Step 5: Run the group view spec and verify GREEN**

Run the Step 2 command. Expected: all group view tests pass.

- [ ] **Step 6: Commit the directory unit**

```bash
git add frontend/src/views/user-groups/UserGroupsView.vue \
  frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts \
  frontend/src/i18n/locales/zh/userGroups.ts \
  frontend/src/i18n/locales/en/userGroups.ts
git commit -m "feat(h5): redesign user group directory"
```

### Task 4: Member Subscription Surface

**Files:**
- Modify: `frontend/src/views/user-groups/UserGroupSubscriptionsView.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts`

- [ ] **Step 1: Add failing layout and accessibility assertions**

Assert the shared shell, context controls, metric band, avatar, and responsive row contract:

```ts
expect(wrapper.get('[data-test="workspace-tab-subscriptions"]').attributes('aria-current')).toBe('page')
expect(wrapper.get('[data-test="subscription-summary-band"]').classes()).toContain('sm:grid-cols-2')
expect(wrapper.get('[data-test="subscription-member-avatar"]').exists()).toBe(true)
expect(wrapper.get('[data-test="refresh-subscriptions"]').attributes('aria-label')).toBeTruthy()
```

- [ ] **Step 2: Run the subscription spec and verify RED**

```bash
pnpm --dir frontend test:run src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts
```

Expected: FAIL because the old page does not use the workspace shell or avatar row.

- [ ] **Step 3: Implement the approved subscription hierarchy**

Wrap the view in `UserGroupWorkspaceShell`, place status and refresh controls in `GroupContextRail#controls`, mark the metric strip with `data-test="subscription-summary-band"`, and render the avatar with:

```vue
<img
  data-test="subscription-member-avatar"
  :src="resolveAvatarUrl(row.member.avatar_url)"
  :alt="row.member.username || row.member.email"
  class="h-9 w-9 rounded-full bg-gray-100 object-cover ring-1 ring-gray-950/5"
/>
```

Keep all current quota/status/pagination behavior. Use a dense desktop header and stacked mobile rows without adding nested cards.

- [ ] **Step 4: Run the subscription spec and verify GREEN**

Run the Step 2 command. Expected: all subscription view tests pass.

- [ ] **Step 5: Commit the subscription unit**

```bash
git add frontend/src/views/user-groups/UserGroupSubscriptionsView.vue \
  frontend/src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts
git commit -m "style(h5): rebalance group subscription workspace"
```

### Task 5: Group Usage Surface

**Files:**
- Modify: `frontend/src/views/user-groups/UserGroupUsageView.vue`
- Modify: `frontend/src/views/user-groups/components/GroupUsageSummary.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`
- Modify: `frontend/src/i18n/locales/zh/userGroups.ts`
- Modify: `frontend/src/i18n/locales/en/userGroups.ts`

- [ ] **Step 1: Add failing usage-view behavior tests**

Add assertions for collapsed filters and the presentation switch:

```ts
expect(wrapper.find('[data-test="advanced-usage-filters"]').exists()).toBe(false)
await wrapper.get('[data-test="toggle-usage-filters"]').trigger('click')
expect(wrapper.get('[data-test="advanced-usage-filters"]').exists()).toBe(true)

const requestCount = mocks.getUsage.mock.calls.length
await wrapper.get('[data-test="usage-view-details"]').trigger('click')
expect(wrapper.get('[data-test="usage-detail-table"]').exists()).toBe(true)
expect(mocks.getUsage).toHaveBeenCalledTimes(requestCount)
```

Retain the existing request-parameter assertion after setting member/model/billing filters.

- [ ] **Step 2: Run the usage spec and verify RED**

```bash
pnpm --dir frontend test:run src/views/user-groups/__tests__/UserGroupUsageView.spec.ts
```

Expected: FAIL because filters and both result sections are always visible.

- [ ] **Step 3: Implement the command bar and presentation state**

Add:

```ts
const showAdvancedFilters = ref(false)
const resultView = ref<'members' | 'details'>('members')
const activeAdvancedFilterCount = computed(() => [memberFilter.value, modelFilter.value.trim(), billingFilter.value].filter(Boolean).length)
```

Move date fields into the context controls, place member/model/billing inputs in a `v-if="showAdvancedFilters"` row, and render member or detail results with `v-if="resultView === 'members'"` / `v-else`. Keep pagination inside the detail branch only.

Update `GroupUsageSummary` to a continuous responsive band:

```vue
<section data-test="usage-summary-band" class="grid grid-cols-2 divide-x divide-y border-y sm:grid-cols-2 xl:grid-cols-5 xl:divide-y-0">
```

- [ ] **Step 4: Add usage control copy**

Add `moreFilters`, `activeFilters`, `memberView`, and `detailView` keys in Chinese and English.

- [ ] **Step 5: Run the usage spec and verify GREEN**

Run the Step 2 command. Expected: all usage view tests pass.

- [ ] **Step 6: Commit the usage unit**

```bash
git add frontend/src/views/user-groups/UserGroupUsageView.vue \
  frontend/src/views/user-groups/components/GroupUsageSummary.vue \
  frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts \
  frontend/src/i18n/locales/zh/userGroups.ts \
  frontend/src/i18n/locales/en/userGroups.ts
git commit -m "style(h5): clarify group usage workspace"
```

### Task 6: Integrated Verification And Visual QA

**Files:**
- Modify only files from Tasks 1-5 if verification exposes an in-scope defect.

- [ ] **Step 1: Run all focused workspace tests**

```bash
pnpm --dir frontend test:run \
  src/components/layout/__tests__/AppSidebar.userGroups.spec.ts \
  src/router/__tests__/userGroupAccess.spec.ts \
  src/views/user-groups/__tests__/UserGroupsView.spec.ts \
  src/views/user-groups/__tests__/UserGroupSubscriptionsView.spec.ts \
  src/views/user-groups/__tests__/UserGroupUsageView.spec.ts \
  src/views/user-groups/components/__tests__/UserGroupWorkspaceShell.spec.ts \
  src/views/user-groups/components/__tests__/UserGroupPeopleDialog.spec.ts
```

Expected: every listed test passes.

- [ ] **Step 2: Run static and production verification**

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: both commands exit zero. If unrelated existing failures remain, capture exact file/line evidence and still run the focused test suite.

- [ ] **Step 3: Start the frontend development server**

```bash
pnpm --dir frontend dev --host 127.0.0.1
```

Use the next free port if Vite's default port is occupied.

- [ ] **Step 4: Verify desktop and mobile rendering**

Use browser screenshots for `/user-groups`, `/user-group-subscriptions?group_id=7`, and `/user-group-usage?group_id=7` at:

- 1920 x 1080 light
- 1280 x 800 light and dark
- 768 x 1024 light
- 375 x 812 light

Check: one sidebar entry, consistent shell, no split roster, preserved group query, readable metric bands, usable filters, no overlapping controls, no horizontal page overflow, meaningful loading/empty states, and no console errors.

- [ ] **Step 5: Run final diff checks**

```bash
git diff --check
git status --short
git diff -- frontend/src/components/layout/AppSidebar.vue frontend/src/views/user-groups frontend/src/i18n/locales/zh/userGroups.ts frontend/src/i18n/locales/en/userGroups.ts
```

Expected: no whitespace errors; only planned user-group files plus pre-existing unrelated workspace changes appear.

- [ ] **Step 6: Commit any final in-scope QA corrections**

```bash
git add frontend/src/components/layout/AppSidebar.vue \
  frontend/src/components/layout/__tests__/AppSidebar.userGroups.spec.ts \
  frontend/src/views/user-groups \
  frontend/src/i18n/locales/zh/userGroups.ts \
  frontend/src/i18n/locales/en/userGroups.ts
git commit -m "fix(h5): finish user group workspace QA"
```

Skip this commit when Step 4 requires no code correction.
