# User Group Prompt Capture Design

## Scope

This feature adds short-lived, permission-scoped prompt collection to the H5 user-group usage workspace. It exists to support later investigation of potentially unlawful AI usage while minimizing latency, retained data, and access.

The feature applies only to business-level groups stored in `user_groups`. It must not confuse those groups with the existing API billing/model `groups` table used by Prompt Audit.

The first release includes:

1. A per-user-group prompt-capture switch, disabled by default.
2. An independent per-group Prompt viewer grant list.
3. Non-blocking collection of the latest user-authored text from new gateway requests.
4. Irreversible redaction before persistence.
5. Prompt detail access from user-group request details.
6. Fixed 14-day online retention and automatic cleanup.
7. Audit logs and operational metrics for sensitive reads and capture health.

The first release does not include model replies, system/developer instructions, tool inputs or outputs, image/file contents, full-text search, bulk export, historical backfill, recoverable original text, or member-facing collection notices.

## Confirmed Product Decisions

- Prompt access is independent from ordinary user-group viewing access.
- Administrators manage capture settings and Prompt viewer grants, but administrators cannot read Prompt content unless explicitly granted.
- Administrators may grant Prompt access to themselves. Grant changes and content reads are audited.
- Capture is configured independently per user group and defaults to off.
- Enabling capture affects only new requests. Disabling it stops new collection; previously collected rows remain until their individual expiry times.
- Only the latest user-authored text in each request is collected. Repeated historical user messages are not stored again.
- Sensitive values are irreversibly redacted before database persistence. No recoverable original Prompt is retained.
- Captured Prompt data expires 14 days after capture. The retention period is fixed in the first release and is not an administrator setting.
- Collection is best effort and asynchronous. It must never block or fail an AI request. A process crash or full queue may lose a small number of pending captures.
- Group members are not shown a capture notice in the application. Product owners are responsible for confirming that deployment policies and applicable law permit this behavior.

## Authorization Model

Existing `user_group_viewer_grants` continue to authorize members, subscriptions, and usage reports. They do not authorize Prompt content.

The new `user_group_prompt_viewer_grants` relation is the only grant that permits a user to load captured Prompt content for a group. Frontend visibility is only a usability control; every sensitive request is authorized again in the backend service.

| Operation | Administrator without Prompt grant | Administrator with Prompt grant | Ordinary group viewer | Prompt viewer | Other user |
| --- | --- | --- | --- | --- | --- |
| Read group usage | Yes | Yes | Yes | Only if also a group viewer | No |
| Enable or disable capture | Yes | Yes | No | No | No |
| Manage Prompt viewers | Yes | Yes | No | No | No |
| See Prompt availability/details control | No | Yes | No | Yes, when group usage is also readable | No |
| Load Prompt content | No | Yes | No | Yes, when group usage is also readable | No |

A Prompt grant does not implicitly grant access to the rest of the user group. To reach request details, an ordinary user must have both an ordinary group viewer grant and a Prompt viewer grant. Administrators already have group usage access but still require the Prompt grant.

Sensitive APIs must verify all of the following:

1. The actor can read the requested business user group.
2. The actor has an explicit Prompt viewer grant for that group.
3. The requested usage-log row belongs to a member of that group under the existing usage-report rules.
4. The returned capture is associated with that same business user group, user, and request ID.

Failure must not reveal whether Prompt content exists in another group. Unauthorized and cross-scope requests return the project's standard forbidden/not-found response without Prompt metadata.

## Data Model

### `user_groups`

Add:

- `prompt_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE`

Archived groups cannot enable capture. Archiving a group disables capture as part of the same service operation, while existing captures continue to expire normally.

### `user_group_prompt_viewer_grants`

