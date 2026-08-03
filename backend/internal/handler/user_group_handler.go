package handler

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type UserGroupApplicationService interface {
	Capabilities(ctx context.Context, actor service.UserGroupActor) (service.UserGroupCapabilities, error)
	List(ctx context.Context, actor service.UserGroupActor) ([]service.UserGroup, error)
	Create(ctx context.Context, actor service.UserGroupActor, mutation service.UserGroupMutation) (*service.UserGroup, error)
	Update(ctx context.Context, actor service.UserGroupActor, groupID int64, mutation service.UserGroupMutation) (*service.UserGroup, error)
	Archive(ctx context.Context, actor service.UserGroupActor, groupID int64) error
	ListMembers(ctx context.Context, actor service.UserGroupActor, groupID int64) ([]service.UserGroupMember, error)
	ReplaceMembers(ctx context.Context, actor service.UserGroupActor, groupID int64, userIDs []int64) error
	ListViewers(ctx context.Context, actor service.UserGroupActor, groupID int64) ([]service.UserGroupViewer, error)
	ReplaceViewers(ctx context.Context, actor service.UserGroupActor, groupID int64, userIDs []int64) error
	ListSubscriptions(ctx context.Context, actor service.UserGroupActor, groupID int64, query service.UserGroupSubscriptionQuery) (*service.UserGroupSubscriptionResult, error)
	GetUsage(ctx context.Context, actor service.UserGroupActor, groupID int64, query service.UserGroupUsageQuery) (*service.UserGroupUsageResult, error)
	SetPromptCapture(ctx context.Context, actor service.UserGroupActor, groupID int64, enabled bool) error
	ListPromptViewers(ctx context.Context, actor service.UserGroupActor, groupID int64) ([]service.UserGroupViewer, error)
	ReplacePromptViewers(ctx context.Context, actor service.UserGroupActor, groupID int64, userIDs []int64) error
	GetUsagePrompts(ctx context.Context, actor service.UserGroupActor, groupID, usageLogID int64) ([]service.UserPromptCaptureDetail, error)
}

type UserGroupHandler struct {
	service UserGroupApplicationService
}

func NewUserGroupHandler(userGroupService *service.UserGroupService) *UserGroupHandler {
	return &UserGroupHandler{service: userGroupService}
}

func newUserGroupHandlerWithService(userGroupService UserGroupApplicationService) *UserGroupHandler {
	return &UserGroupHandler{service: userGroupService}
}

func (h *UserGroupHandler) Capabilities(c *gin.Context) {
	actor, ok := userGroupActorFromContext(c)
	if !ok {
		return
	}
	capabilities, err := h.service.Capabilities(c.Request.Context(), actor)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, capabilities)
}

func (h *UserGroupHandler) List(c *gin.Context) {
	actor, ok := userGroupActorFromContext(c)
	if !ok {
		return
	}
	groups, err := h.service.List(c.Request.Context(), actor)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, groups)
}

func (h *UserGroupHandler) Create(c *gin.Context) {
	actor, ok := userGroupActorFromContext(c)
	if !ok {
		return
	}
	var mutation service.UserGroupMutation
	if err := c.ShouldBindJSON(&mutation); err != nil {
		response.BadRequest(c, "Invalid user group payload")
		return
	}
	group, err := h.service.Create(c.Request.Context(), actor, mutation)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Created(c, group)
}

func (h *UserGroupHandler) Update(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	var mutation service.UserGroupMutation
	if err := c.ShouldBindJSON(&mutation); err != nil {
		response.BadRequest(c, "Invalid user group payload")
		return
	}
	group, err := h.service.Update(c.Request.Context(), actor, groupID, mutation)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, group)
}

func (h *UserGroupHandler) Archive(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	if err := h.service.Archive(c.Request.Context(), actor, groupID); response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, gin.H{"message": "User group archived"})
}

func (h *UserGroupHandler) ListMembers(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	members, err := h.service.ListMembers(c.Request.Context(), actor, groupID)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, members)
}

func (h *UserGroupHandler) ReplaceMembers(c *gin.Context) {
	h.replacePeople(c, h.service.ReplaceMembers)
}

func (h *UserGroupHandler) ListViewers(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	viewers, err := h.service.ListViewers(c.Request.Context(), actor, groupID)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, viewers)
}

func (h *UserGroupHandler) ReplaceViewers(c *gin.Context) {
	h.replacePeople(c, h.service.ReplaceViewers)
}

