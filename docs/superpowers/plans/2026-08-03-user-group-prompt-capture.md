# User Group Prompt Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add best-effort, 14-day, irreversibly redacted latest-user-turn capture to H5 user-group request details with an independent Prompt viewer permission.

**Architecture:** A focused extractor extends the existing multi-protocol security-audit parser. Gateway handlers non-blockingly enqueue eligible requests into an in-memory capture runtime; workers redact and persist one capture plus many business-group associations. User-group services enforce ordinary group access and independent Prompt grants, while H5 exposes administrator controls and an authorized detail modal.

**Tech Stack:** Go 1.26, Gin, PostgreSQL, Redis pub/sub, Google Wire, Vue 3, TypeScript, Pinia, Vitest, Tailwind CSS.

---

## File Map

- Create `backend/migrations/194_user_group_prompt_capture.sql` for settings, grants, captures, associations, and indexes.
- Extend `backend/internal/securityaudit/prompt_snapshot.go` with latest-human-user extraction and irreversible capture redaction.
- Create `backend/internal/service/user_group_prompt_capture.go` for DTOs, repository port, bounded runtime, eligibility snapshot, metrics, lifecycle, and retention.
- Create `backend/internal/repository/user_group_prompt_capture_repo.go` for PostgreSQL persistence, grants, detail lookup, and cleanup.
- Extend `backend/internal/service/user_group.go`, `backend/internal/repository/user_group_repo.go`, and `backend/internal/handler/user_group_handler.go` with independent Prompt permissions and APIs.
- Extend gateway handlers and `backend/internal/handler/security_audit_helper.go` with non-blocking dispatch before audit decisions.
- Update Wire providers and server cleanup lifecycle.
- Extend H5 user-group types/API, group administration, usage details, localization, and focused tests.

### Task 1: Add the persistence schema

**Files:**
- Create: `backend/migrations/194_user_group_prompt_capture.sql`
- Modify: `backend/migrations/user_groups_migration_test.go`

- [ ] **Step 1: Write a failing migration contract test**

Assert migration 194 contains `prompt_capture_enabled`, `user_group_prompt_viewer_grants`, `user_prompt_captures`, `user_group_prompt_captures`, `event_id UUID`, `expires_at`, both lookup indexes, and cascade foreign keys. Assert it does not alter `prompt_audit_events`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd backend && go test ./migrations -run 'Test.*UserGroup.*Prompt' -count=1`

Expected: FAIL because migration 194 does not exist.

- [ ] **Step 3: Add the idempotent migration**

Use:

```sql
ALTER TABLE user_groups
    ADD COLUMN IF NOT EXISTS prompt_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

Create the three tables from the design. Add checks for nonnegative `prompt_length`, non-empty `redacted_prompt`, and `expires_at > captured_at`. Add indexes on `(viewer_user_id, user_group_id)`, `(user_id, request_id, captured_at, id)`, `(expires_at, id)`, and `(user_group_id, capture_id)`.

- [ ] **Step 4: Run migration tests**

Run: `cd backend && go test ./migrations -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/194_user_group_prompt_capture.sql backend/migrations/user_groups_migration_test.go
git commit -m "feat: add user group prompt capture schema"
```

### Task 2: Extract and redact only the latest human user turn

**Files:**
- Modify: `backend/internal/securityaudit/prompt_snapshot.go`
- Modify: `backend/internal/securityaudit/prompt_snapshot_test.go`

- [ ] **Step 1: Write failing extractor tests**

Cover this Anthropic case and equivalent final-turn cases for Chat Completions, Responses string/array input, Gemini parts, media prompts, and WebSocket `response.create`:

```go
snapshot, err := ExtractLatestUserPromptSnapshot(Request{
    Protocol: "anthropic_messages",
    Body: []byte(`{"system":"secret system","messages":[{"role":"user","content":"old"},{"role":"assistant","content":"reply"},{"role":"user","content":[{"type":"tool_result","content":"tool output"},{"type":"text","text":"new alice@example.com sk-testsecret123"}]}]}`),
})
require.NoError(t, err)
require.NotContains(t, snapshot.RedactedPrompt, "old")
require.NotContains(t, snapshot.RedactedPrompt, "tool output")
require.NotContains(t, snapshot.RedactedPrompt, "alice@example.com")
require.NotContains(t, snapshot.RedactedPrompt, "sk-testsecret123")
require.Contains(t, snapshot.RedactedPrompt, "new")
```