- `user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE`
- `viewer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Primary key `(user_group_id, viewer_user_id)`
- Index `(viewer_user_id, user_group_id)` for capability checks

This table is deliberately separate from `user_group_viewer_grants`. The first release does not introduce a generalized role/permission framework.

### `user_prompt_captures`

- `id BIGSERIAL PRIMARY KEY`
- `event_id UUID NOT NULL UNIQUE`, generated before enqueue for idempotent worker retries
- `request_id VARCHAR(128) NOT NULL`
- `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `protocol VARCHAR(64) NOT NULL DEFAULT ''`
- `model VARCHAR(255) NOT NULL DEFAULT ''`
- `stage VARCHAR(32) NOT NULL DEFAULT 'http'`
- `redacted_prompt TEXT NOT NULL`
- `prompt_hash VARCHAR(64) NOT NULL`, calculated from the retained redacted text
- `prompt_length INT NOT NULL`, retained Unicode rune count after truncation
- `truncated BOOLEAN NOT NULL DEFAULT FALSE`
- `captured_at TIMESTAMPTZ NOT NULL`
- `expires_at TIMESTAMPTZ NOT NULL`, always `captured_at + 14 days`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:

- `(user_id, request_id, captured_at, id)` for request-detail lookup
- `(expires_at, id)` for retention cleanup

The retained `redacted_prompt` is limited to 64 KiB at a valid UTF-8 boundary. Redaction runs before truncation so a secret crossing the eventual boundary cannot leak. Empty retained content is not inserted.

### `user_group_prompt_captures`

- `capture_id BIGINT NOT NULL REFERENCES user_prompt_captures(id) ON DELETE CASCADE`
- `user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE`
- Primary key `(capture_id, user_group_id)`
- Index `(user_group_id, capture_id)`

One capture can be associated with multiple enabled groups without duplicating its text. If deleting group associations leaves a capture orphaned, cleanup may delete it immediately; otherwise it remains until `expires_at`.

## Capture Semantics

The existing `securityaudit` protocol parsers are reused through a new focused API rather than by querying `prompt_audit_events`. Prompt Audit remains independently configurable and may be off or may omit passing events, so it is not a complete source for user-group request details.

The focused extractor returns only the latest human-authored user turn:

- Chat Completions and Anthropic Messages: the final `user` message's textual blocks.
- OpenAI Responses: the latest user input or plain-string input for the current request.
- Gemini: the final user-role text parts.
- Image/media requests: the current user-authored textual prompt only.
- WebSocket Responses: each accepted `response.create` turn is a separate capture ordered by `captured_at`.

The extractor excludes system and developer instructions, assistant/model messages, tool calls, tool inputs, tool results, images, files, audio, and other binary content. A user-role container that contains only tool results does not count as a user-authored text turn.

The initial redaction rules cover, at minimum:

- Bearer tokens, API keys, access tokens, secrets, and password-like values
- Cookie and authorization header values embedded in text
- Email addresses and phone numbers
- Mainland China identity-card-like values
- Payment-card-like values

Redaction uses stable category markers such as `[REDACTED_EMAIL]`, not partially preserved source values. Tests must cover mixed case, common separators, Unicode text, and multiple sensitive values in one Prompt. Redaction is a data-minimization measure, not a guarantee that every possible personal identifier can be detected.

## Asynchronous Data Flow

1. Authenticated gateway handling already has the user, request ID, protocol, model, stage, and request body.
2. A process-local, read-optimized eligibility snapshot determines whether the user belongs to one or more active groups with capture enabled.
3. If no enabled group is present, the dispatcher returns immediately.
4. Otherwise the dispatcher copies the minimum required request data, assigns `event_id` and `captured_at`, snapshots the eligible business group IDs, and performs a non-blocking send to a bounded in-memory queue.
5. A background worker extracts the latest user turn, irreversibly redacts it, applies the 64 KiB cap, and writes the capture plus all group associations in one transaction.
6. Temporary raw request bytes exist only in process memory. They are cleared by normal garbage collection after processing and are never written to PostgreSQL, Redis, logs, traces, metrics, or retry storage.

Membership and capture-setting mutations update the local eligibility snapshot after their database transaction commits and publish an invalidation to other application instances. Instances also reconcile the snapshot periodically so a lost invalidation heals automatically. The request-path lookup performs no database or Redis round trip.

