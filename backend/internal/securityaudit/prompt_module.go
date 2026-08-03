package securityaudit

import (
	"context"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/google/wire"
	"github.com/redis/go-redis/v9"
)

func ProvideUserGroupPromptCaptureService(repo service.UserGroupPromptCaptureRepository, redisClient *redis.Client) (*UserGroupPromptCaptureService, error) {
	svc := NewUserGroupPromptCaptureService(repo, redisClient)
	if err := svc.Start(context.Background()); err != nil {
		return nil, err
	}
	return svc, nil
}

var ProviderSet = wire.NewSet(
	NewPostgreSQLRepository,
	wire.Bind(new(JobRepository), new(*PostgreSQLRepository)),
	wire.Bind(new(EventRepository), new(*PostgreSQLRepository)),
	NewRedisPayloadStore,
	wire.Bind(new(PayloadStore), new(*RedisPayloadStore)),
	NewOpenAICompatibleScanner,
	wire.Bind(new(PromptScanner), new(*OpenAICompatibleScanner)),
	NewAtomicMetrics,
	wire.Bind(new(Metrics), new(*AtomicMetrics)),
	NewConfigManager,
	wire.Bind(new(ConfigStore), new(*ConfigManager)),
	NewPromptService,
	wire.Bind(new(PromptEngine), new(*PromptService)),
	wire.Bind(new(PromptAdminService), new(*PromptService)),
	NewLegacyModerationAdapter,
	NewCoordinator,
	NewPromptAdminHandler,
	ProvideUserGroupPromptCaptureService,
)
