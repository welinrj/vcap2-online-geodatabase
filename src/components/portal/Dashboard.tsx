import { useState, useEffect, lazy, Suspense, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import type { ProtectedAreaSummary } from '../../types/protectedArea'
import { listDatasets, formatBytes, migrateFromLocalStorage } from '../../services/datasetStore'
import { listProtectedAreas, formatArea } from '../../services/protectedAreaStore'
import {
  ShieldCheck,
  Waves,
  Database,
  HardDrive,
  TrendingUp,
  MapPin,
  Layers,
  FileJson,
  FileSpreadsheet,
  FileImage,
  FileText,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Target,
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

const Dashboard: FC = () => {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [areas, setAreas] = useState<ProtectedAreaSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      await migrateFromLocalStorage()
      const [ds, pa] = await Promise.all([listDatasets(), listProtectedAreas()])
      setDatasets(ds)
      setAreas(pa)
      setLoading(false)
    }
    load()
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

  const ccas = areas.filter((a) => a.type === 'cca')
  const mpas = areas.filter((a) => a.type === 'mpa')
  const totalCcaHa = ccas.reduce((s, a) => s + (a.areaHa ?? 0), 0)
  const totalMpaHa = mpas.reduce((s, a) => s + (a.areaHa ?? 0), 0)
  const totalFiles = datasets.length
  const totalSize = datasets.reduce((s, d) => s + d.sizeBytes, 0)
  const totalFeatures = datasets.reduce((s, d) => s + d.featureCount, 0)

  const ccaProgress = CCA_TARGET_HA > 0 ? Math.min((totalCcaHa / CCA_TARGET_HA) * 100, 100) : 0
  const mpaProgress = MPA_TARGET_HA > 0 ? Math.min((totalMpaHa / MPA_TARGET_HA) * 100, 100) : 0
  const ccaLandPercent = VANUATU_LAND_HA > 0 ? (totalCcaHa / VANUATU_LAND_HA) * 100 : 0
  const mpaEezPercent = VANUATU_EEZ_HA > 0 ? (totalMpaHa / VANUATU_EEZ_HA) * 100 : 0

  const ccaRemainingHa = Math.max(CCA_TARGET_HA - totalCcaHa, 0)
  const mpaRemainingHa = Math.max(MPA_TARGET_HA - totalMpaHa, 0)

  // Status breakdown
  const activeAreas = areas.filter((a) => a.status === 'active').length
  const designatedAreas = areas.filter((a) => a.status === 'designated').length
  const proposedAreas = areas.filter((a) => a.status === 'proposed').length

  // Province breakdown
  const provinces = [...new Set(areas.map((a) => a.province).filter(Boolean))]

  // Pie chart data for status
  const statusPieData = [
    { name: 'Active', value: activeAreas, color: CHART_COLORS.green },
    { name: 'Designated', value: designatedAreas, color: CHART_COLORS.purple },
    { name: 'Proposed', value: proposedAreas, color: CHART_COLORS.amber },
  ].filter((d) => d.value > 0)

  // Donut chart data for CCA target
  const ccaDonutData = [
    { name: 'Mapped', value: totalCcaHa, color: CHART_COLORS.green },
    { name: 'Remaining', value: ccaRemainingHa, color: CHART_COLORS.gray },
  ]

  // Donut chart data for MPA target
  const mpaDonutData = [
    { name: 'Mapped', value: totalMpaHa, color: CHART_COLORS.blue },
    { name: 'Remaining', value: mpaRemainingHa, color: CHART_COLORS.gray },
  ]

  // Province bar chart data
  const provinceBarData = provinces.sort().map((prov) => {
    const provAreas = areas.filter((a) => a.province === prov)
    return {
      name: prov.length > 12 ? prov.slice(0, 12) + '...' : prov,
      fullName: prov,
      CCA: provAreas.filter((a) => a.type === 'cca').reduce((s, a) => s + (a.areaHa ?? 0), 0),
      MPA: provAreas.filter((a) => a.type === 'mpa').reduce((s, a) => s + (a.areaHa ?? 0), 0),
      count: provAreas.length,
    }
  })

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

      {/* Quick stats */}
      <div className="dash-stats">
        <div className="dash-stat-card dash-stat-green">
          <div className="dash-stat-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{ccas.length}</span>
            <span className="dash-stat-label">CCAs Registered</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <Waves size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{mpas.length}</span>
            <span className="dash-stat-label">MPAs Registered</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-purple">
          <div className="dash-stat-icon">
            <Database size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{totalFiles}</span>
            <span className="dash-stat-label">GIS Datasets</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-amber">
          <div className="dash-stat-icon">
            <HardDrive size={20} />
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{formatBytes(totalSize)}</span>
            <span className="dash-stat-label">Total Data Size</span>
          </div>
        </div>
      </div>

      {/* Data overview map */}
      <Suspense fallback={<div className="dash-loading">Loading map...</div>}>
        <DashboardMap />
      </Suspense>

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
        {/* Status breakdown with pie chart */}
        <div className="dash-panel">
          <h3 className="dash-section-title">
            <TrendingUp size={18} className="dash-section-icon" />
            Protected Areas Status
          </h3>
          {statusPieData.length > 0 ? (
            <div className="dash-chart-row">
              <div className="dash-chart-mini">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {statusPieData.map((entry, index) => (
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
                  <span className="dash-status-count">{activeAreas}</span>
                  <span className="dash-status-label">Active</span>
                </div>
                <div className="dash-status-item">
                  <AlertCircle size={16} color={CHART_COLORS.purple} />
                  <span className="dash-status-count">{designatedAreas}</span>
                  <span className="dash-status-label">Designated</span>
                </div>
                <div className="dash-status-item">
                  <Clock size={16} color={CHART_COLORS.amber} />
                  <span className="dash-status-count">{proposedAreas}</span>
                  <span className="dash-status-label">Proposed</span>
                </div>
                <div className="dash-status-item">
                  <Layers size={16} color={CHART_COLORS.cyan} />
                  <span className="dash-status-count">{totalFeatures.toLocaleString()}</span>
                  <span className="dash-status-label">GIS Features</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="dash-empty-chart">No protected areas registered yet</div>
          )}
        </div>

        {/* File types overview */}
        <div className="dash-panel">
          <h3 className="dash-section-title">
            <File size={18} className="dash-section-icon" />
            Supported File Types
          </h3>
          <div className="dash-file-types">
            {Object.entries(FILE_TYPE_ICONS).map(([ft, Icon]) => (
              <div key={ft} className="dash-file-type">
                <Icon size={16} className="dash-ft-icon" />
                <span>{ft}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Province coverage with bar chart */}
        {provinceBarData.length > 0 && (
          <div className="dash-panel dash-panel-wide">
            <h3 className="dash-section-title">
              <MapPin size={18} className="dash-section-icon" />
              Coverage by Province
            </h3>
            <div className="dash-province-chart">
              <ResponsiveContainer width="100%" height={Math.max(200, provinceBarData.length * 44)}>
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
                    width={100}
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatArea(Number(value)), String(name)]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  />
                  <Bar dataKey="CCA" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="MPA" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="dash-province-legend">
                <span className="dash-province-legend-item">
                  <span className="dash-legend-dot" style={{ background: CHART_COLORS.green }} />
                  CCA (Terrestrial)
                </span>
                <span className="dash-province-legend-item">
                  <span className="dash-legend-dot" style={{ background: CHART_COLORS.blue }} />
                  MPA (Marine)
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
