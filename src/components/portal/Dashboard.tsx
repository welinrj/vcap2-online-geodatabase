import { useState, useEffect, useMemo, lazy, Suspense, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import { listDatasets, formatBytes, migrateFromLocalStorage } from '../../services/datasetStore'
import { formatArea } from '../../services/protectedAreaStore'
import { PRODOC_TARGETS } from '../../data/prodocTrackerData'
import { useProDoc } from '../../contexts/useProDoc'
import { computeProDocAnalytics, computeIndicatorTracking, CCA_TARGET_HA, MPA_TARGET_HA } from '../../services/prodocAnalytics'
import { INDICATOR_COLORS, INDICATOR_BG, INDICATOR_BORDER } from '../../constants/indicatorColors'
import Icons8Icon from '../Icons8Icon'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import vcap2Logo from '../../../assets/vcap2-logo.png'
import './Dashboard.css'

const DashboardMap = lazy(() => import('./DashboardMap'))

const CHART_COLORS = {
  green: '#2D5E5A',
  greenLight: '#3E7A75',
  blue: '#E39341',
  blueLight: '#F0AD5E',
  amber: '#B34839',
  purple: '#477A6E',
  cyan: '#5A9A8E',
  gray: '#e2e8f0',
}

/** Format a percentage with enough decimals to show meaningful digits */
const formatPercent = (pct: number): string => {
  if (pct >= 10) return pct.toFixed(1)
  if (pct >= 1) return pct.toFixed(2)
  if (pct >= 0.01) return pct.toFixed(3)
  if (pct >= 0.001) return pct.toFixed(4)
  return pct.toFixed(4)
}

const TOOLTIP_STYLE = {
  borderRadius: '10px',
  border: 'none',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
  fontSize: '0.78rem',
  padding: '8px 12px',
  background: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(8px)',
}

/** HTML center label overlay for donut charts */
const DonutCenter: FC<{
  value: string
  sub?: string
  color?: string
}> = ({ value, sub, color }) => (
  <div className="dash-donut-center">
    <span className="dash-donut-center-val" style={{ color: color || 'var(--color-text)' }}>
      {value}
    </span>
    {sub && <span className="dash-donut-center-sub">{sub}</span>}
  </div>
)

/** Map icon names from Firestore to Icons8 Glyph Neue names */
/** Map file type to Icons8 Glyph Neue name */
const FILE_TYPE_ICON_MAP: Record<string, string> = {
  GeoJSON: 'json',
  Shapefile: 'layers',
  KML: 'map-pin',
  GeoPackage: 'database',
  PDF: 'pdf',
  PNG: 'image-file',
  CSV: 'csv',
}

/** Race a promise against a timeout; resolves with fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

const Dashboard: FC = () => {
  const { newAreas, existingAreas } = useProDoc()
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])

  useEffect(() => {
    let cancelled = false
    // Load Firestore data in background — don't block ProDoc visualisations
    const TIMEOUT_MS = 8_000
    migrateFromLocalStorage().catch(() => {})
    withTimeout(listDatasets(), TIMEOUT_MS, [] as DatasetSummary[])
      .then((ds) => { if (!cancelled) setDatasets(ds) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const totalFiles = datasets.length
  const totalSize = datasets.reduce((s, d) => s + d.sizeBytes, 0)
  const totalFeatures = datasets.reduce((s, d) => s + d.featureCount, 0)

  // --- All ProDoc analytics from shared module (single source of truth) ---
  const analytics = useMemo(
    () => computeProDocAnalytics(newAreas, existingAreas),
    [newAreas, existingAreas],
  )

  const {
    newCcaHa, existCcaHa, newMpaHa, existMpaHa,
    newCcaProgress, existCcaProgress, newMpaProgress, existMpaProgress,
    allTerrestrialHa, allMarineHa,
    ccaProgress, mpaProgress, ccaLandPercent, mpaEezPercent,
    ccaRemainingHa, mpaRemainingHa,
    newCcaCount, newMpaCount, improvedCcaCount, improvedMpaCount,
    ccaMappedComplete, ccaMappedLeft, mpaMappedComplete, mpaMappedLeft,
    mappingCompleted, mappingInProgress, mappingNotStarted, totalSites,
    provinceBarData,
  } = analytics

  // Indicator-level tracking (1.1, 1.2, 2.1, 2.2)
  const indicatorTracking = useMemo(
    () => computeIndicatorTracking(newAreas, existingAreas),
    [newAreas, existingAreas],
  )

  const ccaAreas = [...newAreas, ...existingAreas].filter(
    (e) => e.ccaType === 'Terrestrial' || e.ccaType === 'Marine & Terrestrial',
  )
  const mpaAreas = [...newAreas, ...existingAreas].filter(
    (e) => e.ccaType === 'Marine' || e.ccaType === 'Marine & Terrestrial',
  )

  // ProDoc indicator donut data
  const prodocIndicators = [
    {
      key: '1.1',
      label: PRODOC_TARGETS['1.1'].label,
      description: PRODOC_TARGETS['1.1'].description,
      mapped: newCcaHa,
      target: PRODOC_TARGETS['1.1'].targetHa,
      progress: newCcaProgress,
      color: INDICATOR_COLORS['1.1'],
      type: 'Terrestrial',
    },
    {
      key: '1.2',
      label: PRODOC_TARGETS['1.2'].label,
      description: PRODOC_TARGETS['1.2'].description,
      mapped: existCcaHa,
      target: PRODOC_TARGETS['1.2'].targetHa,
      progress: existCcaProgress,
      color: INDICATOR_COLORS['1.2'],
      type: 'Terrestrial',
    },
    {
      key: '2.1',
      label: PRODOC_TARGETS['2.1'].label,
      description: PRODOC_TARGETS['2.1'].description,
      mapped: newMpaHa,
      target: PRODOC_TARGETS['2.1'].targetHa,
      progress: newMpaProgress,
      color: INDICATOR_COLORS['2.1'],
      type: 'Marine',
    },
    {
      key: '2.2',
      label: PRODOC_TARGETS['2.2'].label,
      description: PRODOC_TARGETS['2.2'].description,
      mapped: existMpaHa,
      target: PRODOC_TARGETS['2.2'].targetHa,
      progress: existMpaProgress,
      color: INDICATOR_COLORS['2.2'],
      type: 'Marine',
    },
  ]

  // Donut chart data for 30x30 — uses all entries' hectares
  const ccaDonutData = [
    { name: 'Mapped', value: allTerrestrialHa, color: CHART_COLORS.green },
    { name: 'Remaining', value: ccaRemainingHa, color: CHART_COLORS.gray },
  ]
  const mpaDonutData = [
    { name: 'Mapped', value: allMarineHa, color: CHART_COLORS.blue },
    { name: 'Remaining', value: mpaRemainingHa, color: CHART_COLORS.gray },
  ]

  const mappingPieData = [
    { name: 'Completed', value: mappingCompleted, color: CHART_COLORS.green },
    { name: 'In Progress', value: mappingInProgress, color: CHART_COLORS.amber },
    { name: 'Not Started', value: mappingNotStarted, color: CHART_COLORS.gray },
  ].filter((d) => d.value > 0)


  return (
    <div className="dash">
      {/* Hero banner */}
      <div className="dash-hero">
        <div className="dash-hero-content">
          <img src={vcap2Logo} alt="VCAP2" className="dash-hero-logo" />
          <div>
            <h2>VCAP2 Centralised Data Portal</h2>
            <p>Adaptation to Climate Change in the Coastal Zone of Vanuatu Phase II</p>
            <p className="dash-hero-sub">Department of Environmental Protection & Conservation</p>
          </div>
        </div>
      </div>

      {/* ProDoc Indicator Progress */}
      <div className="dash-targets">
        <div className="dash-section-header">
          <div>
            <h3 className="dash-section-title">
              <Icons8Icon name="goal" size={18} className="dash-section-icon" />
              ProDoc Indicator Progress
            </h3>
            <p className="dash-section-desc">Progress towards VCAP2 Project Document targets for new and existing conservation areas (from ProDoc Tracker data).</p>
          </div>
        </div>

        <div className="dash-target-grid dash-target-grid-4">
          {prodocIndicators.map((ind) => {
            const remaining = Math.max(ind.target - ind.mapped, 0)
            const donutData = [
              { name: 'Mapped', value: ind.mapped, color: ind.color },
              { name: 'Remaining', value: remaining, color: CHART_COLORS.gray },
            ]
            const exceeded = ind.mapped > ind.target
            const pctDisplay = exceeded ? '>100%' : `${ind.progress.toFixed(1)}%`
            const progressClamped = Math.min(ind.progress, 100)
            return (
              <div className="dash-indicator-card" key={ind.key}>
                <span
                  className="dash-indicator-badge"
                  style={{ background: INDICATOR_BG[ind.key], color: ind.color, border: `1px solid ${INDICATOR_BORDER[ind.key]}` }}
                >
                  {ind.key} — {ind.label}
                </span>
                <div className="dash-indicator-donut dash-donut-wrapper">
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        cornerRadius={5}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatArea(Number(value))}
                        contentStyle={TOOLTIP_STYLE}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter value={pctDisplay} sub="of target" color={ind.color} />
                </div>
                <div className="dash-indicator-progress">
                  <div className="dash-indicator-progress-track">
                    <div
                      className="dash-indicator-progress-fill"
                      style={{ width: `${progressClamped}%`, background: ind.color }}
                    />
                  </div>
                </div>
                <div className="dash-indicator-stats">
                  <div className="dash-indicator-stat">
                    <span className="dash-indicator-stat-val">{formatArea(ind.mapped)}</span>
                    <span className="dash-indicator-stat-lbl">Mapped</span>
                  </div>
                  <div className="dash-indicator-stat">
                    <span className="dash-indicator-stat-val">{formatArea(ind.target)}</span>
                    <span className="dash-indicator-stat-lbl">Target</span>
                  </div>
                </div>
                <div className="dash-indicator-desc">
                  {ind.description}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Indicator Activity Tracking (1.1, 1.2, 2.1, 2.2) */}
      <div className="dash-targets">
        <div className="dash-section-header">
          <div>
            <h3 className="dash-section-title">
              <Icons8Icon name="activity" size={18} className="dash-section-icon" />
              Activity Tracking Status
            </h3>
            <p className="dash-section-desc">Tracking status of ProDoc indicator activities (1.1, 1.2, 2.1, 2.2) — achieved, on-track, or off-track with flagged blockers.</p>
          </div>
        </div>

        <div className="dash-indicator-tracking-grid">
          {indicatorTracking.map((ind) => {
            const indColor = INDICATOR_COLORS[ind.key] ?? '#64748b'
            const statusColor = ind.status === 'achieved' ? '#2D5E5A' : ind.status === 'off-track' ? '#dc2626' : indColor
            const statusIcon = ind.status === 'achieved' ? 'approval' : ind.status === 'on-track' ? 'clock' : 'error'
            const statusLabel = ind.status === 'achieved' ? 'Achieved' : ind.status === 'on-track' ? 'On Track' : 'Off Track'

            return (
              <div
                className="dash-ind-track-card"
                key={ind.key}
                style={{ borderColor: INDICATOR_BORDER[ind.key], borderLeft: `4px solid ${indColor}` }}
              >
                {/* Header */}
                <div className="dash-ind-track-header">
                  <span
                    className="dash-indicator-badge"
                    style={{ background: INDICATOR_BG[ind.key], color: indColor, border: `1px solid ${INDICATOR_BORDER[ind.key]}` }}
                  >
                    {ind.key} — {ind.label}
                  </span>
                  <span className="dash-ind-track-status" style={{ color: statusColor }}>
                    <Icons8Icon name={statusIcon} size={14} color={statusColor} />
                    {statusLabel}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="dash-ind-track-progress">
                  <div className="dash-ind-track-progress-track">
                    <div
                      className="dash-ind-track-progress-fill"
                      style={{ width: `${Math.min(ind.progressPct, 100)}%`, background: indColor }}
                    />
                  </div>
                  <span className="dash-ind-track-pct" style={{ color: indColor }}>
                    {ind.progressPct >= 100 ? '>100' : ind.progressPct.toFixed(1)}%
                  </span>
                </div>

                {/* Stats row */}
                <div className="dash-ind-track-stats">
                  <div className="dash-ind-track-stat">
                    <span className="dash-ind-track-stat-val">{formatArea(ind.mappedHa)}</span>
                    <span className="dash-ind-track-stat-lbl">Mapped</span>
                  </div>
                  <div className="dash-ind-track-stat">
                    <span className="dash-ind-track-stat-val">{formatArea(ind.targetHa)}</span>
                    <span className="dash-ind-track-stat-lbl">Target</span>
                  </div>
                  <div className="dash-ind-track-stat">
                    <span className="dash-ind-track-stat-val">{ind.mappingCompleted}/{ind.totalAreas}</span>
                    <span className="dash-ind-track-stat-lbl">Mapped</span>
                  </div>
                  <div className="dash-ind-track-stat">
                    <span className="dash-ind-track-stat-val">{ind.registered}/{ind.totalAreas}</span>
                    <span className="dash-ind-track-stat-lbl">Registered</span>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* 30x30 Target tracking with donut charts */}
      <div className="dash-targets">
        <div className="dash-section-header">
          <div>
            <h3 className="dash-section-title">
              <Icons8Icon name="goal" size={18} className="dash-section-icon" />
              30x30 Target Progress
            </h3>
            <p className="dash-section-desc">Progress towards Vanuatu's commitment under the Global Biodiversity Framework to protect 30% of land and sea areas by 2030.</p>
          </div>
        </div>

        <div className="dash-target-grid">
          {/* CCA Target */}
          <div className="dash-30x30-card">
            <div className="dash-30x30-header">
              <span className="dash-30x30-badge dash-30x30-cca">
                <Icons8Icon name="deciduous-tree" size={14} />
                CCA — Terrestrial
              </span>
              <span className="dash-30x30-coverage">
                {formatPercent(ccaLandPercent)}% of land area
              </span>
            </div>
            <div className="dash-30x30-body">
              <div className="dash-30x30-donut dash-donut-wrapper">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={ccaDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={64}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                      cornerRadius={6}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {ccaDonutData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatArea(Number(value))}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter value={`${formatPercent(ccaProgress)}%`} sub="of 30% target" color={CHART_COLORS.green} />
              </div>
              <div className="dash-30x30-metrics">
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val" style={{ color: CHART_COLORS.green }}>{formatArea(allTerrestrialHa)}</span>
                  <span className="dash-30x30-metric-lbl">Mapped</span>
                </div>
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val">{formatArea(CCA_TARGET_HA)}</span>
                  <span className="dash-30x30-metric-lbl">Target (30%)</span>
                </div>
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val">{formatArea(ccaRemainingHa)}</span>
                  <span className="dash-30x30-metric-lbl">Remaining</span>
                </div>
              </div>
            </div>
            <div className="dash-30x30-progress">
              <div className="dash-30x30-progress-track">
                <div
                  className="dash-30x30-progress-fill"
                  style={{ width: `${Math.min(ccaProgress, 100)}%`, background: `linear-gradient(90deg, ${CHART_COLORS.green}, ${CHART_COLORS.greenLight})` }}
                />
              </div>
              <div className="dash-30x30-progress-labels">
                <span>0%</span>
                <span>30% target</span>
              </div>
            </div>
          </div>

          {/* MPA Target */}
          <div className="dash-30x30-card">
            <div className="dash-30x30-header">
              <span className="dash-30x30-badge dash-30x30-mpa">
                <Icons8Icon name="fish" size={14} />
                MPA — Marine
              </span>
              <span className="dash-30x30-coverage">
                {formatPercent(mpaEezPercent)}% of EEZ
              </span>
            </div>
            <div className="dash-30x30-body">
              <div className="dash-30x30-donut dash-donut-wrapper">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={mpaDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={64}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                      cornerRadius={6}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {mpaDonutData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatArea(Number(value))}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter value={`${formatPercent(mpaProgress)}%`} sub="of 30% target" color={CHART_COLORS.blue} />
              </div>
              <div className="dash-30x30-metrics">
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val" style={{ color: CHART_COLORS.blue }}>{formatArea(allMarineHa)}</span>
                  <span className="dash-30x30-metric-lbl">Mapped</span>
                </div>
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val">{formatArea(MPA_TARGET_HA)}</span>
                  <span className="dash-30x30-metric-lbl">Target (30%)</span>
                </div>
                <div className="dash-30x30-metric">
                  <span className="dash-30x30-metric-val">{formatArea(mpaRemainingHa)}</span>
                  <span className="dash-30x30-metric-lbl">Remaining</span>
                </div>
              </div>
            </div>
            <div className="dash-30x30-progress">
              <div className="dash-30x30-progress-track">
                <div
                  className="dash-30x30-progress-fill"
                  style={{ width: `${Math.min(mpaProgress, 100)}%`, background: `linear-gradient(90deg, ${CHART_COLORS.blue}, ${CHART_COLORS.blueLight})` }}
                />
              </div>
              <div className="dash-30x30-progress-labels">
                <span>0%</span>
                <span>30% target</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coverage by Province */}
      {provinceBarData.length > 0 && (
        <div className="dash-targets">
          <div className="dash-panel-header">
            <h3 className="dash-section-title">
              <Icons8Icon name="map-pin" size={18} className="dash-section-icon" />
              Coverage by Province
            </h3>
            <div className="dash-province-legend">
              <span className="dash-province-legend-item">
                <span className="dash-legend-dot" style={{ background: CHART_COLORS.green }} />
                Terrestrial
              </span>
              <span className="dash-province-legend-item">
                <span className="dash-legend-dot" style={{ background: CHART_COLORS.blue }} />
                Marine
              </span>
            </div>
          </div>
          <div className="dash-province-chart">
            <ResponsiveContainer width="100%" height={Math.max(220, provinceBarData.length * 52)}>
              <BarChart
                data={provinceBarData}
                layout="vertical"
                margin={{ top: 4, right: 20, bottom: 4, left: 4 }}
                barCategoryGap="24%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                  tickLine={false}
                  unit=" ha"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={85}
                  tick={{ fontSize: 12, fill: 'var(--color-text-secondary)', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [formatArea(Number(value)), String(name)]}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Bar dataKey="Terrestrial" fill={CHART_COLORS.green} radius={[0, 8, 8, 0]} />
                <Bar dataKey="Marine" fill={CHART_COLORS.blue} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="dash-kpi-row">
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">New CCAs</span>
            <span className="dash-kpi-badge dash-kpi-badge-green">
              <Icons8Icon name="sprout" size={14} />
              Terrestrial
            </span>
          </div>
          <span className="dash-kpi-value">{newCcaCount}</span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-green" style={{ width: `${ccaAreas.length ? (newCcaCount / ccaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">New MPAs</span>
            <span className="dash-kpi-badge dash-kpi-badge-blue">
              <Icons8Icon name="fish" size={14} />
              Marine
            </span>
          </div>
          <span className="dash-kpi-value">{newMpaCount}</span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-blue" style={{ width: `${mpaAreas.length ? (newMpaCount / mpaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">CCAs Improved</span>
            <span className="dash-kpi-badge dash-kpi-badge-green">
              <Icons8Icon name="deciduous-tree" size={14} />
              Strengthened
            </span>
          </div>
          <span className="dash-kpi-value">{improvedCcaCount}</span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-green" style={{ width: `${ccaAreas.length ? (improvedCcaCount / ccaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">MPAs Improved</span>
            <span className="dash-kpi-badge dash-kpi-badge-blue">
              <Icons8Icon name="anchor" size={14} />
              Strengthened
            </span>
          </div>
          <span className="dash-kpi-value">{improvedMpaCount}</span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-blue" style={{ width: `${mpaAreas.length ? (improvedMpaCount / mpaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">CCA Mapped</span>
            <span className="dash-kpi-badge dash-kpi-badge-purple">
              <Icons8Icon name="geography" size={14} />
              {ccaMappedLeft} left
            </span>
          </div>
          <span className="dash-kpi-value">{ccaMappedComplete}<span className="dash-kpi-of">/{ccaAreas.length}</span></span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-purple" style={{ width: `${ccaAreas.length ? (ccaMappedComplete / ccaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">MPA Mapped</span>
            <span className="dash-kpi-badge dash-kpi-badge-amber">
              <Icons8Icon name="compass" size={14} />
              {mpaMappedLeft} left
            </span>
          </div>
          <span className="dash-kpi-value">{mpaMappedComplete}<span className="dash-kpi-of">/{mpaAreas.length}</span></span>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill dash-kpi-fill-amber" style={{ width: `${mpaAreas.length ? (mpaMappedComplete / mpaAreas.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Data overview map */}
      <Suspense fallback={<div className="dash-loading">Loading map...</div>}>
        <DashboardMap />
      </Suspense>

      {/* Overview panels */}
      <div className="dash-panels">
        {/* Mapping status from ProDoc Tracker */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3 className="dash-section-title">
              <Icons8Icon name="activity" size={18} className="dash-section-icon" />
              Mapping Status
            </h3>
            <span className="dash-panel-count">{totalSites} sites</span>
          </div>
          {mappingPieData.length > 0 ? (
            <>
              <div className="dash-mapping-donut dash-donut-wrapper">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={mappingPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={66}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                      cornerRadius={5}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {mappingPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter value={String(mappingCompleted)} sub="completed" color={CHART_COLORS.green} />
              </div>
              <div className="dash-mapping-bars">
                {[
                  { label: 'Completed', count: mappingCompleted, color: CHART_COLORS.green, icon: 'approval' },
                  { label: 'In Progress', count: mappingInProgress, color: CHART_COLORS.amber, icon: 'clock' },
                  { label: 'Not Started', count: mappingNotStarted, color: '#94a3b8', icon: 'checked' },
                ].map((item) => (
                  <div className="dash-mapping-bar-row" key={item.label}>
                    <div className="dash-mapping-bar-label">
                      <Icons8Icon name={item.icon} size={14} color={item.color} />
                      <span>{item.label}</span>
                      <span className="dash-mapping-bar-count">{item.count}</span>
                    </div>
                    <div className="dash-mapping-bar-track">
                      <div
                        className="dash-mapping-bar-fill"
                        style={{
                          width: `${totalSites ? (item.count / totalSites) * 100 : 0}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="dash-empty-chart">No areas in ProDoc Tracker yet</div>
          )}
        </div>

        {/* GIS data overview */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3 className="dash-section-title">
              <Icons8Icon name="database" size={18} className="dash-section-icon" />
              GIS Database
            </h3>
          </div>
          <div className="dash-gis-kpis">
            <div className="dash-gis-kpi">
              <Icons8Icon name="layers" size={20} color={CHART_COLORS.purple} />
              <span className="dash-gis-kpi-val">{totalFiles}</span>
              <span className="dash-gis-kpi-lbl">Datasets</span>
            </div>
            <div className="dash-gis-kpi">
              <Icons8Icon name="hdd" size={20} color={CHART_COLORS.amber} />
              <span className="dash-gis-kpi-val">{formatBytes(totalSize)}</span>
              <span className="dash-gis-kpi-lbl">Total Size</span>
            </div>
            <div className="dash-gis-kpi">
              <Icons8Icon name="layers" size={20} color={CHART_COLORS.cyan} />
              <span className="dash-gis-kpi-val">{totalFeatures.toLocaleString()}</span>
              <span className="dash-gis-kpi-lbl">GIS Features</span>
            </div>
          </div>
          <h4 className="dash-section-subtitle">Supported File Types</h4>
          <div className="dash-file-types">
            {Object.entries(FILE_TYPE_ICON_MAP).map(([ft, iconName]) => (
              <div key={ft} className="dash-file-type">
                <Icons8Icon name={iconName} size={16} className="dash-ft-icon" />
                <span>{ft}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