Add exclusions for system/developer/assistant/tool/model roles, empty user text, and UTF-8-safe 64 KiB truncation. Add redaction cases for authorization/cookie values, email, phone, PRC ID-like values, and payment-card-like values.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend && go test ./internal/securityaudit -run 'TestExtractLatestUser|TestRedactCapturedPrompt' -count=1`

Expected: FAIL because the focused API is absent.

- [ ] **Step 3: Implement focused extraction**

Add:

```go
type LatestUserPrompt struct {
    RedactedPrompt string
    PromptHash     string
    PromptLength   int
    Truncated      bool
}

func ExtractLatestUserPromptSnapshot(req Request) (LatestUserPrompt, error)
func RedactCapturedPrompt(value string) string
```

Reuse protocol parsing and content helpers, select only the last human-authored user turn, and explicitly ignore tool-result blocks. Redact the complete extracted value, cap the redacted UTF-8 text to 64 KiB, then calculate SHA-256 from retained text.

- [ ] **Step 4: Run security-audit tests**

Run: `cd backend && go test ./internal/securityaudit -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/securityaudit/prompt_snapshot.go backend/internal/securityaudit/prompt_snapshot_test.go
git commit -m "feat: extract redacted latest user prompts"
```

### Task 3: Implement capture repository and independent grants

**Files:**
- Create: `backend/internal/service/user_group_prompt_capture.go`
- Create: `backend/internal/repository/user_group_prompt_capture_repo.go`
- Create: `backend/internal/repository/user_group_prompt_capture_repo_test.go`
- Modify: `backend/internal/repository/wire.go`

- [ ] **Step 1: Write failing repository tests**

Test `LoadEligibility`, `ReplacePromptViewers`, `CanViewPrompt`, transactional `InsertCapture`, `ListUsagePrompts`, and `DeleteExpiredBatch`. Require details to match `usage_logs.id`, user ID, request ID, business-group association, and `expires_at > NOW()`.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend && go test ./internal/repository -run 'TestUserGroupPromptCaptureRepository' -count=1`

Expected: FAIL because the repository is undefined.

- [ ] **Step 3: Define the service port**

```go
type UserGroupPromptCaptureRepository interface {
    LoadEligibility(ctx context.Context) (map[int64][]int64, error)
    SetCaptureEnabled(ctx context.Context, groupID int64, enabled bool) error
    ListPromptViewers(ctx context.Context, groupID int64) ([]UserGroupViewer, error)
    ReplacePromptViewers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error
    CanViewPrompt(ctx context.Context, groupID, actorID int64) (bool, error)
    InsertCapture(ctx context.Context, capture UserPromptCaptureWrite) error
    PromptAvailableForUsage(ctx context.Context, groupID, usageLogID int64) (bool, error)
    ListUsagePrompts(ctx context.Context, groupID, usageLogID int64) ([]UserPromptCaptureDetail, error)
    DeleteExpiredBatch(ctx context.Context, now time.Time, limit int) (int64, error)
}
```

- [ ] **Step 4: Implement the PostgreSQL adapter**

Use one transaction and `ON CONFLICT (event_id) DO NOTHING` for capture insertion; insert associations after selecting the capture by event ID. Use `FOR UPDATE` plus current user validation when replacing grants. Filter expired rows in both availability and detail queries.

- [ ] **Step 5: Run repository tests**

Run: `cd backend && go test ./internal/repository -run 'TestUserGroupPromptCaptureRepository' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/service/user_group_prompt_capture.go backend/internal/repository/user_group_prompt_capture_repo.go backend/internal/repository/user_group_prompt_capture_repo_test.go backend/internal/repository/wire.go
git commit -m "feat: persist scoped user group prompts"
```

### Task 4: Build the bounded asynchronous runtime

**Files:**
- Modify: `backend/internal/service/user_group_prompt_capture.go`
- Create: `backend/internal/service/user_group_prompt_capture_test.go`
- Modify: `backend/internal/service/wire.go`
- Modify: `backend/cmd/server/wire.go`

- [ ] **Step 1: Write failing runtime tests**

Use repository and Redis stubs to prove: caller-side dispatch performs no repository call; ineligible users skip; two eligible groups produce one write; queue-full drops without waiting; extraction/storage failures do not panic; expiry is exactly 14 days; cleanup is bounded; and `Stop(ctx)` respects its deadline.

