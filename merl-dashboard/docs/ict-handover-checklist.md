# ICT Handover Checklist — MERL Dashboard

**Project:** Vanuatu Loss and Damage Fund Development Project — MERL Dashboard
**Prepared by:** Vanua Spatial Solutions
**Handover to:** Government of Vanuatu ICT Team, DoCC/MoCC

This checklist must be completed by the ICT team receiving the MERL Dashboard system. Each item must be verified and signed off before the handover is considered complete. Do not mark an item complete until you have personally run the verification command or observed the behaviour described.

---

## Handover Information

| Item | Value |
|------|-------|
| Server hostname | |
| Server IP address | |
| Application URL | |
| Date of handover | |
| Vanua Spatial Solutions contact | |
| GoV ICT officer | |
| Sign-off date | |

---

## Section 1 — Infrastructure and Container Health

### 1.1 All Services Running and Healthy

Run the following command and confirm all 10 services show `running` or `running (healthy)` in the STATUS column:

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
docker compose ps
```

- [ ] `merl-nginx` — Status: `running`
- [ ] `merl-postgres` — Status: `running (healthy)`
- [ ] `merl-clickhouse` — Status: `running (healthy)`
- [ ] `merl-peerdb` — Status: `running`
- [ ] `merl-backend` — Status: `running (healthy)`
- [ ] `merl-frontend` — Status: `running`
- [ ] `merl-airflow` — Status: `running`
- [ ] `merl-superset` — Status: `running`
- [ ] `merl-keycloak` — Status: `running`
- [ ] `merl-redis` — Status: `running`

**Notes:**

___________________________________________________________________________

### 1.2 Docker and Docker Compose Versions

```bash
docker --version
docker compose version
```

- [ ] Docker Engine version is 24.0 or higher
- [ ] Docker Compose version is v2.20 or higher

**Recorded versions:**

Docker: _______________________

Docker Compose: _______________________

---

## Section 2 — Database Services

### 2.1 PostgreSQL Accepting Connections

```bash
cd /opt/vcap2-online-geodatabase/merl-dashboard
export $(grep -v '^#' .env | xargs)
docker compose exec postgres pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
```

Expected output: `localhost:5432 - accepting connections`

- [ ] PostgreSQL accepts connections

```bash
# Verify core MERL tables exist and contain data
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='merl' ORDER BY tablename;"
```

- [ ] MERL schema tables are listed
- [ ] Row counts are non-zero (data was restored from backup)

**Notes:**

___________________________________________________________________________

### 2.2 ClickHouse Responding on Port 8123

```bash
curl -sf http://localhost:8123/ping
```

Expected output: `Ok.`

- [ ] ClickHouse HTTP API responding

```bash
# Check tables exist
export $(grep -v '^#' .env | xargs)
docker compose exec clickhouse clickhouse-client \
  --user=$CLICKHOUSE_USER --password=$CLICKHOUSE_PASSWORD \
  --query="SHOW TABLES FROM $CLICKHOUSE_DB"
```

- [ ] ClickHouse analytics tables are listed

**Notes:**

___________________________________________________________________________

### 2.3 PeerDB Replication Active

Open the PeerDB web UI: **http://\<server-ip\>:8085**

- [ ] PeerDB UI is accessible
- [ ] At least one mirror is listed with status `RUNNING` (not `ERROR` or `PAUSED`)
- [ ] Replication lag is less than 60 seconds

```bash
docker compose logs peerdb | tail -20
```

- [ ] No `ERROR` messages in PeerDB logs

**Notes:**

___________________________________________________________________________

---

## Section 3 — Application Services

### 3.1 Backend API Health

```bash
curl -sf http://localhost:8000/health
```

Expected: HTTP 200 with JSON body indicating all dependencies are healthy.

- [ ] Backend `/health` endpoint returns 200

```bash
# Check API documentation is accessible
curl -sf http://localhost/api/docs -o /dev/null -w "%{http_code}"
```

- [ ] API docs accessible at `https://<domain>/api/docs` — returns 200

**Notes:**

___________________________________________________________________________

### 3.2 React Portal Loading

Open in a browser: **https://\<domain\>**

- [ ] Page loads without JavaScript errors (check browser console)
- [ ] Login page is displayed (redirects through Keycloak)
- [ ] No broken images or missing CSS
- [ ] Page title shows "MERL Dashboard" or equivalent

