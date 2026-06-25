from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENV: str = "development"
    DATABASE_URL: str = "sqlite:///pos_db.db"
    JWT_SECRET: str = "change-me-in-production"
    LOG_SQL: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    EMAIL_ENABLED: bool = False
    EMAIL_API_BASE_URL: str = "https://api.brevo.com/v3/smtp/email"
    EMAIL_API_TOKEN: str | None = None
    EMAIL_API_AUTH_HEADER: str = "api-key"
    EMAIL_FROM_EMAIL: str | None = None
    EMAIL_FROM_NAME: str = "V1TR0 POS"
    EMAIL_TIMEOUT_SECONDS: int = 10
    FRONTEND_URL: str = "http://localhost:5173"

    LOW_STOCK_THRESHOLD: int = 5
    DEFAULT_NOTIFICATION_RECIPIENTS: str = ""
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    SCHEDULER_ENABLED: bool = False
    DAILY_SUMMARY_HOUR_UTC: int = 23
    RUN_MIGRATIONS_ON_STARTUP: bool = False

    APP_NAME: str = "V1TR0 POS"

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def default_notification_recipients(self) -> List[str]:
        return [email.strip() for email in self.DEFAULT_NOTIFICATION_RECIPIENTS.split(",") if email.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
