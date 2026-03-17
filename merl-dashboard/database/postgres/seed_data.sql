-- =============================================================================
-- MERL Dashboard – Seed Data
-- Project : Vanuatu Loss and Damage Fund Development Project
-- =============================================================================
-- All UUIDs are generated at insert time with gen_random_uuid() so the file
-- is safe to run multiple times in a fresh database.  Cross-table references
-- use CTEs with RETURNING to capture generated IDs without hard-coding them.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. USERS
-- ---------------------------------------------------------------------------
INSERT INTO merl.users (email, full_name, role, organisation, keycloak_id) VALUES
    ('ronal.tavita@vcap.gov.vu',   'Ronal Tavita',      'administrator',      'VCAP Secretariat',                     'kc-u-001'),
    ('mere.bani@vcap.gov.vu',      'Mere Bani',         'project_manager',    'VCAP Secretariat',                     'kc-u-002'),
    ('jean.kalsakau@vcap.gov.vu',  'Jean Kalsakau',     'merl_officer',       'VCAP Secretariat',                     'kc-u-003'),
    ('peter.naupa@mof.gov.vu',     'Peter Naupa',       'finance_officer',    'Ministry of Finance',                  'kc-u-004'),
    ('sarah.loughman@oxfam.org.vu','Sarah Loughman',    'partner_viewer',     'Oxfam in the Pacific',                 'kc-u-005');

-- ---------------------------------------------------------------------------
-- 2. INDICATORS
-- ---------------------------------------------------------------------------
-- We use a CTE per domain to keep the file readable; the final SELECT
-- inserts all rows in one pass.
INSERT INTO merl.indicators
    (code, name, description, domain, unit, baseline_value, target_value, target_year, data_source, disaggregation_type)
VALUES
    -- Governance (3)
    ('GOV-01',
     'Number of policy frameworks adopted for L&D management',
     'Cumulative count of national/sub-national policy, regulatory, or strategic frameworks that formally address loss and damage, endorsed by competent authorities.',
     'governance', 'count', 0, 4, 2027,
     'VCAP policy registry; National Advisory Board minutes',
     'none'),
    ('GOV-02',
     'Number of multi-stakeholder coordination meetings held',
     'Count of formal coordination meetings attended by at least three different stakeholder groups (government, civil society, donor, community) with minutes recorded.',
     'governance', 'count', 0, 24, 2027,
     'VCAP meeting registry; attendance sheets',
     'none'),
    ('GOV-03',
     'Number of inter-agency coordination mechanisms operational',
     'Count of permanent or standing coordination bodies (committees, working groups, task forces) that have met at least twice in the reporting year.',
     'governance', 'count', 0, 3, 2026,
     'VCAP secretariat records; ToR documents',
     'none'),

    -- Financial (3)
    ('FIN-01',
     'Percentage of total fund disbursed to implementing partners',
     'Proportion of the total approved fund envelope that has been disbursed to downstream implementing partners, cumulative from project start.',
     'financial', 'percent', 0.0, 80.0, 2027,
     'Finance management information system; disbursement registers',
     'none'),
    ('FIN-02',
     'Budget utilisation rate',
     'Ratio of actual expenditure to approved budget for the reporting period, expressed as a percentage.',
     'financial', 'percent', 0.0, 90.0, 2027,
     'Ministry of Finance FMIS; quarterly financial reports',
     'none'),
    ('FIN-03',
     'Average cost per direct beneficiary (VUV)',
     'Total project expenditure divided by the number of verified direct beneficiaries, expressed in Vanuatu Vatu.',
     'financial', 'VUV', 0, 15000, 2027,
     'Finance records; beneficiary registers',
     'none'),

    -- Community (3)
    ('COM-01',
     'Number of communities directly engaged by the project',
     'Cumulative count of distinct named communities where at least one formal engagement activity has taken place.',
     'community', 'count', 0, 60, 2027,
     'Community engagement registers; provincial reports',
     'location'),
    ('COM-02',
     'Percentage of female participants in project activities',
     'Proportion of female participants across all project consultations, workshops, and training events.',
     'community', 'percent', 0.0, 50.0, 2027,
     'Attendance sheets; GEDSI disaggregation forms',
     'gender'),
    ('COM-03',
     'Number of persons with disability included in consultations',
     'Cumulative count of participants self-identifying as having a disability who have participated in at least one project activity.',
     'community', 'count', 0, 120, 2027,
     'Attendance sheets; disability-inclusive engagement records',
     'disability'),

    -- Events (3)
    ('EVT-01',
     'Number of loss and damage events documented in the national registry',
     'Cumulative count of L&D events for which a standardised event record has been created, verified, and entered in the MERL system.',
     'events', 'count', 0, 30, 2027,
     'MERL event registry; NDMO situation reports',
     'none'),
    ('EVT-02',
     'Average government response time to extreme events (days)',
     'Mean number of days between the onset of a declared extreme event and the first formal government response action.',
     'events', 'days', 14, 5, 2027,
     'NDMO response logs; MERL event registry',
     'none'),
    ('EVT-03',
     'Percentage of L&D events for which economic loss has been formally assessed',
     'Proportion of documented L&D events that have an approved post-disaster needs assessment or equivalent economic loss estimate.',
     'events', 'percent', 20.0, 85.0, 2027,
     'MERL event registry; PDNA reports',
     'none'),

    -- Learning (3)
    ('LRN-01',
     'Number of lessons captured in the knowledge management system',
     'Cumulative count of validated lesson entries (success, challenge, adaptation, or innovation) recorded in the MERL platform.',
     'learning', 'count', 0, 40, 2027,
     'MERL knowledge management module',
     'none'),
    ('LRN-02',
     'Number of project adaptations implemented based on learning',
     'Cumulative count of documented changes to project design, strategy, or implementation approach that are directly traceable to a recorded lesson.',
     'learning', 'count', 0, 12, 2027,
     'Project revision logs; progress reports',
     'none'),
    ('LRN-03',
     'Number of knowledge products produced and disseminated',
     'Cumulative count of published outputs (briefs, case studies, toolkits, datasets) that synthesise project learning and have been shared with at least one external audience.',
     'learning', 'count', 0, 8, 2027,
     'Publication registry; dissemination records',
     'none');

