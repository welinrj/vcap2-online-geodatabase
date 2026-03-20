# Environment Variables Reference — MERL Dashboard

All environment variables are stored in the `.env` file at the root of the `merl-dashboard` directory. Copy `.env.example` to `.env` before starting the stack.

```bash
cp .env.example .env
```

Variables marked **Required** must be set before running `docker compose up`. Variables marked **Optional** have sensible defaults that work for most deployments.

---

## Table of Contents

1. [PostgreSQL](#1-postgresql)
2. [ClickHouse](#2-clickhouse)
3. [PeerDB](#3-peerdb)
4. [Backend (FastAPI)](#4-backend-fastapi)
5. [Frontend (React / Vite)](#5-frontend-react--vite)
6. [Keycloak](#6-keycloak)
7. [Airflow](#7-airflow)
8. [Superset](#8-superset)
9. [Redis](#9-redis)
10. [AWS / S3 Backups](#10-aws--s3-backups)
11. [SMTP / Email](#11-smtp--email)
12. [pgAdmin (Dev Only)](#12-pgadmin-dev-only)

---

## 1. PostgreSQL

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `POSTGRES_DB` | postgres, backend, airflow, superset, keycloak | Name of the primary PostgreSQL database | `merldb` | Yes |
| `POSTGRES_USER` | postgres, backend, airflow, superset, keycloak | PostgreSQL superuser username | `merluser` | Yes |
| `POSTGRES_PASSWORD` | postgres, backend, airflow, superset, keycloak | PostgreSQL superuser password. Use a strong random string (min 24 chars). | `s3cur3P@ssw0rd!XYZ` | Yes |

**Notes:**
- All application schemas (Keycloak, Airflow, Superset) are created inside the same database using schema isolation. The `init.sql` migration script creates separate schemas: `keycloak`, `airflow`, `superset`, and `merl`.
- In a high-security environment, consider creating separate PostgreSQL users for each service with minimum required privileges.

---

## 2. ClickHouse

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `CLICKHOUSE_DB` | clickhouse, backend, superset, peerdb | ClickHouse database name | `merl_analytics` | Yes |
| `CLICKHOUSE_USER` | clickhouse, backend, superset, peerdb | ClickHouse username | `merlch` | Yes |
| `CLICKHOUSE_PASSWORD` | clickhouse, backend, superset, peerdb | ClickHouse password | `Cl1ckH0use!Pass` | Yes |

**Notes:**
- The ClickHouse database is used exclusively for analytics and reporting. Application writes go to PostgreSQL only.
- PeerDB uses these credentials to create the destination peer and write CDC data.

---

## 3. PeerDB

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `PEERDB_PASSWORD` | peerdb | PeerDB internal API password for the web UI | `P33rDB!secret` | Yes |

**Notes:**
- PeerDB uses the `POSTGRES_*` variables to connect to its catalog database (the same PostgreSQL instance).
- Mirror configuration (which tables to replicate) is defined in `peerdb/config.json`.

---

## 4. Backend (FastAPI)

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `DATABASE_URL` | backend | Async SQLAlchemy connection URL for PostgreSQL | `postgresql+asyncpg://merluser:password@postgres:5432/merldb` | Yes (auto-built from POSTGRES_* vars) |
| `BACKEND_SECRET_KEY` | backend | Secret key for signing internal tokens and cookies. Generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` | `a3f8d2...` (64 hex chars) | Yes |
| `ENVIRONMENT` | backend | Deployment environment. Controls debug output, CORS strictness. | `production` | Optional (default: `production`) |
| `ALLOWED_ORIGINS` | backend | Comma-separated list of allowed CORS origins | `https://merl.climate.gov.vu` | Yes |
| `KEYCLOAK_REALM` | backend, frontend | Keycloak realm name for the MERL application | `merl` | Yes |
| `KEYCLOAK_CLIENT_ID` | backend, frontend | Keycloak client ID for the MERL frontend/backend | `merl-portal` | Yes |
| `KEYCLOAK_CLIENT_SECRET` | backend | Keycloak client secret for backend confidential client | `abc123...` | Yes |
| `UPLOAD_DIR` | backend | Directory inside the container where uploads are stored | `/app/uploads` | Optional (default: `/app/uploads`) |

**Notes:**
- `DATABASE_URL` is constructed automatically from `POSTGRES_*` variables in `docker-compose.yml`. You do not need to set it explicitly unless you want to override it.
- `KEYCLOAK_CLIENT_SECRET` is found in the Keycloak admin console under Clients → merl-portal → Credentials tab.

---

## 5. Frontend (React / Vite)

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `VITE_API_URL` | frontend | Public URL of the backend API, as seen by the browser | `https://merl.climate.gov.vu/api` | Yes |
| `VITE_KEYCLOAK_URL` | frontend | Public URL of the Keycloak server, as seen by the browser | `https://merl.climate.gov.vu/auth` | Yes |
| `VITE_KEYCLOAK_REALM` | frontend | Same as `KEYCLOAK_REALM` | `merl` | Yes |
| `VITE_KEYCLOAK_CLIENT_ID` | frontend | Same as `KEYCLOAK_CLIENT_ID` | `merl-portal` | Yes |
| `VITE_MAPBOX_TOKEN` | frontend | Mapbox GL JS public access token for the map view. Obtain from mapbox.com. | `pk.eyJ1Ijo...` | Optional (map view disabled without this) |

**Notes:**
- `VITE_*` variables are baked into the React build at build time. Changing them after building the image requires a rebuild.
- In development mode (`docker-compose.dev.yml`), the Vite dev server reads these from `.env` at startup — no rebuild required.

---

## 6. Keycloak

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `KEYCLOAK_ADMIN_USER` | keycloak | Keycloak bootstrap admin username | `admin` | Optional (default: `admin`) |
| `KEYCLOAK_ADMIN_PASSWORD` | keycloak | Keycloak bootstrap admin password. Change immediately after first login. | `Keyc10@kAdmin!` | Yes |
| `KEYCLOAK_REALM` | backend, frontend | The Keycloak realm to use for MERL users | `merl` | Yes |
| `KEYCLOAK_CLIENT_ID` | backend, frontend | Keycloak OIDC client identifier | `merl-portal` | Yes |
| `KEYCLOAK_CLIENT_SECRET` | backend | Client secret from Keycloak (confidential client) | `d9e3f1...` | Yes |

**Notes:**
- After first startup, log into the Keycloak admin console (`http://localhost/auth`) and create the `merl` realm and `merl-portal` client.
- Export the realm configuration to `keycloak/realm-export.json` so it can be auto-imported on fresh deployments.

---

## 7. Airflow

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `AIRFLOW_FERNET_KEY` | airflow | Fernet key for encrypting sensitive variables in the Airflow metadata DB. Generate with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | `ZmDf...=` (44 base64 chars) | Yes |
| `AIRFLOW_SECRET_KEY` | airflow | Flask secret key for the Airflow webserver | `airflow_web_secret_xyz` | Yes |

**Notes:**
- The `AIRFLOW__DATABASE__SQL_ALCHEMY_CONN` and `AIRFLOW__CELERY__BROKER_URL` are constructed automatically from `POSTGRES_*` and Redis variables in `docker-compose.yml`.
- If you lose the Fernet key, encrypted connection passwords in Airflow will be unrecoverable. Back up the `.env` file securely.
- All `POSTGRES_*`, `CLICKHOUSE_*`, `AWS_*`, and `SMTP_*` variables are also passed to Airflow so DAGs can access them via `os.environ`.

---

## 8. Superset

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `SUPERSET_SECRET_KEY` | superset | Flask secret key for Superset session management. Generate with `python3 -c "import secrets; print(secrets.token_hex(42))"` | `84b2c1...` (84 hex chars) | Yes |
| `SUPERSET_ADMIN_USER` | superset | Username for the initial Superset admin account | `admin` | Optional (default: `admin`) |
| `SUPERSET_ADMIN_PASSWORD` | superset | Password for the initial Superset admin account. Change after first login. | `Sup3rs3t!Admin` | Yes |
| `SUPERSET_ADMIN_EMAIL` | superset | Email address for the Superset admin account | `admin@merl.gov.vu` | Optional (default: `admin@merl.gov.vu`) |

**Notes:**
- `DATABASE_URI` (Superset metadata DB) is constructed automatically from `POSTGRES_*` variables.
- `REDIS_URL` (Superset cache) is set automatically to `redis://redis:6379/2`.
- Dashboard definitions are imported from `superset/exports/` on first startup (if configured in `superset_config.py`).

---

## 9. Redis

Redis requires no additional configuration in `.env`. It runs with default settings.

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| *(none required)* | redis | Redis uses no authentication in the default config. If you enable Redis AUTH, update the `REDIS_URL` in all consumer services. | — | No |

**Notes:**
- Redis database allocation: `0` = backend cache, `1` = Airflow Celery broker, `2` = Superset cache.
- For production, consider enabling Redis password authentication and updating all `REDIS_URL` values accordingly.

---

## 10. AWS / S3 Backups

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `BACKUP_S3_BUCKET` | airflow | Name of the S3 bucket for backup storage | `merl-backups-gov-vu` | Yes (for automated backups) |
| `AWS_ACCESS_KEY_ID` | airflow | AWS IAM access key ID with S3 write access | `AKIA...` | Yes (for automated backups) |
| `AWS_SECRET_ACCESS_KEY` | airflow | AWS IAM secret access key | `wJalrXUt...` | Yes (for automated backups) |
| `AWS_DEFAULT_REGION` | airflow | AWS region where the S3 bucket is located | `ap-southeast-2` | Optional (default: `ap-southeast-2`) |

**Notes:**
- If you do not use S3 backups, leave these variables blank. Backups will still be saved to the local `backups_data` volume.
- The IAM user should have the minimum necessary permissions: `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the backup bucket only.

---

## 11. SMTP / Email

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `SMTP_HOST` | airflow | SMTP server hostname | `smtp.gmail.com` | Yes (for email alerts) |
| `SMTP_PORT` | airflow | SMTP server port | `587` | Optional (default: `587`) |
| `SMTP_USER` | airflow | SMTP username / sender email address | `merl-alerts@climate.gov.vu` | Yes (for email alerts) |
| `SMTP_PASSWORD` | airflow | SMTP password or app-specific password | `app_password_here` | Yes (for email alerts) |
| `ALERT_EMAIL` | airflow | Email address that receives backup and error alerts | `ict-admin@climate.gov.vu` | Yes (for email alerts) |

**Notes:**
- For Gmail, use an App Password (requires 2FA enabled on the Google account).
- Airflow's SMTP configuration is set via the `AIRFLOW__SMTP__*` environment variables, which are configured in the DAG email operator.

---

## 12. pgAdmin (Dev Only)

These variables are only used in `docker-compose.dev.yml`.

| Variable | Service(s) | Description | Example Value | Required |
|----------|------------|-------------|---------------|----------|
| `PGADMIN_EMAIL` | pgadmin (dev) | Login email for the pgAdmin web UI | `dev@merl.local` | Optional (default: `dev@merl.local`) |
| `PGADMIN_PASSWORD` | pgadmin (dev) | Login password for the pgAdmin web UI | `devpassword` | Optional (default: `devpassword`) |

---

## Generating Secure Secret Keys

```bash
# SUPERSET_SECRET_KEY (84 hex chars = 42 bytes)
python3 -c "import secrets; print(secrets.token_hex(42))"

# BACKEND_SECRET_KEY (64 hex chars = 32 bytes)
python3 -c "import secrets; print(secrets.token_hex(32))"

# AIRFLOW_FERNET_KEY (Fernet base64)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# AIRFLOW_SECRET_KEY (32 hex chars)
python3 -c "import secrets; print(secrets.token_hex(16))"
```

---

*Document version: 1.0 | March 2026 | Vanua Spatial Solutions*
