# MERL Dashboard — Vanuatu Loss and Damage Fund Development Project

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-red)

---

## Quick Start (Frontend)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 to view the dashboard.

To build for production:

```bash
npm run build     # outputs to frontend/dist/
npm run preview   # preview the production build
```

The app deploys automatically to GitHub Pages on push to `main`.

---

## Overview

The MERL Dashboard is the digital backbone for monitoring, evaluation, reporting and learning (MERL) activities under Vanuatu's **Loss and Damage Fund Development Project**, a programme of the **Department of Climate Change (DoCC) / Ministry of Climate Change (MoCC)** funded by **MFAT New Zealand**.

The system provides:

- A **React portal** for field officers, provincial coordinators and national administrators to enter, review and approve MERL data (indicator values, activities, loss and damage events, community engagement records).
- A **FastAPI backend** exposing a documented REST API consumed by the portal and third-party integrations.
- A **spatial database** (PostgreSQL + PostGIS) for transactional storage and a **ClickHouse** columnar store for fast analytical queries.
- Real-time replication from PostgreSQL to ClickHouse via **PeerDB** (CDC).
- Interactive dashboards and charts in **Apache Superset**, connected directly to ClickHouse.
- Automated workflow orchestration (backup, data validation, report generation) via **Apache Airflow**.
- Centralised identity and access management via **Keycloak**, with role-based access control (RBAC) enforced at every layer.
- An offline-capable **community reporter** module for areas with limited connectivity.

### Key Users

| Role | Description |
|------|-------------|
| National Administrator | Full system access; manages users, indicators, reports |
| Provincial Coordinator | Enters, reviews and approves data for their province |
| Field Officer | Submits indicator values and activity records |
| Community Reporter | Lightweight offline-capable data entry (mobile-first) |
| Donor / Observer | Read-only access to dashboards and summary reports |

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| Docker Engine | 24.0+ |
| Docker Compose | v2.20+ (included with Docker Desktop 4.x) |
| RAM | 8 GB (16 GB recommended for production) |
| CPU Cores | 4 (8 recommended) |
| Disk Space | 50 GB free |
| Operating System | Linux (Ubuntu 22.04 LTS recommended), macOS 13+, or Windows 11 via WSL2 |
| Open Ports | 80, 443, 5432 (optional), 8085 (PeerDB UI) |

> **Windows users:** All commands below must be run inside a WSL2 terminal (Ubuntu). Docker Desktop with WSL2 integration must be enabled.

---

## Quick Start

Follow these five steps to bring the full stack up from scratch.

### Step 1 — Clone the repository

```bash
git clone https://github.com/welinrj/vcap2-online-geodatabase.git
cd vcap2-online-geodatabase/merl-dashboard
```

### Step 2 — Create the environment file

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in every value marked `# REQUIRED`. At minimum you must set:

- `POSTGRES_PASSWORD`
- `KEYCLOAK_ADMIN_PASSWORD`
- `SUPERSET_SECRET_KEY` (generate with `python3 -c "import secrets; print(secrets.token_hex(42))"`)
- `AIRFLOW_FERNET_KEY` (generate with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `BACKEND_SECRET_KEY`

### Step 3 — Create required runtime directories

```bash
mkdir -p nginx/logs nginx/ssl uploads backups airflow/logs superset/exports
touch nginx/logs/.gitkeep nginx/ssl/.gitkeep uploads/.gitkeep backups/.gitkeep \
      airflow/logs/.gitkeep superset/exports/.gitkeep
```

### Step 4 — Start all services

```bash
docker compose up -d
```

The first run pulls all images and builds the custom services. This takes 5–15 minutes depending on your connection. Monitor progress with:

```bash
docker compose logs -f
```

Wait until all services report `healthy` or `started`:

```bash
docker compose ps
```

### Step 5 — Initialise Superset and verify

```bash
# Superset initialisation is handled automatically by its entrypoint command.
# Verify all services are healthy:
docker compose ps

# Run a quick health check across all HTTP services:
curl -s http://localhost/health        # nginx → backend
curl -s http://localhost:8088/health   # superset
curl -s http://localhost:8080/health   # airflow
```

Open your browser at **http://localhost** to access the MERL portal.

---

## Service URLs

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| React Portal | http://localhost | admin / admin |
| API Docs (Swagger) | http://localhost/api/docs | — |
| API Docs (ReDoc) | http://localhost/api/redoc | — |
| Apache Superset | http://localhost/superset | admin / admin |
| Apache Airflow | http://localhost/airflow | admin / admin |
| Keycloak Admin Console | http://localhost/auth | admin / (see `.env`) |
| PeerDB UI | http://localhost:8085 | — |
| PostgreSQL | localhost:5432 | see `.env` |
| ClickHouse HTTP | localhost:8123 | see `.env` |

> **Security:** Change ALL default passwords before exposing any service to the internet. See [docs/environment-variables.md](docs/environment-variables.md).

---

## Development Mode

To run with hot-reload and additional developer tooling (pgAdmin, Tabix):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Additional dev service URLs:

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| pgAdmin | http://localhost:5050 | dev@merl.local / devpassword |
| Tabix (ClickHouse UI) | http://localhost:8124 | see `.env` |

---

## Architecture Overview

```
                         ┌─────────────────────────────────┐
                         │           NGINX (TLS)           │
                         │   Reverse proxy / cert term.    │
                         └────┬──────┬──────┬──────┬───────┘
                              │      │      │      │
              ┌───────────────▼┐  ┌──▼──┐  │  ┌──▼──────────┐
              │  React Portal  │  │ API │  │  │  Superset   │
              │  (Vite / SPA)  │  │8000 │  │  │   :8088     │
              └────────────────┘  └──┬──┘  │  └──────┬──────┘
                                     │     │         │
                              ┌──────▼─────▼─────────▼──────┐
                              │         PostgreSQL 16        │
                              │    (PostGIS, Keycloak DB,    │
                              │     Airflow metadata DB)     │
                              └─────────────┬────────────────┘
                                            │  CDC via PeerDB
                              ┌─────────────▼────────────────┐
                              │         ClickHouse 24        │
                              │  (analytics / dashboards)    │
                              └──────────────────────────────┘
              ┌──────────────────────────────────────────────┐
              │  Supporting services (same merl-net bridge)  │
              │  Keycloak :8180 │ Airflow :8080 │ Redis :6379│
              └──────────────────────────────────────────────┘
```

For the full architecture document see [docs/architecture.md](docs/architecture.md).

---

## Data Entry

Field officers and coordinators use the React portal to:

1. **Submit indicator values** — against the project results framework, with evidence file uploads.
2. **Record activities** — linking to indicators, provinces, and implementing partners.
3. **Log Loss and Damage events** — category, severity, affected households, economic value, geolocation.
4. **Community engagement records** — meeting attendance, gender disaggregation, follow-up actions.

Data submitted through the portal is stored in PostgreSQL and replicated in near-real-time to ClickHouse, where it becomes immediately queryable in Superset dashboards.

---

## User Roles

| Role | Portal | Superset | Airflow | Keycloak |
|------|--------|----------|---------|----------|
| `merl-admin` | Full CRUD | Admin | Admin | Admin |
| `merl-coordinator` | Province CRUD + approval | Viewer | — | — |
| `merl-officer` | Own records CRUD | — | — | — |
| `merl-community` | Offline-first entry (mobile) | — | — | — |
| `merl-donor` | Read-only dashboards | Viewer | — | — |

Roles are managed in Keycloak. See [docs/admin-manual.md](docs/admin-manual.md) for user management procedures.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | Full system architecture, data flow, security model |
| [docs/migration-runbook.md](docs/migration-runbook.md) | Step-by-step guide for migrating to the GoV server |
| [docs/backup-restore.md](docs/backup-restore.md) | Backup schedules, manual procedures, restore steps |
| [docs/environment-variables.md](docs/environment-variables.md) | Complete reference for all `.env` variables |
| [docs/docker-compose-reference.md](docs/docker-compose-reference.md) | Annotated service configuration guide |
| [docs/ict-handover-checklist.md](docs/ict-handover-checklist.md) | Post-deployment verification checklist for GoV ICT |
| [docs/user-manual.md](docs/user-manual.md) | End-user guide for portal features |
| [docs/admin-manual.md](docs/admin-manual.md) | Administrator guide for system operations |

---

## Troubleshooting

### Services won't start

```bash
# Check logs for the failing service
docker compose logs postgres
docker compose logs backend

# Verify .env is populated
grep -E "^[A-Z]" .env | head -20
```

### PostgreSQL health check failing

```bash
# Confirm the container is running
docker compose ps postgres

# Exec into the container and test manually
docker compose exec postgres pg_isready -U $POSTGRES_USER
```

### Keycloak not reachable

Keycloak depends on PostgreSQL being fully healthy. If it starts before Postgres is ready, restart it:

```bash
docker compose restart keycloak
```

### Superset shows "No dashboards"

Superset dashboards are imported separately. See [docs/admin-manual.md](docs/admin-manual.md#importing-dashboards).

### PeerDB replication not active

```bash
# Check PeerDB logs
docker compose logs peerdb

# Verify the mirror is running via the PeerDB UI at http://localhost:8085
```

### Out-of-disk errors

Check Docker volume usage:

```bash
docker system df
docker volume ls
```

Prune unused images and stopped containers:

```bash
docker system prune -f
```

### Backend 401 Unauthorized errors

Ensure `KEYCLOAK_REALM` and `KEYCLOAK_CLIENT_ID` in `.env` match the realm and client configured in Keycloak admin console.

---

## Contributing

This repository is maintained by **Vanua Spatial Solutions** on behalf of DoCC/MoCC. Internal contributors should follow the Git branching strategy described in `docs/architecture.md`. External contributions are not accepted without prior written agreement.

---

## Credits

Developed by **Vanua Spatial Solutions** for the Department of Climate Change (DoCC) / Ministry of Climate Change (MoCC), Government of Vanuatu.

Funded by the **Ministry of Foreign Affairs and Trade (MFAT), New Zealand** under the Loss and Damage Fund Development Project.

---

*Last updated: March 2026*