-- ---------------------------------------------------------------------------
-- 3. ACTIVITIES
-- ---------------------------------------------------------------------------
INSERT INTO merl.activities
    (code, name, description, domain, phase, start_date, end_date, status, lead_officer, budget_vuv, budget_nzd)
VALUES
    ('ACT-01',
     'Project Inception and Governance Setup',
     'Establish project governance structures, convene inception workshop, finalise project management manual, and register the project with relevant government ministries.',
     'governance', 1,
     '2025-01-06', '2025-04-30',
     'completed', 'Mere Bani',
     4500000, 37500),

    ('ACT-02',
     'Stakeholder Mapping and Consultation Planning',
     'Develop a comprehensive stakeholder map covering national and provincial actors; design a stakeholder engagement plan aligned with GEDSI principles.',
     'governance', 1,
     '2025-02-03', '2025-05-30',
     'completed', 'Jean Kalsakau',
     1800000, 15000),

    ('ACT-03',
     'Loss and Damage Assessment Framework Development',
     'Co-design a nationally appropriate L&D assessment methodology drawing on IPCC frameworks, Pacific regional guidance, and community-based approaches.',
     'events', 2,
     '2025-03-03', '2025-08-29',
     'completed', 'Jean Kalsakau',
     2400000, 20000),

    ('ACT-04',
     'Community Vulnerability Assessments – Six Provinces',
     'Conduct participatory vulnerability and capacity assessments in at least 10 communities per province, generating province-level L&D risk profiles.',
     'community', 2,
     '2025-05-05', '2025-12-19',
     'in_progress', 'Mere Bani',
     9600000, 80000),

    ('ACT-05',
     'Financial Management System Setup',
     'Procure, configure, and test the fund management information system; establish chart of accounts; train finance staff; develop financial management manual.',
     'financial', 1,
     '2025-01-06', '2025-06-30',
     'completed', 'Peter Naupa',
     3000000, 25000),

    ('ACT-06',
     'Data Collection Tool Development',
     'Design and pilot mobile data collection tools for community reporters; develop data quality protocols; establish data-flow SOPs.',
     'learning', 2,
     '2025-04-01', '2025-09-30',
     'in_progress', 'Jean Kalsakau',
     1680000, 14000),

    ('ACT-07',
     'Provincial Workshops Series',
     'Deliver a series of multi-stakeholder workshops in all six provinces to validate L&D assessment findings and co-develop provincial response priorities.',
     'community', 3,
     '2025-09-01', '2026-03-31',
     'in_progress', 'Mere Bani',
     6000000, 50000),

    ('ACT-08',
     'Fund Disbursement Mechanism Design',
     'Design and test the downstream fund disbursement mechanism including eligibility criteria, application processes, and accountability safeguards.',
     'financial', 3,
     '2025-10-01', '2026-06-30',
     'planned', 'Peter Naupa',
     2400000, 20000),

    ('ACT-09',
     'Knowledge Management Platform Development',
     'Build and deploy the online MERL and knowledge-sharing platform; populate with baseline data; conduct user acceptance testing with partners.',
     'learning', 4,
     '2026-01-05', '2026-09-30',
     'planned', 'Jean Kalsakau',
     3600000, 30000),

    ('ACT-10',
     'Project Evaluation and Final Reporting',
     'Commission independent mid-term review; prepare and disseminate final project report; conduct end-of-project learning review and hand-over.',
     'learning', 5,
     '2026-10-01', '2026-12-18',
     'planned', 'Mere Bani',
     1800000, 15000);