**Notes:**

___________________________________________________________________________

### 3.3 Keycloak Admin Console Accessible

Open in a browser: **https://\<domain\>/auth**

- [ ] Keycloak login page loads
- [ ] Admin login succeeds with the credentials in `.env` (`KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`)
- [ ] The `merl` realm exists in the realm dropdown
- [ ] User list shows at least one admin user

**Notes:**

___________________________________________________________________________

### 3.4 Airflow Web UI and DAGs Visible

Open in a browser: **https://\<domain\>/airflow**

- [ ] Airflow login page loads
- [ ] Login succeeds (default: admin / admin — change immediately)
- [ ] DAG list shows at minimum: `dag_daily_backup`, `dag_data_validation`, `dag_report_generation`
- [ ] DAGs are not showing `Import Error` status
- [ ] Scheduler is shown as `Healthy` in the Airflow UI footer

```bash
# CLI check
docker compose exec airflow airflow dags list
docker compose exec airflow airflow scheduler --health-check
```

- [ ] DAG list printed without errors

**Notes:**

___________________________________________________________________________

### 3.5 Superset Dashboards Loading

Open in a browser: **https://\<domain\>/superset**

- [ ] Superset login page loads
- [ ] Login succeeds (admin credentials from `.env`)
- [ ] Dashboard list shows at least one MERL dashboard
- [ ] Opening a dashboard renders charts without errors
- [ ] Charts display data (not empty / no database connection errors)

**Notes:**

___________________________________________________________________________

---

## Section 4 — Security and Networking

### 4.1 SSL Certificate Valid

```bash
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -dates -subject
```

- [ ] `notAfter` date is more than 30 days in the future
- [ ] `subject` matches the server's domain name
- [ ] Browser shows padlock icon (no mixed-content warnings)

**Certificate expiry date:** _______________________

**Notes:**

___________________________________________________________________________

### 4.2 Firewall Rules Verified

```bash
sudo ufw status verbose
```

- [ ] Port 22 (SSH) is restricted to admin IP only (not `0.0.0.0/0`)
- [ ] Port 80 is open to all (HTTP → HTTPS redirect)
- [ ] Port 443 is open to all (HTTPS)
- [ ] Port 5432 (PostgreSQL) is NOT open to external addresses
- [ ] Port 6379 (Redis) is NOT open to external addresses
- [ ] Port 8123/9000 (ClickHouse) is NOT open to external addresses
- [ ] Port 8085 (PeerDB UI) is restricted to admin IP only

**Notes:**

___________________________________________________________________________

### 4.3 DNS Pointing Correctly

```bash
dig <domain> +short
```

Expected: returns the server's public IP address.

- [ ] DNS A record resolves to the correct server IP
- [ ] `https://<domain>` loads the MERL portal (not a default server page)

**Resolved IP:** _______________________
**Expected IP:** _______________________

**Notes:**

___________________________________________________________________________

---

## Section 5 — Backup and Monitoring

### 5.1 Backup DAG Runs Successfully

Trigger the backup DAG manually and verify it completes:

```bash
docker compose exec airflow airflow dags trigger dag_daily_backup
```

Wait 2–5 minutes, then check:

```bash
docker compose exec airflow airflow dags show-run dag_daily_backup
```

Open Airflow UI → DAGs → `dag_daily_backup` → last run → all tasks should be green.

- [ ] `dag_daily_backup` triggered successfully
- [ ] All tasks completed with status `success`
- [ ] Backup files created in `backups/` directory:

```bash
ls -lht /opt/vcap2-online-geodatabase/merl-dashboard/backups/ | head -10
```

- [ ] Backup files exist and are non-zero size

**Notes:**

___________________________________________________________________________

### 5.2 S3 Backup Upload Verified

```bash
export $(grep -v '^#' .env | xargs)
aws s3 ls s3://${BACKUP_S3_BUCKET}/postgres/ --human-readable | tail -5
```

- [ ] At least one backup file is visible in S3

**Notes:**

___________________________________________________________________________

### 5.3 SMTP Alert Email Working

Trigger a test email from Airflow:

```bash
docker compose exec airflow airflow email-test -e $ALERT_EMAIL
```

- [ ] Test email received at the `ALERT_EMAIL` address
- [ ] Email came from the configured `SMTP_USER` address

**Notes:**

___________________________________________________________________________

