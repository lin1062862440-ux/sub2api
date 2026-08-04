package service

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

const (
	UserGroupStatusActive   = "active"
	UserGroupStatusArchived = "archived"
	maxUserGroupUsageDays   = 366
)

var (
	ErrUserGroupForbidden                 = infraerrors.Forbidden("USER_GROUP_FORBIDDEN", "You do not have access to this user group")
	ErrUserGroupNotFound                  = infraerrors.NotFound("USER_GROUP_NOT_FOUND", "User group not found")
	ErrUserGroupInvalidName               = infraerrors.BadRequest("USER_GROUP_INVALID_NAME", "User group name is required")
	ErrUserGroupInvalidUserIDs            = infraerrors.BadRequest("USER_GROUP_INVALID_USER_IDS", "User IDs must be positive integers")
	ErrUserGroupInvalidDateRange          = infraerrors.BadRequest("USER_GROUP_INVALID_DATE_RANGE", "Usage date range must be valid and no longer than 366 days")
	ErrUserGroupInvalidSubscriptionStatus = infraerrors.BadRequest("USER_GROUP_INVALID_SUBSCRIPTION_STATUS", "Subscription status must be active, expired, or none")
	ErrUserGroupInvalidTeamSubscription   = infraerrors.BadRequest("USER_GROUP_INVALID_TEAM_SUBSCRIPTION", "Only active OpenAI or Anthropic team subscription groups can be assigned")
	ErrUserGroupDuplicateTeamPlatform     = infraerrors.Conflict("USER_GROUP_DUPLICATE_TEAM_PLATFORM", "Only one team subscription group can be assigned per platform")
)

type UserGroup struct {
	ID                   int64     `json:"id"`
	Name                 string    `json:"name"`
	Description          string    `json:"description"`
	Status               string    `json:"status"`
	MemberCount          int64     `json:"member_count"`
	ViewerCount          int64     `json:"viewer_count"`
	PromptCaptureEnabled bool      `json:"prompt_capture_enabled"`
	CanViewPrompt        bool      `json:"can_view_prompt"`
	CreatedBy            *int64    `json:"created_by,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

type UserGroupMutation struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UserGroupMember struct {
	UserID    int64     `json:"user_id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	Status    string    `json:"status"`
	JoinedAt  time.Time `json:"joined_at"`
}

type UserGroupViewer struct {
	UserID    int64     `json:"user_id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	Status    string    `json:"status"`
	GrantedAt time.Time `json:"granted_at"`
}

type UserGroupCapabilities struct {
	CanAccess      bool  `json:"can_access"`
	CanManage      bool  `json:"can_manage"`
	CanManageQuota bool  `json:"can_manage_quota"`
	GroupCount     int64 `json:"group_count"`
}

type UserGroupActor struct {
	UserID int64
	Role   string
}

func (a UserGroupActor) IsAdmin() bool { return a.Role == RoleAdmin }

type UserGroupSubscriptionQuery struct {
	Status   string
	Page     int
	PageSize int
}

type UserGroupTeamSubscriptionGroup struct {
	BillingGroupID int64  `json:"billing_group_id"`
	Name           string `json:"name"`
	Platform       string `json:"platform"`
	Status         string `json:"status"`
}

type UserGroupSubscriptionRow struct {
	Member         UserGroupMember `json:"member"`
	SubscriptionID *int64          `json:"subscription_id"`
	BillingGroupID *int64          `json:"billing_group_id"`
	BillingGroup   string          `json:"billing_group"`
	Platform       string          `json:"platform"`
	Status         string          `json:"status"`
	StartsAt       *time.Time      `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time      `json:"expires_at,omitempty"`
	WeeklyUsed     float64         `json:"weekly_used"`
	WeeklyLimit    *float64        `json:"weekly_limit,omitempty"`
}

type UserGroupSubscriptionSummary struct {
	MemberCount             int64   `json:"member_count"`
	ActiveSubscriptionCount int64   `json:"active_subscription_count"`
	NoSubscriptionCount     int64   `json:"no_subscription_count"`
	AllocatedQuotaUSD       float64 `json:"allocated_quota_usd"`
	TeamSubscriptionUsage   float64 `json:"team_subscription_usage"`
}

type UserGroupSubscriptionResult struct {
	Summary  UserGroupSubscriptionSummary `json:"summary"`
	Items    []UserGroupSubscriptionRow   `json:"items"`
	Total    int64                        `json:"total"`
	Page     int                          `json:"page"`
	PageSize int                          `json:"page_size"`
	Pages    int                          `json:"pages"`
}

type UserGroupUsageQuery struct {
	StartTime   time.Time
	EndTime     time.Time
	UserID      *int64
	Model       string
	BillingType *int8
	Page        int
	PageSize    int
}