The queue is deliberately best effort:

- A full or unavailable queue increments a drop metric and returns immediately.
- Parsing, redaction, and persistence failures are logged without raw Prompt content.
- A database failure may be retried briefly in the worker using `event_id` for idempotency.
- Retries remain in memory only and stop after a small bounded attempt count.
- Capture health never changes the gateway response, billing, account selection, or upstream call.

This design prioritizes request latency over perfect collection. Deployments must treat capture counts as investigative aids rather than a complete legal record.

## Retention and Cleanup

A dedicated cleanup worker runs once at startup and then hourly. It deletes expired captures in bounded batches ordered by `(expires_at, id)`. Deleting a capture cascades to group associations. Multiple application instances coordinate with a PostgreSQL advisory lock or equivalent existing cleanup pattern so only one active cleanup pass runs at a time.

All availability and detail queries require `expires_at > NOW()`. Content therefore becomes inaccessible exactly at its 14-day expiry even when the hourly physical deletion pass has not removed the row yet.

Cleanup requirements:

- Delete only rows where `expires_at <= NOW()`.
- Use bounded transactions so cleanup does not hold long locks.
- Continue batches until no expired rows remain or the run reaches a conservative work limit; the next hourly run resumes.
- Record deleted-row counts, duration, and failures without Prompt content.
- Capture-setting changes and grant deletion do not extend retention.
- Manual per-row deletion and retention configuration are outside the first release.

The 14-day guarantee applies to the online application tables. Database backup retention is an operational concern outside this feature; deployments that require deletion from backups must align their backup lifecycle separately.

## Backend API

All endpoints require authenticated user sessions. Administrator mutations use the existing administrator authorization policy, not frontend role checks.

### Group and capability responses

Group responses gain:

- `prompt_capture_enabled`, visible to administrators; ordinary responses may omit it.
- `can_view_prompt`, computed for the current actor from an explicit Prompt grant and returned per group.

The global user-group capability response may add `can_view_any_prompt` for navigation/state convenience, but group-specific authorization remains authoritative.

### Capture administration

- `PUT /user-groups/:id/prompt-capture` (administrator)
  - Body: `{ "enabled": true | false }`
  - Reject enabling an archived group.
- `GET /user-groups/:id/prompt-viewers` (administrator)
  - Returns the independent Prompt viewer list.
- `PUT /user-groups/:id/prompt-viewers` (administrator)
  - Body: `{ "user_ids": number[] }`
  - Replaces the complete grant set atomically; an empty array clears it.

Ordinary group viewers cannot list Prompt viewers. Administrators can manage these endpoints without having Prompt read permission.

### Usage and Prompt details

`GET /user-groups/:id/usage` retains its existing behavior. For actors with Prompt permission, each detail item additionally includes `prompt_available`. The field is omitted for actors without Prompt permission so the response does not expose capture state unnecessarily.

- `GET /user-groups/:id/usage/:usage_log_id/prompts`
  - Loads the usage row server-side; the client cannot substitute an arbitrary request ID.
  - Returns captures matching the usage row's user and request ID and associated with the requested business group.
  - Orders multiple turns by `captured_at`, then ID.
  - Returns metadata, redacted content, truncation state, capture time, and expiry time.
  - Does not return raw request bodies or Prompt Audit findings.

A successful sensitive detail read records `user_group.prompt.view` with actor ID, group ID, usage-log ID, request ID, returned capture count, IP, and request metadata. The audit entry never contains Prompt text or hashes. Capture toggles and grant replacement record separate `user_group.prompt_capture.update` and `user_group.prompt_viewers.update` actions.

## H5 Interface

The existing user-group management modal gains a visually separate Prompt collection section rather than another page or drawer:

- Capture toggle with default-off state
- Static description: latest user text only, pre-storage redaction, 14-day retention
- Independent Prompt viewer selector
- Clear distinction from ordinary user-group viewers