---

## Section 6 — User Acceptance Testing

These tests should be performed with the MERL project manager or a designated system user.

### 6.1 User Login — Each Role

Test login for each of the following roles using Keycloak-managed accounts:

| Role | Username | Login Result |
|------|----------|--------------|
| `merl-admin` | | Pass / Fail |
| `merl-coordinator` | | Pass / Fail |
| `merl-officer` | | Pass / Fail |
| `merl-community` | | Pass / Fail |
| `merl-donor` | | Pass / Fail |

- [ ] All five roles can log in successfully
- [ ] Each role sees only the UI sections appropriate to their role
- [ ] Admin sees user management and system settings
- [ ] Donor sees dashboards only (no data entry forms)

**Notes:**

___________________________________________________________________________

### 6.2 Data Entry Form Submits Successfully

Log in as a `merl-officer` and submit a test indicator value:

- [ ] Navigate to "Submit Indicator Value"
- [ ] Select an indicator from the dropdown
- [ ] Enter a numeric value and reporting period
- [ ] Click Submit — no error message appears
- [ ] The new record is visible in the "My Submissions" list
- [ ] The record appears in the Superset dashboard within 60 seconds (PeerDB propagation)

**Notes:**

___________________________________________________________________________

### 6.3 Community Reporter Offline Mode Works

In a browser, simulate offline conditions:

1. Open the MERL portal as a `merl-community` user.
2. In Chrome DevTools → Network tab → set to "Offline".
3. Navigate to the community reporting form.

- [ ] The offline page loads without a network error
- [ ] The form is usable while offline
- [ ] Submitting while offline shows a "Saved for sync" message
- [ ] When network is restored, the pending submission appears in the sync queue
- [ ] After sync, the record appears in the backend (check API)

**Notes:**

___________________________________________________________________________

### 6.4 Map View Loads

Navigate to the map view in the portal:

- [ ] Map tiles load correctly (no grey boxes)
- [ ] Existing L&D event markers are visible on the map
- [ ] Clicking a marker shows event details popup
- [ ] Province boundary polygons are displayed

**Notes:**

___________________________________________________________________________

### 6.5 CSV Upload Works

Log in as a `merl-officer` or `merl-coordinator` and upload a test CSV:

- [ ] Navigate to "Upload Data"
- [ ] Select a correctly formatted test CSV file
- [ ] Column mapping wizard appears
- [ ] Preview shows correct data
- [ ] Submit import — success message appears
- [ ] Imported records appear in the data list

**Notes:**

___________________________________________________________________________

### 6.6 Report Download Works

Log in as a `merl-coordinator` or admin and download a report:

- [ ] Navigate to "Reports" or "Download"
- [ ] Select a reporting period
- [ ] Click "Download CSV" (or "Download PDF")
- [ ] File downloads successfully and contains data

**Notes:**

___________________________________________________________________________

---

## Section 7 — Documentation and Credentials

- [ ] `.env` file is backed up securely (not stored in git)
- [ ] A copy of the `.env` file has been provided to the GoV ICT team via secure channel
- [ ] Keycloak admin password has been changed from the default
- [ ] Superset admin password has been changed from the default
- [ ] Airflow admin password has been changed from the default
- [ ] All documentation in `docs/` directory has been reviewed by the ICT team
- [ ] [docs/admin-manual.md](admin-manual.md) has been read by the GoV admin
- [ ] [docs/backup-restore.md](backup-restore.md) has been reviewed
- [ ] ICT team knows how to reach Vanua Spatial Solutions support contact

---

## Section 8 — Sign-Off

### Vanua Spatial Solutions

I certify that the MERL Dashboard has been deployed and configured according to project specifications, and that all items in this checklist have been verified.

**Name:** _______________________

**Signature:** _______________________

**Date:** _______________________

---

### Government of Vanuatu ICT Officer

I confirm that I have verified each item in this checklist and accept responsibility for the ongoing operation of the MERL Dashboard on GoV infrastructure.

**Name:** _______________________

**Title:** _______________________

**Department:** _______________________

**Signature:** _______________________

**Date:** _______________________

---

### MERL Project Manager

I confirm that the system has been tested and is fit for use by project staff.

**Name:** _______________________

**Signature:** _______________________

**Date:** _______________________

---

*Checklist version: 1.0 | March 2026 | Vanua Spatial Solutions*
