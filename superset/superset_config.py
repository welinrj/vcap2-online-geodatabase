"""
superset_config.py
------------------
Apache Superset configuration for the MERL Dashboard.

This file is loaded by Superset at startup via the SUPERSET_CONFIG_PATH
environment variable or by placing it in the Python path as
`superset_config.py`.

Environment variables are loaded from Docker/compose; do NOT hard-code
secrets here.  See .env.example for the full variable reference.
"""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Any

# ---------------------------------------------------------------------------
# Core security
# ---------------------------------------------------------------------------
SECRET_KEY: str = os.environ["SUPERSET_SECRET_KEY"]

# ---------------------------------------------------------------------------
# Superset metadata database (PostgreSQL)
# ---------------------------------------------------------------------------
_PG_HOST = os.getenv("POSTGRES_HOST", "postgres")
_PG_PORT = os.getenv("POSTGRES_PORT", "5432")
_PG_DB = os.getenv("POSTGRES_DB", "merl_dashboard")
_PG_USER = os.getenv("POSTGRES_USER", "merl_user")
_PG_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

SQLALCHEMY_DATABASE_URI: str = (
    f"postgresql+psycopg2://{_PG_USER}:{_PG_PASSWORD}"
    f"@{_PG_HOST}:{_PG_PORT}/{_PG_DB}"
)

# Use a separate schema for Superset's own metadata tables so they don't
# collide with the merl application schema.
SQLALCHEMY_SCHEMA: str = "superset_meta"

# Connection pool settings
SQLALCHEMY_POOL_SIZE: int = 10
SQLALCHEMY_POOL_TIMEOUT: int = 30
SQLALCHEMY_MAX_OVERFLOW: int = 25
SQLALCHEMY_POOL_RECYCLE: int = 3600  # recycle connections every hour

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------
FEATURE_FLAGS: dict[str, bool] = {
    # Native dashboard filters (replaces legacy URL-param filters)
    "DASHBOARD_NATIVE_FILTERS": True,
    # Allow Jinja templating in SQL queries (use with caution — restrict by role)
    "ENABLE_TEMPLATE_PROCESSING": True,
    # Allow JS controls in chart forms (needed for some custom viz plugins)
    "ENABLE_JAVASCRIPT_CONTROLS": True,
    # Drill-down on charts
    "DRILL_TO_DETAIL": True,
    # Enable alerts & reports module
    "ALERT_REPORTS": True,
    # Show row-level counts on Explore page
    "ENABLE_EXPLORE_JSON_CSRF_PROTECTION": True,
    # Allow embedding dashboards in iframes
    "EMBEDDABLE_CHARTS": True,
    "EMBEDDED_SUPERSET": True,
    # Cache warmup
    "DASHBOARD_CACHE": True,
}

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGES: dict[str, dict[str, str]] = {
    "en": {"flag": "us", "name": "English"},
    # Uncomment to add Bislama/French when translations are available:
    # "fr": {"flag": "fr", "name": "Français"},
}
BABEL_DEFAULT_LOCALE: str = "en"
BABEL_DEFAULT_TIMEZONE: str = "Pacific/Efate"   # UTC+11 Vanuatu

# ---------------------------------------------------------------------------
# Security / CSRF / CORS
# ---------------------------------------------------------------------------
WTF_CSRF_ENABLED: bool = True
WTF_CSRF_TIME_LIMIT: int = 60 * 60 * 24  # 24 hours

SESSION_COOKIE_HTTPONLY: bool = True
SESSION_COOKIE_SAMESITE: str = "Lax"
SESSION_COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# Origins that are allowed to make cross-origin requests to Superset.
# In production, restrict this to your actual frontend hostname(s).
_CORS_ORIGINS_RAW: str = os.getenv(
    "SUPERSET_CORS_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:8088",
)
CORS_ORIGINS: list[str] = [o.strip() for o in _CORS_ORIGINS_RAW.split(",") if o.strip()]

ENABLE_CORS: bool = True
CORS_OPTIONS: dict[str, Any] = {
    "origins": CORS_ORIGINS,
    "methods": ["GET", "HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
    "allow_headers": [
        "Content-Type",
        "Authorization",
        "X-CSRFToken",
        "X-Requested-With",
    ],
    "supports_credentials": True,
    "max_age": 600,
}

# Hosts that Superset is served from (used for CSRF origin checking)
_APP_URL = os.getenv("SUPERSET_PUBLIC_URL", "http://localhost:8088")
ALLOWED_ORIGINS: list[str] = CORS_ORIGINS + [_APP_URL]

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
from flask_appbuilder.security.manager import AUTH_DB  # type: ignore[import]

AUTH_TYPE: int = AUTH_DB
AUTH_ROLE_ADMIN: str = "Admin"
AUTH_ROLE_PUBLIC: str = "Public"
# Automatically create users on first login (relevant for OAuth flows)
AUTH_USER_REGISTRATION: bool = False
AUTH_USER_REGISTRATION_ROLE: str = "Gamma"

# ---------------------------------------------------------------------------
# Query limits
# ---------------------------------------------------------------------------
ROW_LIMIT: int = 50_000
VIZ_ROW_LIMIT: int = 10_000
SAMPLES_ROW_LIMIT: int = 1_000
QUERY_SEARCH_LIMIT: int = 1_000

# ---------------------------------------------------------------------------
# Cache (Redis)
# ---------------------------------------------------------------------------
_REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Default cache: short TTL for explore/chart data
CACHE_CONFIG: dict[str, Any] = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("SUPERSET_CACHE_TTL", "600")),  # 10 minutes
    "CACHE_KEY_PREFIX": "superset_cache_",
    "CACHE_REDIS_URL": _REDIS_URL,
}

