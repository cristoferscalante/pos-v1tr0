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
    EMAIL_PROVIDER: str = "api"
    EMAIL_API_BASE_URL: str = "https://api.brevo.com/v3/smtp/email"
    EMAIL_API_TOKEN: str | None = None
    EMAIL_API_AUTH_HEADER: str = "api-key"
    EMAIL_FROM_EMAIL: str | None = None
    EMAIL_FROM_NAME: str = "V1TR0 POS"
    EMAIL_TIMEOUT_SECONDS: int = 10
    EMAIL_SMTP_HOST: str | None = None
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USERNAME: str | None = None
    EMAIL_SMTP_PASSWORD: str | None = None
    EMAIL_SMTP_USE_TLS: bool = True
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


_INSECURE_JWT_SECRETS = {"", "change-me-in-production"}


def _validate_production_settings(settings: "Settings") -> None:
    """Falla rápido y ruidoso en vez de arrancar en un estado inseguro.

    Antes, si JWT_SECRET quedaba vacío o en su valor por defecto en producción
    (por ejemplo porque la variable de entorno no se propagó bien al contenedor),
    el backend arrancaba igual y firmaba tokens con un secreto conocido/vacío,
    permitiendo falsificar el token de cualquier usuario, incluido superadmin.
    Ver hallazgo 5.10 del plan de mejora.
    """
    if not settings.is_production:
        return
    if settings.JWT_SECRET in _INSECURE_JWT_SECRETS or len(settings.JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET no está configurado de forma segura para producción "
            "(vacío, en su valor por defecto, o demasiado corto). "
            "Define una variable de entorno JWT_SECRET con al menos 32 "
            "caracteres aleatorios antes de arrancar en ENV=production."
        )


@lru_cache
def get_settings() -> Settings:
    resolved = Settings()
    _validate_production_settings(resolved)
    return resolved


settings = get_settings()