type UserGroupUsageSummary struct {
	TotalRequests     int64   `json:"total_requests"`
	TotalInputTokens  int64   `json:"total_input_tokens"`
	TotalOutputTokens int64   `json:"total_output_tokens"`
	TotalCacheTokens  int64   `json:"total_cache_tokens"`
	TotalTokens       int64   `json:"total_tokens"`
	TotalActualCost   float64 `json:"total_actual_cost"`
}

type UserGroupUsageByUser struct {
	UserID          int64   `json:"user_id"`
	Email           string  `json:"email"`
	Username        string  `json:"username"`
	TotalRequests   int64   `json:"total_requests"`
	TotalTokens     int64   `json:"total_tokens"`
	TotalActualCost float64 `json:"total_actual_cost"`
}

type UserGroupUsageItem struct {
	ID                  int64     `json:"id"`
	UserID              int64     `json:"user_id"`
	Email               string    `json:"email"`
	Username            string    `json:"username"`
	RequestID           string    `json:"request_id"`
	Model               string    `json:"model"`
	InputTokens         int       `json:"input_tokens"`
	OutputTokens        int       `json:"output_tokens"`
	CacheCreationTokens int       `json:"cache_creation_tokens"`
	CacheReadTokens     int       `json:"cache_read_tokens"`
	TotalTokens         int       `json:"total_tokens"`
	ActualCost          float64   `json:"actual_cost"`
	CreatedAt           time.Time `json:"created_at"`
	PromptAvailable     *bool     `json:"prompt_available,omitempty"`
}

type UserGroupUsageResult struct {
	Summary  UserGroupUsageSummary  `json:"summary"`
	ByUser   []UserGroupUsageByUser `json:"by_user"`
	Items    []UserGroupUsageItem   `json:"items"`
	Total    int64                  `json:"total"`
	Page     int                    `json:"page"`
	PageSize int                    `json:"page_size"`
	Pages    int                    `json:"pages"`
}

type UserGroupRepository interface {
	CountAccessible(ctx context.Context, actorID int64, isAdmin bool) (int64, error)
	ListAccessible(ctx context.Context, actorID int64, isAdmin bool) ([]UserGroup, error)
	CanView(ctx context.Context, groupID, actorID int64) (bool, error)
	GetByID(ctx context.Context, groupID int64) (*UserGroup, error)
	Create(ctx context.Context, group UserGroup, actorID int64) (*UserGroup, error)
	Update(ctx context.Context, groupID int64, group UserGroup) (*UserGroup, error)
	Archive(ctx context.Context, groupID int64) error
	ListMembers(ctx context.Context, groupID int64) ([]UserGroupMember, error)
	ReplaceMembers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error
	ListViewers(ctx context.Context, groupID int64) ([]UserGroupViewer, error)
	ReplaceViewers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error
	ListTeamSubscriptionGroups(ctx context.Context, groupID int64) ([]UserGroupTeamSubscriptionGroup, error)
	ListAvailableTeamSubscriptionGroups(ctx context.Context) ([]UserGroupTeamSubscriptionGroup, error)
	ReplaceTeamSubscriptionGroups(ctx context.Context, groupID int64, billingGroupIDs []int64, actorID int64) error
	ListSubscriptions(ctx context.Context, groupID int64, query UserGroupSubscriptionQuery) (*UserGroupSubscriptionResult, error)
	GetUsage(ctx context.Context, groupID int64, query UserGroupUsageQuery) (*UserGroupUsageResult, error)
}

type UserGroupService struct {
	repo            UserGroupRepository
	quotaRepo       UserGroupQuotaRepository
	promptRepo      UserGroupPromptCaptureRepository
	promptRefresher UserGroupPromptEligibilityRefresher
}

func NewUserGroupService(repo UserGroupRepository) *UserGroupService {
	return &UserGroupService{repo: repo}
}

func newUserGroupServiceWithPromptCapture(repo UserGroupRepository, promptRepo UserGroupPromptCaptureRepository, refresher UserGroupPromptEligibilityRefresher) *UserGroupService {
	return &UserGroupService{repo: repo, promptRepo: promptRepo, promptRefresher: refresher}
}

func ProvideUserGroupService(repo UserGroupRepository, quotaRepo UserGroupQuotaRepository, promptRepo UserGroupPromptCaptureRepository, refresher UserGroupPromptEligibilityRefresher) *UserGroupService {
	service := newUserGroupServiceWithPromptCapture(repo, promptRepo, refresher)
	service.quotaRepo = quotaRepo
	return service
}