-- ---------------------------------------------------------------------------
-- 4. ACTIVITY MILESTONES  (10 milestones, at least one per activity)
-- ---------------------------------------------------------------------------
INSERT INTO merl.activity_milestones
    (activity_id, milestone_name, due_date, completed_date, status, notes)
SELECT a.id, m.milestone_name, m.due_date::DATE, m.completed_date::DATE, m.status::merl.milestone_status, m.notes
FROM (
    VALUES
        ('ACT-01', 'Inception workshop held and report finalised',                   '2025-02-28', '2025-02-21', 'completed', 'Workshop held at Warwick Le Lagon, Port Vila; 42 participants.'),
        ('ACT-01', 'Project management manual approved by steering committee',       '2025-04-30', '2025-04-25', 'completed', 'Approved at SC-01 meeting.'),
        ('ACT-02', 'Stakeholder map v1.0 endorsed',                                  '2025-04-30', '2025-04-28', 'completed', 'Mapped 87 stakeholders across 5 categories.'),
        ('ACT-03', 'L&D assessment framework draft shared for review',               '2025-06-30', '2025-06-27', 'completed', 'Circulated to NDMO, DEPC, and Oxfam.'),
        ('ACT-03', 'Framework finalised and endorsed by inter-agency committee',     '2025-08-29', '2025-08-22', 'completed', 'Endorsed at IAC-03 meeting.'),
        ('ACT-04', 'Vulnerability assessments completed in Shefa and Tafea',         '2025-08-29', '2025-08-15', 'completed', NULL),
        ('ACT-04', 'Vulnerability assessments completed in all six provinces',       '2025-12-19', NULL,         'in_progress', 'Torba assessment delayed due to weather; rescheduled for November.'),
        ('ACT-05', 'Finance staff trained on FMIS',                                  '2025-05-30', '2025-05-23', 'completed', 'Four staff completed two-day training.'),
        ('ACT-07', 'Workshops completed in Shefa, Tafea, and Malampa provinces',    '2025-12-19', NULL,         'in_progress', 'Shefa and Tafea workshops completed; Malampa scheduled December.'),
        ('ACT-08', 'Disbursement mechanism design document approved',                '2026-03-31', NULL,         'pending',    NULL)
) AS m(activity_code, milestone_name, due_date, completed_date, status, notes)
JOIN merl.activities a ON a.code = m.activity_code;

-- ---------------------------------------------------------------------------
-- 5. L&D EVENTS
-- ---------------------------------------------------------------------------
INSERT INTO merl.ld_events
    (event_name, event_type, onset_type, start_date, end_date,
     islands_affected, provinces_affected,
     economic_loss_vuv, non_economic_loss_description,
     response_actions, data_source, geom)
