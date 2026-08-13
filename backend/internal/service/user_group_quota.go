package service

import (
	"context"
	"math"
	"sort"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

var (
	ErrUserGroupQuotaInvalidLimit       = infraerrors.BadRequest("USER_GROUP_QUOTA_INVALID_LIMIT", "Weekly quota must be a valid non-negative amount")
	ErrUserGroupQuotaDisabled           = infraerrors.Conflict("USER_GROUP_QUOTA_DISABLED", "User group quota is not enabled")
	ErrUserGroupQuotaAllocationExceeded = infraerrors.Conflict("USER_GROUP_QUOTA_ALLOCATION_EXCEEDED", "Member allocations exceed the user group weekly quota")
	ErrUserGroupQuotaMembershipConflict = infraerrors.Conflict("USER_GROUP_QUOTA_MEMBERSHIP_CONFLICT", "A member already belongs to another quota-enabled user group")
	ErrUserGroupQuotaMemberNotFound     = infraerrors.BadRequest("USER_GROUP_QUOTA_MEMBER_NOT_FOUND", "Quota member must belong to the user group")
	ErrUserGroupWeeklyQuotaExceeded     = infraerrors.TooManyRequests("USER_GROUP_WEEKLY_QUOTA_EXCEEDED", "User group weekly quota has been exhausted")
	ErrUserGroupMemberQuotaExceeded     = infraerrors.TooManyRequests("USER_GROUP_MEMBER_WEEKLY_QUOTA_EXCEEDED", "Your weekly user group quota has been exhausted")
)

type UserGroupQuotaPolicy struct {
	Enabled                  bool       `json:"enabled"`
	WeeklyLimitUSD           float64    `json:"weekly_limit_usd"`
	WeeklyUsageUSD           float64    `json:"weekly_usage_usd"`
	WeeklyCumulativeUsageUSD float64    `json:"weekly_cumulative_usage_usd"`
	WeeklyWindowStart        *time.Time `json:"weekly_window_start,omitempty"`
	WeeklyResetAt            *time.Time `json:"weekly_reset_at,omitempty"`
}

type UserGroupQuotaMember struct {
	UserID                   int64      `json:"user_id"`
	Email                    string     `json:"email"`
	Username                 string     `json:"username"`
	AvatarURL                string     `json:"avatar_url,omitempty"`
	Status                   string     `json:"status"`
	WeeklyLimitUSD           float64    `json:"weekly_limit_usd"`
	WeeklyUsageUSD           float64    `json:"weekly_usage_usd"`
	WeeklyCumulativeUsageUSD float64    `json:"weekly_cumulative_usage_usd"`
	WeeklyWindowStart        *time.Time `json:"weekly_window_start,omitempty"`
}

type UserGroupQuotaOverview struct {
	GroupID                         int64                            `json:"group_id"`
	Policy                          UserGroupQuotaPolicy             `json:"policy"`
	Managers                        []UserGroupViewer                `json:"managers"`
	Members                         []UserGroupQuotaMember           `json:"members"`
	AllocatedUSD                    float64                          `json:"allocated_usd"`
	CanManage                       bool                             `json:"can_manage"`
	CanConfigure                    bool                             `json:"can_configure"`
	TeamSubscriptionGroups          []UserGroupTeamSubscriptionGroup `json:"team_subscription_groups"`
	AvailableTeamSubscriptionGroups []UserGroupTeamSubscriptionGroup `json:"available_team_subscription_groups,omitempty"`
}

type UserGroupQuotaPolicyMutation struct {
	Enabled        bool    `json:"enabled"`
	WeeklyLimitUSD float64 `json:"weekly_limit_usd"`
}

type UserGroupMemberQuotaMutation struct {
	UserID         int64   `json:"user_id"`
	WeeklyLimitUSD float64 `json:"weekly_limit_usd"`
}

type UserGroupQuotaState struct {
	GroupID           int64
	GroupWeeklyLimit  float64
	GroupWeeklyUsage  float64
	MemberWeeklyLimit float64
	MemberWeeklyUsage float64
}

type UserGroupQuotaRepository interface {
	CountManaged(ctx context.Context, actorID int64) (int64, error)
	CanManage(ctx context.Context, groupID, actorID int64) (bool, error)
	GetOverview(ctx context.Context, groupID int64, weekStart time.Time) (*UserGroupQuotaOverview, error)
	SetPolicy(ctx context.Context, groupID int64, mutation UserGroupQuotaPolicyMutation, actorID int64, weekStart time.Time) error
	ReplaceManagers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error
	UpdateMemberQuotas(ctx context.Context, groupID int64, mutations []UserGroupMemberQuotaMutation, actorID int64, weekStart time.Time) error
	GetUserQuotaState(ctx context.Context, groupID, billingGroupID, userID int64, weekStart time.Time) (*UserGroupQuotaState, error)
	IncrementUsage(ctx context.Context, groupID, billingGroupID, userID int64, amount float64, weekStart time.Time) error
	ResetUsage(ctx context.Context, groupID, actorID int64, resetAt time.Time) error
}

func (s *UserGroupService) GetQuotaOverview(ctx context.Context, actor UserGroupActor, groupID int64) (*UserGroupQuotaOverview, error) {
	if s.quotaRepo == nil {
		return nil, ErrUserGroupNotFound
	}
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	overview, err := s.quotaRepo.GetOverview(ctx, groupID, CurrentUserGroupQuotaWeek(time.Now()))
	if err != nil {
		return nil, err
	}
	canManage, err := s.canManageQuota(ctx, actor, groupID)
	if err != nil {
		return nil, err
	}
	overview.CanManage = canManage
	overview.CanConfigure = actor.IsAdmin()
	if overview.Policy.Enabled {
		resetAt := NextUserGroupQuotaReset(time.Now())
		overview.Policy.WeeklyResetAt = &resetAt
	}
	overview.TeamSubscriptionGroups, err = s.repo.ListTeamSubscriptionGroups(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if actor.IsAdmin() {
		overview.AvailableTeamSubscriptionGroups, err = s.repo.ListAvailableTeamSubscriptionGroups(ctx)
		if err != nil {
			return nil, err
		}
	}
	return overview, nil
}

func (s *UserGroupService) ResetQuotaUsage(ctx context.Context, actor UserGroupActor, groupID int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	if s.quotaRepo == nil {
		return ErrUserGroupNotFound
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	return s.quotaRepo.ResetUsage(ctx, groupID, actor.UserID, time.Now().UTC())
}

func (s *UserGroupService) SetQuotaPolicy(ctx context.Context, actor UserGroupActor, groupID int64, mutation UserGroupQuotaPolicyMutation) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	if s.quotaRepo == nil {
		return ErrUserGroupNotFound
	}
	if !validQuotaAmount(mutation.WeeklyLimitUSD) || (mutation.Enabled && mutation.WeeklyLimitUSD <= 0) {
		return ErrUserGroupQuotaInvalidLimit
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	return s.quotaRepo.SetPolicy(ctx, groupID, mutation, actor.UserID, CurrentUserGroupQuotaWeek(time.Now()))
}

func (s *UserGroupService) ReplaceQuotaManagers(ctx context.Context, actor UserGroupActor, groupID int64, userIDs []int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	if s.quotaRepo == nil {
		return ErrUserGroupNotFound
	}
	normalized, err := normalizeUserGroupUserIDs(userIDs)
	if err != nil {
		return err
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	return s.quotaRepo.ReplaceManagers(ctx, groupID, normalized, actor.UserID)
}

func (s *UserGroupService) UpdateMemberQuotas(ctx context.Context, actor UserGroupActor, groupID int64, mutations []UserGroupMemberQuotaMutation) error {
	if s.quotaRepo == nil {
		return ErrUserGroupNotFound
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	allowed, err := s.canManageQuota(ctx, actor, groupID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrUserGroupForbidden
	}
	normalized, err := normalizeMemberQuotaMutations(mutations)
	if err != nil {
		return err
	}
	return s.quotaRepo.UpdateMemberQuotas(ctx, groupID, normalized, actor.UserID, CurrentUserGroupQuotaWeek(time.Now()))
}

func (s *UserGroupService) canManageQuota(ctx context.Context, actor UserGroupActor, groupID int64) (bool, error) {
	if actor.IsAdmin() {
		return true, nil
	}
	return s.quotaRepo.CanManage(ctx, groupID, actor.UserID)
}

func normalizeMemberQuotaMutations(mutations []UserGroupMemberQuotaMutation) ([]UserGroupMemberQuotaMutation, error) {
	byUser := make(map[int64]UserGroupMemberQuotaMutation, len(mutations))
	for _, mutation := range mutations {
		if mutation.UserID <= 0 {
			return nil, ErrUserGroupQuotaMemberNotFound
		}
		if !validQuotaAmount(mutation.WeeklyLimitUSD) {
			return nil, ErrUserGroupQuotaInvalidLimit
		}
		byUser[mutation.UserID] = mutation
	}
	result := make([]UserGroupMemberQuotaMutation, 0, len(byUser))
	for _, mutation := range byUser {
		result = append(result, mutation)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].UserID < result[j].UserID })
	return result, nil
}

func validQuotaAmount(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func CurrentUserGroupQuotaWeek(now time.Time) time.Time {
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	local := now.In(shanghai)
	daysSinceMonday := (int(local.Weekday()) + 6) % 7
	weekStartLocal := time.Date(local.Year(), local.Month(), local.Day()-daysSinceMonday, 0, 0, 0, 0, shanghai)
	return weekStartLocal.UTC()
}

func NextUserGroupQuotaReset(now time.Time) time.Time {
	weekStart := CurrentUserGroupQuotaWeek(now)
	return weekStart.Add(7 * 24 * time.Hour)
}

func (s *BillingCacheService) checkUserGroupQuotaEligibility(ctx context.Context, groupID, billingGroupID, userID int64) error {
	if s == nil || s.userGroupQuotaRepo == nil || groupID <= 0 || billingGroupID <= 0 || userID <= 0 {
		return nil
	}
	state, err := s.userGroupQuotaRepo.GetUserQuotaState(ctx, groupID, billingGroupID, userID, CurrentUserGroupQuotaWeek(time.Now()))
	if err != nil {
		return err
	}
	if state == nil {
		return ErrUserGroupQuotaMemberNotFound
	}
	if state.GroupWeeklyUsage >= state.GroupWeeklyLimit {
		return ErrUserGroupWeeklyQuotaExceeded
	}
	if state.MemberWeeklyUsage >= state.MemberWeeklyLimit {
		return ErrUserGroupMemberQuotaExceeded
	}
	return nil
}

func (s *BillingCacheService) IncrementUserGroupQuotaUsage(ctx context.Context, groupID, billingGroupID, userID int64, amount float64) error {
	if s == nil || s.userGroupQuotaRepo == nil || groupID <= 0 || billingGroupID <= 0 || userID <= 0 || amount <= 0 {
		return nil
	}
	return s.userGroupQuotaRepo.IncrementUsage(ctx, groupID, billingGroupID, userID, amount, CurrentUserGroupQuotaWeek(time.Now()))
}
