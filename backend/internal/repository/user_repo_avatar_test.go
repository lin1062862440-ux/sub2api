package repository

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestLoadUserAvatarURLs_BatchesAndAppliesUploadedAvatars(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	users := map[int64]*service.User{
		7: {ID: 7, Username: "Lin"},
		8: {ID: 8, Username: "No Avatar"},
	}
	mock.ExpectQuery(`SELECT user_id, url\s+FROM user_avatars\s+WHERE user_id = ANY\(\$1\)`).
		WithArgs(sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "url"}).
			AddRow(7, "https://cdn.example.com/lin.png"))

	repo := &userRepository{sql: db}
	err = repo.loadUserAvatarURLs(context.Background(), []int64{7, 8}, users)

	require.NoError(t, err)
	require.Equal(t, "https://cdn.example.com/lin.png", users[7].AvatarURL)
	require.Empty(t, users[8].AvatarURL)
	require.NoError(t, mock.ExpectationsWereMet())
}
