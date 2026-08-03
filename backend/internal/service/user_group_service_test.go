package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type userGroupRepositoryStub struct {
	accessibleCount   int64
	canView           bool
	groups            []UserGroup
	members           []UserGroupMember
	viewers           []UserGroupViewer
	subscriptions     *UserGroupSubscriptionResult
	subscriptionQuery UserGroupSubscriptionQuery
	usage             *UserGroupUsageResult
	replacedMembers   []int64
	replacedViewers   []int64
	created           *UserGroup
	getByIDErr        error
}

type userGroupPromptRepositoryStub struct {
	canView         bool
	enabled         bool
	replacedViewers []int64
	prompts         []UserPromptCaptureDetail
	availability    map[int64]bool
}

func (s *userGroupPromptRepositoryStub) LoadEligibility(context.Context) (map[int64][]int64, error) {
	return nil, nil
}
func (s *userGroupPromptRepositoryStub) SetCaptureEnabled(_ context.Context, _ int64, enabled bool) error {
	s.enabled = enabled
	return nil
}
func (s *userGroupPromptRepositoryStub) ListPromptViewers(context.Context, int64) ([]UserGroupViewer, error) {
	return nil, nil
}
func (s *userGroupPromptRepositoryStub) ReplacePromptViewers(_ context.Context, _ int64, ids []int64, _ int64) error {
	s.replacedViewers = append([]int64(nil), ids...)
	return nil
}
func (s *userGroupPromptRepositoryStub) CanViewPrompt(context.Context, int64, int64) (bool, error) {
	return s.canView, nil
}
func (s *userGroupPromptRepositoryStub) InsertCapture(context.Context, UserPromptCaptureWrite) error {
	return nil
}
func (s *userGroupPromptRepositoryStub) PromptAvailableForUsage(_ context.Context, _ int64, usageID int64) (bool, error) {
	return s.availability[usageID], nil
}
func (s *userGroupPromptRepositoryStub) ListUsagePrompts(context.Context, int64, int64) ([]UserPromptCaptureDetail, error) {
	return s.prompts, nil
}
func (s *userGroupPromptRepositoryStub) DeleteExpiredBatch(context.Context, time.Time, int) (int64, error) {
	return 0, nil
}

type promptEligibilityRefresherStub struct{ refreshes, publishes int }

func (s *promptEligibilityRefresherStub) RefreshEligibility(context.Context) error {
	s.refreshes++
	return nil
}
func (s *promptEligibilityRefresherStub) PublishEligibilityInvalidation(context.Context) error {
	s.publishes++
	return nil
}

func (s *userGroupRepositoryStub) CountAccessible(context.Context, int64, bool) (int64, error) {
	return s.accessibleCount, nil
}

func (s *userGroupRepositoryStub) ListAccessible(context.Context, int64, bool) ([]UserGroup, error) {
	return s.groups, nil
}

func (s *userGroupRepositoryStub) CanView(context.Context, int64, int64) (bool, error) {
	return s.canView, nil
}

func (s *userGroupRepositoryStub) GetByID(_ context.Context, groupID int64) (*UserGroup, error) {
	if s.getByIDErr != nil {
		return nil, s.getByIDErr
	}
	return &UserGroup{ID: groupID, Name: "Group", Status: UserGroupStatusActive}, nil
}

func (s *userGroupRepositoryStub) Create(_ context.Context, group UserGroup, _ int64) (*UserGroup, error) {
	s.created = &group
	group.ID = 7
	return &group, nil
}

func (s *userGroupRepositoryStub) Update(_ context.Context, groupID int64, group UserGroup) (*UserGroup, error) {
	group.ID = groupID
	return &group, nil
}

func (s *userGroupRepositoryStub) Archive(context.Context, int64) error { return nil }

func (s *userGroupRepositoryStub) ListMembers(context.Context, int64) ([]UserGroupMember, error) {
	return s.members, nil
}

func (s *userGroupRepositoryStub) ReplaceMembers(_ context.Context, _ int64, userIDs []int64, _ int64) error {
	s.replacedMembers = append([]int64(nil), userIDs...)
	return nil
}

func (s *userGroupRepositoryStub) ListViewers(context.Context, int64) ([]UserGroupViewer, error) {
	return s.viewers, nil
}

func (s *userGroupRepositoryStub) ReplaceViewers(_ context.Context, _ int64, userIDs []int64, _ int64) error {
	s.replacedViewers = append([]int64(nil), userIDs...)
	return nil
}

func (s *userGroupRepositoryStub) ListSubscriptions(_ context.Context, _ int64, query UserGroupSubscriptionQuery) (*UserGroupSubscriptionResult, error) {
	s.subscriptionQuery = query
	return s.subscriptions, nil
}

func (s *userGroupRepositoryStub) GetUsage(context.Context, int64, UserGroupUsageQuery) (*UserGroupUsageResult, error) {
	return s.usage, nil
}

