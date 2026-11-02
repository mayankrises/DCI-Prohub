# Feature flags to control deployment of new collaboration features

FEATURE_COLLABORATION_V1 = True

# Collaboration constants

LEASE_DURATION_SECONDS = 120

HEARTBEAT_INTERVAL_SECONDS = 45

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB


def is_collaboration_enabled() -> bool:
    """Check if the collaboration feature flag is enabled."""
    return FEATURE_COLLABORATION_V1