func (s *UserGroupService) Capabilities(ctx context.Context, actor UserGroupActor) (UserGroupCapabilities, error) {
	count, err := s.repo.CountAccessible(ctx, actor.UserID, actor.IsAdmin())
	if err != nil {
		return UserGroupCapabilities{}, err
	}
	managedCount := int64(0)
	if s.quotaRepo != nil && !actor.IsAdmin() {
		managedCount, err = s.quotaRepo.CountManaged(ctx, actor.UserID)
		if err != nil {
			return UserGroupCapabilities{}, err
		}
	}
	return UserGroupCapabilities{
		CanAccess: actor.IsAdmin() || count > 0 || managedCount > 0, CanManage: actor.IsAdmin(),
		CanManageQuota: actor.IsAdmin() || managedCount > 0, GroupCount: count,
	}, nil
}

func (s *UserGroupService) List(ctx context.Context, actor UserGroupActor) ([]UserGroup, error) {
	return s.repo.ListAccessible(ctx, actor.UserID, actor.IsAdmin())
}

func (s *UserGroupService) Create(ctx context.Context, actor UserGroupActor, mutation UserGroupMutation) (*UserGroup, error) {
	if err := requireUserGroupAdmin(actor); err != nil {
		return nil, err
	}
	group, err := normalizeUserGroupMutation(mutation)
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, group, actor.UserID)
}

func (s *UserGroupService) Update(ctx context.Context, actor UserGroupActor, groupID int64, mutation UserGroupMutation) (*UserGroup, error) {
	if err := requireUserGroupAdmin(actor); err != nil {
		return nil, err
	}
	group, err := normalizeUserGroupMutation(mutation)
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, groupID, group)
}

func (s *UserGroupService) Archive(ctx context.Context, actor UserGroupActor, groupID int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	if err := s.repo.Archive(ctx, groupID); err != nil {
		return err
	}
	s.refreshPromptEligibility(ctx)
	return nil
}

func (s *UserGroupService) ListMembers(ctx context.Context, actor UserGroupActor, groupID int64) ([]UserGroupMember, error) {
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	return s.repo.ListMembers(ctx, groupID)
}

func (s *UserGroupService) ReplaceMembers(ctx context.Context, actor UserGroupActor, groupID int64, userIDs []int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	normalized, err := normalizeUserGroupUserIDs(userIDs)
	if err != nil {
		return err
	}
	if err := s.repo.ReplaceMembers(ctx, groupID, normalized, actor.UserID); err != nil {
		return err
	}
	s.refreshPromptEligibility(ctx)
	return nil
}

func (s *UserGroupService) ListViewers(ctx context.Context, actor UserGroupActor, groupID int64) ([]UserGroupViewer, error) {
	if err := requireUserGroupAdmin(actor); err != nil {
		return nil, err
	}
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	return s.repo.ListViewers(ctx, groupID)
}

func (s *UserGroupService) ReplaceViewers(ctx context.Context, actor UserGroupActor, groupID int64, userIDs []int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	normalized, err := normalizeUserGroupUserIDs(userIDs)
	if err != nil {
		return err
	}
	return s.repo.ReplaceViewers(ctx, groupID, normalized, actor.UserID)
}

