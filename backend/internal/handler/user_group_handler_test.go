package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type userGroupServiceStub struct {
	actor         service.UserGroupActor
	capabilities  service.UserGroupCapabilities
	replacedIDs   []int64
	usageQuery    service.UserGroupUsageQuery
	usageResult   *service.UserGroupUsageResult
	promptEnabled *bool
	promptIDs     []int64
	promptUsageID int64
	prompts       []service.UserPromptCaptureDetail
	teamGroupIDs  []int64
}

func (s *userGroupServiceStub) Capabilities(_ context.Context, actor service.UserGroupActor) (service.UserGroupCapabilities, error) {
	s.actor = actor
	return s.capabilities, nil
}

func (s *userGroupServiceStub) List(context.Context, service.UserGroupActor) ([]service.UserGroup, error) {
	return []service.UserGroup{}, nil
}

func (s *userGroupServiceStub) Create(context.Context, service.UserGroupActor, service.UserGroupMutation) (*service.UserGroup, error) {
	return &service.UserGroup{}, nil
}

func (s *userGroupServiceStub) Update(context.Context, service.UserGroupActor, int64, service.UserGroupMutation) (*service.UserGroup, error) {
	return &service.UserGroup{}, nil
}

func (s *userGroupServiceStub) Archive(context.Context, service.UserGroupActor, int64) error {
	return nil
}

func (s *userGroupServiceStub) ListMembers(context.Context, service.UserGroupActor, int64) ([]service.UserGroupMember, error) {
	return []service.UserGroupMember{}, nil
}

func (s *userGroupServiceStub) ReplaceMembers(_ context.Context, actor service.UserGroupActor, _ int64, ids []int64) error {
	s.actor = actor
	s.replacedIDs = append([]int64(nil), ids...)
	return nil
}

func (s *userGroupServiceStub) ListViewers(context.Context, service.UserGroupActor, int64) ([]service.UserGroupViewer, error) {
	return []service.UserGroupViewer{}, nil
}

func (s *userGroupServiceStub) ReplaceViewers(context.Context, service.UserGroupActor, int64, []int64) error {
	return nil
}

func (s *userGroupServiceStub) ReplaceTeamSubscriptionGroups(_ context.Context, actor service.UserGroupActor, _ int64, ids []int64) error {
	s.actor = actor
	s.teamGroupIDs = append([]int64(nil), ids...)
	return nil
}

func (s *userGroupServiceStub) ListSubscriptions(context.Context, service.UserGroupActor, int64, service.UserGroupSubscriptionQuery) (*service.UserGroupSubscriptionResult, error) {
	return &service.UserGroupSubscriptionResult{}, nil
}

func (s *userGroupServiceStub) GetUsage(_ context.Context, actor service.UserGroupActor, _ int64, query service.UserGroupUsageQuery) (*service.UserGroupUsageResult, error) {
	s.actor = actor
	s.usageQuery = query
	return s.usageResult, nil
}

func (s *userGroupServiceStub) SetPromptCapture(_ context.Context, actor service.UserGroupActor, _ int64, enabled bool) error {
	s.actor = actor
	s.promptEnabled = &enabled
	return nil
}

func (s *userGroupServiceStub) ListPromptViewers(context.Context, service.UserGroupActor, int64) ([]service.UserGroupViewer, error) {
	return []service.UserGroupViewer{}, nil
}

func (s *userGroupServiceStub) ReplacePromptViewers(_ context.Context, actor service.UserGroupActor, _ int64, ids []int64) error {
	s.actor = actor
	s.promptIDs = append([]int64(nil), ids...)
	return nil
}

func (s *userGroupServiceStub) GetUsagePrompts(_ context.Context, actor service.UserGroupActor, _ int64, usageLogID int64) ([]service.UserPromptCaptureDetail, error) {
	s.actor = actor
	s.promptUsageID = usageLogID
	return s.prompts, nil
}

func TestUserGroupHandlerCapabilitiesUsesAuthenticatedActor(t *testing.T) {
	stub := &userGroupServiceStub{capabilities: service.UserGroupCapabilities{CanAccess: true, GroupCount: 2}}
	handler := newUserGroupHandlerWithService(stub)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/capabilities", nil)
	c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 42})
	c.Set(string(middleware.ContextKeyUserRole), service.RoleUser)

	handler.Capabilities(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, service.UserGroupActor{UserID: 42, Role: service.RoleUser}, stub.actor)
	var body struct {
		Code int                           `json:"code"`
		Data service.UserGroupCapabilities `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.Zero(t, body.Code)
	require.Equal(t, int64(2), body.Data.GroupCount)
}

func TestUserGroupHandlerReplaceMembersParsesCompleteIDSet(t *testing.T) {
	stub := &userGroupServiceStub{}
	handler := newUserGroupHandlerWithService(stub)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "id", Value: "5"}}
	c.Request = httptest.NewRequest(http.MethodPut, "/api/v1/user-groups/5/members", strings.NewReader(`{"user_ids":[9,3]}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 1})
	c.Set(string(middleware.ContextKeyUserRole), service.RoleAdmin)

	handler.ReplaceMembers(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, []int64{9, 3}, stub.replacedIDs)
	require.Equal(t, service.RoleAdmin, stub.actor.Role)
}