func (h *UserGroupHandler) replacePeople(c *gin.Context, replace func(context.Context, service.UserGroupActor, int64, []int64) error) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	var payload struct {
		UserIDs []int64 `json:"user_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		response.BadRequest(c, "user_ids is required")
		return
	}
	if err := replace(c.Request.Context(), actor, groupID, payload.UserIDs); response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, gin.H{"message": "User group people updated"})
}

func (h *UserGroupHandler) ListSubscriptions(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	page, pageSize := response.ParsePagination(c)
	result, err := h.service.ListSubscriptions(c.Request.Context(), actor, groupID, service.UserGroupSubscriptionQuery{
		Status: c.Query("status"), Page: page, PageSize: pageSize,
	})
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, result)
}

func (h *UserGroupHandler) GetUsage(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	query, err := parseUserGroupUsageQuery(c)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	result, err := h.service.GetUsage(c.Request.Context(), actor, groupID, query)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, result)
}

func (h *UserGroupHandler) SetPromptCapture(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	var payload struct {
		Enabled *bool `json:"enabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || payload.Enabled == nil {
		response.BadRequest(c, "enabled is required")
		return
	}
	if err := h.service.SetPromptCapture(c.Request.Context(), actor, groupID, *payload.Enabled); response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, gin.H{"message": "User group prompt capture updated"})
}

func (h *UserGroupHandler) ListPromptViewers(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	viewers, err := h.service.ListPromptViewers(c.Request.Context(), actor, groupID)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, viewers)
}

func (h *UserGroupHandler) ReplacePromptViewers(c *gin.Context) {
	h.replacePeople(c, h.service.ReplacePromptViewers)
}

func (h *UserGroupHandler) GetUsagePrompts(c *gin.Context) {
	actor, groupID, ok := userGroupActorAndID(c)
	if !ok {
		return
	}
	usageLogID, err := strconv.ParseInt(c.Param("usageLogID"), 10, 64)
	if err != nil || usageLogID <= 0 {
		response.BadRequest(c, "Invalid usage log ID")
		return
	}
	items, err := h.service.GetUsagePrompts(c.Request.Context(), actor, groupID, usageLogID)
	if response.ErrorFrom(c, err) {
		return
	}
	response.Success(c, items)
}

func userGroupActorFromContext(c *gin.Context) (service.UserGroupActor, bool) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "User not authenticated")
		return service.UserGroupActor{}, false
	}
	role, ok := middleware.GetUserRoleFromContext(c)
	if !ok {
		response.Unauthorized(c, "User role not available")
		return service.UserGroupActor{}, false
	}
	return service.UserGroupActor{UserID: subject.UserID, Role: role}, true
}

func userGroupActorAndID(c *gin.Context) (service.UserGroupActor, int64, bool) {
	actor, ok := userGroupActorFromContext(c)
	if !ok {
		return service.UserGroupActor{}, 0, false
	}
	groupID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || groupID <= 0 {
		response.BadRequest(c, "Invalid user group ID")
		return service.UserGroupActor{}, 0, false
	}
	return actor, groupID, true
}

func parseUserGroupUsageQuery(c *gin.Context) (service.UserGroupUsageQuery, error) {
	page, pageSize := response.ParsePagination(c)
	location := time.UTC
	if timezone := strings.TrimSpace(c.Query("timezone")); timezone != "" {
		loaded, err := time.LoadLocation(timezone)
		if err != nil {
			return service.UserGroupUsageQuery{}, strconv.ErrSyntax
		}
		location = loaded
	}
	startRaw, endRaw := c.Query("start_date"), c.Query("end_date")
	var startTime, endTime time.Time
	if startRaw == "" && endRaw == "" {
		now := time.Now().In(location)
		endTime = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, location)
		startTime = endTime.AddDate(0, 0, -7)
	} else {
		if startRaw == "" || endRaw == "" {
			return service.UserGroupUsageQuery{}, strconv.ErrSyntax
		}
		var err error
		startTime, err = time.ParseInLocation("2006-01-02", startRaw, location)
		if err != nil {
			return service.UserGroupUsageQuery{}, err
		}
		endDate, err := time.ParseInLocation("2006-01-02", endRaw, location)
		if err != nil {
			return service.UserGroupUsageQuery{}, err
		}
		endTime = endDate.AddDate(0, 0, 1)
	}
	query := service.UserGroupUsageQuery{StartTime: startTime, EndTime: endTime, Model: c.Query("model"), Page: page, PageSize: pageSize}
	if value := c.Query("user_id"); value != "" {
		userID, err := strconv.ParseInt(value, 10, 64)
		if err != nil || userID <= 0 {
			return service.UserGroupUsageQuery{}, strconv.ErrSyntax
		}
		query.UserID = &userID
	}
	if value := c.Query("billing_type"); value != "" {
		billingType, err := strconv.ParseInt(value, 10, 8)
		if err != nil || (billingType != int64(service.BillingTypeBalance) && billingType != int64(service.BillingTypeSubscription)) {
			return service.UserGroupUsageQuery{}, strconv.ErrSyntax
		}
		converted := int8(billingType)
		query.BillingType = &converted
	}
	return query, nil
}