VALUES
    ('Tropical Cyclone Pam',
     'cyclone', 'extreme',
     '2015-03-06', '2015-03-15',
     ARRAY['Efate','Erromango','Tanna','Aneityum','Aniwa','Futuna'],
     ARRAY['Shefa','Tafea'],
     49000000000,
     'Widespread destruction of traditional gardens, cultural sites, and community meeting houses. Loss of livestock and traditional seed stocks. Severe psychological trauma reported in Tanna communities.',
     'Declared state of emergency. NDMO coordinated international humanitarian response. New Zealand and Australian DART teams deployed. Temporary shelters erected.',
     'UNOCHA Situation Reports; World Bank PDNA 2015; VMGD records',
     ST_SetSRID(ST_MakePoint(168.3273, -17.7334), 4326)),

    ('2020 Northern Floods – Penama Province',
     'flood', 'extreme',
     '2020-04-12', '2020-04-19',
     ARRAY['Ambae','Maewo','Pentecost'],
     ARRAY['Penama'],
     850000000,
     'Loss of taro gardens and root-crop plots affecting food security for an estimated 4,200 people. Destruction of community freshwater catchment systems on Ambae. Cultural gardens lost on Maewo.',
     'NDMO emergency declaration. Provincial Disaster Committee activated. Red Cross Vanuatu deployed relief supplies.',
     'NDMO Situation Report 2020-04-14; Penama PDC assessment',
     ST_SetSRID(ST_MakePoint(167.8833, -15.3167), 4326)),

    ('2023 Extended Drought – Malampa Province',
     'drought', 'slow_onset',
     '2023-06-01', '2023-11-30',
     ARRAY['Malekula','Ambrym','Paama'],
     ARRAY['Malampa'],
     420000000,
     'Failure of subsistence crops (taro, yam, cassava) across Malekula and Paama. Reduction in freshwater availability. Reported increase in child malnutrition in interior Malekula communities.',
     'VMGD drought advisory issued July 2023. SPC Food Security cluster activated. Cash-for-work programme implemented by World Food Programme.',
     'VMGD climate bulletins; WFP Vanuatu situation report Q3 2023; Malampa PDC records',
     ST_SetSRID(ST_MakePoint(167.1667, -16.2167), 4326)),

    ('Tropical Cyclone Judy – Torba Province',
     'cyclone', 'extreme',
     '2024-02-26', '2024-03-02',
     ARRAY['Vanua Lava','Gaua','Mota Lava','Mota','Merig','Mere Lava','Ureparapara'],
     ARRAY['Torba'],
     1200000000,
     'Destruction of community-managed marine protected areas. Loss of traditional navigation knowledge sites. Damage to historically significant community meeting nakamal structures on Vanua Lava.',
     'NDMO state of emergency declared 27 February 2024. Aerial assessment conducted by government. Vanuatu Red Cross emergency response activated.',
     'NDMO Situation Reports Feb–Mar 2024; Torba PDC damage assessment',
     ST_SetSRID(ST_MakePoint(167.4667, -13.8167), 4326)),

    ('Ongoing Sea Level Rise and Coastal Erosion – All Provinces',
     'sea_level_rise', 'slow_onset',
     '2000-01-01', NULL,
     ARRAY['Efate','Espiritu Santo','Malekula','Ambae','Tanna','Erromango','Vanua Lava','Aneityum'],
     ARRAY['Shefa','Sanma','Malampa','Penama','Tafea','Torba'],
     NULL,
     'Erosion of traditional coastal gardens and burial sites. Loss of low-lying customary land to inundation. Saltwater intrusion into freshwater lenses on low atolls. Bleaching and degradation of reef ecosystems critical for subsistence fishing.',
     'Community-level adaptation measures including shoreline vegetation planting. DEPC monitoring programme. Government engagement with Pacific Regional Climate Change Roundtable.',
     'VMGD sea level monitoring; SPREP Pacific Sea Level and Climate Monitoring Project; DEPC coastal assessments',
     ST_SetSRID(ST_MakePoint(167.9667, -15.3767), 4326));

-- ---------------------------------------------------------------------------
-- 6. COMMUNITY ENGAGEMENTS  (20 records, all 6 provinces)
-- ---------------------------------------------------------------------------
INSERT INTO merl.community_engagements
    (engagement_date, community_name, island, province, engagement_type,
     total_participants, male_participants, female_participants,
     youth_participants, disability_participants, outcomes, follow_up_required)
