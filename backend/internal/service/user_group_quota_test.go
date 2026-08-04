package service

import (
	"context"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type userGroupQuotaRepositoryStub struct {
	managedCount int64
	canManage    bool
	overview     *UserGroupQuotaOverview
	state        *UserGroupQuotaState
	policy       UserGroupQuotaPolicyMutation
	memberQuotas []UserGroupMemberQuotaMutation
	incremented  float64
	resetAt      time.Time
}

func (s *userGroupQuotaRepositoryStub) CountManaged(context.Context, int64) (int64, error) {
	return s.managedCount, nil
}
func (s *userGroupQuotaRepositoryStub) CanManage(context.Context, int64, int64) (bool, error) {
	return s.canManage, nil
}
func (s *userGroupQuotaRepositoryStub) GetOverview(context.Context, int64, time.Time) (*UserGroupQuotaOverview, error) {
	return s.overview, nil
}
func (s *userGroupQuotaRepositoryStub) SetPolicy(_ context.Context, _ int64, mutation UserGroupQuotaPolicyMutation, _ int64, _ time.Time) error {
	s.policy = mutation
	return nil
}
func (s *userGroupQuotaRepositoryStub) ReplaceManagers(context.Context, int64, []int64, int64) error {
	return nil
}
func (s *userGroupQuotaRepositoryStub) UpdateMemberQuotas(_ context.Context, _ int64, mutations []UserGroupMemberQuotaMutation, _ int64, _ time.Time) error {
	s.memberQuotas = append([]UserGroupMemberQuotaMutation(nil), mutations...)
	return nil
}
func (s *userGroupQuotaRepositoryStub) GetUserQuotaState(context.Context, int64, int64, int64, time.Time) (*UserGroupQuotaState, error) {
	return s.state, nil
}
func (s *userGroupQuotaRepositoryStub) IncrementUsage(_ context.Context, _, _, _ int64, amount float64, _ time.Time) error {
	s.incremented += amount
	return nil
}
func (s *userGroupQuotaRepositoryStub) ResetUsage(_ context.Context, _ int64, _ int64, resetAt time.Time) error {
	s.resetAt = resetAt
	return nil
}

func TestCurrentUserGroupQuotaWeekUsesMondayInShanghai(t *testing.T) {
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	now := time.Date(2026, time.August, 4, 15, 30, 0, 0, shanghai)
	want := time.Date(2026, time.August, 2, 16, 0, 0, 0, time.UTC)
	require.Equal(t, want, CurrentUserGroupQuotaWeek(now))
}

func TestUserGroupQuotaEligibilityChecksPoolBeforeMember(t *testing.T) {
	repo := &userGroupQuotaRepositoryStub{state: &UserGroupQuotaState{
		GroupWeeklyLimit: 800, GroupWeeklyUsage: 800,
		MemberWeeklyLimit: 300, MemberWeeklyUsage: 300,
	}}
	svc := &BillingCacheService{userGroupQuotaRepo: repo}
	require.ErrorIs(t, svc.checkUserGroupQuotaEligibility(context.Background(), 5, 11, 7), ErrUserGroupWeeklyQuotaExceeded)

	repo.state.GroupWeeklyUsage = 500
	require.ErrorIs(t, svc.checkUserGroupQuotaEligibility(context.Background(), 5, 11, 7), ErrUserGroupMemberQuotaExceeded)

	repo.state.MemberWeeklyUsage = 299
	require.NoError(t, svc.checkUserGroupQuotaEligibility(context.Background(), 5, 11, 7))
}

func TestUserGroupQuotaManagerCanUpdateMemberAllocationsOnly(t *testing.T) {
	quotaRepo := &userGroupQuotaRepositoryStub{canManage: true}
	svc := NewUserGroupService(&userGroupRepositoryStub{canView: true})
	svc.quotaRepo = quotaRepo
	actor := UserGroupActor{UserID: 8, Role: RoleUser}

	err := svc.UpdateMemberQuotas(context.Background(), actor, 5, []UserGroupMemberQuotaMutation{
		{UserID: 9, WeeklyLimitUSD: 300},
		{UserID: 7, WeeklyLimitUSD: 200},
	})
	require.NoError(t, err)
	require.Equal(t, []UserGroupMemberQuotaMutation{
		{UserID: 7, WeeklyLimitUSD: 200},
		{UserID: 9, WeeklyLimitUSD: 300},
	}, quotaRepo.memberQuotas)

	err = svc.SetQuotaPolicy(context.Background(), actor, 5, UserGroupQuotaPolicyMutation{Enabled: true, WeeklyLimitUSD: 800})
	require.ErrorIs(t, err, ErrUserGroupForbidden)
}

func TestBillingCacheServiceIncrementUserGroupQuotaUsage(t *testing.T) {
	repo := &userGroupQuotaRepositoryStub{}
	svc := &BillingCacheService{userGroupQuotaRepo: repo}
	require.NoError(t, svc.IncrementUserGroupQuotaUsage(context.Background(), 5, 11, 7, 2.5))
	require.Equal(t, 2.5, repo.incremented)
}

func TestUserGroupQuotaManualResetIsAdminOnly(t *testing.T) {
	quotaRepo := &userGroupQuotaRepositoryStub{}
	svc := NewUserGroupService(&userGroupRepositoryStub{})
	svc.quotaRepo = quotaRepo

	err := svc.ResetQuotaUsage(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 5)
	require.ErrorIs(t, err, ErrUserGroupForbidden)
	require.True(t, quotaRepo.resetAt.IsZero())

	err = svc.ResetQuotaUsage(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 5)
	require.NoError(t, err)
	require.False(t, quotaRepo.resetAt.IsZero())
}

func TestNextUserGroupQuotaResetStaysOnMondayAfterManualReset(t *testing.T) {
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	manualReset := time.Date(2026, time.August, 6, 15, 30, 0, 0, shanghai)
	want := time.Date(2026, time.August, 9, 16, 0, 0, 0, time.UTC)
	require.Equal(t, want, NextUserGroupQuotaReset(manualReset))
}

func TestTeamSubscriptionGroupNeverFallsBackToPersonalBalance(t *testing.T) {
	svc := &BillingCacheService{cfg: &config.Config{}}
	group := &Group{ID: 11, SubscriptionType: SubscriptionTypeTeam}
	err := svc.CheckBillingEligibility(context.Background(), &User{ID: 7}, nil, group, nil, PlatformOpenAI)
	require.ErrorIs(t, err, ErrUserGroupQuotaMemberNotFound)
}
