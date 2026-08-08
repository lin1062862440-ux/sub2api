# User Group Member Usage Sorting

## Goal

Allow the member quota roster to switch between two useful weekly usage rankings: actual spend and quota utilization. Both rankings show the highest value first, with actual spend selected by default.

## Scope

- Apply the behavior to the web `UserGroupMembersView` member allocation roster shown in the supplied screenshot.
- Keep the existing quota API and backend response unchanged.
- Do not add persistence for the selected sort metric.
- Do not change member quota validation, editing, or save payloads.

## Interaction

- A two-option segmented control sits in the member allocation section header, immediately before the save button on desktop layouts and wrapping cleanly on compact layouts.
- The options are "Actual usage" and "Utilization". The control uses buttons with `aria-pressed` state and keeps both options visible so the active ranking is unambiguous.
- "Actual usage" is selected initially and ranks members by `weekly_usage_usd` in descending order.
- "Utilization" ranks members by persisted `weekly_usage_usd / weekly_limit_usd` in descending order. Zero-limit members with positive usage rank at 100%; zero-limit members with no usage rank at 0%, matching the existing progress display semantics.
- Both rankings are descending only. Equal values preserve the merged source order.
- Editing a member quota does not move rows while the input is active. Utilization sorting uses the persisted quota from the latest overview; after a successful save and quota refresh, the ranking reflects the saved quota.
- The selected metric is local view state and resets to "Actual usage" when the view is recreated.

## Data Flow

`workspaceMembers` continues to merge the member roster with quota-only member rows. A separate computed value creates a copied, sorted array for rendering:

1. Resolve each member's usage from `overview.members` by `user_id`.
2. Treat missing or non-finite usage as zero.
3. For actual-usage mode, compare the normalized usage values.
4. For utilization mode, compute the ratio from the persisted quota overview rather than editable draft input state.
5. Compare the selected metric in descending order and preserve the merged source order when values are equal.

Quota input state remains keyed by `user_id`, so changing display order cannot associate an edited limit with the wrong member. Saving continues to iterate the quota overview and submit the same payload shape.

## Testing

- Verify that members render from highest to lowest actual weekly usage on initial load.
- Verify that selecting utilization changes the order to highest utilization first and updates the pressed state.
- Verify that changing a quota draft does not reorder utilization-ranked rows before save.
- Keep the existing member quota editing and saving test green to prove sorting does not alter mutation behavior.
