package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/pkg/ctxkey"
	"github.com/Wei-Shaw/sub2api/internal/securityaudit"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCachesSecurityAuditCompletionSkipsWebSocketStages(t *testing.T) {
	require.True(t, cachesSecurityAuditCompletion("http"))
	require.True(t, cachesSecurityAuditCompletion(""))
	require.False(t, cachesSecurityAuditCompletion("first_turn"))
	require.False(t, cachesSecurityAuditCompletion("subsequent_turn"))
}

func TestRunSecurityAuditDoesNotSkipSubsequentWebSocketTurns(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := &turnCountingEngine{mode: securityaudit.ModeAsync}
	coordinator := securityaudit.NewCoordinator(nil, engine)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	subject := middleware2.AuthSubject{UserID: 7, Concurrency: 1}
	first := runSecurityAudit(c, nil, coordinator, nil, nil, nil, subject, "openai_responses", "gpt-test",
		[]byte(`{"type":"response.create","response":{"input":"benign"}}`), "first_turn")
	require.NotNil(t, first)
	require.True(t, first.AllowNextStage)
	require.Equal(t, int64(1), engine.enqueues.Load())
	_, cached := c.Get(securityAuditCompletedContextKey)
	require.False(t, cached, "WebSocket stages must not set the HTTP completion cache")

	// Even if an HTTP path previously cached completion on this Context, WS turns
	// must still audit every response.create payload.
	c.Set(securityAuditCompletedContextKey, true)

	second := runSecurityAudit(c, nil, coordinator, nil, nil, nil, subject, "openai_responses", "gpt-test",
		[]byte(`{"type":"response.create","response":{"input":"malicious follow-up"}}`), "subsequent_turn")
	require.NotNil(t, second)
	require.Equal(t, int64(2), engine.enqueues.Load(), "subsequent WebSocket turns must be audited again")
}

func TestUserGroupPromptCaptureDispatchesWithoutPromptAuditAndDeduplicatesHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	spy := &promptCaptureDispatcherSpy{}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	subject := middleware2.AuthSubject{UserID: 7, Concurrency: 1}
	body := []byte(`{"messages":[{"role":"user","content":"current"}]}`)

	require.Nil(t, runSecurityAudit(c, nil, nil, spy, nil, nil, subject, "anthropic_messages", "claude", body, "http"))
	require.Nil(t, runSecurityAudit(c, nil, nil, spy, nil, nil, subject, "anthropic_messages", "claude", body, "http"))
	require.Equal(t, int64(1), spy.calls.Load())
	require.Equal(t, int64(7), spy.last.UserID)
}

func TestUserGroupPromptCaptureDispatchesEveryWebSocketTurn(t *testing.T) {
	gin.SetMode(gin.TestMode)
	spy := &promptCaptureDispatcherSpy{}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	subject := middleware2.AuthSubject{UserID: 7, Concurrency: 1}

	for _, stage := range []string{"first_turn", "subsequent_turn"} {
		runSecurityAudit(c, nil, nil, spy, nil, nil, subject, "openai_responses", "gpt-test",
			[]byte(`{"type":"response.create","response":{"input":"turn"}}`), stage)
	}
	require.Equal(t, int64(2), spy.calls.Load())
}

func TestBuildSecurityAuditRequestUsesCanonicalClientRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	ctx := context.WithValue(request.Context(), ctxkey.RequestID, "local-request-ignored")
	ctx = context.WithValue(ctx, ctxkey.ClientRequestID, "client-request-123")
	c.Request = request.WithContext(ctx)

	auditRequest := buildSecurityAuditRequest(c, nil, middleware2.AuthSubject{UserID: 7}, "anthropic_messages", "claude", nil, "http")

	require.Equal(t, "client:client-request-123", auditRequest.RequestID)
}

func TestBuildSecurityAuditRequestUsesCanonicalLocalRequestIDFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	ctx := context.WithValue(request.Context(), ctxkey.RequestID, "local-request-456")
	c.Request = request.WithContext(ctx)

	auditRequest := buildSecurityAuditRequest(c, nil, middleware2.AuthSubject{UserID: 7}, "anthropic_messages", "claude", nil, "http")

	require.Equal(t, "local:local-request-456", auditRequest.RequestID)
}

type promptCaptureDispatcherSpy struct {
	calls atomic.Int64
	last  securityaudit.Request
}

func (s *promptCaptureDispatcherSpy) Dispatch(request securityaudit.Request) {
	s.last = request
	s.calls.Add(1)
}

type turnCountingEngine struct {
	mode     securityaudit.Mode
	enqueues atomic.Int64
}

func (e *turnCountingEngine) EffectiveMode() securityaudit.Mode { return e.mode }
func (e *turnCountingEngine) Enqueue(context.Context, securityaudit.Request) error {
	e.enqueues.Add(1)
	return nil
}
func (e *turnCountingEngine) Evaluate(context.Context, securityaudit.Request) (*securityaudit.PromptDecision, error) {
	return &securityaudit.PromptDecision{Kind: securityaudit.DecisionAllow, AllowNextStage: true}, nil
}