func TestUserGroupServiceCapabilities(t *testing.T) {
	t.Run("admin can access and manage even with no groups", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		got, err := svc.Capabilities(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin})
		require.NoError(t, err)
		require.Equal(t, UserGroupCapabilities{CanAccess: true, CanManage: true, GroupCount: 0}, got)
	})

	t.Run("delegated user can access assigned groups read only", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{accessibleCount: 2})
		got, err := svc.Capabilities(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser})
		require.NoError(t, err)
		require.Equal(t, UserGroupCapabilities{CanAccess: true, CanManage: false, GroupCount: 2}, got)
	})

	t.Run("ordinary user without grants has no access", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		got, err := svc.Capabilities(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser})
		require.NoError(t, err)
		require.Equal(t, UserGroupCapabilities{CanAccess: false, CanManage: false, GroupCount: 0}, got)
	})
}

func TestUserGroupServiceEnforcesReadAndWriteAccess(t *testing.T) {
	t.Run("granted user can read members", func(t *testing.T) {
		repo := &userGroupRepositoryStub{canView: true, members: []UserGroupMember{{UserID: 3}}}
		svc := NewUserGroupService(repo)
		got, err := svc.ListMembers(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2)
		require.NoError(t, err)
		require.Len(t, got, 1)
	})

	t.Run("ungranted user cannot read members", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		_, err := svc.ListMembers(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2)
		require.ErrorIs(t, err, ErrUserGroupForbidden)
	})

	t.Run("ordinary user sees an archived or missing group as not found", func(t *testing.T) {
		repo := &userGroupRepositoryStub{getByIDErr: ErrUserGroupNotFound}
		svc := NewUserGroupService(repo)
		_, err := svc.ListMembers(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2)
		require.ErrorIs(t, err, ErrUserGroupNotFound)
	})

	t.Run("granted user cannot mutate members", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{canView: true})
		err := svc.ReplaceMembers(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2, []int64{3})
		require.ErrorIs(t, err, ErrUserGroupForbidden)
	})

	t.Run("admin can read without a grant", func(t *testing.T) {
		repo := &userGroupRepositoryStub{members: []UserGroupMember{{UserID: 3}}}
		svc := NewUserGroupService(repo)
		got, err := svc.ListMembers(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2)
		require.NoError(t, err)
		require.Len(t, got, 1)
	})

	t.Run("admin cannot read viewers from an archived or missing group", func(t *testing.T) {
		repo := &userGroupRepositoryStub{getByIDErr: ErrUserGroupNotFound, viewers: []UserGroupViewer{{UserID: 3}}}
		svc := NewUserGroupService(repo)
		_, err := svc.ListViewers(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2)
		require.ErrorIs(t, err, ErrUserGroupNotFound)
	})
}

func TestUserGroupServiceValidatesAndNormalizesMutations(t *testing.T) {
	t.Run("rejects blank group name", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		_, err := svc.Create(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, UserGroupMutation{Name: "   "})
		require.ErrorIs(t, err, ErrUserGroupInvalidName)
	})

	t.Run("trims group fields", func(t *testing.T) {
		repo := &userGroupRepositoryStub{}
		svc := NewUserGroupService(repo)
		created, err := svc.Create(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, UserGroupMutation{Name: "  Core team  ", Description: "  Owners  "})
		require.NoError(t, err)
		require.Equal(t, "Core team", created.Name)
		require.Equal(t, "Owners", created.Description)
	})

	t.Run("deduplicates and sorts replacement IDs", func(t *testing.T) {
		repo := &userGroupRepositoryStub{}
		svc := NewUserGroupService(repo)
		err := svc.ReplaceMembers(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, []int64{9, 3, 9, 5})
		require.NoError(t, err)
		require.Equal(t, []int64{3, 5, 9}, repo.replacedMembers)
	})

	t.Run("rejects invalid replacement IDs", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		err := svc.ReplaceViewers(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, []int64{0, 4})
		require.ErrorIs(t, err, ErrUserGroupInvalidUserIDs)
	})
}

func TestUserGroupServiceUsageRange(t *testing.T) {
	repo := &userGroupRepositoryStub{canView: true, usage: &UserGroupUsageResult{}}
	svc := NewUserGroupService(repo)
	actor := UserGroupActor{UserID: 8, Role: RoleUser}

	start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	_, err := svc.GetUsage(context.Background(), actor, 2, UserGroupUsageQuery{
		StartTime: start,
		EndTime:   start.Add(367 * 24 * time.Hour),
	})
	require.ErrorIs(t, err, ErrUserGroupInvalidDateRange)

	_, err = svc.GetUsage(context.Background(), actor, 2, UserGroupUsageQuery{
		StartTime: start.Add(2 * time.Hour),
		EndTime:   start,
	})
	require.ErrorIs(t, err, ErrUserGroupInvalidDateRange)

	location, err := time.LoadLocation("America/New_York")
	require.NoError(t, err)
	dstStart := time.Date(2024, time.November, 3, 0, 0, 0, 0, location)
	_, err = svc.GetUsage(context.Background(), actor, 2, UserGroupUsageQuery{
		StartTime: dstStart,
		EndTime:   dstStart.AddDate(0, 0, maxUserGroupUsageDays),
	})
	require.NoError(t, err)
}

