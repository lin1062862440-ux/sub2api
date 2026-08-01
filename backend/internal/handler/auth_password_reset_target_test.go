//go:build unit

package handler

import (
	"testing"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
	"github.com/stretchr/testify/require"
)

func TestResolvePasswordResetURL(t *testing.T) {
	tests := []struct {
		name       string
		target     string
		frontend   string
		wantURL    string
		wantReason string
	}{
		{name: "web default", frontend: "https://lynn.lat", wantURL: "https://lynn.lat"},
		{name: "web explicit", target: "web", frontend: "https://lynn.lat/", wantURL: "https://lynn.lat/"},
		{name: "desktop", target: "desktop", frontend: "https://attacker.invalid", wantURL: "linai://reset-password"},
		{name: "unknown target", target: "ftp", frontend: "https://lynn.lat", wantReason: "INVALID_RESET_TARGET"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolvePasswordResetURL(tt.target, tt.frontend)
			if tt.wantReason != "" {
				require.Error(t, err)
				require.Equal(t, tt.wantReason, infraerrors.Reason(err))
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantURL, got)
		})
	}
}
