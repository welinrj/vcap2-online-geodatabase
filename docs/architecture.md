# System Architecture — MERL Dashboard

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Descriptions](#2-component-descriptions)
3. [Data Flow](#3-data-flow)
4. [Network Topology](#4-network-topology)
5. [Security Architecture](#5-security-architecture)
6. [Backup Architecture](#6-backup-architecture)

---

## 1. System Overview

The MERL Dashboard is a containerised, multi-service web application deployed via Docker Compose. All services communicate over a private Docker bridge network (`merl-net`) and are exposed externally only through the NGINX reverse proxy.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        HOST SERVER (GoV / Cloud)                         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                  NGINX :80 / :443  (TLS termination)               │  │
│  │        Reverse proxies to frontend, backend, superset, airflow     │  │
│  └──────┬──────────────┬─────────────────┬──────────────┬─────────────┘  │
│         │              │                 │              │                 │
│  ┌──────▼──────┐ ┌─────▼──────┐ ┌───────▼──────┐ ┌────▼──────────┐      │
│  │  Frontend   │ │  Backend   │ │   Superset   │ │   Airflow     │      │
│  │  React/Vite │ │  FastAPI   │ │   (BI/viz)   │ │  (scheduler)  │      │
│  │  :3000      │ │  :8000     │ │  :8088       │ │  :8080        │      │
│  └──────────────┘ └─────┬──────┘ └──────┬───────┘ └──────┬────────┘      │
│                         │               │                 │               │
│                  ┌──────▼───────────────▼─────────────────▼──────┐        │
│                  │              merl-net (bridge)                 │        │
│                  └──────┬──────────────────────────┬─────────────┘        │
│                         │                          │                      │
│              ┌──────────▼──────────┐   ┌──────────▼──────────┐            │
│              │  PostgreSQL 16      │   │  ClickHouse 24.2     │            │
│              │  (PostGIS)          │   │  (columnar OLAP)     │            │
│              │  :5432              │   │  :8123 / :9000       │            │
│              └──────────┬──────────┘   └──────────────────────┘            │
│                         │   CDC replication                                │
│                         │   via PeerDB :8085                               │
│                         └──────────────────────────────────────────────►  │
│                                                                            │
│              ┌────────────────┐   ┌──────────────────────────────┐         │
│              │  Keycloak      │   │  Redis :6379                 │         │
│              │  IAM  :8180    │   │  (Celery broker, cache)      │         │
│              └────────────────┘   └──────────────────────────────┘         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Descriptions

### 2.1 NGINX (nginx:1.25-alpine)

The entry point for all external traffic. Responsibilities:

- TLS termination using Let's Encrypt or GoV-provided certificates stored in `nginx/ssl/`.
- Routing HTTP requests to the correct upstream service based on path prefix:
  - `/` → frontend (React SPA)
  - `/api` → backend (FastAPI)
  - `/superset` → Superset
  - `/airflow` → Airflow webserver
  - `/auth` → Keycloak
- Setting security headers (`HSTS`, `X-Frame-Options`, `Content-Security-Policy`).
- Rate limiting on the API prefix to prevent abuse.
- Serving static assets for the frontend with appropriate cache headers.

### 2.2 PostgreSQL 16 with PostGIS 3.4 (postgis/postgis:16-3.4-alpine)

The **primary transactional database**. Used for:

- All application MERL data (indicators, activities, events, organisations, users).
- Spatial data storage using PostGIS geometry types (points for event locations, polygons for provinces and communities).
- Keycloak's identity data (realms, users, sessions, credentials) — in a dedicated `keycloak` schema.
- Airflow's metadata database (DAG runs, task instances, connections) — in a dedicated `airflow` schema.
- Superset's metadata (dashboards, charts, database connections) — in a dedicated `superset` schema.

The `init.sql` script creates all schemas and grants, while `seed_data.sql` populates reference data (provinces, islands, indicator framework).

### 2.3 ClickHouse 24.2 (clickhouse/clickhouse-server:24.2-alpine)

The **analytical columnar database** powering Superset dashboards. Key characteristics:

- Stores a replica of MERL data optimised for aggregation queries (GROUP BY province, time period, indicator type).
- Uses the `MergeTree` table engine with partitioning by year/month for efficient time-series queries.
- Materialized views (defined in `materialized_views.sql`) pre-aggregate common dashboard metrics, ensuring sub-second query response times.
- Populated via PeerDB CDC from PostgreSQL — no direct writes from the application.
- Superset connects directly to ClickHouse using the `clickhouse-connect` driver.

### 2.4 PeerDB (ghcr.io/peerdb-io/peerdb:stable)

**Change Data Capture (CDC) replication** from PostgreSQL to ClickHouse. PeerDB:

- Uses PostgreSQL logical replication slots to capture every INSERT, UPDATE and DELETE.
- Transforms and streams changes to ClickHouse in near-real-time (typically < 5 seconds lag).
- Configuration is defined in `peerdb/config.json` which specifies the source mirror, destination peer, and table mapping.
- Provides a web UI on port 8085 to monitor replication lag and mirror health.

### 2.5 FastAPI Backend (./backend)

The **application API layer**. Provides:

- RESTful endpoints for all MERL data entities (CRUD + search + export).
- File upload handling (evidence documents, CSV imports) stored in `uploads_data` volume.
- JWT validation against Keycloak JWKS endpoint — every request must carry a valid Bearer token.
- Role-based permission enforcement via FastAPI dependencies.
- Background tasks for async processing (CSV import validation, report generation triggers).
- `/health` endpoint for Docker and NGINX health checks.
- OpenAPI documentation at `/api/docs` and `/api/redoc`.

### 2.6 React Frontend (./frontend)

A **Single-Page Application** built with React 18, Vite, and TypeScript. Features:

- Keycloak JS adapter for SSO authentication.
- Indicator value entry forms with client-side validation.
- Activity and event reporting workflows.
- Interactive map (MapLibre GL or Mapbox) showing events by province.
- Offline-first service worker for community reporters (IndexedDB sync queue).
- CSV upload wizard with column-mapping and preview.
- Responsive, mobile-first UI.

### 2.7 Apache Airflow (./airflow)

**Workflow orchestration** for scheduled and triggered jobs:

- `dag_daily_backup.py` — nightly `pg_dump` + ClickHouse backup, compressed and uploaded to S3.
- `dag_data_validation.py` — daily checks for missing indicator submissions by province.
- `dag_report_generation.py` — weekly Superset dashboard export to PDF, emailed to stakeholders.
- `dag_clickhouse_refresh.py` — periodically refreshes ClickHouse materialized views.
- Uses Redis as Celery broker for scalable task execution.
- Runs in standalone mode (webserver + scheduler in one container) suitable for single-server deployment.

### 2.8 Apache Superset 3.1.0

**Business intelligence and data visualisation**:

- Connected to ClickHouse as the primary analytical data source.
- Dashboards for: indicator progress, activity tracker, L&D events map, community engagement summary, provincial comparison.
- Role-based dashboard access mapped to Keycloak roles via Superset's RBAC.
- Exports to PDF and CSV available to authorised users.

### 2.9 Keycloak 23.0

**Identity and Access Management (IAM)**:

- Single Sign-On (SSO) for all services (frontend, API, Superset, Airflow).
- MERL realm with five application roles (see user roles in README).
- OIDC/OAuth2 tokens issued to authenticated users and validated by the backend.
- Social login (optional) and MFA (TOTP) can be configured per realm.
- Admin console available at `/auth`.

### 2.10 Redis 7.2

**In-memory data store** used for:

- Airflow Celery broker (`redis:6379/1`).
- Airflow Celery results backend.
- Superset query result caching (`redis:6379/2`).
- Backend session/token caching (`redis:6379/0`).

---

## 3. Data Flow

### 3.1 Field Data Entry Flow

```
  Community Reporter / Field Officer
         │
         │  HTTPS (JWT Bearer token)
         ▼
    NGINX :443
         │
         │  /api/*
         ▼
    FastAPI Backend :8000
         │
         ├─► Validates JWT with Keycloak JWKS
         ├─► Enforces role-based permissions
         ├─► Validates and sanitises input
         │
         ▼
    PostgreSQL :5432
         │  (logical replication slot)
         ▼
    PeerDB CDC :8085
         │  (streams changes)
         ▼
    ClickHouse :8123
         │  (materialized views refresh)
         ▼
    Superset Dashboards
         │
         │  HTTPS (JWT Bearer token)
         ▼
    Dashboard Viewers / Donors
```

### 3.2 Offline Community Reporter Flow

```
  Community Reporter (mobile, offline)
         │
         │  Writes to IndexedDB sync queue
         │  (service worker intercepts API calls)
         ▼
    Local Browser Storage
         │
         │  When connectivity restored:
         │  Background sync fires
         ▼
    FastAPI Backend :8000  (same path as above)
```

### 3.3 Backup Data Flow

```
  Airflow Scheduler (nightly, 02:00 VUT)
         │
         ├─► pg_dump → gzip → S3 bucket
         │   (PostgreSQL full backup)
         │
         ├─► clickhouse-backup → gzip → S3 bucket
         │   (ClickHouse table backup)
         │
         └─► Notification email → ALERT_EMAIL
```

### 3.4 Authentication Flow (Keycloak JWT)

```
  Browser / Client
         │
         │  1. Redirect to Keycloak login page
         ▼
    Keycloak :8180 (proxied as /auth)
         │
         │  2. User enters credentials
         │  3. Keycloak issues access token (JWT) + refresh token
         │
         ▼
  Browser / Client
         │
         │  4. Includes JWT in every API request:
         │     Authorization: Bearer <token>
         ▼
    FastAPI Backend
         │
         │  5. Fetches JWKS from Keycloak (cached)
         │  6. Verifies JWT signature and claims
         │  7. Extracts roles from token claims
         │
         ▼
    Protected Resource
```

---

## 4. Network Topology

All containers share the `merl-net` Docker bridge network. Container-to-container communication uses service names as hostnames (e.g. `postgres`, `clickhouse`, `redis`).

Only the following ports are mapped to the host:

| Container Port | Host Port | Purpose |
|----------------|-----------|---------|
| nginx:80 | 80 | HTTP (redirects to HTTPS in production) |
| nginx:443 | 443 | HTTPS (TLS terminated) |
| postgres:5432 | 5432 | Direct DB access (disable in production firewall) |
| clickhouse:8123 | 8123 | ClickHouse HTTP (disable in production firewall) |
| clickhouse:9000 | 9000 | ClickHouse native protocol (disable in production firewall) |
| keycloak:8080 | 8180 | Keycloak admin (accessible during setup; restrict in production) |
| peerdb:8085 | 8085 | PeerDB UI (restrict to admin IPs in production) |
| airflow:8080 | 8080 | Airflow (proxied via NGINX at /airflow; direct port optional) |
| superset:8088 | 8088 | Superset (proxied via NGINX at /superset; direct port optional) |
| redis:6379 | 6379 | Redis (bind to 127.0.0.1 in production) |

### Production Firewall Recommendations

In a production GoV server deployment, the following iptables rules are recommended:

```
# Allow public HTTP/HTTPS only
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow SSH from admin IP only
iptables -A INPUT -p tcp --dport 22 -s <ADMIN_IP> -j ACCEPT

# Allow PeerDB UI from admin IP only
iptables -A INPUT -p tcp --dport 8085 -s <ADMIN_IP> -j ACCEPT

# Block all direct database access from external
iptables -A INPUT -p tcp --dport 5432 -j DROP
iptables -A INPUT -p tcp --dport 8123 -j DROP
iptables -A INPUT -p tcp --dport 9000 -j DROP
iptables -A INPUT -p tcp --dport 6379 -j DROP
```

---

## 5. Security Architecture

### 5.1 Authentication and Authorisation

- All services use Keycloak as the single source of truth for identity.
- The frontend uses the `keycloak-js` adapter to initiate OIDC flows.
- The backend validates every incoming JWT using Keycloak's JWKS endpoint (`/auth/realms/merl/protocol/openid-connect/certs`).
- Tokens expire after 5 minutes (configurable in Keycloak); refresh tokens last 30 minutes.
- Superset and Airflow are integrated with Keycloak via OAuth2 proxy or native OIDC support.

### 5.2 Transport Security

- All external traffic uses TLS 1.2+.
- NGINX is configured with a strong cipher suite and HSTS header.
- Certificates are stored in `nginx/ssl/` and renewed automatically via Certbot (see migration runbook).

### 5.3 Secrets Management

- All sensitive values (passwords, API keys, secret keys) are stored in `.env` and injected as Docker environment variables at container startup.
- `.env` is excluded from git via `.gitignore`.
- In production, consider replacing `.env` with Docker Secrets or a vault solution.

### 5.4 Data Security

- PostgreSQL uses row-level security (RLS) policies to enforce province-level data isolation for coordinators.
- File uploads are stored in a Docker-managed volume inaccessible from the web directly; the API validates and serves uploads via authenticated endpoints.
- ClickHouse is not directly accessible from the internet; all queries pass through Superset which enforces its own RBAC.

---

## 6. Backup Architecture

### 6.1 Automated Backup Schedule

| Job | Schedule (VUT) | Target | Retention |
|-----|----------------|--------|-----------|
| PostgreSQL full dump | Daily 02:00 | S3 + local volume | 30 days |
| ClickHouse backup | Daily 02:30 | S3 + local volume | 30 days |
| Weekly archive | Sunday 03:00 | S3 (separate prefix) | 1 year |

### 6.2 Backup Storage Locations

```
backups/                    (Docker volume: backups_data)
  postgres/
    merl_postgres_YYYYMMDD_HHMMSS.sql.gz
  clickhouse/
    merl_clickhouse_YYYYMMDD_HHMMSS.tar.gz

S3 bucket: s3://${BACKUP_S3_BUCKET}/
  postgres/
  clickhouse/
  weekly/
```

### 6.3 Recovery

See [backup-restore.md](backup-restore.md) for step-by-step restore procedures and tested recovery time objectives.

---

*Document version: 1.0 | March 2026 | Vanua Spatial Solutions*
