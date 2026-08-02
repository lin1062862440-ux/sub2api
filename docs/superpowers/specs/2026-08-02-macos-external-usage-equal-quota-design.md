# macOS External Usage Equal-Quota Design

## Scope

This change applies only to macOS system-external usage surfaces:

- the menu bar popover;
- the expanded floating window;
- the collapsed floating orb or bar;
- the menu bar title and quota ring.

The in-app usage-display settings remain a configuration surface and keep their existing application-theme presentation. Windows and Linux remain placeholders.

## Visual Direction

The menu bar popover and expanded floating window share one 352 by 352 detail-card presentation. The approved style follows the supplied reference:

- a restrained pale blue, green, and warm-white glass background;
- a 20 to 22 px outer radius with a light border and compact shadow;
- a small `LINAI · PRO` brand line, source name, and freshness indicator;
- clear vertical spacing and thin separators;
- blue remaining-quota progress bars with the percentage inside the fill;
- muted usage, limit, reset, and expiry metadata;
- no decorative action icons or external configuration controls.

The three configured appearances may continue to tint the background, text, and accent variables, but they must retain this shared geometry and hierarchy.

## Subscription Presentation

Subscription quotas use equal visual hierarchy. The previous oversized `剩余额度` metric and promoted longest-period quota are removed.

Configured quotas are ordered by shortest window first:

1. daily;
2. weekly;
3. monthly.

Each row displays:

- quota label;
- remaining-percentage progress bar;
- used and limit amounts;
- relative reset time.

The subscription expiry remains right-aligned at the bottom. Missing subscriptions and unlimited subscriptions retain explicit empty states without inventing quota values.

## Compact Subscription Value

All compact subscription surfaces resolve one quota through the same fallback order: daily, then weekly, then monthly.

That resolved quota drives:

- the collapsed floating orb percentage;
- the collapsed floating bar value;
- the macOS menu bar text;
- the macOS menu bar quota ring.

If no finite quota exists, the current unlimited or unavailable states remain unchanged. Balance mode continues to show the balance value and does not use quota fallback logic.

## Balance Presentation

Balance mode uses the same card shell and header as subscription mode. It keeps:

- available balance as the primary value;
- today, last seven days, and current month as three compact summary metrics;
- the shared freshness and stale-data treatment.

Balance mode does not render quota progress bars because it has no configured limit.

## Component Boundaries

- `resolveExternalQuotaPresentation` owns deterministic shortest-window ordering and fallback.
- `ExternalSubscriptionOverview` renders equal quota rows and expiry metadata.
- `ExternalUsageDetailCard` remains the shared card shell for menu bar and floating-window expansion.
- `MacOSFloatingWindow` consumes the same resolved primary quota for collapsed orb and bar values.
- The native macOS menu bar host receives the resolved compact percentage instead of independently choosing a quota.
- Surface-specific CSS controls only window hosting and collapsed controls; shared detail-card styling remains in the macOS external shared stylesheet.

## Error And Loading States

- Loading and refresh behavior remain unchanged.
- Stale data keeps the current stale indicator and notice.
- A selected subscription mismatch must show unavailable data rather than a previous subscription's percentage.
- Expansion failures keep the collapsed control usable.
- Missing reset or expiry timestamps use the existing explicit unknown or long-term labels.

## Verification

Focused tests must prove:

- daily is selected before weekly and monthly;
- weekly is selected when daily is absent;
- monthly is selected when both shorter windows are absent;
- equal quota rows render in daily, weekly, monthly order without the oversized metric;
- the floating orb and bar use the shortest configured quota;
- the menu bar title and ring use the same quota;
- balance rendering is unchanged semantically;
- the in-app settings surface is unaffected.

Complete desktop tests, TypeScript production build, Rust tests, and browser screenshots at the native 352 by 352 dimensions are required before packaging.