- [ ] **Step 2: Run focused service tests and verify they fail**

Run: `cd backend && go test ./internal/service -run 'TestUserGroupPromptCapture' -count=1`

Expected: FAIL because the runtime is incomplete.

- [ ] **Step 3: Implement lifecycle and eligibility**

Expose:

```go
func (s *UserGroupPromptCaptureService) Start(ctx context.Context) error
func (s *UserGroupPromptCaptureService) Dispatch(req securityaudit.Request)
func (s *UserGroupPromptCaptureService) RefreshEligibility(ctx context.Context) error
func (s *UserGroupPromptCaptureService) PublishEligibilityInvalidation(ctx context.Context) error
func (s *UserGroupPromptCaptureService) Stop(ctx context.Context) error
```

Use `atomic.Value` for immutable eligibility maps, a bounded channel of 2048 tasks, two workers, three in-memory persistence attempts, hourly cleanup with 1000-row batches, Redis pub/sub invalidation, and one-minute reconciliation. Raw bodies remain only in queue memory.

- [ ] **Step 4: Wire startup and shutdown**

Provide and start the runtime from `service.ProviderSet`. Add it to `provideCleanup` before Redis/database shutdown, using the existing ten-second shutdown context.

- [ ] **Step 5: Run service tests**

Run: `cd backend && go test ./internal/service -run 'TestUserGroupPromptCapture' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/service/user_group_prompt_capture.go backend/internal/service/user_group_prompt_capture_test.go backend/internal/service/wire.go backend/cmd/server/wire.go
git commit -m "feat: run prompt capture asynchronously"
```

### Task 5: Dispatch supported gateway inputs without blocking

**Files:**
- Modify: `backend/internal/handler/security_audit_helper.go`
- Modify: `backend/internal/handler/security_audit_helper_test.go`
- Modify: `backend/internal/handler/gateway_handler.go`
- Modify: `backend/internal/handler/openai_gateway_handler.go`
- Modify: `backend/internal/handler/wire.go`
- Modify: generated `backend/cmd/server/wire_gen.go`

- [ ] **Step 1: Write failing handler tests**

Add a dispatcher spy and prove capture happens before a blocking audit decision, still happens when Prompt Audit is off, occurs once per HTTP request, and occurs once per WebSocket turn.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend && go test ./internal/handler -run 'TestUserGroupPromptCaptureDispatch' -count=1`

Expected: FAIL because handlers have no dispatcher.

- [ ] **Step 3: Add a narrow dispatcher hook**

```go
type userPromptCaptureDispatcher interface {
    Dispatch(securityaudit.Request)
}
```

Store it on both gateway handlers. In `runSecurityAudit`, build the existing request and dispatch before coordinator/legacy evaluation. Keep a capture-specific HTTP context key separate from the existing audit-completion key; WebSocket stages remain per-turn.

- [ ] **Step 4: Regenerate Wire and run tests**

Run: `cd backend && go generate ./cmd/server && go test ./internal/handler ./cmd/server -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handler/security_audit_helper.go backend/internal/handler/security_audit_helper_test.go backend/internal/handler/gateway_handler.go backend/internal/handler/openai_gateway_handler.go backend/internal/handler/wire.go backend/cmd/server/wire_gen.go
git commit -m "feat: enqueue user group prompts at gateway"
```

### Task 6: Add Prompt authorization and H5 backend APIs

**Files:**
- Modify: `backend/internal/service/user_group.go`
- Modify: `backend/internal/service/user_group_service_test.go`
- Modify: `backend/internal/repository/user_group_repo.go`
- Modify: `backend/internal/repository/user_group_repo_test.go`
- Modify: `backend/internal/handler/user_group_handler.go`
- Modify: `backend/internal/handler/user_group_handler_test.go`
- Modify: `backend/internal/server/routes/user.go`
- Modify: `backend/internal/server/routes/user_group_routes_test.go`
- Modify: `backend/internal/server/middleware/audit_log.go`
- Modify: `backend/internal/server/middleware/audit_log_test.go`

- [ ] **Step 1: Write failing permission and route tests**

Cover administrators without Prompt grants, administrators with grants, ordinary viewers without Prompt grants, Prompt-granted users without ordinary group access, dual-granted users, forged usage IDs, archived groups, and atomic viewer replacement. Assert audit data contains no Prompt text.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd backend && go test ./internal/service ./internal/handler ./internal/server/routes ./internal/server/middleware -run 'TestUserGroup.*Prompt|Test.*Prompt.*Audit' -count=1`

