"""
Application configuration loaded from environment variables.

All settings are validated at startup via pydantic-settings.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://merl:merl@localhost:5432/merl_db",
        description="Async SQLAlchemy PostgreSQL connection string.",
    )

    # ── ClickHouse ────────────────────────────────────────────────────────────
    CLICKHOUSE_HOST: str = Field(default="localhost")
    CLICKHOUSE_PORT: int = Field(default=9000)
    CLICKHOUSE_DB: str = Field(default="merl_analytics")
    CLICKHOUSE_USER: str = Field(default="default")
    CLICKHOUSE_PASSWORD: str = Field(default="")

    # ── Keycloak ──────────────────────────────────────────────────────────────
    KEYCLOAK_URL: str = Field(
        default="http://keycloak:8080",
        description="Base URL of the Keycloak server (no trailing slash).",
    )
    KEYCLOAK_REALM: str = Field(default="merl")
    KEYCLOAK_CLIENT_ID: str = Field(default="merl-dashboard")

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(
        default="change-me-in-production-use-a-long-random-string",
        min_length=32,
    )

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # ── File uploads ──────────────────────────────────────────────────────────
    UPLOAD_DIR: str = Field(default="/app/uploads")
    MAX_UPLOAD_SIZE_MB: int = Field(default=50, ge=1, le=500)

    # ── Airflow ───────────────────────────────────────────────────────────────
    AIRFLOW_API_URL: str = Field(default="http://airflow:8080/api/v1")

    # ── SMTP / Email ──────────────────────────────────────────────────────────
    SMTP_HOST: str = Field(default="smtp.example.com")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    SMTP_FROM: str = Field(default="merl@example.com")
    REPORT_RECIPIENTS: List[str] = Field(default_factory=list)

    # ── S3 / Object storage (optional) ───────────────────────────────────────
    S3_BUCKET: Optional[str] = Field(default=None)
    S3_ENDPOINT: Optional[str] = Field(default=None)
    AWS_ACCESS_KEY_ID: Optional[str] = Field(default=None)
    AWS_SECRET_ACCESS_KEY: Optional[str] = Field(default=None)

    # ── General ───────────────────────────────────────────────────────────────
    DEBUG: bool = Field(default=False)
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )

    # ── Derived helpers ───────────────────────────────────────────────────────
    @property
    def keycloak_jwks_uri(self) -> str:
        return (
            f"{self.KEYCLOAK_URL}/realms/{self.KEYCLOAK_REALM}"
            "/protocol/openid-connect/certs"
        )

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.KEYCLOAK_URL}/realms/{self.KEYCLOAK_REALM}"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @field_validator("REPORT_RECIPIENTS", "CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_list(cls, v: object) -> object:
        """Accept either a real list or a comma-separated string."""
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


# Module-level convenience alias used throughout the app.
settings: Settings = get_settings()
