package dto

import (
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestUserFromServiceShallow_MapsAvatarURL(t *testing.T) {
	mapped := UserFromServiceShallow(&service.User{
		ID:        7,
		Username:  "Lin",
		AvatarURL: "https://cdn.example.com/lin.png",
	})

	require.Equal(t, "https://cdn.example.com/lin.png", mapped.AvatarURL)
}