# Dashboard filter-state cache (longer TTL)
FILTER_STATE_CACHE_CONFIG: dict[str, Any] = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 86400,  # 24 hours
    "CACHE_KEY_PREFIX": "superset_filter_",
    "CACHE_REDIS_URL": _REDIS_URL,
}

# Explore permalink cache
EXPLORE_FORM_DATA_CACHE_CONFIG: dict[str, Any] = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 86400,
    "CACHE_KEY_PREFIX": "superset_explore_",
    "CACHE_REDIS_URL": _REDIS_URL,
}

# Data cache used by async queries (Celery results backend also uses Redis)
DATA_CACHE_CONFIG: dict[str, Any] = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("SUPERSET_DATA_CACHE_TTL", "1800")),  # 30 min
    "CACHE_KEY_PREFIX": "superset_data_",
    "CACHE_REDIS_URL": _REDIS_URL,
}

# Thumbnail cache (dashboard screenshots for email reports)
THUMBNAIL_CACHE_CONFIG: dict[str, Any] = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 3600,
    "CACHE_KEY_PREFIX": "superset_thumb_",
    "CACHE_REDIS_URL": _REDIS_URL,
}

# ---------------------------------------------------------------------------
# Celery (async queries and scheduled reports)
# ---------------------------------------------------------------------------
from celery.schedules import crontab  # type: ignore[import]


class CeleryConfig:
    broker_url: str = _REDIS_URL
    result_backend: str = os.getenv("REDIS_RESULTS_URL", _REDIS_URL.replace("/0", "/1"))
    worker_prefetch_multiplier: int = 1
    task_acks_late: bool = True
    task_serializer: str = "json"
    result_serializer: str = "json"
    accept_content: list[str] = ["json"]
    result_expires: int = 86400  # 24 hours

    imports: tuple[str, ...] = (
        "superset.sql_lab",
        "superset.tasks.scheduler",
        "superset.tasks.thumbnails",
        "superset.tasks.cache",
    )

    beat_schedule: dict[str, Any] = {
        # Warm up dashboard caches at 6am Vanuatu time (= 7pm UTC previous day)
        "cache_warmup_daily": {
            "task": "superset.tasks.cache.warm_up_cache",
            "schedule": crontab(hour=19, minute=0),
        },
        # Process scheduled alerts and reports every minute
        "reports_scheduler": {
            "task": "superset.tasks.scheduler.schedule_work",
            "schedule": crontab(minute="*"),
        },
    }


CELERY_CONFIG = CeleryConfig

# ---------------------------------------------------------------------------
# Alerts & Reports (email)
# ---------------------------------------------------------------------------
ALERT_REPORTS_NOTIFICATION_DRY_RUN: bool = (
    os.getenv("SUPERSET_ALERT_DRY_RUN", "false").lower() == "true"
)
WEBDRIVER_BASEURL: str = os.getenv("SUPERSET_WEBDRIVER_BASEURL", "http://superset:8088/")
WEBDRIVER_BASEURL_USER_FRIENDLY: str = _APP_URL

# Email configuration for alerts
SMTP_HOST_SUPERSET: str = os.getenv("SMTP_HOST", "smtp.example.com")
SMTP_PORT_SUPERSET: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_STARTTLS: bool = True
SMTP_SSL: bool = False
SMTP_USER_SUPERSET: str = os.getenv("SMTP_USER", "")
SMTP_PASSWORD_SUPERSET: str = os.getenv("SMTP_PASSWORD", "")
SMTP_MAIL_FROM: str = os.getenv("SMTP_FROM", "noreply@example.gov.vu")

# ---------------------------------------------------------------------------
# Upload / file settings
# ---------------------------------------------------------------------------
UPLOAD_FOLDER: str = os.getenv("UPLOAD_DIR", "/app/uploads/superset")
IMG_UPLOAD_FOLDER: str = os.path.join(UPLOAD_FOLDER, "images")
IMG_UPLOAD_URL: str = "/static/uploads/"
ALLOWED_EXTENSIONS: set[str] = {"csv", "tsv", "txt", "json", "parquet"}
CSV_EXPORT_LIMIT: int = 100_000

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
import logging

LOG_LEVEL: str = os.getenv("SUPERSET_LOG_LEVEL", "WARNING")
ENABLE_TIME_ROTATE: bool = True
TIME_ROTATE_LOG_LEVEL: str = LOG_LEVEL
FILENAME: str = os.path.join(
    os.getenv("SUPERSET_LOG_DIR", "/var/log/superset"), "superset.log"
)
ROLLOVER: str = "midnight"
INTERVAL: int = 1
BACKUP_COUNT: int = 30

# ---------------------------------------------------------------------------
# Miscellaneous
# ---------------------------------------------------------------------------
# Dashboard title shown in the browser
APP_NAME: str = "MERL Dashboard — Vanuatu L&D Fund"
APP_ICON: str = "/static/assets/images/superset-logo-horiz.png"

# Enable profiling for slow queries in development
ENABLE_PROFILING: bool = os.getenv("SUPERSET_PROFILING", "false").lower() == "true"

# Prevent users from submitting queries > 5 minutes
SQLLAB_TIMEOUT: int = int(os.getenv("SUPERSET_SQLLAB_TIMEOUT", "300"))
SUPERSET_WEBSERVER_TIMEOUT: int = SQLLAB_TIMEOUT

# Enable client-side pagination on tables
ENABLE_JAVASCRIPT_CONTROLS: bool = True

# Public role can see the landing page but nothing else
PUBLIC_ROLE_LIKE: str = "Gamma"

# Custom CSS injected into every page (leave empty or add branding overrides)
CUSTOM_CSS: str = ""
