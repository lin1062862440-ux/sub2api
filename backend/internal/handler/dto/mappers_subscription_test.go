package dto

import (
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestUserSubscriptionFromServiceAdminIncludesTeamQuotaAllocation(t *testing.T) {
	ownerGroupID := int64(7)
	limit := 300.0
	usage := 120.5
	windowStart := time.Date(2026, time.August, 3, 16, 0, 0, 0, time.UTC)

	out := UserSubscriptionFromServiceAdmin(&service.UserSubscription{
		ID:                    11,
		OwnerUserGroupID:      &ownerGroupID,
		TeamWeeklyLimitUSD:    &limit,
		TeamWeeklyUsageUSD:    &usage,
		TeamWeeklyWindowStart: &windowStart,
	})

	require.NotNil(t, out)
	require.Equal(t, ownerGroupID, *out.OwnerUserGroupID)
	require.Equal(t, limit, *out.TeamWeeklyLimitUSD)
	require.Equal(t, usage, *out.TeamWeeklyUsageUSD)
	require.Equal(t, windowStart, *out.TeamWeeklyWindowStart)
}

func TestUserSubscriptionFromServiceIncludesOwnTeamQuotaAllocation(t *testing.T) {
	ownerGroupID := int64(7)
	limit := 300.0
	usage := 120.5
	windowStart := time.Date(2026, time.August, 3, 16, 0, 0, 0, time.UTC)

	out := UserSubscriptionFromService(&service.UserSubscription{
		ID:                    11,
		OwnerUserGroupID:      &ownerGroupID,
		TeamWeeklyLimitUSD:    &limit,
		TeamWeeklyUsageUSD:    &usage,
		TeamWeeklyWindowStart: &windowStart,
	})

	require.NotNil(t, out)
	require.Equal(t, limit, *out.TeamWeeklyLimitUSD)
	require.Equal(t, usage, *out.TeamWeeklyUsageUSD)
	require.Equal(t, windowStart, *out.TeamWeeklyWindowStart)
}
