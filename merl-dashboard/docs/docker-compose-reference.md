# Docker Compose Reference — MERL Dashboard

This document provides an annotated explanation of every service, volume, and network defined in `docker-compose.yml`. Use it to understand configuration decisions, troubleshoot issues, and safely modify the stack.

---

## Table of Contents

1. [How to Read This Document](#1-how-to-read-this-document)
2. [Service: nginx](#2-service-nginx)
3. [Service: postgres](#3-service-postgres)
4. [Service: clickhouse](#4-service-clickhouse)
5. [Service: peerdb](#5-service-peerdb)
6. [Service: backend](#6-service-backend)
7. [Service: frontend](#7-service-frontend)
8. [Service: airflow](#8-service-airflow)
9. [Service: superset](#9-service-superset)
10. [Service: keycloak](#10-service-keycloak)
11. [Service: redis](#11-service-redis)
12. [Volumes Strategy](#12-volumes-strategy)
13. [Network Architecture](#13-network-architecture)
14. [Development Overrides](#14-development-overrides)

---

## 1. How to Read This Document

Each service section follows this structure:

- **Purpose** — what the service does in the MERL system
- **Image** — the Docker image used and why this version was chosen
- **Key Configuration** — explanation of important `environment`, `volumes`, `ports`, and `command` settings
- **Healthcheck** — what the healthcheck tests and why
- **Dependencies** — which services must be running first and why
- **Scaling Notes** — whether this service can be scaled horizontally

Common commands for managing a specific service:

```bash
# View logs
docker compose logs -f <service>

# Restart a single service
docker compose restart <service>

# Rebuild and restart (after code change)
docker compose up -d --build <service>

# Execute a command inside the running container
docker compose exec <service> <command>

# Stop a single service without removing its volumes
docker compose stop <service>
```

---

## 2. Service: nginx

**Purpose:** The single entry point for all external HTTP/HTTPS traffic. NGINX terminates TLS, handles SSL certificates, and reverse-proxies requests to the correct internal service based on the URL path.

**Image:** `nginx:1.25-alpine`
- 1.25 is an LTS stable release with security patches.
- Alpine variant keeps the image small and reduces attack surface.

### Key Configuration

```yaml
ports:
  - "80:80"
  - "443:443"
```
Only ports 80 and 443 are exposed to the host. All other services communicate over the internal `merl-net` network and are not directly accessible from outside the host.

```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - ./nginx/ssl:/etc/nginx/ssl:ro
  - ./nginx/logs:/var/log/nginx
```
- `nginx.conf` is mounted read-only (`:ro`) to prevent the container from modifying it.
- `ssl/` contains TLS certificates. Mounted read-only for security.
- `logs/` is mounted writable so log rotation and external log shippers can access the files.

```yaml
depends_on:
  - frontend
  - backend
  - superset
```
NGINX will not start until these services have started (note: `depends_on` only waits for container start, not for the service to be healthy). The NGINX configuration includes `proxy_connect_timeout` and retry logic to handle brief upstream unavailability at startup.

### Healthcheck

NGINX itself does not have a healthcheck defined in `docker-compose.yml` because the services it depends on have their own healthchecks. NGINX's own health can be monitored by checking `curl -sf http://localhost/health` from the host.

### Scaling Notes

NGINX cannot be scaled horizontally in this single-server deployment. In a multi-server setup, use a load balancer (e.g., HAProxy or AWS ALB) in front of multiple NGINX instances.

---

## 3. Service: postgres

**Purpose:** The primary transactional relational database. Stores all MERL application data (indicators, activities, events, organisations), as well as metadata for Keycloak, Airflow, and Superset in separate schemas.

**Image:** `postgis/postgis:16-3.4-alpine`
- PostgreSQL 16 for the latest performance improvements.
- PostGIS 3.4 adds spatial geometry types, indexing, and functions needed for event geolocation and province boundary queries.
- Alpine base for minimal footprint.

### Key Configuration

```yaml
environment:
  POSTGRES_DB: ${POSTGRES_DB}
  POSTGRES_USER: ${POSTGRES_USER}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```
These are the only required environment variables for the official PostgreSQL Docker image. The superuser account is created with these credentials on first startup.

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./database/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
  - ./database/postgres/seed_data.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
```
- `postgres_data` is a Docker-managed named volume. Data persists across container restarts and upgrades.
- Files in `/docker-entrypoint-initdb.d/` are executed in alphabetical order on the **first** container startup (when the data directory is empty). `01-init.sql` creates schemas and tables; `02-seed.sql` populates reference data.
- These init scripts do NOT re-run on subsequent startups. To apply schema changes after initial setup, use a database migration tool (e.g., Alembic).

### Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 30s
```
`pg_isready` checks whether the PostgreSQL server is accepting connections. The `start_period: 30s` grace period prevents false health failures during the initial database startup and migration phase.

### Scaling Notes

PostgreSQL cannot be horizontally scaled in this configuration. For read scaling, consider adding a read replica with streaming replication. For high availability, investigate Patroni or a managed PostgreSQL service.

---

## 4. Service: clickhouse

**Purpose:** The analytical columnar database. Stores a replicated, query-optimised copy of MERL data for use by Superset dashboards. Not written to by the application directly — data arrives via PeerDB CDC replication.

**Image:** `clickhouse/clickhouse-server:24.2-alpine`
- 24.2 is a stable release with good performance for time-series aggregation.
- Alpine base.

### Key Configuration

```yaml
environment:
  CLICKHOUSE_DB: ${CLICKHOUSE_DB}
  CLICKHOUSE_USER: ${CLICKHOUSE_USER}
  CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
```
Creates a named database and user on first startup.

```yaml
volumes:
  - clickhouse_data:/var/lib/clickhouse
  - ./database/clickhouse/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
  - ./database/clickhouse/materialized_views.sql:/docker-entrypoint-initdb.d/02-mv.sql:ro
```
`init.sql` creates ClickHouse tables using the `MergeTree` engine. `materialized_views.sql` defines materialized views that pre-aggregate data for common Superset queries (e.g., indicator progress by province and quarter).

```yaml
ulimits:
  nofile:
    soft: 262144
    hard: 262144
```
ClickHouse is designed to use many concurrent file handles for parallel query execution. The default OS limit of 1024 is far too low. This ulimit matches ClickHouse's own documentation recommendation.

### Healthcheck

```yaml
test: ["CMD-SHELL", "clickhouse-client --host localhost --query 'SELECT 1'"]
```
Runs a trivial query against the ClickHouse server. If the server is not ready or the TCP port is not listening, this fails and Docker will restart the container.

### Scaling Notes

ClickHouse can be scaled with a cluster configuration using ZooKeeper for coordination. Not required for the current deployment scale.

---

## 5. Service: peerdb

**Purpose:** Change Data Capture (CDC) replication from PostgreSQL to ClickHouse. Monitors the PostgreSQL Write-Ahead Log (WAL) and streams every row change to ClickHouse in near-real-time.

**Image:** `ghcr.io/peerdb-io/peerdb:stable`
- `stable` tag tracks the latest stable release.

### Key Configuration

```yaml
environment:
  PEERDB_PASSWORD: ${PEERDB_PASSWORD}
  CATALOG_HOST: postgres
  CATALOG_PORT: 5432
  CATALOG_USER: ${POSTGRES_USER}
  CATALOG_PASSWORD: ${POSTGRES_PASSWORD}
  CATALOG_DATABASE: ${POSTGRES_DB}
```
PeerDB stores its own metadata (mirror state, checkpoint offsets) in the PostgreSQL catalog database. The `PEERDB_PASSWORD` protects the web UI.

```yaml
volumes:
  - ./peerdb/config.json:/config/config.json:ro
```
`config.json` defines the source peer (PostgreSQL), destination peer (ClickHouse), and the mirror (which tables to replicate and with what column mapping).

```yaml
depends_on:
  postgres:
    condition: service_healthy
  clickhouse:
    condition: service_healthy
```
PeerDB requires both databases to be healthy before it can establish connections. Using `condition: service_healthy` ensures it waits for the healthchecks to pass, not just for the containers to start.

### Healthcheck

PeerDB provides a web UI on port 8085 but no HTTP health endpoint. Monitor replication status via the PeerDB UI or by querying the lag:

```bash
# Check replication lag from PeerDB logs
docker compose logs peerdb | grep "lag"
```

---

## 6. Service: backend

**Purpose:** The FastAPI application server. The authoritative source for all business logic, data validation, authentication enforcement, and API endpoints.

**Build:** `./backend`
The `Dockerfile` in `./backend` builds a production image using a multi-stage build: a builder stage installs Python dependencies, and a final stage copies only the installed packages and application code into a slim Python base image.

**Image:** `ghcr.io/welinrj/vcap2-online-geodatabase/merl-backend:latest`
Pre-built production image. In development, rebuilt locally via the `build:` directive.

### Key Configuration

```yaml
environment:
  DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```
Uses `asyncpg` (async PostgreSQL driver) for high-concurrency async request handling.

```yaml
  KEYCLOAK_URL: http://keycloak:8080
```
Internal service-to-service URL. The backend fetches Keycloak's JWKS endpoint to validate JWT tokens. This is the internal Docker network URL — not the public-facing `/auth` path.

```yaml
volumes:
  - uploads_data:/app/uploads
```
User-uploaded evidence files are stored in this volume. The volume persists across container restarts. Files are served via authenticated API endpoints, not directly from the web server.

### Healthcheck

```yaml
test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
```
The `/health` endpoint checks PostgreSQL and Redis connectivity and returns HTTP 200 if all dependencies are reachable.

```yaml
start_period: 60s
```
The backend waits up to 60 seconds before health checks begin. This allows time for database connection pool initialisation and Keycloak JWKS cache warm-up.

---

## 7. Service: frontend

**Purpose:** Serves the compiled React SPA. In production, the Dockerfile uses a multi-stage build: Node compiles the Vite bundle, and NGINX Alpine serves the static files.

**Build:** `./frontend`

### Key Configuration

```yaml
environment:
  VITE_API_URL: ${VITE_API_URL:-http://localhost/api}
```
`VITE_*` environment variables are injected into the Vite build at build time. The `:-` default value syntax provides a fallback for local development without a `.env` file.

```yaml
depends_on:
  - backend
```
The frontend container depends on the backend being started. In practice, the frontend is a static SPA — it does not contact the backend at container startup, only when a user loads the page in their browser. This dependency is a safety guard during initial stack startup ordering.

---

## 8. Service: airflow

**Purpose:** Workflow orchestration for scheduled jobs: nightly backups, data validation, weekly report generation, and ClickHouse materialized view refresh.

**Build:** `./airflow`
The Airflow Dockerfile extends the official `apache/airflow` image and adds the `boto3`, `clickhouse-driver`, `psycopg2-binary`, and `apache-airflow-providers-*` packages required by the MERL DAGs.

### Key Configuration

```yaml
  AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://...
  AIRFLOW__CELERY__BROKER_URL: redis://redis:6379/1
```
Airflow uses the project's PostgreSQL for its metadata database and Redis as the Celery message broker. This avoids running a separate database for Airflow.

```yaml
  AIRFLOW__CORE__FERNET_KEY: ${AIRFLOW_FERNET_KEY}
```
Used to encrypt sensitive values (passwords, API keys) stored in Airflow's Variables and Connections. **Losing this key makes all encrypted values unrecoverable.**

```yaml
  AIRFLOW__WEBSERVER__BASE_URL: http://localhost/airflow
  AIRFLOW__WEBSERVER__ENABLE_PROXY_FIX: "true"
```
Required for Airflow to generate correct URLs when running behind the NGINX reverse proxy at `/airflow`.

```yaml
volumes:
  - ./airflow/dags:/opt/airflow/dags:ro
```
DAG files are mounted from the host directory, allowing DAG updates without rebuilding the container. In production this is read-only; in development (`docker-compose.dev.yml`) it is writable.

```yaml
command: ["airflow", "standalone"]
```
`airflow standalone` runs the webserver, scheduler, and triggerer in a single process. This is appropriate for single-server deployments. For production at scale, use separate containers for the webserver, scheduler, and worker.

---

## 9. Service: superset

**Purpose:** Apache Superset provides the business intelligence (BI) layer. End users and administrators access pre-built dashboards and can create ad-hoc charts querying the ClickHouse database.

**Image:** `apache/superset:3.1.0`
Pinned to a specific version to ensure dashboard compatibility and reproducible deployments. Upgrade Superset deliberately and test dashboards after each upgrade.

### Key Configuration

```yaml
command:
  - /bin/sh
  - -c
  - |
    superset db upgrade &&
    superset fab create-admin ... &&
    superset init &&
    gunicorn ...
```
The entrypoint command handles the full Superset initialization sequence:
1. `superset db upgrade` — runs Alembic migrations to create/update the Superset metadata schema in PostgreSQL.
2. `superset fab create-admin` — creates the admin user if it does not already exist (the `|| true` prevents failure on subsequent starts).
3. `superset init` — registers permissions and sets up default roles.
4. `gunicorn` — starts the production WSGI server with 4 workers.

```yaml
volumes:
  - ./superset/superset_config.py:/app/pythonpath/superset_config.py:ro
```
The Superset config file overrides the default configuration: sets the ClickHouse datasource, configures REDIS caching, sets `FEATURE_FLAGS`, and configures OIDC/OAuth2 with Keycloak.

---

## 10. Service: keycloak

**Purpose:** Identity and Access Management. All user authentication and role management flows through Keycloak. The MERL portal, API, Superset, and Airflow all trust Keycloak-issued JWT tokens.

**Image:** `quay.io/keycloak/keycloak:23.0`
Version 23.0 is an LTS-style release with a stable OIDC implementation and Quarkus-based startup.

### Key Configuration

```yaml
  KC_DB: postgres
  KC_DB_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
```
Keycloak stores its realm, user, and session data in the shared PostgreSQL database under a `keycloak` schema. The JDBC URL uses the internal service hostname `postgres`.

```yaml
  KC_HTTP_RELATIVE_PATH: /auth
  KC_PROXY: edge
  KC_HOSTNAME_STRICT: "false"
  KC_HOSTNAME_STRICT_HTTPS: "false"
```
- `KC_HTTP_RELATIVE_PATH: /auth` configures Keycloak to serve at the `/auth` path, matching the NGINX proxy rule.
- `KC_PROXY: edge` tells Keycloak that it is behind a reverse proxy that handles TLS termination. This makes Keycloak trust `X-Forwarded-*` headers from NGINX.
- `KC_HOSTNAME_STRICT: false` allows Keycloak to respond to any hostname in development. Set to `true` and configure `KC_HOSTNAME` in production.

```yaml
command: ["start-dev"]
```
`start-dev` uses an embedded H2 database by default, but since `KC_DB=postgres` is set, Keycloak uses PostgreSQL instead. `start-dev` disables some production hardening. When the deployment matures, switch to `start` (Quarkus production mode) and provide a TLS certificate directly to Keycloak or keep relying on NGINX for TLS.

---

## 11. Service: redis

**Purpose:** In-memory data store. Used as the Celery message broker for Airflow task queuing, as Superset's query result cache, and as the backend application cache.

**Image:** `redis:7.2-alpine`
Redis 7.2 with Alpine base. No authentication is configured in the default setup. For production, enable Redis AUTH and update the `REDIS_URL` in all consumer services.

### Key Configuration

```yaml
command: redis-server --appendonly yes
```
`--appendonly yes` enables the AOF (Append-Only File) persistence mode. This writes every write command to a file, enabling recovery after a crash. Without this flag, Redis only persists data on restart via RDB snapshots (which may lose the last few minutes of data).

---

## 12. Volumes Strategy

All persistent data is stored in **named Docker volumes** (not bind mounts), which means Docker manages the storage location on the host (typically under `/var/lib/docker/volumes/`).

| Volume | Purpose | Backup Required |
|--------|---------|-----------------|
| `postgres_data` | PostgreSQL database files | Yes — daily `pg_dump` |
| `clickhouse_data` | ClickHouse database files | Yes — daily export |
| `uploads_data` | User-uploaded evidence files | Yes — daily tar |
| `airflow_logs` | Airflow DAG task logs | Optional |
| `superset_data` | Superset home directory (charts, dashboard exports) | Optional |
| `redis_data` | Redis AOF persistence file | No — data is re-populated from source systems |
| `backups_data` | Local backup archives before S3 upload | No — these ARE the backups |

**Why named volumes instead of bind mounts in production?**

- Named volumes are managed by Docker and have better performance characteristics on Linux.
- They are isolated from the host filesystem, reducing the risk of accidental file deletions.
- `docker compose down` without `-v` preserves named volumes, protecting data.

**To inspect volume contents:**

```bash
# List all volumes
docker volume ls | grep merl

# Inspect a volume
docker volume inspect merl-dashboard_postgres_data

# Browse volume contents via a temporary alpine container
docker run --rm -v merl-dashboard_postgres_data:/data alpine ls -la /data
```

---

## 13. Network Architecture

```yaml
networks:
  merl-net:
    driver: bridge
```

All services are attached to the `merl-net` bridge network. This means:

- Container-to-container communication uses service names as DNS hostnames (e.g., `postgres`, `redis`, `clickhouse`).
- Containers on `merl-net` are isolated from containers on other Docker networks.
- Only ports explicitly mapped with `ports:` are accessible from the host or external network.

**Best practices enforced:**
- No service directly exposes PostgreSQL or Redis to the internet.
- ClickHouse ports (8123, 9000) are mapped for development convenience — close them with a firewall rule in production.
- PeerDB UI (8085) should be restricted to admin IPs in production.

---

## 14. Development Overrides

The `docker-compose.dev.yml` file provides development-specific overrides applied on top of `docker-compose.yml`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Key development changes:
- Backend mounts `./backend/app` as a writable volume and runs Uvicorn with `--reload` for hot-reload on code changes.
- Frontend mounts `./frontend/src` and runs `npm run dev` (Vite dev server with HMR).
- Airflow mounts DAGs directory as writable so you can edit DAGs without restarting the container.
- Reduced healthcheck intervals (10s instead of 30s) for faster feedback.
- **pgAdmin** added on port 5050 for database administration.
- **Tabix** added on port 8124 for ClickHouse query UI.

---

*Document version: 1.0 | March 2026 | Vanua Spatial Solutions*
