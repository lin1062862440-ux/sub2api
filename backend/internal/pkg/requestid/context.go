package requestid

import (
	"context"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/ctxkey"
)

// FromContext returns the stable request identity shared by prompt capture and
// usage billing. Client IDs take precedence because they survive retries.
func FromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if clientRequestID, _ := ctx.Value(ctxkey.ClientRequestID).(string); strings.TrimSpace(clientRequestID) != "" {
		return "client:" + strings.TrimSpace(clientRequestID)
	}
	if localRequestID, _ := ctx.Value(ctxkey.RequestID).(string); strings.TrimSpace(localRequestID) != "" {
		return "local:" + strings.TrimSpace(localRequestID)
	}
	return ""
}
