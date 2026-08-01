package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type userGroupRouteRepositoryStub struct {
	service.UserGroupRepository
	actorID int64
	isAdmin bool
}

func (s *userGroupRouteRepositoryStub) CountAccessible(_ context.Context, actorID int64, isAdmin bool) (int64, error) {
	s.actorID = actorID
	s.isAdmin = isAdmin
	return 1, nil
}

func TestRegisterUserGroupRoutesMountsExpectedSurface(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	v1 := router.Group("/api/v1")
	registerUserGroupRoutes(v1, &handler.UserGroupHandler{}, func(c *gin.Context) { c.Next() })

	routes := map[string]bool{}
	for _, route := range router.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	expected := []string{
		http.MethodGet + " /api/v1/user-groups/capabilities",
		http.MethodGet + " /api/v1/user-groups",
		http.MethodPost + " /api/v1/user-groups",
		http.MethodPut + " /api/v1/user-groups/:id",
		http.MethodDelete + " /api/v1/user-groups/:id",
		http.MethodGet + " /api/v1/user-groups/:id/members",
		http.MethodPut + " /api/v1/user-groups/:id/members",
		http.MethodGet + " /api/v1/user-groups/:id/viewers",
		http.MethodPut + " /api/v1/user-groups/:id/viewers",
		http.MethodGet + " /api/v1/user-groups/:id/subscriptions",
		http.MethodGet + " /api/v1/user-groups/:id/usage",
	}
	for _, route := range expected {
		require.Truef(t, routes[route], "missing route %s", route)
	}
}

func TestRegisterUserGroupRoutesInheritsAuthenticationMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	v1 := router.Group("/api/v1")
	authenticated := v1.Group("")
	authenticated.Use(func(c *gin.Context) {
		c.AbortWithStatus(http.StatusUnauthorized)
	})
	registerUserGroupRoutes(authenticated, &handler.UserGroupHandler{}, func(c *gin.Context) { c.Next() })

	request := httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/capabilities", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusUnauthorized, response.Code)
}

func TestRegisterUserGroupRoutesAllowsOrdinaryAuthenticatedUserToReachHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := &userGroupRouteRepositoryStub{}
	userGroupHandler := handler.NewUserGroupHandler(service.NewUserGroupService(repo))
	router := gin.New()
	v1 := router.Group("/api/v1")
	authenticated := v1.Group("")
	authenticated.Use(func(c *gin.Context) {
		c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 42})
		c.Set(string(middleware.ContextKeyUserRole), service.RoleUser)
		c.Next()
	})
	registerUserGroupRoutes(authenticated, userGroupHandler, func(c *gin.Context) { c.Next() })

	request := httptest.NewRequest(http.MethodGet, "/api/v1/user-groups/capabilities", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var body struct {
		Code int                           `json:"code"`
		Data service.UserGroupCapabilities `json:"data"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	require.Zero(t, body.Code)
	require.Equal(t, service.UserGroupCapabilities{CanAccess: true, CanManage: false, GroupCount: 1}, body.Data)
	require.Equal(t, int64(42), repo.actorID)
	require.False(t, repo.isAdmin)
}
