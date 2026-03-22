import { useState, useEffect, useMemo, lazy, Suspense, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import type { PortalCategory } from '../../types/geospatial'
import { listDatasets, formatBytes, migrateFromLocalStorage } from '../../services/datasetStore'
import { seedDefaultCategories } from '../../services/portalCategoryStore'
import { formatArea } from '../../services/protectedAreaStore'
import { PRODOC_TARGETS } from '../../data/prodocTrackerData'
import { useProDoc } from '../../contexts/useProDoc'
import { computeProDocAnalytics, VANUATU_LAND_HA, VANUATU_EEZ_HA } from '../../services/prodocAnalytics'
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
  green: '#16a34a',
  greenLight: '#4ade80',
  blue: '#2563eb',
  blueLight: '#60a5fa',
  amber: '#d97706',
  purple: '#7c3aed',
  cyan: '#0891b2',
  gray: '#e2e8f0',
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

/** Map icon names from Firestore to Icons8 Glyph Neue names */
const CATEGORY_ICON_MAP: Record<string, string> = {
  TreePine: 'leaf',
  Leaf: 'leaf',
  Waves: 'sea',
  Shell: 'sea',
  Thermometer: 'thermometer',
  Users: 'group',
  Building2: 'monument',
  Landmark: 'monument',
  Folder: 'opened-folder',
  FolderOpen: 'opened-folder',
  LayoutGrid: 'four-squares',
}

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

function getCategoryIconName(name: string) {
  return CATEGORY_ICON_MAP[name] ?? 'opened-folder'
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
  const [categories, setCategories] = useState<PortalCategory[]>([])

  useEffect(() => {
    let cancelled = false
    // Load Firestore data in background — don't block ProDoc visualisations
    const TIMEOUT_MS = 8_000
    migrateFromLocalStorage().catch(() => {})
    withTimeout(listDatasets(), TIMEOUT_MS, [] as DatasetSummary[])
      .then((ds) => { if (!cancelled) setDatasets(ds) })
      .catch(() => {})
    withTimeout(seedDefaultCategories(), TIMEOUT_MS, [] as PortalCategory[])
      .then((cats) => { if (!cancelled) setCategories(cats) })
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
      color: CHART_COLORS.green,
      type: 'Terrestrial',
    },
    {
      key: '1.2',
      label: PRODOC_TARGETS['1.2'].label,
      description: PRODOC_TARGETS['1.2'].description,
      mapped: existCcaHa,
      target: PRODOC_TARGETS['1.2'].targetHa,
      progress: existCcaProgress,
      color: CHART_COLORS.greenLight,
      type: 'Terrestrial',
    },
    {
      key: '2.1',
      label: PRODOC_TARGETS['2.1'].label,
      description: PRODOC_TARGETS['2.1'].description,
      mapped: newMpaHa,
      target: PRODOC_TARGETS['2.1'].targetHa,
      progress: newMpaProgress,
      color: CHART_COLORS.blue,
      type: 'Marine',
    },
    {
      key: '2.2',
      label: PRODOC_TARGETS['2.2'].label,
      description: PRODOC_TARGETS['2.2'].description,
      mapped: existMpaHa,
      target: PRODOC_TARGETS['2.2'].targetHa,
      progress: existMpaProgress,
      color: CHART_COLORS.blueLight,
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

      {/* Portal Data Categories */}
      {categories.length > 0 && (
        <div className="dash-categories">
          <div className="dash-section-header">
            <div>
              <h3 className="dash-section-title">
                <Icons8Icon name="four-squares" size={18} className="dash-section-icon" />
                Data Categories
              </h3>
              <p className="dash-section-desc">Browse datasets by thematic category</p>
            </div>
          </div>
          <div className="dash-category-grid">
            {categories.map((cat) => {
              const iconName = getCategoryIconName(cat.icon)
              const count = datasets.filter((d) => d.metadata.portalCategory === cat.id).length
              return (
                <div className="dash-category-card" key={cat.id} style={{ borderTopColor: cat.color }}>
                  <div className="dash-category-icon">
                    <Icons8Icon name={iconName} size={24} color={cat.color} />
                  </div>
                  <div className="dash-category-info">
                    <span className="dash-category-name">{cat.name}</span>
                    <span className="dash-category-desc">{cat.description}</span>
                  </div>
                  <span className="dash-category-count" style={{ background: cat.color }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick stats — CCA & MPA summary */}
      <div className="dash-stats dash-stats-6">
        <div className="dash-stat-card dash-stat-green">
          <div className="dash-stat-icon">
            <Icons8Icon name="sprout" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{newCcaCount}</span>
            <span className="dash-stat-label">New CCAs</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <Icons8Icon name="fish" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{newMpaCount}</span>
            <span className="dash-stat-label">New MPAs</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-green">
          <div className="dash-stat-icon">
            <Icons8Icon name="deciduous-tree" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{improvedCcaCount}</span>
            <span className="dash-stat-label">CCAs Improved</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <Icons8Icon name="anchor" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{improvedMpaCount}</span>
            <span className="dash-stat-label">MPAs Improved</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-purple">
          <div className="dash-stat-icon">
            <Icons8Icon name="geography" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{ccaMappedComplete} / {ccaAreas.length}</span>
            <span className="dash-stat-label">CCA Mapped</span>
            <span className="dash-stat-sub">{ccaMappedLeft} remaining</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-amber">
          <div className="dash-stat-icon">
            <Icons8Icon name="compass" size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{mpaMappedComplete} / {mpaAreas.length}</span>
            <span className="dash-stat-label">MPA Mapped</span>
            <span className="dash-stat-sub">{mpaMappedLeft} remaining</span>
          </div>
        </div>
      </div>

      {/* Data overview map */}
      <Suspense fallback={<div className="dash-loading">Loading map...</div>}>
        <DashboardMap />
      </Suspense>

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
            return (
              <div className="dash-target-card" key={ind.key}>
                <div className="dash-target-header">
                  <span className={`dash-target-type ${ind.type === 'Terrestrial' ? 'dash-target-cca' : 'dash-target-mpa'}`}>
                    {ind.key} — {ind.label}
                  </span>
                  <span className="dash-target-pct">{exceeded ? '>100' : ind.progress.toFixed(1)}%</span>
                </div>
                <div className="dash-target-chart">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={60}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        cornerRadius={4}
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
                </div>
                <div className="dash-target-stats">
                  <div className="dash-target-stat">
                    <span className="dash-target-stat-val">{formatArea(ind.mapped)}</span>
                    <span className="dash-target-stat-lbl">Mapped</span>
                  </div>
                  <div className="dash-target-stat">
                    <span className="dash-target-stat-val">{formatArea(ind.target)}</span>
                    <span className="dash-target-stat-lbl">Target</span>
                  </div>
                </div>
                <div className="dash-target-coverage">
                  {ind.description}
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
          <div className="dash-target-card">
            <div className="dash-target-header">
              <span className="dash-target-type dash-target-cca">CCA — Terrestrial</span>
              <span className="dash-target-pct">{ccaProgress.toFixed(1)}%</span>
            </div>
            <div className="dash-target-chart">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={ccaDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                    cornerRadius={5}
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
            </div>
            <div className="dash-target-stats">
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(allTerrestrialHa)}</span>
                <span className="dash-target-stat-lbl">Mapped</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(VANUATU_LAND_HA)}</span>
                <span className="dash-target-stat-lbl">Total Land</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(ccaRemainingHa)}</span>
                <span className="dash-target-stat-lbl">Remaining</span>
              </div>
            </div>
            <div className="dash-target-coverage">
              {ccaLandPercent.toFixed(2)}% of Vanuatu land area covered
            </div>
          </div>

          {/* MPA Target */}
          <div className="dash-target-card">
            <div className="dash-target-header">
              <span className="dash-target-type dash-target-mpa">MPA — Marine</span>
              <span className="dash-target-pct">{mpaProgress.toFixed(1)}%</span>
            </div>
            <div className="dash-target-chart">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={mpaDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                    cornerRadius={5}
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
            </div>
            <div className="dash-target-stats">
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(allMarineHa)}</span>
                <span className="dash-target-stat-lbl">Mapped</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(VANUATU_EEZ_HA)}</span>
                <span className="dash-target-stat-lbl">Total EEZ</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(mpaRemainingHa)}</span>
                <span className="dash-target-stat-lbl">Remaining</span>
              </div>
            </div>
            <div className="dash-target-coverage">
              {mpaEezPercent.toFixed(4)}% of Vanuatu EEZ covered
            </div>
          </div>
        </div>
      </div>

      {/* Overview panels */}
      <div className="dash-panels">
        {/* Mapping status from ProDoc Tracker */}
        <div className="dash-panel">
          <h3 className="dash-section-title">
            <Icons8Icon name="activity" size={18} className="dash-section-icon" />
            Mapping Status
          </h3>
          {mappingPieData.length > 0 ? (
            <div className="dash-chart-row">
              <div className="dash-chart-mini">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={mappingPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                      cornerRadius={4}
                    >
                      {mappingPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="dash-status-legend">
                <div className="dash-status-item">
                  <Icons8Icon name="approval" size={16} color={CHART_COLORS.green} />
                  <span className="dash-status-count">{mappingCompleted}</span>
                  <span className="dash-status-label">Completed</span>
                </div>
                <div className="dash-status-item">
                  <Icons8Icon name="clock" size={16} color={CHART_COLORS.amber} />
                  <span className="dash-status-count">{mappingInProgress}</span>
                  <span className="dash-status-label">In Progress</span>
                </div>
                <div className="dash-status-item">
                  <Icons8Icon name="checked" size={16} color={CHART_COLORS.gray} />
                  <span className="dash-status-count">{mappingNotStarted}</span>
                  <span className="dash-status-label">Not Started</span>
                </div>
                <div className="dash-status-item">
                  <Icons8Icon name="layers" size={16} color={CHART_COLORS.cyan} />
                  <span className="dash-status-count">{totalSites}</span>
                  <span className="dash-status-label">Total Sites</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="dash-empty-chart">No areas in ProDoc Tracker yet</div>
          )}
        </div>

        {/* GIS data overview */}
        <div className="dash-panel">
          <h3 className="dash-section-title">
            <Icons8Icon name="database" size={18} className="dash-section-icon" />
            GIS Database
          </h3>
          <div className="dash-status-legend">
            <div className="dash-status-item">
              <Icons8Icon name="layers" size={16} color={CHART_COLORS.purple} />
              <span className="dash-status-count">{totalFiles}</span>
              <span className="dash-status-label">Datasets</span>
            </div>
            <div className="dash-status-item">
              <Icons8Icon name="hdd" size={16} color={CHART_COLORS.amber} />
              <span className="dash-status-count">{formatBytes(totalSize)}</span>
              <span className="dash-status-label">Total Size</span>
            </div>
            <div className="dash-status-item">
              <Icons8Icon name="layers" size={16} color={CHART_COLORS.cyan} />
              <span className="dash-status-count">{totalFeatures.toLocaleString()}</span>
              <span className="dash-status-label">GIS Features</span>
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

        {/* Province coverage from ProDoc Tracker */}
        {provinceBarData.length > 0 && (
          <div className="dash-panel dash-panel-wide">
            <h3 className="dash-section-title">
              <Icons8Icon name="map-pin" size={18} className="dash-section-icon" />
              Coverage by Province
            </h3>
            <div className="dash-province-chart">
              <ResponsiveContainer width="100%" height={Math.max(200, provinceBarData.length * 50)}>
                <BarChart
                  data={provinceBarData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#f1f5f9' }}
                    tickLine={{ stroke: '#f1f5f9' }}
                    unit=" ha"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatArea(Number(value)), String(name)]}
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  />
                  <Bar dataKey="Terrestrial" fill={CHART_COLORS.green} radius={[0, 6, 6, 0]} />
                  <Bar dataKey="Marine" fill={CHART_COLORS.blue} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="dash-province-legend">
                <span className="dash-province-legend-item">
                  <span className="dash-legend-dot" style={{ background: CHART_COLORS.green }} />
                  Terrestrial (ha)
                </span>
                <span className="dash-province-legend-item">
                  <span className="dash-legend-dot" style={{ background: CHART_COLORS.blue }} />
                  Marine (ha)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