The interface does not show capture state or notices to group members. An administrator without Prompt permission can manage the section but cannot open content.

The request-detail table gains a compact details icon only for actors with Prompt permission. When `prompt_available` is false, the control may be disabled with an appropriate unavailable tooltip instead of performing a pointless request.

The details modal uses existing H5 modal, typography, spacing, dark-mode, and responsive patterns. It displays:

- Member identity from the authorized usage record
- Model, request ID, and request time
- Chronologically ordered user turns
- Visible redaction markers
- Truncation warning when applicable
- Capture and expiry times

An authorized request with no live capture shows one combined state: "Prompt was not collected or has expired." The system cannot reliably distinguish capture-disabled, queue-drop, parser-skip, and already-deleted cases without retaining additional long-lived tracking data. Forbidden requests remain a separate authorization error. The modal does not provide bulk export or an unredacted-content control. Normal text selection is acceptable; a dedicated mass-copy action is not added in the first release.

## Failure Handling and Observability

Capture operations expose metrics for:

- queue depth and capacity
- enqueued tasks
- successfully persisted captures
- no-enabled-group skips
- no-user-text skips
- queue-full drops
- parse/redaction failures
- persistence failures and retries
- cleanup deletions and failures

Logs contain event ID, request ID, user ID, group IDs, protocol, stage, failure code, and sizes where useful, but never contain raw or redacted Prompt content. Metrics labels must avoid user IDs, request IDs, models with unbounded cardinality, or Prompt-derived values.

Startup and shutdown integrate with the existing server lifecycle. Shutdown stops intake, drains the queue for a short bounded interval, and then exits without delaying server termination indefinitely.

## Testing

Backend unit and integration coverage must include:

- Latest-turn extraction for Chat Completions, Anthropic Messages, OpenAI Responses HTTP/WebSocket, Gemini, and media prompts
- Exclusion of historical user turns, system/developer text, assistant/model text, tool inputs/results, and binary content
- Every redaction category, multiple categories, Unicode, and boundary truncation
- Eligibility snapshot updates for group membership, group archive, and capture toggle changes
- Multi-group association without duplicated Prompt text
- Event-ID idempotency and transactional capture/association writes
- Fixed expiry calculation and batched multi-instance-safe cleanup
- Queue-full, parser failure, database failure, retry, shutdown, and worker panic isolation without gateway failure
- The complete authorization matrix, including administrators without grants, Prompt viewers without ordinary group access, forged group IDs, forged usage-log IDs, and cross-user request IDs
- Audit entries for reads and mutations with assertions that Prompt content is absent

Frontend coverage must include:

- Administrator capture controls and independent viewer selection
- No member-facing collection notice
- Details-control visibility for each permission combination
- Available, not-collected-or-expired, truncated, forbidden, loading, and error modal states
- Desktop and mobile layout without horizontal page overflow

Verification before release includes focused backend tests, the complete backend suite, frontend unit tests, typecheck, production build, and clean-browser checks for administrator, ordinary viewer, dual-granted Prompt viewer, and unauthorized states.

## Acceptance Criteria

1. Enabling capture for one business user group collects only new latest-turn user text for members of that group.
2. Normal AI requests never wait for parsing, redaction, Redis, or PostgreSQL capture work.
3. No original or recoverable Prompt text reaches persistent storage or logs.
4. A user with only ordinary group viewing permission cannot infer or load Prompt content.
5. An administrator without an explicit Prompt grant cannot load Prompt content.
6. A dual-authorized Prompt viewer can open the correct request detail without accessing another group, user, or request through parameter tampering.
7. A member in multiple enabled groups produces one capture row with multiple group associations.
8. Disabling capture prevents new queue entries after the eligibility snapshot update and does not extend existing retention.
9. Prompt content becomes unreadable exactly at 14 days and expired rows are physically removed by the next bounded cleanup pass without long database locks.
10. Capture overload, process restart, or worker failure may lose capture data but cannot change gateway success, latency materially, billing, or upstream behavior.
