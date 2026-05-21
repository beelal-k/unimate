# core/config.py
# Application settings loaded from environment variables

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Turso
    turso_url: str
    turso_auth_token: str

    # Gemini
    gemini_api_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Expo Push Notifications
    expo_access_token: str = ""

    # Server
    secret_key: str = "change-me-in-production"
    environment: str = "development"
    max_jobs_per_user: int = 5
    rate_limit_per_minute: int = 30

    # Rate limits
    max_analyze_jobs_per_hour: int = 10
    max_embed_jobs_per_day: int = 5
    max_concurrent_jobs_per_user: int = 3

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
