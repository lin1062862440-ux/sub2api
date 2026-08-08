# User Group Member Usage Sorting

## Goal

Allow the member quota roster to sort by weekly usage, with highest usage shown first by default.

## Scope

- Apply the behavior to the web `UserGroupMembersView` member allocation roster shown in the supplied screenshot.
- Keep the existing quota API and backend response unchanged.
- Do not add persistence for the selected sort direction.
- Do not change member quota validation, editing, or save payloads.

## Interaction

- The roster initially sorts members by `weekly_usage_usd` in descending order.
- The "Weekly usage" column header is a button on desktop table layouts.
- Selecting the header toggles between descending and ascending order.
- The control exposes the current direction through `aria-sort`, accessible text, and the existing icon system.
- Compact layouts still receive the default sorted order even when the desktop table header is hidden.

## Data Flow

`workspaceMembers` continues to merge the member roster with quota-only member rows. A separate computed value creates a copied, sorted array for rendering:

1. Resolve each member's usage from `overview.members` by `user_id`.
2. Treat missing or non-finite usage as zero.
3. Compare usage according to the selected direction.
4. Preserve the merged source order when usage values are equal.

Quota input state remains keyed by `user_id`, so changing display order cannot associate an edited limit with the wrong member. Saving continues to iterate the quota overview and submit the same payload shape.

## Testing

- Verify that members render from highest to lowest weekly usage on initial load.
- Verify that selecting the usage header changes the order to lowest to highest and updates the accessible sort state.
- Keep the existing member quota editing and saving test green to prove sorting does not alter mutation behavior.