Expected: FAIL because methods/routes are absent.

- [ ] **Step 3: Extend service authorization**

Add `PromptCaptureEnabled` and actor-specific `CanViewPrompt` to `UserGroup`, and authorized `PromptAvailable` to usage items. Add admin-only setting/grant methods and `GetUsagePrompts`. That read must call both ordinary `requireRead` and explicit `CanViewPrompt`; `actor.IsAdmin()` must not bypass the Prompt grant.

- [ ] **Step 4: Register endpoints**

```text
PUT /api/v1/user-groups/:id/prompt-capture
GET /api/v1/user-groups/:id/prompt-viewers
PUT /api/v1/user-groups/:id/prompt-viewers
GET /api/v1/user-groups/:id/usage/:usageLogID/prompts
```

Set stable audit actions `user_group.prompt_capture.update`, `user_group.prompt_viewers.update`, and `user_group.prompt.view`; add the detail GET to `auditSensitiveReads`.

- [ ] **Step 5: Refresh eligibility after mutations**

After member replacement, capture toggle, or archive, refresh locally and publish invalidation. Log publication failures without rolling back committed administrator mutations; periodic reconciliation repairs peers.

- [ ] **Step 6: Run focused backend tests**

Run: `cd backend && go test ./internal/service ./internal/repository ./internal/handler ./internal/server/routes ./internal/server/middleware -count=1`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/service/user_group.go backend/internal/service/user_group_service_test.go backend/internal/repository/user_group_repo.go backend/internal/repository/user_group_repo_test.go backend/internal/handler/user_group_handler.go backend/internal/handler/user_group_handler_test.go backend/internal/server/routes/user.go backend/internal/server/routes/user_group_routes_test.go backend/internal/server/middleware/audit_log.go backend/internal/server/middleware/audit_log_test.go
git commit -m "feat: authorize user group prompt access"
```

### Task 7: Add H5 API contracts and administrator settings modal

**Files:**
- Modify: `frontend/src/types/userGroups.ts`
- Modify: `frontend/src/api/userGroups.ts`
- Modify: `frontend/src/api/__tests__/userGroups.spec.ts`
- Create: `frontend/src/views/user-groups/components/UserGroupPromptSettingsDialog.vue`
- Modify: `frontend/src/views/user-groups/UserGroupsView.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts`
- Modify: both user-group locale files

- [ ] **Step 1: Write failing API and view tests**

Assert exact URLs/bodies for capture toggle and Prompt viewer replacement. Assert only administrators see the security-settings icon, opening it loads independent Prompt viewers, saving does not alter ordinary viewers, and no member-facing collection notice appears.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd frontend && npm run test:run -- src/api/__tests__/userGroups.spec.ts src/views/user-groups/__tests__/UserGroupsView.spec.ts`

Expected: FAIL because methods and modal are missing.

- [ ] **Step 3: Add typed API methods**

Add `setPromptCapture(groupId, enabled)`, `getPromptViewers(groupId)`, and `replacePromptViewers(groupId, userIds)`. Extend `UserGroup` with optional `prompt_capture_enabled` and required `can_view_prompt`.

- [ ] **Step 4: Implement settings modal**

Reuse current modal/people selection patterns. Keep capture status, fixed 14-day copy, and independent viewer selection in one dialog. Disable save during requests, support established backdrop/Escape close behavior, and report errors through the app store.

- [ ] **Step 5: Run focused tests**

Run: `cd frontend && npm run test:run -- src/api/__tests__/userGroups.spec.ts src/views/user-groups/__tests__/UserGroupsView.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/userGroups.ts frontend/src/api/userGroups.ts frontend/src/api/__tests__/userGroups.spec.ts frontend/src/views/user-groups/components/UserGroupPromptSettingsDialog.vue frontend/src/views/user-groups/UserGroupsView.vue frontend/src/views/user-groups/__tests__/UserGroupsView.spec.ts frontend/src/i18n/locales/zh/userGroups.ts frontend/src/i18n/locales/en/userGroups.ts
git commit -m "feat(h5): manage user group prompt capture"
```