VALUES
    -- Torba (2 records)
    ('2025-03-10', 'Sola Village', 'Vanua Lava', 'Torba', 'consultation',
     38, 18, 20, 12, 3,
     'Community priorities mapped; sea level rise identified as primary concern. Village land committee agreed to participate in vulnerability assessment.',
     TRUE),
    ('2025-06-16', 'Port Patteson Community', 'Mota Lava', 'Torba', 'workshop',
     45, 20, 25, 15, 2,
     'L&D assessment framework validated with community. Customary indicators of environmental change documented. Women''s group established as focal point.',
     FALSE),

    -- Sanma (3 records)
    ('2025-02-17', 'Luganville Urban Community', 'Espiritu Santo', 'Sanma', 'workshop',
     62, 28, 34, 18, 4,
     'Inception workshop for Sanma province. Inter-agency coordination roles agreed. Provincial L&D focal points identified.',
     FALSE),
    ('2025-04-07', 'Matantas Village', 'Espiritu Santo', 'Sanma', 'training',
     30, 12, 18, 10, 1,
     'Community reporters trained on mobile data collection tool. 8 community reporters certified. Data collection protocols agreed.',
     FALSE),
    ('2025-07-21', 'Norsup Community', 'Malekula', 'Sanma', 'consultation',
     25, 11, 14, 7, 2,
     'Consultation on draft L&D assessment findings. Community validated three additional non-economic loss categories.',
     TRUE),

    -- Penama (4 records)
    ('2025-03-24', 'Saratamata Village', 'Ambae', 'Penama', 'consultation',
     41, 19, 22, 14, 3,
     'Community risk mapping completed. 2020 flood impacts documented with community validation. Early warning system gaps identified.',
     TRUE),
    ('2025-05-12', 'Lolowai Community', 'Ambae', 'Penama', 'workshop',
     55, 25, 30, 17, 4,
     'Provincial L&D workshop. Recovery planning prioritised. Women-led adaptation strategies presented and endorsed.',
     FALSE),
    ('2025-06-30', 'Laone Village', 'Pentecost', 'Penama', 'training',
     28, 10, 18, 9, 1,
     'GEDSI-focused training for provincial staff. Disability-inclusive engagement techniques practised.',
     FALSE),
    ('2025-09-08', 'Craig Cove Area', 'Ambrym', 'Penama', 'reporting',
     35, 16, 19, 11, 2,
     'Mid-year reporting consultation. Communities reviewed project progress. Three corrective action recommendations recorded.',
     TRUE),

    -- Malampa (4 records)
    ('2025-02-24', 'Lakatoro Town', 'Malekula', 'Malampa', 'workshop',
     58, 27, 31, 16, 5,
     'Provincial inception workshop. 2023 drought impacts validated by community representatives. Provincial Disaster Committee engagement strengthened.',
     FALSE),
    ('2025-04-28', 'Norsup Village', 'Malekula', 'Malampa', 'consultation',
     32, 14, 18, 9, 2,
     'Consultation on L&D assessment methodology. Community requested inclusion of traditional knowledge indicators.',
     TRUE),
    ('2025-07-14', 'Paama Island Community', 'Paama', 'Malampa', 'training',
     22, 8, 14, 7, 1,
     'Mobile data collection training. Community reporters upskilled. Drought monitoring transects established.',
     FALSE),
    ('2025-10-06', 'Fanla Village', 'Ambrym', 'Malampa', 'workshop',
     48, 21, 27, 15, 3,
     'Vulnerability assessment validation workshop. Ambrym volcanic risk integrated into L&D framework. Youth group drafted community action plan.',
     TRUE),

    -- Shefa (4 records)
    ('2025-01-27', 'Port Vila Urban Communities', 'Efate', 'Shefa', 'workshop',
     75, 33, 42, 22, 6,
     'National inception workshop. National Advisory Board constituted. VCAP project formally launched.',
     FALSE),
    ('2025-04-14', 'Eton Village', 'Efate', 'Shefa', 'consultation',
     36, 16, 20, 11, 2,
     'Coastal erosion impacts documented. Community-based monitoring system agreed. Customary land tenure and L&D linkages explored.',
     TRUE),
    ('2025-06-09', 'Erakor Village', 'Efate', 'Shefa', 'training',
     29, 11, 18, 8, 3,
     'Community reporters trained. Three women appointed as island-level data coordinators.',
     FALSE),
    ('2025-09-22', 'Siviri Village', 'Efate', 'Shefa', 'workshop',
     44, 19, 25, 13, 2,
     'L&D framework validation with peri-urban communities. Urban-rural L&D linkages documented.',
     FALSE),

    -- Tafea (3 records)
    ('2025-03-17', 'Lenakel Town', 'Tanna', 'Tafea', 'workshop',
     52, 24, 28, 17, 4,
     'Provincial workshop following Cyclone Pam legacy review. Tafea Provincial Council engagement. Long-term L&D trajectory discussed.',
     FALSE),
    ('2025-05-26', 'Isangel Village', 'Tanna', 'Tafea', 'consultation',
     39, 17, 22, 12, 3,
     'Consultation on Tanna customary L&D indicators. Kastom-based resilience mechanisms documented.',
     TRUE),
    ('2025-08-11', 'Anatom Village', 'Aneityum', 'Tafea', 'training',
     21, 8, 13, 6, 1,
     'Remote island community training. Digital literacy component added due to low connectivity. Satellite data collection method piloted.',
     FALSE);

-- ---------------------------------------------------------------------------
-- 7. FINANCIAL TRANSACTIONS  (~15 transactions, total ~300,000,000 VUV)
-- ---------------------------------------------------------------------------
INSERT INTO merl.financial_transactions
    (transaction_date, description, amount_vuv, amount_nzd, transaction_type,
     activity_id, donor_reference, payment_method, approved_by)
SELECT
    t.transaction_date::DATE,
    t.description,
    t.amount_vuv,
    t.amount_nzd,
    t.transaction_type::merl.transaction_type,
    a.id,
    t.donor_reference,
    t.payment_method,
    t.approved_by
