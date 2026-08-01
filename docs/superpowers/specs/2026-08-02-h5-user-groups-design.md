# H5 User Groups Design

## Scope

This feature adds a business-level user grouping and delegated reporting surface to the H5 application. It is independent from the existing API routing and billing `groups` table and does not modify desktop behavior or desktop UI.

The H5 navigation gains three first-class menus:

1. **用户组**: group roster and, for administrators, group/member/viewer management.
2. **组成员订阅**: subscription and balance state for members of one accessible group.
3. **组用量**: group-level usage totals, per-member summaries, and request details.

## Terminology and Boundaries

- A **user group** is an organizational collection of users. It is stored in `user_groups` and must never be confused with the existing model/billing `groups` entity.
- A **member** is a user assigned to a user group. Membership is many-to-many so a user may appear in more than one organizational group.
- A **viewer** is a user granted read-only access to one user group. Viewer grants do not alter the user's global `role` and do not grant access to any existing administrator API.
- An **administrator** can access and manage every user group without an explicit grant.
- A delegated ordinary user can only read groups for which an active viewer grant exists.

## Authorization Matrix

| Operation | Administrator | Granted user | Other authenticated user |
| --- | --- | --- | --- |
| See the three menus | Yes | Yes | No |
| List groups | All groups | Granted groups | Empty list |
| Read group members | Yes | Granted groups only | Forbidden |
| Read group subscriptions | Yes | Granted groups only | Forbidden |
| Read group usage | Yes | Granted groups only | Forbidden |
| Create/edit/archive groups | Yes | No | No |
| Replace group members | Yes | No | No |
| Replace viewer grants | Yes | No | No |

Every group-specific read performs authorization in the backend service. Frontend route guards and hidden navigation are usability controls, not the security boundary.

## Data Model

### `user_groups`

- `id BIGSERIAL PRIMARY KEY`
- `name VARCHAR(100) NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `status VARCHAR(20) NOT NULL DEFAULT 'active'`, restricted to `active` or `archived`
- `created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`
- Active group names are unique case-insensitively through a partial unique index.

### `user_group_members`

- `user_group_id BIGINT REFERENCES user_groups(id) ON DELETE CASCADE`
- `user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`
- `created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- Composite primary key `(user_group_id, user_id)`.

### `user_group_viewer_grants`

- `user_group_id BIGINT REFERENCES user_groups(id) ON DELETE CASCADE`
- `viewer_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`
- `created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- Composite primary key `(user_group_id, viewer_user_id)`.

Group usage queries reuse the existing `usage_logs(user_id, created_at)` index. The user-group migration does not create another descending variant because PostgreSQL can scan the existing B-tree in either direction and a transactional index build would unnecessarily lock the large usage table.

## Backend Architecture

`UserGroupRepository` owns SQL persistence and reporting queries. `UserGroupService` owns validation and the complete admin-or-grant policy. `UserGroupHandler` translates authenticated HTTP requests into service calls. The authenticated H5 router exposes `/api/v1/user-groups`; no delegated route is mounted beneath `/api/v1/admin`.

The repository uses parameterized SQL and transactions. Replacing members or viewers locks the group row, deletes the old set, validates that users still exist and are not soft-deleted, and inserts the new set atomically. Disabled users remain selectable so administrators can remove or retain existing relationships without making the group impossible to save. Empty arrays intentionally clear the set. Duplicate user IDs are normalized.

## API Contract

All endpoints require JWT authentication.

### Capability and groups

- `GET /user-groups/capabilities`
  - Returns `{ can_access, can_manage, group_count }`.
- `GET /user-groups`
  - Administrator: all active groups.
  - Ordinary user: active groups with an explicit grant.
- `POST /user-groups` (administrator)
  - Body `{ name, description }`.
- `PUT /user-groups/:id` (administrator)
  - Body `{ name, description }`.
- `DELETE /user-groups/:id` (administrator)
  - Archives the group rather than physically deleting historical relationships.

### Members and viewers

- `GET /user-groups/:id/members`
- Returns non-deleted members, including disabled accounts, with ID, username, email, avatar, status, balance, and membership time.
- `PUT /user-groups/:id/members` (administrator)
  - Body `{ user_ids: number[] }`; replaces the complete member set.
- `GET /user-groups/:id/viewers` (administrator)
  - Returns users with read permission.
- `PUT /user-groups/:id/viewers` (administrator)
  - Body `{ user_ids: number[] }`; replaces the complete viewer set.

### Group subscriptions

- `GET /user-groups/:id/subscriptions?status=&page=&page_size=`
  - Returns every member, including members with no subscription.
  - Subscription rows include billing group name/platform, status, validity, daily/weekly/monthly used and limit values, and current balance.
  - Summary includes member count, active subscription count, no-subscription count, total balance, and active subscription usage.

### Group usage

- `GET /user-groups/:id/usage?start_date=&end_date=&user_id=&model=&billing_type=&page=&page_size=`
  - Defaults to the last seven local calendar days and enforces a maximum 366-day range.
  - Summary includes request count, token totals, total actual cost, balance consumption, and subscription consumption.
  - `by_user` provides the same core totals per member.
  - Detail rows include user identity, model, token counts, actual cost, billing type, request ID, and timestamp.
  - Sensitive account credentials, prompts, IP addresses, and API key values are never returned.

Balance and subscription spending use the persisted `billing_type`; `actual_cost` is summed in both cases because it is the effective cost used by the billing pipeline.

## Frontend Architecture

The auth store keeps a small `userGroupCapabilities` state loaded from `/user-groups/capabilities`. Administrators resolve to full capability immediately; ordinary users receive menus only after a successful capability response. Routes use `meta.requiresUserGroupAccess` and await capability loading before allowing navigation.

The three routes are shared by administrators and delegated users:

- `/user-groups`
- `/user-group-subscriptions`
- `/user-group-usage`

They use the existing `AppLayout`, `TablePageLayout`, `DataTable`, `Select`, `Pagination`, dialogs, buttons, light/dark tokens, and responsive breakpoints. The pages remain dense and operational rather than card-heavy. Administrators see edit controls; delegated users see an explicit read-only badge and no mutation controls.

The visual signature is a narrow group context rail at the top of subscription and usage views: group selector, member count, and access mode stay aligned in one scanning row. Summary metrics form a restrained full-width band below it, not nested cards.

## Error and Empty States

- `400`: malformed IDs, invalid status, invalid date/range, invalid member/viewer IDs, duplicate name.
- `401`: missing or invalid authentication.
- `403`: ordinary user requests an ungranted group or any mutation.
- `404`: group does not exist or is archived.
- `409`: active group name conflict.
- Empty group list explains that no group has been authorized.
- Empty member/subscription/usage tables retain the group selector and show a focused empty-state message.

## Testing and Acceptance

- Repository SQL tests cover access scoping, atomic replacement, left-joined subscription rows, and billing split aggregation.
- Service tests cover the full authorization matrix, validation, deduplication, and date range limits.
- Handler/route tests prove unauthenticated rejection and delegated access does not depend on admin middleware.
- Frontend tests cover API shapes, capability persistence, route guards, navigation visibility, admin-only controls, subscription empty rows, and usage summary/detail rendering.
- `go test ./...`, frontend unit tests, typecheck, and production build must pass.
- Browser verification covers administrator and delegated-user states at desktop and mobile widths with no horizontal page overflow or console errors.