### Task 8: Add the authorized Prompt detail modal

**Files:**
- Create: `frontend/src/views/user-groups/components/UserGroupPromptDetailDialog.vue`
- Modify: `frontend/src/views/user-groups/UserGroupUsageView.vue`
- Modify: `frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`
- Modify: `frontend/src/types/userGroups.ts`
- Modify: `frontend/src/api/userGroups.ts`
- Modify: `frontend/src/api/__tests__/userGroups.spec.ts`
- Modify: both user-group locale files

- [ ] **Step 1: Write failing detail tests**

Assert the icon appears only when `can_view_prompt` and `prompt_available` are true; clicking calls `/user-groups/7/usage/1/prompts`; the modal orders turns, renders redaction/truncation/expiry metadata, closes on backdrop/Escape, and shows not-collected-or-expired, forbidden, loading, and retry states.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd frontend && npm run test:run -- src/api/__tests__/userGroups.spec.ts src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`

Expected: FAIL because detail support is absent.

- [ ] **Step 3: Add detail DTO and API**

```ts
export interface UserGroupPromptDetail {
  id: number
  request_id: string
  protocol: string
  model: string
  stage: string
  redacted_prompt: string
  prompt_length: number
  truncated: boolean
  captured_at: string
  expires_at: string
}
```

Add `getUsagePrompts(groupId, usageLogId)` and optional `prompt_available` on usage items.

- [ ] **Step 4: Implement responsive detail UX**

Use a familiar details/eye icon with tooltip, stable row columns, scrollable modal body, normal-sized text, preserved whitespace, and no dedicated bulk-copy/export action. Keep page scrolling rather than shrinking content.

- [ ] **Step 5: Run focused tests**

Run: `cd frontend && npm run test:run -- src/api/__tests__/userGroups.spec.ts src/views/user-groups/__tests__/UserGroupUsageView.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/user-groups/components/UserGroupPromptDetailDialog.vue frontend/src/views/user-groups/UserGroupUsageView.vue frontend/src/views/user-groups/__tests__/UserGroupUsageView.spec.ts frontend/src/types/userGroups.ts frontend/src/api/userGroups.ts frontend/src/api/__tests__/userGroups.spec.ts frontend/src/i18n/locales/zh/userGroups.ts frontend/src/i18n/locales/en/userGroups.ts
git commit -m "feat(h5): inspect scoped user prompts"
```

### Task 9: Regenerate and verify end to end

**Files:**
- Modify: generated `backend/cmd/server/wire_gen.go`
- Modify the approved design spec only if implementation uncovers a factual correction

- [ ] **Step 1: Regenerate and format**

Run:

```bash
cd backend
go generate ./cmd/server
go fmt ./...
```

Expected: both commands succeed.

- [ ] **Step 2: Run focused backend suites**

Run: `cd backend && go test ./migrations ./internal/securityaudit ./internal/service ./internal/repository ./internal/handler ./internal/server/middleware ./internal/server/routes ./cmd/server -count=1`

Expected: PASS.

- [ ] **Step 3: Run complete backend tests**

Run: `cd backend && go test ./... -count=1`

Expected: PASS, or record any exact unrelated pre-existing failure and prove it does not involve this feature.

- [ ] **Step 4: Run frontend verification**

```bash
cd frontend
npm run test:run
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 5: Verify in a clean browser**

Check administrator without grant, administrator with grant, dual-granted ordinary user, and unauthorized states at wide desktop and narrow widths. Confirm no horizontal page overflow, no member-facing capture notice, and no console error.

- [ ] **Step 6: Review data-safety invariants**

Run:

```bash
rg -n "redacted_prompt|FullPrompt|Request.Body|zap\.(String|ByteString).*prompt" backend/internal
```

Expected: this module persists only `redacted_prompt`; it never logs or stores raw bodies in Redis. Prompt Audit's separately approved `FullPrompt` remains unchanged.

- [ ] **Step 7: Commit final generated corrections when files changed**

```bash
git diff --quiet -- backend/cmd/server/wire_gen.go docs/superpowers/specs/2026-08-03-user-group-prompt-capture-design.md || {
  git add backend/cmd/server/wire_gen.go docs/superpowers/specs/2026-08-03-user-group-prompt-capture-design.md
  git commit -m "test: verify user group prompt capture"
}
```