FROM (
    VALUES
        ('2025-01-15', 'Initial donor tranche – NZ MFAT contribution Q1 2025',                    60000000, 500000, 'disbursement',  NULL,     'MFAT-2025-VAN-001',   'wire_transfer',  'Peter Naupa'),
        ('2025-01-31', 'ACT-01: Inception workshop venue and catering – Warwick Le Lagon',          1260000,  10500, 'expenditure',   'ACT-01', 'MFAT-2025-VAN-001',   'bank_transfer',  'Mere Bani'),
        ('2025-02-10', 'ACT-01: International facilitation consultant fees Jan–Feb 2025',           2400000,  20000, 'expenditure',   'ACT-01', 'MFAT-2025-VAN-001',   'bank_transfer',  'Mere Bani'),
        ('2025-02-28', 'ACT-05: FMIS software licence – annual subscription',                      1440000,  12000, 'expenditure',   'ACT-05', 'MFAT-2025-VAN-001',   'bank_transfer',  'Peter Naupa'),
        ('2025-03-20', 'ACT-02: Stakeholder mapping consultant – national travel',                   660000,   5500, 'expenditure',   'ACT-02', 'MFAT-2025-VAN-001',   'petty_cash',     'Jean Kalsakau'),
        ('2025-03-31', 'ACT-05: Finance staff FMIS training – 4 staff × 2 days',                    360000,   3000, 'expenditure',   'ACT-05', 'MFAT-2025-VAN-001',   'bank_transfer',  'Peter Naupa'),
        ('2025-04-15', 'Second donor tranche – NZ MFAT Q2 2025',                                  60000000, 500000, 'disbursement',  NULL,     'MFAT-2025-VAN-002',   'wire_transfer',  'Peter Naupa'),
        ('2025-04-25', 'ACT-03: L&D framework technical consultant – regional expert fees',         3000000,  25000, 'expenditure',   'ACT-03', 'MFAT-2025-VAN-002',   'bank_transfer',  'Mere Bani'),
        ('2025-05-30', 'ACT-04: Vulnerability assessment field team – Shefa province',              1560000,  13000, 'expenditure',   'ACT-04', 'MFAT-2025-VAN-002',   'bank_transfer',  'Mere Bani'),
        ('2025-06-16', 'ACT-06: Mobile data collection platform development',                       1200000,  10000, 'expenditure',   'ACT-06', 'MFAT-2025-VAN-002',   'bank_transfer',  'Jean Kalsakau'),
        ('2025-06-30', 'ACT-04: Vulnerability assessment field team – Tafea province',              1440000,  12000, 'expenditure',   'ACT-04', 'MFAT-2025-VAN-002',   'bank_transfer',  'Mere Bani'),
        ('2025-07-15', 'Third donor tranche – NZ MFAT Q3 2025',                                   60000000, 500000, 'disbursement',  NULL,     'MFAT-2025-VAN-003',   'wire_transfer',  'Peter Naupa'),
        ('2025-07-31', 'ACT-07: Shefa provincial workshop – logistics and per diem',               1080000,   9000, 'expenditure',   'ACT-07', 'MFAT-2025-VAN-003',   'bank_transfer',  'Mere Bani'),
        ('2025-08-19', 'ACT-04: Vulnerability assessment field team – Penama and Malampa',          2640000,  22000, 'expenditure',   'ACT-04', 'MFAT-2025-VAN-003',   'bank_transfer',  'Mere Bani'),
        ('2025-08-29', 'ACT-06: Data collection tool pilot – refund of unused catering budget',     -120000,  -1000, 'refund',        'ACT-06', 'MFAT-2025-VAN-003',   'bank_transfer',  'Peter Naupa')
) AS t(transaction_date, description, amount_vuv, amount_nzd, transaction_type,
       activity_code, donor_reference, payment_method, approved_by)
LEFT JOIN merl.activities a ON a.code = t.activity_code;

-- ---------------------------------------------------------------------------
-- 8. INDICATOR VALUES  (20+ data points across multiple reporting periods)
-- ---------------------------------------------------------------------------
INSERT INTO merl.indicator_values
    (indicator_id, value, reporting_period, reported_by,
     location_province, disaggregation_key, disaggregation_value, notes, verified)
SELECT
    i.id,
    v.value,
    v.reporting_period::DATE,
    u.id,
    v.location_province,
    v.disaggregation_key,
    v.disaggregation_value,
    v.notes,
    v.verified
