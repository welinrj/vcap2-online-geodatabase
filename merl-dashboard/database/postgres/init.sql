-- =============================================================================
-- MERL Dashboard – PostgreSQL 16 + PostGIS Schema Initialisation
-- Project : Vanuatu Loss and Damage Fund Development Project
-- Schema  : merl
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS merl;

-- ---------------------------------------------------------------------------
-- 2. Enumerations
-- ---------------------------------------------------------------------------

CREATE TYPE merl.domain_type AS ENUM (
    'governance',
    'financial',
    'community',
    'events',
    'learning'
);

CREATE TYPE merl.disaggregation_type AS ENUM (
    'gender',
    'age',
    'disability',
    'location',
    'none'
);

CREATE TYPE merl.activity_status AS ENUM (
    'planned',
    'in_progress',
    'completed',
    'delayed'
);

CREATE TYPE merl.transaction_type AS ENUM (
    'disbursement',
    'expenditure',
    'refund'
);

CREATE TYPE merl.event_type AS ENUM (
    'cyclone',
    'flood',
    'drought',
    'sea_level_rise',
    'acidification',
    'other'
);

CREATE TYPE merl.onset_type AS ENUM (
    'extreme',
    'slow_onset'
);

CREATE TYPE merl.engagement_type AS ENUM (
    'consultation',
    'workshop',
    'training',
    'reporting'
);

CREATE TYPE merl.lesson_type AS ENUM (
    'success',
    'challenge',
    'adaptation',
    'innovation'
);

CREATE TYPE merl.user_role AS ENUM (
    'administrator',
    'project_manager',
    'merl_officer',
    'finance_officer',
    'partner_viewer',
    'community_reporter'
);

CREATE TYPE merl.milestone_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'overdue'
);

-- ---------------------------------------------------------------------------
-- 3. Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merl.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------------

-- 4.1  users ----------------------------------------------------------------
CREATE TABLE merl.users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id     VARCHAR(255) UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    role            merl.user_role NOT NULL,
    organisation    VARCHAR(255),
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  merl.users IS 'Application users, linked to Keycloak identity provider.';
COMMENT ON COLUMN merl.users.keycloak_id IS 'Subject claim from the Keycloak JWT; used for SSO lookup.';

