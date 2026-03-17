-- =============================================================================
-- MERL Dashboard – ClickHouse Table Definitions
-- Project : Vanuatu Loss and Damage Fund Development Project
-- Engine  : MergeTree (single-node) or ReplicatedMergeTree (cluster)
-- =============================================================================
-- ClickHouse does not support ALTER TABLE ADD CONSTRAINT or PostgreSQL enums.
-- String columns are used for enum-like fields.  UUIDs are stored as UUID type
-- (ClickHouse 21.6+).  All tables have a default ORDER BY key and a
-- PARTITION BY clause where cardinality warrants it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Database
-- ---------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS merl;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.users
(
    id              UUID,
    keycloak_id     String,
    email           String,
    full_name       String,
    role            LowCardinality(String),  -- administrator | project_manager | merl_officer | finance_officer | partner_viewer | community_reporter
    organisation    String,
    active          UInt8 DEFAULT 1,
    created_at      DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (role, email)
SETTINGS index_granularity = 8192;

COMMENT ON TABLE merl.users IS 'Replicated from PostgreSQL via PeerDB CDC.';

-- ---------------------------------------------------------------------------
-- 2. indicators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.indicators
(
    id                  UUID,
    code                String,
    name                String,
    description         String,
    domain              LowCardinality(String),  -- governance | financial | community | events | learning
    unit                String,
    baseline_value      Nullable(Float64),
    target_value        Nullable(Float64),
    target_year         Nullable(Int32),
    data_source         String,
    disaggregation_type LowCardinality(String),  -- gender | age | disability | location | none
    created_at          DateTime DEFAULT now(),
    updated_at          DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (domain, code)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 3. indicator_values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.indicator_values
(
    id                   UUID,
    indicator_id         UUID,
    value                Float64,
    reporting_period     Date,
    reported_by          Nullable(UUID),
    location_island      LowCardinality(String),
    location_province    LowCardinality(String),
    disaggregation_key   String,
    disaggregation_value String,
    notes                String,
    evidence_url         String,
    verified             UInt8 DEFAULT 0,
    verified_by          Nullable(UUID),
    created_at           DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(reporting_period)
ORDER BY (indicator_id, reporting_period)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 4. activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.activities
(
    id           UUID,
    code         String,
    name         String,
    description  String,
    domain       LowCardinality(String),
    phase        UInt8,
    start_date   Nullable(Date),
    end_date     Nullable(Date),
    status       LowCardinality(String),  -- planned | in_progress | completed | delayed
    lead_officer String,
    budget_vuv   Nullable(Float64),
    budget_nzd   Nullable(Float64),
    created_at   DateTime DEFAULT now(),
    updated_at   DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (domain, phase, code)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 5. activity_milestones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.activity_milestones
(
    id               UUID,
    activity_id      UUID,
    milestone_name   String,
    due_date         Date,
    completed_date   Nullable(Date),
    status           LowCardinality(String),  -- pending | in_progress | completed | overdue
    notes            String
)
ENGINE = MergeTree()
PARTITION BY toYear(due_date)
ORDER BY (activity_id, due_date)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 6. financial_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.financial_transactions
(
    id               UUID,
    transaction_date Date,
    description      String,
    amount_vuv       Float64,
    amount_nzd       Nullable(Float64),
    transaction_type LowCardinality(String),  -- disbursement | expenditure | refund
    activity_id      Nullable(UUID),
    donor_reference  String,
    payment_method   LowCardinality(String),
    approved_by      String,
    created_at       DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(transaction_date)
ORDER BY (transaction_type, transaction_date)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 7. ld_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.ld_events
(
    id                            UUID,
    event_name                    String,
    event_type                    LowCardinality(String),   -- cyclone | flood | drought | sea_level_rise | acidification | other
    onset_type                    LowCardinality(String),   -- extreme | slow_onset
    start_date                    Nullable(Date),
    end_date                      Nullable(Date),
    islands_affected              Array(String),
    provinces_affected            Array(String),
    economic_loss_vuv             Nullable(Float64),
    non_economic_loss_description String,
    response_actions              String,
    data_source                   String,
    -- PostGIS geometry is decomposed into lat/lon for ClickHouse
    longitude                     Nullable(Float64),
    latitude                      Nullable(Float64),
    created_at                    DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (event_type, start_date)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 8. community_engagements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.community_engagements
(
    id                      UUID,
    engagement_date         Date,
    community_name          String,
    island                  LowCardinality(String),
    province                LowCardinality(String),
    engagement_type         LowCardinality(String),  -- consultation | workshop | training | reporting
    total_participants      UInt32 DEFAULT 0,
    male_participants       UInt32 DEFAULT 0,
    female_participants     UInt32 DEFAULT 0,
    youth_participants      UInt32 DEFAULT 0,
    disability_participants UInt32 DEFAULT 0,
    outcomes                String,
    follow_up_required      UInt8  DEFAULT 0,
    created_at              DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(engagement_date)
ORDER BY (province, engagement_date)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 9. learning_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.learning_entries
(
    id           UUID,
    entry_date   Date,
    title        String,
    domain       LowCardinality(String),
    lesson_type  LowCardinality(String),  -- success | challenge | adaptation | innovation
    description  String,
    implications String,
    action_taken String,
    recorded_by  Nullable(UUID),
    tags         Array(String),
    created_at   DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (domain, entry_date)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 10. kpi_snapshots
--     Point-in-time KPI readings used by the dashboard overview cards.
--     Populated by a daily Airflow DAG that reads from indicator_values.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.kpi_snapshots
(
    snapshot_date   Date,
    indicator_id    UUID,
    indicator_code  String,
    indicator_name  String,
    domain          LowCardinality(String),
    current_value   Float64,
    target_value    Float64,
    progress_pct    Float64,
    period_label    String,   -- e.g. '2025-Q3'
    created_at      DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(snapshot_date)
ORDER BY (snapshot_date, domain, indicator_code)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 11. financial_summaries
--     Pre-aggregated financial data used by the finance dashboard tab.
--     Populated by a daily Airflow DAG.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.financial_summaries
(
    period           Date,              -- first day of the reporting month
    domain           LowCardinality(String),
    activity_id      UUID,
    activity_name    String,
    total_disbursed  Float64 DEFAULT 0,
    total_expended   Float64 DEFAULT 0,
    remaining        Float64 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (period, domain, activity_id)
SETTINGS index_granularity = 8192;

-- ---------------------------------------------------------------------------
-- 12. engagement_summaries
--     Pre-aggregated GEDSI participation figures used by the community tab.
--     Populated by a daily Airflow DAG.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.engagement_summaries
(
    period             Date,
    province           LowCardinality(String),
    island             LowCardinality(String),
    total_engagements  UInt32  DEFAULT 0,
    total_participants UInt32  DEFAULT 0,
    male_count         UInt32  DEFAULT 0,
    female_count       UInt32  DEFAULT 0,
    youth_count        UInt32  DEFAULT 0,
    disability_count   UInt32  DEFAULT 0,
    female_pct         Float64 DEFAULT 0  -- pre-computed for dashboard performance
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (period, province, island)
SETTINGS index_granularity = 8192;