FROM (
    VALUES
        -- GOV-01: policy frameworks
        ('GOV-01', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline confirmed at inception workshop.',     TRUE),
        ('GOV-01', 1::NUMERIC,  '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'L&D Assessment Framework endorsed by IAC.',    TRUE),

        -- GOV-02: coordination meetings
        ('GOV-02', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline.',                                     TRUE),
        ('GOV-02', 4::NUMERIC,  '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         '4 multi-stakeholder meetings Q1–Q2 2025.',      TRUE),
        ('GOV-02', 8::NUMERIC,  '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Cumulative to end Q3 2025.',                    TRUE),

        -- GOV-03: coordination mechanisms
        ('GOV-03', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline.',                                     TRUE),
        ('GOV-03', 2::NUMERIC,  '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'National Advisory Board and IAC operational.',  TRUE),

        -- FIN-01: fund disbursed %
        ('FIN-01', 0::NUMERIC,  '2025-01-31', 'peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         'Fund accounts opened; no disbursement yet.',    TRUE),
        ('FIN-01', 6.5::NUMERIC,'2025-06-30', 'peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         '6.5% of total envelope disbursed to date.',     TRUE),
        ('FIN-01', 11.2::NUMERIC,'2025-09-30','peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         'Cumulative disbursement Q1–Q3 2025.',           TRUE),

        -- FIN-02: budget utilisation
        ('FIN-02', 0::NUMERIC,  '2025-03-31', 'peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         'Q1 2025.',                                      TRUE),
        ('FIN-02', 72.3::NUMERIC,'2025-06-30','peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         'Q2 2025 – slightly below target.',              TRUE),
        ('FIN-02', 81.0::NUMERIC,'2025-09-30','peter.naupa@mof.gov.vu',    NULL,   NULL,          NULL,         'Q3 2025 – on track.',                           TRUE),

        -- COM-01: communities engaged
        ('COM-01', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline.',                                     TRUE),
        ('COM-01', 8::NUMERIC,  '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         '8 communities engaged Q1–Q2 2025.',             TRUE),
        ('COM-01', 20::NUMERIC, '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         '20 communities engaged cumulatively.',          TRUE),

        -- COM-02: female participation %
        ('COM-02', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   'gender',      'female',     'Baseline.',                                     TRUE),
        ('COM-02', 54.7::NUMERIC,'2025-06-30','jean.kalsakau@vcap.gov.vu', NULL,   'gender',      'female',     'Female participation above target in H1 2025.', TRUE),
        ('COM-02', 56.1::NUMERIC,'2025-09-30','jean.kalsakau@vcap.gov.vu', NULL,   'gender',      'female',     'Sustained above 50% target.',                  TRUE),

        -- COM-03: persons with disability
        ('COM-03', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   'disability',  'yes',        'Baseline.',                                     TRUE),
        ('COM-03', 35::NUMERIC, '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   'disability',  'yes',        '35 pwds engaged cumulatively to Q2.',           TRUE),
        ('COM-03', 52::NUMERIC, '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   'disability',  'yes',        'Progress on track.',                            TRUE),

        -- EVT-01: L&D events documented
        ('EVT-01', 2::NUMERIC,  '2025-06-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Cyclone Pam and 2020 floods entered and verified.', TRUE),
        ('EVT-01', 5::NUMERIC,  '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'All five seed events documented.',              TRUE),

        -- EVT-03: economic loss assessed %
        ('EVT-03', 20::NUMERIC, '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline – historical estimate.',               TRUE),
        ('EVT-03', 40::NUMERIC, '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Cyclone Pam and 2023 drought assessed.',       TRUE),

        -- LRN-01: lessons captured
        ('LRN-01', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline.',                                     TRUE),
        ('LRN-01', 5::NUMERIC,  '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         '5 lessons captured in KMS to end Q3.',          TRUE),

        -- LRN-02: adaptations implemented
        ('LRN-02', 0::NUMERIC,  '2025-01-31', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Baseline.',                                     TRUE),
        ('LRN-02', 2::NUMERIC,  '2025-09-30', 'jean.kalsakau@vcap.gov.vu', NULL,   NULL,          NULL,         'Two project adaptations documented.',           TRUE)

) AS v(indicator_code, value, reporting_period, reporter_email,
        location_province, disaggregation_key, disaggregation_value, notes, verified)
JOIN merl.indicators i ON i.code = v.indicator_code
JOIN merl.users      u ON u.email = v.reporter_email;

-- ---------------------------------------------------------------------------
-- 9. LEARNING ENTRIES
-- ---------------------------------------------------------------------------
INSERT INTO merl.learning_entries
    (entry_date, title, domain, lesson_type, description,
     implications, action_taken, recorded_by, tags)
SELECT
    l.entry_date::DATE,
    l.title,
    l.domain::merl.domain_type,
    l.lesson_type::merl.lesson_type,
    l.description,
    l.implications,
    l.action_taken,
    u.id,
    l.tags
FROM (
    VALUES
        ('2025-03-05',
         'Gender-inclusive facilitation increases data quality in community consultations',
         'community', 'success',
         'When female facilitators co-led consultations in Tafea and Shefa, women''s participation rose from 38% to 55% and the range of non-economic losses identified doubled. Women articulated distinct loss categories related to traditional food preparation, childcare disruption, and emotional well-being that male-led sessions had not captured.',
         'All future community consultations should deploy at least one female facilitator. Recruitment of additional female community reporters should be prioritised in Torba and Sanma where female participation is currently below 45%.',
         'Updated stakeholder engagement plan to mandate gender-balanced facilitation teams. Recruitment advertisement for female community reporters issued March 2025.',
         'jean.kalsakau@vcap.gov.vu',
         ARRAY['GEDSI','facilitation','community engagement','data quality']),

        ('2025-04-22',
         'Remote islands require satellite connectivity fallback for mobile data tools',
         'learning', 'challenge',
         'During the Aneityum pilot, the mobile data collection tool failed to sync for 72 hours due to complete absence of 3G coverage. Community reporters had to hand-write data and transfer it on return to Tanna. Two records were lost in transcription.',
         'The MERL platform must support full offline functionality with local device storage and encrypted synchronisation upon reconnection. Remote-island deployment should include satellite modem availability.',
         'Mobile application upgraded to full offline-first architecture. Procurement of two iridium-compatible data loggers initiated for remote island deployments.',
         'jean.kalsakau@vcap.gov.vu',
         ARRAY['technology','connectivity','remote islands','data collection']),

        ('2025-05-19',
         'Traditional ecological knowledge provides early warning signals not captured by VMGD instruments',
         'events', 'innovation',
         'Community elders in Malekula and Pentecost identified four plant and animal-behaviour indicators of drought onset that preceded VMGD''s formal drought declaration by 4–6 weeks. This indigenous knowledge was not previously integrated into any formal early warning protocol.',
         'The L&D assessment framework should include a dedicated module for documenting and operationalising traditional ecological knowledge (TEK). Cross-referencing TEK indicators with meteorological data may improve early warning lead times.',
         'TEK documentation protocol developed and appended to L&D assessment framework (v1.1). Three elder knowledge-holders engaged as project advisors.',
         'mere.bani@vcap.gov.vu',
         ARRAY['traditional knowledge','early warning','drought','indigenous','innovation']),

        ('2025-07-08',
         'Cascading bureaucratic delays in fund disbursement to provincial partners',
         'financial', 'challenge',
         'The first provincial grant disbursement to Shefa PDC took 47 working days from approval to receipt due to sequential Treasury, Finance Ministry, and VCAP sign-off requirements. Two provincial partners reported cash-flow problems during this period.',
         'Disbursement procedures must be streamlined. A pre-approved delegation of authority framework and a direct online payment pathway for amounts below VUV 2 million should be established to reduce approval chains.',
         'Financial management manual revised to introduce a tiered approval system. Direct bank transfer authorisation delegated to Project Manager for transactions below VUV 1.5 million. Implemented August 2025.',
         'peter.naupa@mof.gov.vu',
         ARRAY['finance','disbursement','process','bottleneck','adaptation']),

        ('2025-09-15',
         'Coordination with NDMO prevents data duplication and improves event documentation coverage',
         'governance', 'success',
         'Following the signing of a data-sharing MOU with NDMO in June 2025, the MERL platform received automated daily situation-report feeds. This eliminated manual data entry for event documentation and cross-validated community-reported losses against official NDMO records, reducing data inconsistencies by an estimated 60%.',
         'Data-sharing agreements with VMGD, Department of Statistics, and the Pacific Community (SPC) should be prioritised in Q4 2025. A standardised machine-readable event data schema should be agreed at the Pacific level.',
         'Outreach letters sent to VMGD, DoS, and SPC in September 2025. Draft data-sharing agreement template prepared for legal review.',
         'jean.kalsakau@vcap.gov.vu',
         ARRAY['coordination','NDMO','data sharing','governance','efficiency'])
) AS l(entry_date, title, domain, lesson_type, description,
       implications, action_taken, recorder_email, tags)
JOIN merl.users u ON u.email = l.recorder_email;

COMMIT;