-- 4.2  indicators -----------------------------------------------------------
CREATE TABLE merl.indicators (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(30) NOT NULL UNIQUE,
    name                VARCHAR(500) NOT NULL,
    description         TEXT,
    domain              merl.domain_type        NOT NULL,
    unit                VARCHAR(100),
    baseline_value      NUMERIC(18, 4),
    target_value        NUMERIC(18, 4),
    target_year         INTEGER     CHECK (target_year BETWEEN 2020 AND 2050),
    data_source         VARCHAR(500),
    disaggregation_type merl.disaggregation_type NOT NULL DEFAULT 'none',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.indicators IS 'Results-framework indicator register.';

-- 4.3  indicator_values -----------------------------------------------------
CREATE TABLE merl.indicator_values (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_id        UUID        NOT NULL REFERENCES merl.indicators (id) ON DELETE CASCADE,
    value               NUMERIC(18, 4) NOT NULL,
    reporting_period    DATE        NOT NULL,
    reported_by         UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    location_island     VARCHAR(100),
    location_province   VARCHAR(100),
    disaggregation_key  VARCHAR(100),
    disaggregation_value VARCHAR(200),
    notes               TEXT,
    evidence_url        VARCHAR(2000),
    verified            BOOLEAN     NOT NULL DEFAULT FALSE,
    verified_by         UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.indicator_values IS 'Time-series data points for each indicator.';

-- 4.4  activities -----------------------------------------------------------
CREATE TABLE merl.activities (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) NOT NULL UNIQUE,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    domain          merl.domain_type NOT NULL,
    phase           INTEGER     NOT NULL CHECK (phase BETWEEN 1 AND 5),
    start_date      DATE,
    end_date        DATE,
    status          merl.activity_status NOT NULL DEFAULT 'planned',
    lead_officer    VARCHAR(255),
    budget_vuv      NUMERIC(18, 2),
    budget_nzd      NUMERIC(18, 2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT activities_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE merl.activities IS 'Project work-plan activities organised by phase.';

-- 4.5  activity_milestones --------------------------------------------------
CREATE TABLE merl.activity_milestones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id     UUID        NOT NULL REFERENCES merl.activities (id) ON DELETE CASCADE,
    milestone_name  VARCHAR(500) NOT NULL,
    due_date        DATE        NOT NULL,
    completed_date  DATE,
    status          merl.milestone_status NOT NULL DEFAULT 'pending',
    notes           TEXT,
    CONSTRAINT milestone_completion_check CHECK (
        completed_date IS NULL OR completed_date >= due_date - INTERVAL '180 days'
    )
);

COMMENT ON TABLE merl.activity_milestones IS 'Key milestones associated with each activity.';

-- 4.6  financial_transactions -----------------------------------------------
CREATE TABLE merl.financial_transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date    DATE        NOT NULL,
    description         TEXT        NOT NULL,
    amount_vuv          NUMERIC(18, 2) NOT NULL,
    amount_nzd          NUMERIC(18, 2),
    transaction_type    merl.transaction_type NOT NULL,
    activity_id         UUID        REFERENCES merl.activities (id) ON DELETE SET NULL,
    donor_reference     VARCHAR(255),
    payment_method      VARCHAR(100),
    approved_by         VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.financial_transactions IS 'Fund disbursements, expenditures, and refunds.';

-- 4.7  ld_events ------------------------------------------------------------
CREATE TABLE merl.ld_events (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name                      VARCHAR(500) NOT NULL,
    event_type                      merl.event_type NOT NULL,
    onset_type                      merl.onset_type NOT NULL,
    start_date                      DATE,
    end_date                        DATE,
    islands_affected                TEXT[],
    provinces_affected              TEXT[],
    economic_loss_vuv               NUMERIC(18, 2),
    non_economic_loss_description   TEXT,
    response_actions                TEXT,
    data_source                     VARCHAR(500),
    geom                            GEOMETRY(Point, 4326),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ld_events_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE merl.ld_events IS 'Documented loss and damage events affecting Vanuatu communities.';

-- 4.8  community_engagements ------------------------------------------------
CREATE TABLE merl.community_engagements (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_date         DATE        NOT NULL,
    community_name          VARCHAR(255) NOT NULL,
    island                  VARCHAR(100) NOT NULL,
    province                VARCHAR(100) NOT NULL,
    engagement_type         merl.engagement_type NOT NULL,
    total_participants      INTEGER     NOT NULL DEFAULT 0 CHECK (total_participants >= 0),
    male_participants       INTEGER     NOT NULL DEFAULT 0 CHECK (male_participants >= 0),
    female_participants     INTEGER     NOT NULL DEFAULT 0 CHECK (female_participants >= 0),
    youth_participants      INTEGER     NOT NULL DEFAULT 0 CHECK (youth_participants >= 0),
    disability_participants INTEGER     NOT NULL DEFAULT 0 CHECK (disability_participants >= 0),
    outcomes                TEXT,
    follow_up_required      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_gender_total_check CHECK (
        male_participants + female_participants <= total_participants
    )
);

COMMENT ON TABLE merl.community_engagements IS 'GEDSI-disaggregated community engagement records.';

-- 4.9  learning_entries -----------------------------------------------------
CREATE TABLE merl.learning_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date      DATE        NOT NULL,
    title           VARCHAR(500) NOT NULL,
    domain          merl.domain_type NOT NULL,
    lesson_type     merl.lesson_type NOT NULL,
    description     TEXT        NOT NULL,
    implications    TEXT,
    action_taken    TEXT,
    recorded_by     UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    tags            TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.learning_entries IS 'Lessons learned, adaptations, and knowledge management entries.';

-- 4.10 document_uploads -----------------------------------------------------
CREATE TABLE merl.document_uploads (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by             UUID        NOT NULL REFERENCES merl.users (id) ON DELETE RESTRICT,
    filename                VARCHAR(500) NOT NULL,
    file_path               VARCHAR(2000) NOT NULL,
    file_type               VARCHAR(100),
    related_entity_type     VARCHAR(100),
    related_entity_id       UUID,
    description             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.document_uploads IS 'Evidence documents and supporting files linked to MERL entities.';

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

-- indicator_values
CREATE INDEX idx_iv_indicator_id     ON merl.indicator_values (indicator_id);
CREATE INDEX idx_iv_reporting_period ON merl.indicator_values (reporting_period DESC);
CREATE INDEX idx_iv_reported_by      ON merl.indicator_values (reported_by);
CREATE INDEX idx_iv_province         ON merl.indicator_values (location_province);
CREATE INDEX idx_iv_indicator_period ON merl.indicator_values (indicator_id, reporting_period DESC);

-- activities
CREATE INDEX idx_act_domain  ON merl.activities (domain);
CREATE INDEX idx_act_status  ON merl.activities (status);
CREATE INDEX idx_act_phase   ON merl.activities (phase);
CREATE INDEX idx_act_dates   ON merl.activities (start_date, end_date);

-- activity_milestones
CREATE INDEX idx_am_activity_id ON merl.activity_milestones (activity_id);
CREATE INDEX idx_am_due_date    ON merl.activity_milestones (due_date);
CREATE INDEX idx_am_status      ON merl.activity_milestones (status);

-- financial_transactions
CREATE INDEX idx_ft_transaction_date ON merl.financial_transactions (transaction_date DESC);
CREATE INDEX idx_ft_activity_id      ON merl.financial_transactions (activity_id);
CREATE INDEX idx_ft_type             ON merl.financial_transactions (transaction_type);

-- ld_events
CREATE INDEX idx_lde_event_type  ON merl.ld_events (event_type);
CREATE INDEX idx_lde_start_date  ON merl.ld_events (start_date DESC);
CREATE INDEX idx_lde_onset_type  ON merl.ld_events (onset_type);
CREATE INDEX idx_lde_geom        ON merl.ld_events USING GIST (geom);

-- community_engagements
CREATE INDEX idx_ce_engagement_date ON merl.community_engagements (engagement_date DESC);
CREATE INDEX idx_ce_province        ON merl.community_engagements (province);
CREATE INDEX idx_ce_island          ON merl.community_engagements (island);
CREATE INDEX idx_ce_type            ON merl.community_engagements (engagement_type);

-- learning_entries
CREATE INDEX idx_le_entry_date  ON merl.learning_entries (entry_date DESC);
CREATE INDEX idx_le_domain      ON merl.learning_entries (domain);
CREATE INDEX idx_le_lesson_type ON merl.learning_entries (lesson_type);
CREATE INDEX idx_le_recorded_by ON merl.learning_entries (recorded_by);
CREATE INDEX idx_le_tags        ON merl.learning_entries USING GIN (tags);

-- indicators
CREATE INDEX idx_ind_domain ON merl.indicators (domain);

-- document_uploads
CREATE INDEX idx_du_uploaded_by         ON merl.document_uploads (uploaded_by);
CREATE INDEX idx_du_related_entity      ON merl.document_uploads (related_entity_type, related_entity_id);

-- users
CREATE INDEX idx_users_role   ON merl.users (role);
CREATE INDEX idx_users_active ON merl.users (active);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_indicators_updated_at
    BEFORE UPDATE ON merl.indicators
    FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at();

CREATE TRIGGER trg_activities_updated_at
    BEFORE UPDATE ON merl.activities
    FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at();
