-- =============================================================================
-- MERL Dashboard – ClickHouse Materialized Views
-- Project : Vanuatu Loss and Damage Fund Development Project
-- =============================================================================
-- Each materialized view (MV) consists of:
--   1. A target MergeTree table that stores the aggregated rows.
--   2. A MATERIALIZED VIEW that fires on INSERT into the source table and
--      writes aggregated rows into the target table.
--
-- Because ClickHouse MVs are INSERT-triggered (not full-refresh), the target
-- tables use AggregatingMergeTree or SummingMergeTree where partial states
-- must be merged.  A SELECT using aggregation-combinator functions (sumMerge,
-- avgMerge, etc.) or a FINAL modifier is required to read correct totals.
--
-- Rebuild procedure (run after a bulk historical load):
--   INSERT INTO merl.mv_<target>_state SELECT ... FROM merl.<source>;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.  mv_indicator_progress
--     Latest reported value vs target, with progress percentage, per indicator.
--     Source: merl.indicator_values joined with merl.indicators.
--
--     Because ClickHouse MVs cannot span JOINs inline, we maintain the target
--     table and populate it via an Airflow task that runs daily.  The MV below
--     fires on indicator_values inserts and records the raw unaggregated row;
--     a ReplacingMergeTree on (indicator_id, reporting_period) keeps only the
--     latest row per indicator per period, so querying with FINAL gives the
--     most recent value per indicator.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merl.mv_indicator_progress_state
(
    indicator_id       UUID,
    indicator_code     String,
    indicator_name     String,
    domain             LowCardinality(String),
    unit               String,
    target_value       Nullable(Float64),
    target_year        Nullable(Int32),
    reporting_period   Date,
    current_value      Float64,
    progress_pct       Float64,  -- (current_value / target_value) * 100, 0 when target IS NULL
    location_province  LowCardinality(String),
    _updated_at        DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(_updated_at)
PARTITION BY toYear(reporting_period)
ORDER BY (indicator_id, reporting_period, location_province)
SETTINGS index_granularity = 8192;

COMMENT ON TABLE merl.mv_indicator_progress_state IS
    'Target table for mv_indicator_progress.  Query with FINAL to get deduplicated rows.';

-- The MV writes one row per insert into indicator_values.
-- The indicators dimension columns are denormalised via a dictionary lookup
-- configured separately (merl_indicators_dict).  The MV shown here writes
-- directly available columns; the Airflow enrichment task fills denormalised
-- columns nightly.
CREATE MATERIALIZED VIEW IF NOT EXISTS merl.mv_indicator_progress
TO merl.mv_indicator_progress_state
AS
SELECT
    iv.indicator_id                                                         AS indicator_id,
    ''                                                                      AS indicator_code,    -- enriched by Airflow
    ''                                                                      AS indicator_name,    -- enriched by Airflow
    ''                                                                      AS domain,            -- enriched by Airflow
    ''                                                                      AS unit,              -- enriched by Airflow
    NULL                                                                    AS target_value,      -- enriched by Airflow
    NULL                                                                    AS target_year,       -- enriched by Airflow
    iv.reporting_period                                                     AS reporting_period,
    iv.value                                                                AS current_value,
    0                                                                       AS progress_pct,      -- enriched by Airflow
    iv.location_province                                                    AS location_province,
    now()                                                                   AS _updated_at
FROM merl.indicator_values AS iv;

-- Convenience view: read the latest value per indicator (all provinces combined)
-- using FINAL.  This is the view consumed by the dashboard KPI cards.
CREATE VIEW IF NOT EXISTS merl.v_indicator_latest_progress AS
SELECT
    indicator_id,
    indicator_code,
    indicator_name,
    domain,
    unit,
    target_value,
    target_year,
    argMax(current_value,   reporting_period) AS latest_value,
    argMax(progress_pct,    reporting_period) AS latest_progress_pct,
    max(reporting_period)                     AS latest_period
FROM merl.mv_indicator_progress_state FINAL
WHERE location_province = ''          -- aggregate row, not province-split
GROUP BY
    indicator_id, indicator_code, indicator_name,
    domain, unit, target_value, target_year;

-- ---------------------------------------------------------------------------
-- 2.  mv_expenditure_by_domain_month
--     Sum of expenditures (and disbursements separately) by domain and
--     calendar month.  Enables the Finance dashboard bar/line chart.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merl.mv_expenditure_by_domain_month_state
(
    period              Date,             -- first day of month (toStartOfMonth)
    domain              LowCardinality(String),
    transaction_type    LowCardinality(String),
    total_amount_vuv    AggregateFunction(sum, Float64),
    total_amount_nzd    AggregateFunction(sum, Float64),
    tx_count            AggregateFunction(count, UInt64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYear(period)
ORDER BY (period, domain, transaction_type)
SETTINGS index_granularity = 8192;

COMMENT ON TABLE merl.mv_expenditure_by_domain_month_state IS
    'AggregatingMergeTree target for mv_expenditure_by_domain_month.  '
    'Use sumMerge() / countMerge() combiners when reading.';

-- The MV joins financial_transactions with activities for the domain.
-- ClickHouse does not support JOIN inside a MV definition backed by an
-- AggregatingMergeTree directly; we use a two-step approach:
-- Step 1 – raw staging table populated via Airflow (JOIN done in Airflow).
-- Step 2 – MV below fires on inserts into the staging table.

CREATE TABLE IF NOT EXISTS merl.ft_domain_staging
(
    transaction_date Date,
    domain           LowCardinality(String),
    transaction_type LowCardinality(String),
    amount_vuv       Float64,
    amount_nzd       Float64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(transaction_date)
ORDER BY (transaction_date, domain, transaction_type)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS merl.mv_expenditure_by_domain_month
TO merl.mv_expenditure_by_domain_month_state
AS
SELECT
    toStartOfMonth(transaction_date)        AS period,
    domain,
    transaction_type,
    sumState(amount_vuv)                    AS total_amount_vuv,
    sumState(amount_nzd)                    AS total_amount_nzd,
    countState()                            AS tx_count
FROM merl.ft_domain_staging
GROUP BY period, domain, transaction_type;

-- Convenience view for dashboard consumption
CREATE VIEW IF NOT EXISTS merl.v_expenditure_by_domain_month AS
SELECT
    period,
    domain,
    transaction_type,
    sumMerge(total_amount_vuv)  AS total_amount_vuv,
    sumMerge(total_amount_nzd)  AS total_amount_nzd,
    countMerge(tx_count)        AS tx_count
FROM merl.mv_expenditure_by_domain_month_state
GROUP BY period, domain, transaction_type
ORDER BY period, domain, transaction_type;

-- ---------------------------------------------------------------------------
-- 3.  mv_gedsi_participation
--     GEDSI participation rates by province and reporting period.
--     Enables the Community / GEDSI dashboard tab stacked bar and gauge charts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merl.mv_gedsi_participation_state
(
    period                  Date,             -- toStartOfMonth(engagement_date)
    province                LowCardinality(String),
    total_engagements       AggregateFunction(count,     UInt64),
    total_participants      AggregateFunction(sum,       UInt32),
    male_count              AggregateFunction(sum,       UInt32),
    female_count            AggregateFunction(sum,       UInt32),
    youth_count             AggregateFunction(sum,       UInt32),
    disability_count        AggregateFunction(sum,       UInt32),
    female_pct_state        AggregateFunction(avg,       Float64),
    youth_pct_state         AggregateFunction(avg,       Float64),
    disability_pct_state    AggregateFunction(avg,       Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYear(period)
ORDER BY (period, province)
SETTINGS index_granularity = 8192;

COMMENT ON TABLE merl.mv_gedsi_participation_state IS
    'AggregatingMergeTree target for mv_gedsi_participation.';

CREATE MATERIALIZED VIEW IF NOT EXISTS merl.mv_gedsi_participation
TO merl.mv_gedsi_participation_state
AS
SELECT
    toStartOfMonth(engagement_date)                              AS period,
    province,
    countState()                                                 AS total_engagements,
    sumState(total_participants)                                 AS total_participants,
    sumState(male_participants)                                  AS male_count,
    sumState(female_participants)                                AS female_count,
    sumState(youth_participants)                                 AS youth_count,
    sumState(disability_participants)                            AS disability_count,
    -- Per-session female % averaged across sessions in the period
    avgState(
        if(total_participants > 0,
           toFloat64(female_participants) / toFloat64(total_participants) * 100,
           0)
    )                                                            AS female_pct_state,
    avgState(
        if(total_participants > 0,
           toFloat64(youth_participants) / toFloat64(total_participants) * 100,
           0)
    )                                                            AS youth_pct_state,
    avgState(
        if(total_participants > 0,
           toFloat64(disability_participants) / toFloat64(total_participants) * 100,
           0)
    )                                                            AS disability_pct_state
FROM merl.community_engagements
GROUP BY period, province;

-- Convenience view
CREATE VIEW IF NOT EXISTS merl.v_gedsi_participation AS
SELECT
    period,
    province,
    countMerge(total_engagements)        AS total_engagements,
    sumMerge(total_participants)         AS total_participants,
    sumMerge(male_count)                 AS male_count,
    sumMerge(female_count)               AS female_count,
    sumMerge(youth_count)                AS youth_count,
    sumMerge(disability_count)           AS disability_count,
    round(avgMerge(female_pct_state),   2) AS female_pct,
    round(avgMerge(youth_pct_state),    2) AS youth_pct,
    round(avgMerge(disability_pct_state),2) AS disability_pct
FROM merl.mv_gedsi_participation_state
GROUP BY period, province
ORDER BY period, province;

-- Cumulative GEDSI summary across all time (used by dashboard summary cards)
CREATE VIEW IF NOT EXISTS merl.v_gedsi_cumulative AS
SELECT
    province,
    sum(total_engagements)                                     AS total_engagements,
    sum(total_participants)                                    AS total_participants,
    sum(male_count)                                            AS male_count,
    sum(female_count)                                          AS female_count,
    sum(youth_count)                                           AS youth_count,
    sum(disability_count)                                      AS disability_count,
    if(sum(total_participants) > 0,
       round(sum(female_count) / sum(total_participants) * 100, 2),
       0)                                                      AS female_pct,
    if(sum(total_participants) > 0,
       round(sum(youth_count)  / sum(total_participants) * 100, 2),
       0)                                                      AS youth_pct,
    if(sum(total_participants) > 0,
       round(sum(disability_count) / sum(total_participants) * 100, 2),
       0)                                                      AS disability_pct
FROM merl.v_gedsi_participation
GROUP BY province
ORDER BY province;

-- ---------------------------------------------------------------------------
-- 4.  mv_event_frequency
--     L&D event count by event_type and province by year.
--     Enables the Events dashboard heatmap and trend charts.
--
--     Because provinces_affected is an Array(String), we unnest (arrayJoin)
--     so each province gets its own row in the aggregation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merl.mv_event_frequency_state
(
    event_year    UInt16,
    event_type    LowCardinality(String),
    province      LowCardinality(String),
    onset_type    LowCardinality(String),
    event_count   AggregateFunction(count,  UInt64),
    total_loss_vuv AggregateFunction(sum,   Float64)
)
ENGINE = AggregatingMergeTree()
PARTITION BY event_year
ORDER BY (event_year, event_type, province)
SETTINGS index_granularity = 8192;

COMMENT ON TABLE merl.mv_event_frequency_state IS
    'AggregatingMergeTree target for mv_event_frequency.';

-- Staging table: one row per (event, province) created by Airflow arrayJoin
CREATE TABLE IF NOT EXISTS merl.ld_event_province_staging
(
    event_id           UUID,
    event_year         UInt16,
    event_type         LowCardinality(String),
    onset_type         LowCardinality(String),
    province           LowCardinality(String),
    economic_loss_vuv  Float64 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY event_year
ORDER BY (event_year, event_type, province)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS merl.mv_event_frequency
TO merl.mv_event_frequency_state
AS
SELECT
    event_year,
    event_type,
    province,
    onset_type,
    countState()                    AS event_count,
    sumState(economic_loss_vuv)     AS total_loss_vuv
FROM merl.ld_event_province_staging
GROUP BY event_year, event_type, province, onset_type;

-- Convenience view
CREATE VIEW IF NOT EXISTS merl.v_event_frequency AS
SELECT
    event_year,
    event_type,
    province,
    onset_type,
    countMerge(event_count)          AS event_count,
    sumMerge(total_loss_vuv)         AS total_loss_vuv_sum
FROM merl.mv_event_frequency_state
GROUP BY event_year, event_type, province, onset_type
ORDER BY event_year DESC, event_type, province;

-- Cross-tab helper: events per province per year (all types combined)
CREATE VIEW IF NOT EXISTS merl.v_event_frequency_by_province_year AS
SELECT
    event_year,
    province,
    sum(event_count)         AS total_events,
    sum(total_loss_vuv_sum)  AS total_loss_vuv,
    groupArray(event_type)   AS event_types
FROM merl.v_event_frequency
GROUP BY event_year, province
ORDER BY event_year DESC, province;