func (s *UserGroupService) ReplaceTeamSubscriptionGroups(ctx context.Context, actor UserGroupActor, groupID int64, billingGroupIDs []int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	normalized, err := normalizeUserGroupUserIDs(billingGroupIDs)
	if err != nil {
		return err
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	return s.repo.ReplaceTeamSubscriptionGroups(ctx, groupID, normalized, actor.UserID)
}

func (s *UserGroupService) ListSubscriptions(ctx context.Context, actor UserGroupActor, groupID int64, query UserGroupSubscriptionQuery) (*UserGroupSubscriptionResult, error) {
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	status, err := normalizeUserGroupSubscriptionStatus(query.Status)
	if err != nil {
		return nil, err
	}
	query.Status = status
	query.Page, query.PageSize = normalizeUserGroupPagination(query.Page, query.PageSize)
	result, err := s.repo.ListSubscriptions(ctx, groupID, query)
	if err != nil || result == nil {
		return result, err
	}
	now := time.Now()
	for index := range result.Items {
		row := &result.Items[index]
		if row.Status == SubscriptionStatusActive && row.ExpiresAt != nil && !row.ExpiresAt.After(now) {
			row.Status = SubscriptionStatusExpired
		}
	}
	return result, nil
}

func (s *UserGroupService) GetUsage(ctx context.Context, actor UserGroupActor, groupID int64, query UserGroupUsageQuery) (*UserGroupUsageResult, error) {
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	if query.StartTime.IsZero() || query.EndTime.IsZero() || !query.EndTime.After(query.StartTime) || query.EndTime.After(query.StartTime.AddDate(0, 0, maxUserGroupUsageDays)) {
		return nil, ErrUserGroupInvalidDateRange
	}
	query.Page, query.PageSize = normalizeUserGroupPagination(query.Page, query.PageSize)
	query.Model = strings.TrimSpace(query.Model)
	result, err := s.repo.GetUsage(ctx, groupID, query)
	if err != nil || result == nil || s.promptRepo == nil {
		return result, err
	}
	allowed, err := s.promptRepo.CanViewPrompt(ctx, groupID, actor.UserID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return result, nil
	}
	for index := range result.Items {
		available, err := s.promptRepo.PromptAvailableForUsage(ctx, groupID, result.Items[index].ID)
		if err != nil {
			return nil, err
		}
		result.Items[index].PromptAvailable = &available
	}
	return result, nil
}

func (s *UserGroupService) SetPromptCapture(ctx context.Context, actor UserGroupActor, groupID int64, enabled bool) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	if s.promptRepo == nil {
		return ErrUserGroupForbidden
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	if err := s.promptRepo.SetCaptureEnabled(ctx, groupID, enabled); err != nil {
		return err
	}
	s.refreshPromptEligibility(ctx)
	return nil
}

func (s *UserGroupService) ListPromptViewers(ctx context.Context, actor UserGroupActor, groupID int64) ([]UserGroupViewer, error) {
	if err := requireUserGroupAdmin(actor); err != nil {
		return nil, err
	}
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	if s.promptRepo == nil {
		return nil, ErrUserGroupForbidden
	}
	return s.promptRepo.ListPromptViewers(ctx, groupID)
}

func (s *UserGroupService) ReplacePromptViewers(ctx context.Context, actor UserGroupActor, groupID int64, userIDs []int64) error {
	if err := requireUserGroupAdmin(actor); err != nil {
		return err
	}
	normalized, err := normalizeUserGroupUserIDs(userIDs)
	if err != nil {
		return err
	}
	if s.promptRepo == nil {
		return ErrUserGroupForbidden
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	return s.promptRepo.ReplacePromptViewers(ctx, groupID, normalized, actor.UserID)
}

func (s *UserGroupService) GetUsagePrompts(ctx context.Context, actor UserGroupActor, groupID, usageLogID int64) ([]UserPromptCaptureDetail, error) {
	if usageLogID <= 0 {
		return nil, ErrUserGroupNotFound
	}
	if err := s.requireRead(ctx, actor, groupID); err != nil {
		return nil, err
	}
	if s.promptRepo == nil {
		return nil, ErrUserGroupForbidden
	}
	allowed, err := s.promptRepo.CanViewPrompt(ctx, groupID, actor.UserID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrUserGroupForbidden
	}
	return s.promptRepo.ListUsagePrompts(ctx, groupID, usageLogID)
}

func (s *UserGroupService) refreshPromptEligibility(ctx context.Context) {
	if s.promptRefresher == nil {
		return
	}
	if err := s.promptRefresher.RefreshEligibility(ctx); err != nil {
		slog.Warn("user_group_prompt_capture.local_refresh_failed", "error", err)
	}
	if err := s.promptRefresher.PublishEligibilityInvalidation(ctx); err != nil {
		slog.Warn("user_group_prompt_capture.publish_invalidation_failed", "error", err)
	}
}

func (s *UserGroupService) requireRead(ctx context.Context, actor UserGroupActor, groupID int64) error {
	if groupID <= 0 {
		return ErrUserGroupNotFound
	}
	if _, err := s.repo.GetByID(ctx, groupID); err != nil {
		return err
	}
	if actor.IsAdmin() {
		return nil
	}
	allowed, err := s.repo.CanView(ctx, groupID, actor.UserID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrUserGroupForbidden
	}
	return nil
}

func requireUserGroupAdmin(actor UserGroupActor) error {
	if !actor.IsAdmin() {
		return ErrUserGroupForbidden
	}
	return nil
}

func normalizeUserGroupMutation(mutation UserGroupMutation) (UserGroup, error) {
	name := strings.TrimSpace(mutation.Name)
	if name == "" || len([]rune(name)) > 100 {
		return UserGroup{}, ErrUserGroupInvalidName
	}
	return UserGroup{Name: name, Description: strings.TrimSpace(mutation.Description), Status: UserGroupStatusActive}, nil
}

func normalizeUserGroupUserIDs(userIDs []int64) ([]int64, error) {
	set := make(map[int64]struct{}, len(userIDs))
	for _, id := range userIDs {
		if id <= 0 {
			return nil, ErrUserGroupInvalidUserIDs
		}
		set[id] = struct{}{}
	}
	result := make([]int64, 0, len(set))
	for id := range set {
		result = append(result, id)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result, nil
}

func normalizeUserGroupSubscriptionStatus(status string) (string, error) {
	status = strings.TrimSpace(status)
	switch status {
	case "", SubscriptionStatusActive, SubscriptionStatusExpired, "none":
		return status, nil
	default:
		return "", ErrUserGroupInvalidSubscriptionStatus
	}
}

func normalizeUserGroupPagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}