func TestUserGroupServiceNormalizesSubscriptionStatus(t *testing.T) {
	t.Run("rejects unsupported status filters", func(t *testing.T) {
		svc := NewUserGroupService(&userGroupRepositoryStub{})
		_, err := svc.ListSubscriptions(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, UserGroupSubscriptionQuery{Status: "suspended"})
		require.ErrorIs(t, err, ErrUserGroupInvalidSubscriptionStatus)
	})

	t.Run("normalizes filters and expired active rows", func(t *testing.T) {
		expiredAt := time.Now().Add(-time.Minute)
		repo := &userGroupRepositoryStub{subscriptions: &UserGroupSubscriptionResult{
			Items: []UserGroupSubscriptionRow{{Status: SubscriptionStatusActive, ExpiresAt: &expiredAt}},
		}}
		svc := NewUserGroupService(repo)
		result, err := svc.ListSubscriptions(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, UserGroupSubscriptionQuery{Status: " active "})
		require.NoError(t, err)
		require.Equal(t, SubscriptionStatusActive, repo.subscriptionQuery.Status)
		require.Equal(t, SubscriptionStatusExpired, result.Items[0].Status)
	})
}

func TestUserGroupServicePromptAuthorizationIsIndependent(t *testing.T) {
	prompt := &userGroupPromptRepositoryStub{prompts: []UserPromptCaptureDetail{{ID: 9, RedactedPrompt: "safe"}}}

	t.Run("admin without prompt grant is forbidden", func(t *testing.T) {
		svc := newUserGroupServiceWithPromptCapture(&userGroupRepositoryStub{}, prompt, nil)
		_, err := svc.GetUsagePrompts(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, 31)
		require.ErrorIs(t, err, ErrUserGroupForbidden)
	})

	t.Run("dual granted ordinary viewer can read", func(t *testing.T) {
		prompt.canView = true
		svc := newUserGroupServiceWithPromptCapture(&userGroupRepositoryStub{canView: true}, prompt, nil)
		items, err := svc.GetUsagePrompts(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2, 31)
		require.NoError(t, err)
		require.Len(t, items, 1)
	})

	t.Run("prompt grant alone does not grant group read", func(t *testing.T) {
		prompt.canView = true
		svc := newUserGroupServiceWithPromptCapture(&userGroupRepositoryStub{canView: false}, prompt, nil)
		_, err := svc.GetUsagePrompts(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2, 31)
		require.ErrorIs(t, err, ErrUserGroupForbidden)
	})
}

func TestUserGroupServicePromptMutationsAreAdminOnlyAndRefreshEligibility(t *testing.T) {
	prompt := &userGroupPromptRepositoryStub{}
	refresher := &promptEligibilityRefresherStub{}
	svc := newUserGroupServiceWithPromptCapture(&userGroupRepositoryStub{}, prompt, refresher)

	err := svc.SetPromptCapture(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2, true)
	require.ErrorIs(t, err, ErrUserGroupForbidden)

	err = svc.SetPromptCapture(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, true)
	require.NoError(t, err)
	require.True(t, prompt.enabled)
	require.Equal(t, 1, refresher.refreshes)
	require.Equal(t, 1, refresher.publishes)

	err = svc.ReplacePromptViewers(context.Background(), UserGroupActor{UserID: 1, Role: RoleAdmin}, 2, []int64{9, 3, 9})
	require.NoError(t, err)
	require.Equal(t, []int64{3, 9}, prompt.replacedViewers)
}

func TestUserGroupServiceUsageAddsPromptAvailabilityOnlyForGrantedActor(t *testing.T) {
	usage := &UserGroupUsageResult{Items: []UserGroupUsageItem{{ID: 31}, {ID: 32}}}
	prompt := &userGroupPromptRepositoryStub{canView: true, availability: map[int64]bool{31: true}}
	svc := newUserGroupServiceWithPromptCapture(&userGroupRepositoryStub{canView: true, usage: usage}, prompt, nil)

	result, err := svc.GetUsage(context.Background(), UserGroupActor{UserID: 8, Role: RoleUser}, 2, UserGroupUsageQuery{
		StartTime: time.Now().Add(-time.Hour), EndTime: time.Now(), Page: 1, PageSize: 20,
	})
	require.NoError(t, err)
	require.NotNil(t, result.Items[0].PromptAvailable)
	require.True(t, *result.Items[0].PromptAvailable)
	require.NotNil(t, result.Items[1].PromptAvailable)
	require.False(t, *result.Items[1].PromptAvailable)
}