func TestUserGroupHandlerReplaceMembersAcceptsEmptySet(t *testing.T) {
	stub := &userGroupServiceStub{}
	handler := newUserGroupHandlerWithService(stub)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "id", Value: "5"}}
	c.Request = httptest.NewRequest(http.MethodPut, "/api/v1/user-groups/5/members", strings.NewReader(`{"user_ids":[]}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 1})
	c.Set(string(middleware.ContextKeyUserRole), service.RoleAdmin)

	handler.ReplaceMembers(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Empty(t, stub.replacedIDs)
}

func TestUserGroupHandlerRejectsInvalidGroupID(t *testing.T) {
	handler := newUserGroupHandlerWithService(&userGroupServiceStub{})
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "id", Value: "not-a-number"}}
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/not-a-number/members", nil)
	c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 1})
	c.Set(string(middleware.ContextKeyUserRole), service.RoleAdmin)

	handler.ListMembers(c)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestUserGroupHandlerUsageParsesInclusiveDatesAndBillingType(t *testing.T) {
	stub := &userGroupServiceStub{usageResult: &service.UserGroupUsageResult{}}
	handler := newUserGroupHandlerWithService(stub)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "id", Value: "5"}}
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/5/usage?start_date=2026-08-01&end_date=2026-08-02&billing_type=1&timezone=Asia%2FShanghai", nil)
	c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 42})
	c.Set(string(middleware.ContextKeyUserRole), service.RoleUser)

	handler.GetUsage(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 8, 1, 0, 0, 0, 0, location), stub.usageQuery.StartTime)
	require.Equal(t, time.Date(2026, 8, 3, 0, 0, 0, 0, location), stub.usageQuery.EndTime)
	require.NotNil(t, stub.usageQuery.BillingType)
	require.Equal(t, int8(1), *stub.usageQuery.BillingType)
}

func TestUserGroupHandlerPromptEndpointsParseExactPayloads(t *testing.T) {
	gin.SetMode(gin.TestMode)
	stub := &userGroupServiceStub{prompts: []service.UserPromptCaptureDetail{{ID: 91, RedactedPrompt: "safe"}}}
	handler := newUserGroupHandlerWithService(stub)

	t.Run("capture toggle", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Params = gin.Params{{Key: "id", Value: "5"}}
		c.Request = httptest.NewRequest(http.MethodPut, "/api/v1/user-groups/5/prompt-capture", strings.NewReader(`{"enabled":false}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 1})
		c.Set(string(middleware.ContextKeyUserRole), service.RoleAdmin)

		handler.SetPromptCapture(c)

		require.Equal(t, http.StatusOK, recorder.Code)
		require.NotNil(t, stub.promptEnabled)
		require.False(t, *stub.promptEnabled)
	})

	t.Run("prompt viewers", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Params = gin.Params{{Key: "id", Value: "5"}}
		c.Request = httptest.NewRequest(http.MethodPut, "/api/v1/user-groups/5/prompt-viewers", strings.NewReader(`{"user_ids":[8,3]}`))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 1})
		c.Set(string(middleware.ContextKeyUserRole), service.RoleAdmin)

		handler.ReplacePromptViewers(c)

		require.Equal(t, http.StatusOK, recorder.Code)
		require.Equal(t, []int64{8, 3}, stub.promptIDs)
	})

	t.Run("usage prompts", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Params = gin.Params{{Key: "id", Value: "5"}, {Key: "usageLogID", Value: "42"}}
		c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/5/usage/42/prompts", nil)
		c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 8})
		c.Set(string(middleware.ContextKeyUserRole), service.RoleUser)

		handler.GetUsagePrompts(c)

		require.Equal(t, http.StatusOK, recorder.Code)
		require.Equal(t, int64(42), stub.promptUsageID)
		require.NotContains(t, recorder.Body.String(), "raw_prompt")
		require.Contains(t, recorder.Body.String(), "safe")
	})
}
