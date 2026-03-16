import { useState, useEffect, lazy, Suspense, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import type { PortalCategory } from '../../types/geospatial'
import { listDatasets, formatBytes, migrateFromLocalStorage } from '../../services/datasetStore'
import { seedDefaultCategories } from '../../services/portalCategoryStore'
import { formatArea } from '../../services/protectedAreaStore'
import { newAreas, existingAreas, PRODOC_TARGETS, type ProDocEntry } from '../../data/prodocTrackerData'
import {
  ShieldCheck,
  Database,
  HardDrive,
  TrendingUp,
  MapPin,
  Layers,
  FileJson,
  FileSpreadsheet,
  FileImage,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Target,
  TreePine,
  Waves,
  Thermometer,
  Users,
  Building2,
  Folder,
  FolderOpen,
} from 'lucide-react'
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

// Vanuatu targets — 30x30 Global Biodiversity Framework
const CCA_TARGET_HA = 365_700 // 30% of 1,219,000 ha land area
const MPA_TARGET_HA = 19_890_000 // 30% of 66,300,000 ha EEZ
const VANUATU_LAND_HA = 1_219_000
const VANUATU_EEZ_HA = 66_300_000

const CHART_COLORS = {
  green: '#22c55e',
  greenLight: '#86efac',
  blue: '#3b82f6',
  blueLight: '#93c5fd',
  amber: '#f59e0b',
  purple: '#a855f7',
  cyan: '#06b6d4',
  gray: '#e2e8f0',
}

const FILE_TYPE_ICONS: Record<string, typeof FileJson> = {
  GeoJSON: FileJson,
  Shapefile: Layers,
  KML: MapPin,
  GeoPackage: Database,
  PDF: FileText,
  PNG: FileImage,
  CSV: FileSpreadsheet,
}

/** Map area councils to their province */
const AREA_COUNCIL_TO_PROVINCE: Record<string, string> = {
  'South Epi': 'Shefa',
  'South Maewo': 'Penama',
  'Toga Island (Torres)': 'Torba',
  'West Ambrym': 'Malampa',
  'West Coast Santo': 'Sanma',
  'East Vanualava': 'Torba',
  'Hiu Island (Torres)': 'Torba',
  'South East Tanna': 'Tafea',
  'Torba': 'Torba',
  'Sanma': 'Sanma',
  'Malampa': 'Malampa',
  'Shefa': 'Shefa',
  'Tafea': 'Tafea',
}

function getProvince(areaCouncil: string): string {
  return AREA_COUNCIL_TO_PROVINCE[areaCouncil] ?? areaCouncil
}

/** Sum terrestrial hectares for entries whose ccaType includes terrestrial */
function sumTerrestrial(entries: ProDocEntry[]): number {
  return entries
    .filter((e) => e.ccaType === 'Terrestrial' || e.ccaType === 'Marine & Terrestrial')
    .reduce((s, e) => s + (e.hectaresTerrestrial ?? 0), 0)
}

/** Sum marine hectares for entries whose ccaType includes marine */
function sumMarine(entries: ProDocEntry[]): number {
  return entries
    .filter((e) => e.ccaType === 'Marine' || e.ccaType === 'Marine & Terrestrial')
    .reduce((s, e) => s + (e.hectaresMarine ?? 0), 0)
}

/** Map icon names from Firestore to lucide components */
const CATEGORY_ICONS: Record<string, typeof Folder> = {
  TreePine,
  Waves,
  Thermometer,
  Users,
  Building2,
  Folder,
  FolderOpen,
}

function getCategoryIcon(name: string) {
  return CATEGORY_ICONS[name] ?? Folder
}

const Dashboard: FC = () => {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [categories, setCategories] = useState<PortalCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      migrateFromLocalStorage(),
      listDatasets(),
      seedDefaultCategories(),
    ]).then(([, ds, cats]) => {
      setDatasets(ds)
      setCategories(cats)
    }).catch((err) => {
      console.warn('Failed to load dashboard data:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="dash">
        <div className="dash-loading">
          <div className="dash-loading-spinner" />
          Loading dashboard...
        </div>
      </div>
    )
  }

  const totalFiles = datasets.length
  const totalSize = datasets.reduce((s, d) => s + d.sizeBytes, 0)
  const totalFeatures = datasets.reduce((s, d) => s + d.featureCount, 0)

  // --- ProDoc indicator calculations from tracker data ---
  const allProDocAreas = [...newAreas, ...existingAreas]

  // Indicator 1.1: New CCA — terrestrial hectares from new areas
  const newCcaHa = sumTerrestrial(newAreas)
  const newCcaTarget = PRODOC_TARGETS['1.1'].targetHa
  const newCcaProgress = Math.min((newCcaHa / newCcaTarget) * 100, 100)

  // Indicator 1.2: Existing CCA Strengthened — terrestrial hectares from existing areas
  const existCcaHa = sumTerrestrial(existingAreas)
  const existCcaTarget = PRODOC_TARGETS['1.2'].targetHa
  const existCcaProgress = Math.min((existCcaHa / existCcaTarget) * 100, 100)

  // Indicator 2.1: New MPA — marine hectares from new areas
  const newMpaHa = sumMarine(newAreas)
  const newMpaTarget = PRODOC_TARGETS['2.1'].targetHa
  const newMpaProgress = Math.min((newMpaHa / newMpaTarget) * 100, 100)

  // Indicator 2.2: Existing MPA Strengthened — marine hectares from existing areas
  const existMpaHa = sumMarine(existingAreas)
  const existMpaTarget = PRODOC_TARGETS['2.2'].targetHa
  const existMpaProgress = Math.min((existMpaHa / existMpaTarget) * 100, 100)

  // Combined totals for 30x30 display
  const totalCcaHa = newCcaHa + existCcaHa
  const totalMpaHa = newMpaHa + existMpaHa
  const ccaProgress = CCA_TARGET_HA > 0 ? Math.min((totalCcaHa / CCA_TARGET_HA) * 100, 100) : 0
  const mpaProgress = MPA_TARGET_HA > 0 ? Math.min((totalMpaHa / MPA_TARGET_HA) * 100, 100) : 0
  const ccaLandPercent = VANUATU_LAND_HA > 0 ? (totalCcaHa / VANUATU_LAND_HA) * 100 : 0
  const mpaEezPercent = VANUATU_EEZ_HA > 0 ? (totalMpaHa / VANUATU_EEZ_HA) * 100 : 0
  const ccaRemainingHa = Math.max(CCA_TARGET_HA - totalCcaHa, 0)
  const mpaRemainingHa = Math.max(MPA_TARGET_HA - totalMpaHa, 0)

  // ProDoc indicator donut data
  const prodocIndicators = [
    {
      key: '1.1',
      label: PRODOC_TARGETS['1.1'].label,
      description: PRODOC_TARGETS['1.1'].description,
      mapped: newCcaHa,
      target: newCcaTarget,
      progress: newCcaProgress,
      color: CHART_COLORS.green,
      type: 'Terrestrial',
    },
    {
      key: '1.2',
      label: PRODOC_TARGETS['1.2'].label,
      description: PRODOC_TARGETS['1.2'].description,
      mapped: existCcaHa,
      target: existCcaTarget,
      progress: existCcaProgress,
      color: CHART_COLORS.greenLight,
      type: 'Terrestrial',
    },
    {
      key: '2.1',
      label: PRODOC_TARGETS['2.1'].label,
      description: PRODOC_TARGETS['2.1'].description,
      mapped: newMpaHa,
      target: newMpaTarget,
      progress: newMpaProgress,
      color: CHART_COLORS.blue,
      type: 'Marine',
    },
    {
      key: '2.2',
      label: PRODOC_TARGETS['2.2'].label,
      description: PRODOC_TARGETS['2.2'].description,
      mapped: existMpaHa,
      target: existMpaTarget,
      progress: existMpaProgress,
      color: CHART_COLORS.blueLight,
      type: 'Marine',
    },
  ]

  // Donut chart data for 30x30
  const ccaDonutData = [
    { name: 'Mapped', value: totalCcaHa, color: CHART_COLORS.green },
    { name: 'Remaining', value: ccaRemainingHa, color: CHART_COLORS.gray },
  ]
  const mpaDonutData = [
    { name: 'Mapped', value: totalMpaHa, color: CHART_COLORS.blue },
    { name: 'Remaining', value: mpaRemainingHa, color: CHART_COLORS.gray },
  ]

  // --- CCA / MPA counts ---
  // CCA = entries with terrestrial component, MPA = entries with marine component
  const isCCA = (e: ProDocEntry) => e.ccaType === 'Terrestrial' || e.ccaType === 'Marine & Terrestrial'
  const isMPA = (e: ProDocEntry) => e.ccaType === 'Marine' || e.ccaType === 'Marine & Terrestrial'

  const newCcaCount = newAreas.filter(isCCA).length
  const newMpaCount = newAreas.filter(isMPA).length
  const improvedCcaCount = existingAreas.filter(isCCA).length
  const improvedMpaCount = existingAreas.filter(isMPA).length

  // --- Mapping completion ---
  const ccaAreas = allProDocAreas.filter(isCCA)
  const mpaAreas = allProDocAreas.filter(isMPA)
  const ccaMappedComplete = ccaAreas.filter((a) => a.mappingStatus === 'Completed').length
  const ccaMappedLeft = ccaAreas.length - ccaMappedComplete
  const mpaMappedComplete = mpaAreas.filter((a) => a.mappingStatus === 'Completed').length
  const mpaMappedLeft = mpaAreas.length - mpaMappedComplete

  // Mapping status breakdown from ProDoc data
  const mappingCompleted = allProDocAreas.filter((a) => a.mappingStatus === 'Completed').length
  const mappingInProgress = allProDocAreas.filter((a) => a.mappingStatus === 'In Progress').length
  const mappingNotStarted = allProDocAreas.filter((a) => a.mappingStatus === '').length

  const mappingPieData = [
    { name: 'Completed', value: mappingCompleted, color: CHART_COLORS.green },
    { name: 'In Progress', value: mappingInProgress, color: CHART_COLORS.amber },
    { name: 'Not Started', value: mappingNotStarted, color: CHART_COLORS.gray },
  ].filter((d) => d.value > 0)

  // Province breakdown from ProDoc data
  const provinces = [...new Set(allProDocAreas.map((a) => getProvince(a.areaCouncil)))].sort()
  const provinceBarData = provinces.map((province) => {
    const provinceAreas = allProDocAreas.filter((a) => getProvince(a.areaCouncil) === province)
    return {
      name: province,
      fullName: province,
      Terrestrial: provinceAreas.reduce((s, a) => s + (a.hectaresTerrestrial ?? 0), 0),
      Marine: provinceAreas.reduce((s, a) => s + (a.hectaresMarine ?? 0), 0),
      count: provinceAreas.length,
    }
  }).filter((d) => d.Terrestrial > 0 || d.Marine > 0)


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
                <FolderOpen size={18} className="dash-section-icon" />
                Data Categories
              </h3>
              <p className="dash-section-desc">Browse datasets by thematic category</p>
            </div>
          </div>
          <div className="dash-category-grid">
            {categories.map((cat) => {
              const Icon = getCategoryIcon(cat.icon)
              const count = datasets.filter((d) => d.metadata.portalCategory === cat.id).length
              return (
                <div className="dash-category-card" key={cat.id} style={{ borderTopColor: cat.color }}>
                  <div className="dash-category-icon" style={{ color: cat.color }}>
                    <Icon size={24} />
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
            <TreePine size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{newCcaCount}</span>
            <span className="dash-stat-label">New CCAs</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{newMpaCount}</span>
            <span className="dash-stat-label">New MPAs</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-green">
          <div className="dash-stat-icon">
            <TrendingUp size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{improvedCcaCount}</span>
            <span className="dash-stat-label">CCAs Improved</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <TrendingUp size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{improvedMpaCount}</span>
            <span className="dash-stat-label">MPAs Improved</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-purple">
          <div className="dash-stat-icon">
            <CheckCircle2 size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{ccaMappedComplete} / {ccaAreas.length}</span>
            <span className="dash-stat-label">CCA Mapped</span>
            <span className="dash-stat-sub">{ccaMappedLeft} remaining</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-amber">
          <div className="dash-stat-icon">
            <CheckCircle2 size={20} />
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
              <Target size={18} className="dash-section-icon" />
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
                        innerRadius={40}
                        outerRadius={58}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatArea(Number(value))}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
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
              <Target size={18} className="dash-section-icon" />
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
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {ccaDonutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatArea(Number(value))}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="dash-target-stats">
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(totalCcaHa)}</span>
                <span className="dash-target-stat-lbl">Mapped</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(CCA_TARGET_HA)}</span>
                <span className="dash-target-stat-lbl">Target (30%)</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(ccaRemainingHa)}</span>
                <span className="dash-target-stat-lbl">Remaining</span>
              </div>
            </div>
            <div className="dash-target-coverage">
              {ccaLandPercent.toFixed(2)}% of Vanuatu land area ({formatArea(VANUATU_LAND_HA)})
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
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {mpaDonutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatArea(Number(value))}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="dash-target-stats">
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(totalMpaHa)}</span>
                <span className="dash-target-stat-lbl">Mapped</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(MPA_TARGET_HA)}</span>
                <span className="dash-target-stat-lbl">Target (30%)</span>
              </div>
              <div className="dash-target-stat">
                <span className="dash-target-stat-val">{formatArea(mpaRemainingHa)}</span>
                <span className="dash-target-stat-lbl">Remaining</span>
              </div>
            </div>
            <div className="dash-target-coverage">
              {mpaEezPercent.toFixed(4)}% of Vanuatu EEZ ({formatArea(VANUATU_EEZ_HA)})
            </div>
          </div>
        </div>
      </div>

      {/* Overview panels */}
      <div className="dash-panels">
        {/* Mapping status from ProDoc Tracker */}
        <div className="dash-panel">
          <h3 className="dash-section-title">
            <TrendingUp size={18} className="dash-section-icon" />
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
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {mappingPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="dash-status-legend">
                <div className="dash-status-item">
                  <CheckCircle2 size={16} color={CHART_COLORS.green} />
                  <span className="dash-status-count">{mappingCompleted}</span>
                  <span className="dash-status-label">Completed</span>
                </div>
                <div className="dash-status-item">
                  <Clock size={16} color={CHART_COLORS.amber} />
                  <span className="dash-status-count">{mappingInProgress}</span>
                  <span className="dash-status-label">In Progress</span>
                </div>
                <div className="dash-status-item">
                  <AlertCircle size={16} color={CHART_COLORS.gray} />
                  <span className="dash-status-count">{mappingNotStarted}</span>
                  <span className="dash-status-label">Not Started</span>
                </div>
                <div className="dash-status-item">
                  <Layers size={16} color={CHART_COLORS.cyan} />
                  <span className="dash-status-count">{allProDocAreas.length}</span>
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
            <HardDrive size={18} className="dash-section-icon" />
            GIS Database
          </h3>
          <div className="dash-status-legend">
            <div className="dash-status-item">
              <Database size={16} color={CHART_COLORS.purple} />
              <span className="dash-status-count">{totalFiles}</span>
              <span className="dash-status-label">Datasets</span>
            </div>
            <div className="dash-status-item">
              <HardDrive size={16} color={CHART_COLORS.amber} />
              <span className="dash-status-count">{formatBytes(totalSize)}</span>
              <span className="dash-status-label">Total Size</span>
            </div>
            <div className="dash-status-item">
              <Layers size={16} color={CHART_COLORS.cyan} />
              <span className="dash-status-count">{totalFeatures.toLocaleString()}</span>
              <span className="dash-status-label">GIS Features</span>
            </div>
          </div>
          <h4 className="dash-section-subtitle">Supported File Types</h4>
          <div className="dash-file-types">
            {Object.entries(FILE_TYPE_ICONS).map(([ft, Icon]) => (
              <div key={ft} className="dash-file-type">
                <Icon size={16} className="dash-ft-icon" />
                <span>{ft}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Province coverage from ProDoc Tracker */}
        {provinceBarData.length > 0 && (
          <div className="dash-panel dash-panel-wide">
            <h3 className="dash-section-title">
              <MapPin size={18} className="dash-section-icon" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    unit=" ha"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatArea(Number(value)), String(name)]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  />
                  <Bar dataKey="Terrestrial" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Marine" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} />
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
