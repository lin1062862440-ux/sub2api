# Desktop Usage Page Design

## Goal

Add a native desktop usage page that uses the existing authenticated user APIs while matching the current LinAI desktop visual system. The page should support quick analysis and detailed request troubleshooting without copying the H5 layout verbatim.

## Scope

The first version includes:

- A new `使用记录` sidebar entry and `/usage` desktop route.
- Shared time and request filters for summaries, charts, and detail rows.
- Compact usage totals for requests, tokens, actual cost, and average duration.
- A primary token trend plus model and group rankings.
- Paginated usage records.
- A user-safe error request tab and detail drawer when enabled by public settings.
- Loading, empty, partial failure, refresh, and automatic refresh states.

The first version does not include CSV export, column customization, admin-only account billing fields, or upstream account information.

## Information Architecture

The page uses the selected hybrid of layout A and layout C:

1. Page header with title, update time, and global refresh.
2. A compact filter toolbar.
3. A four-item summary strip: total requests, total tokens, actual cost, average duration.
4. An analysis workspace:
   - Token trend as the primary chart on the left.
   - Model ranking and group ranking stacked on the right.
5. A detail workspace with filters and tabs:
   - `用量明细`
   - `错误请求`, shown only when `allow_user_view_error_requests` is enabled.

The page uses one normal vertical scroll surface when the content is taller than the window. Tables expand to the current page of results instead of introducing a second nested scrollbar.

## Time Range

The time range control is a compact popover with these presets:

- 今天
- 昨天
- 近 24 小时
- 近 7 天
- 近 14 天
- 近 30 天
- 本月
- 上月

The popover also contains start and end date inputs and an `应用` command. `近 24 小时` uses hourly granularity. Other ranges select hourly or daily granularity from their duration. The selected range is shared by summaries, charts, rankings, usage rows, and error rows.

## Filters

Common filters remain visible:

- Time range
- API key
- Model
- Request type

An expandable `更多筛选` area contains:

- Group
- Billing type
- Billing mode

Changing a filter resets the relevant table to page one and refreshes all page data. Reset restores the default 24-hour range and clears non-time filters.

## Data Contracts

The desktop API layer will add trimmed types and bindings for:

- `GET /usage/stats`: summary totals and endpoint statistics.
- `GET /usage/dashboard/snapshot-v2`: trend and group statistics.
- `GET /usage/dashboard/models`: requested-model statistics.
- `GET /usage`: paginated usage records.
- `GET /usage/errors`: paginated, redacted error records.
- `GET /usage/errors/:id`: one user-owned, redacted error detail.
- `GET /keys`: API key filter options.
- `GET /groups/available`: group filter options.
- `GET /settings/public`: existing public settings extended with `allow_user_view_error_requests`.

All usage requests carry the same normalized filter fields where supported: `start_date`, `end_date`, `timezone`, `api_key_id`, `model`, `group_id`, `request_type`, `billing_type`, and `billing_mode`.

## Components

The page is split into focused components:

- `UsageView.vue`: owns filters, request coordination, refresh scheduling, and partial-failure state.
- `UsageRangePicker.vue`: preset and custom date popover.
- `UsageSummary.vue`: four compact totals.
- `UsageRanking.vue`: reusable model and group ranking.
- `UsageRecordsTable.vue`: paginated request rows.
- `UsageErrorsTable.vue`: paginated error rows.
- `UsageErrorDrawer.vue`: redacted error details.

The existing `TrendChart.vue` is reused for the primary trend rather than introducing a second chart language.

## Record Presentation

Usage rows show the fields most useful to end users:

- Time
- API key
- Model
- Request type
- Endpoint
- Token total with input/output detail
- Actual cost
- First-token latency
- Total duration

Error rows show:

- Time
- Status code
- Category
- API key
- Model
- Error summary

Selecting an error row opens a right-side drawer. The drawer displays only fields returned by the user-safe error detail endpoint, including the redacted error body and upstream status when present.

## Loading And Failure Behavior

- The initial page uses structural skeletons.
- Each API result is handled independently; one failed endpoint does not discard successful data.
- A compact notice lists sections that did not update.
- Empty charts explain that data appears after API calls.
- Empty tables distinguish no activity from filters that match no records.
- A sequence counter or abort controller prevents stale filter responses from replacing newer data.
- Manual refresh reloads all data immediately.
- Automatic refresh runs every 60 seconds and preserves the active tab, page, and table scroll position.

## Visual Direction

The page reuses the current desktop tokens, system sans typography, 7-8px radii, light surfaces, restrained semantic color, and Lucide icons. It avoids nested decorative cards and large stat tiles. The trend is the primary visual signal; rankings and records remain dense and operational.

## Verification

Targeted tests cover:

- Route and sidebar navigation.
- Preset and custom time ranges.
- Filter normalization and pagination reset.
- Shared filter propagation to every endpoint.
- Partial endpoint failure.
- Error tab visibility from public settings.
- Usage and error empty states.
- Error detail drawer loading and failure.
- Automatic and manual refresh behavior.

Visual verification covers at least `1280x720` and `1180x780`, confirms no page-level scrollbars, checks table-contained scrolling, and verifies no console errors.
