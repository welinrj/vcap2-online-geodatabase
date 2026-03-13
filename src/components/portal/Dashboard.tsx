import { useState, useEffect, lazy, Suspense, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import type { ProtectedAreaSummary } from '../../types/protectedArea'
import { listDatasets, formatBytes, migrateFromLocalStorage } from '../../services/datasetStore'
import { listProtectedAreas, formatArea } from '../../services/protectedAreaStore'
import vcap2Logo from '../../../assets/vcap2-logo.png'
import './Dashboard.css'

const DashboardMap = lazy(() => import('./DashboardMap'))

// Vanuatu targets — 30x30 Global Biodiversity Framework
const CCA_TARGET_HA = 365_700 // 30% of 1,219,000 ha land area
const MPA_TARGET_HA = 19_890_000 // 30% of 66,300,000 ha EEZ
const VANUATU_LAND_HA = 1_219_000
const VANUATU_EEZ_HA = 66_300_000

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
        <div className="dash-loading">Loading dashboard...</div>
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{ccas.length}</span>
            <span className="dash-stat-label">CCAs Registered</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-blue">
          <div className="dash-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{mpas.length}</span>
            <span className="dash-stat-label">MPAs Registered</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-purple">
          <div className="dash-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>
          </div>
          <div className="dash-stat-info">
            <span className="dash-stat-value">{totalFiles}</span>
            <span className="dash-stat-label">GIS Datasets</span>
          </div>
        </div>
        <div className="dash-stat-card dash-stat-amber">
          <div className="dash-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
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

      {/* Target tracking */}
      <div className="dash-targets">
        <h3 className="dash-section-title">30x30 Target Progress</h3>
        <p className="dash-section-desc">Progress towards Vanuatu's commitment under the Global Biodiversity Framework to protect 30% of land and sea areas by 2030.</p>

        <div className="dash-target-grid">
          {/* CCA Target */}
          <div className="dash-target-card">
            <div className="dash-target-header">
              <span className="dash-target-type dash-target-cca">CCA</span>
              <span className="dash-target-pct">{ccaProgress.toFixed(1)}%</span>
            </div>
            <div className="dash-target-title">Terrestrial Conservation</div>
            <div className="dash-progress-bar">
              <div className="dash-progress-fill dash-progress-green" style={{ width: `${ccaProgress}%` }} />
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
              <span className="dash-target-type dash-target-mpa">MPA</span>
              <span className="dash-target-pct">{mpaProgress.toFixed(1)}%</span>
            </div>
            <div className="dash-target-title">Marine Conservation</div>
            <div className="dash-progress-bar">
              <div className="dash-progress-fill dash-progress-blue" style={{ width: `${mpaProgress}%` }} />
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
        {/* Status breakdown */}
        <div className="dash-panel">
          <h3 className="dash-section-title">Protected Areas Status</h3>
          <div className="dash-status-grid">
            <div className="dash-status-item">
              <span className="dash-status-count">{activeAreas}</span>
              <span className="dash-status-dot dash-dot-green" />
              <span className="dash-status-label">Active</span>
            </div>
            <div className="dash-status-item">
              <span className="dash-status-count">{designatedAreas}</span>
              <span className="dash-status-dot dash-dot-purple" />
              <span className="dash-status-label">Designated</span>
            </div>
            <div className="dash-status-item">
              <span className="dash-status-count">{proposedAreas}</span>
              <span className="dash-status-dot dash-dot-amber" />
              <span className="dash-status-label">Proposed</span>
            </div>
            <div className="dash-status-item">
              <span className="dash-status-count">{totalFeatures.toLocaleString()}</span>
              <span className="dash-status-dot dash-dot-cyan" />
              <span className="dash-status-label">GIS Features</span>
            </div>
          </div>
        </div>

        {/* File types overview */}
        <div className="dash-panel">
          <h3 className="dash-section-title">Supported File Types</h3>
          <div className="dash-file-types">
            {['GeoJSON', 'Shapefile', 'KML', 'GeoPackage', 'PDF', 'PNG', 'CSV'].map((ft) => (
              <div key={ft} className="dash-file-type">
                <svg className="dash-ft-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                <span>{ft}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Province coverage */}
        {provinces.length > 0 && (
          <div className="dash-panel dash-panel-wide">
            <h3 className="dash-section-title">Coverage by Province</h3>
            <div className="dash-province-list">
              {provinces.sort().map((prov) => {
                const provAreas = areas.filter((a) => a.province === prov)
                const provCca = provAreas.filter((a) => a.type === 'cca').reduce((s, a) => s + (a.areaHa ?? 0), 0)
                const provMpa = provAreas.filter((a) => a.type === 'mpa').reduce((s, a) => s + (a.areaHa ?? 0), 0)
                return (
                  <div key={prov} className="dash-province-row">
                    <span className="dash-province-name">{prov}</span>
                    <div className="dash-province-bars">
                      <span className="dash-province-tag dash-tag-green">{formatArea(provCca)} CCA</span>
                      <span className="dash-province-tag dash-tag-blue">{formatArea(provMpa)} MPA</span>
                    </div>
                    <span className="dash-province-count">{provAreas.length} area{provAreas.length !== 1 ? 's' : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
