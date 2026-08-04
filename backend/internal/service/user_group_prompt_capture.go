package service

import (
	"context"
	"time"
)

const (
	UserGroupPromptRetention        = 14 * 24 * time.Hour
	UserGroupPromptStagingRetention = 15 * time.Minute
)

type UserPromptCaptureWrite struct {
	EventID        string
	RequestID      string
	UserID         int64
	Protocol       string
	Model          string
	Stage          string
	RedactedPrompt string
	PromptHash     string
	PromptLength   int
	Truncated      bool
	GroupIDs       []int64
	CapturedAt     time.Time
	ExpiresAt      time.Time
}

type UserPromptCaptureDetail struct {
	ID             int64     `json:"id"`
	RequestID      string    `json:"request_id"`
	Protocol       string    `json:"protocol"`
	Model          string    `json:"model"`
	Stage          string    `json:"stage"`
	RedactedPrompt string    `json:"redacted_prompt"`
	PromptLength   int       `json:"prompt_length"`
	Truncated      bool      `json:"truncated"`
	CapturedAt     time.Time `json:"captured_at"`
	ExpiresAt      time.Time `json:"expires_at"`
}

type UserGroupPromptCaptureRepository interface {
	LoadEligibility(ctx context.Context) (map[int64][]int64, error)
	SetCaptureEnabled(ctx context.Context, groupID int64, enabled bool) error
	ListPromptViewers(ctx context.Context, groupID int64) ([]UserGroupViewer, error)
	ReplacePromptViewers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error
	CanViewPrompt(ctx context.Context, groupID, actorID int64) (bool, error)
	InsertCapture(ctx context.Context, capture UserPromptCaptureWrite) error
	PromptAvailableForUsage(ctx context.Context, groupID, usageLogID int64) (bool, error)
	ListUsagePrompts(ctx context.Context, groupID, usageLogID int64) ([]UserPromptCaptureDetail, error)
	DeleteExpiredBatch(ctx context.Context, now time.Time, limit int) (int64, error)
}

type UserGroupPromptEligibilityRefresher interface {
	RefreshEligibility(ctx context.Context) error
	PublishEligibilityInvalidation(ctx context.Context) error
}
