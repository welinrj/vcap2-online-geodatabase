import { useState, useCallback, useEffect, useRef, type FC, type FormEvent } from 'react'
import type {
  ProtectedArea,
  ProtectedAreaSummary,
  ProtectedAreaType,
  ProtectedAreaStatus,
} from '../../types/protectedArea'
import {
  listProtectedAreas,
  getProtectedArea,
  createProtectedArea,
  updateProtectedArea,
  deleteProtectedArea,
  addAttachment,
  removeAttachment,
  downloadAttachment,
  formatArea,
  onProtectedAreasChanged,
} from '../../services/protectedAreaStore'
import {
  syncProtectedAreas,
  getSyncSettings,
  getPaSyncState,
  deleteRemoteArea,
} from '../../services/githubSync'
import { parseGeoJSON } from '../../services/datasetStore'
import MapViewer from './MapViewer'
import './DataPortal.css'
import './GISDatabase.css'
import './ProtectedAreas.css'

type PaView = 'dashboard' | 'detail' | 'create' | 'edit'

const STATUS_LABELS: Record<ProtectedAreaStatus, string> = {
  proposed: 'Proposed',
  designated: 'Designated',
  active: 'Active',
  inactive: 'Inactive',
}

const TYPE_LABELS: Record<ProtectedAreaType, string> = {
  cca: 'CCA',
  mpa: 'MPA',
}

const PROVINCES = [
  'Malampa',
  'Penama',
  'Sanma',
  'Shefa',
  'Tafea',
  'Torba',
]

const ProtectedAreas: FC = () => {
  const [view, setView] = useState<PaView>('dashboard')
  const [areas, setAreas] = useState<ProtectedAreaSummary[]>([])
  const [activeArea, setActiveArea] = useState<ProtectedArea | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<ProtectedAreaType | ''>('')
  const [filterStatus, setFilterStatus] = useState<ProtectedAreaStatus | ''>('')

  // GitHub sync state
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    const state = getPaSyncState()
    setLastSync(state.lastSync)
  }, [])

  const refresh = useCallback(async () => {
    const list = await listProtectedAreas()
    setAreas(list)
  }, [])

  // Auto-sync on mount: pull from GitHub, then subscribe to real-time updates
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function initialSync() {
      try {
        const config = getSyncSettings()
        const result = await syncProtectedAreas(config)
        if (!cancelled && (result.pulled > 0 || result.pushed > 0)) {
          setLastSync(new Date().toISOString())
        }
      } catch {
        // silent — manual sync still available
      }
      if (!cancelled) {
        // Subscribe to real-time updates for cross-device sync
        unsubscribe = onProtectedAreasChanged((list) => {
          if (!cancelled) setAreas(list)
        })
        setLoading(false)
      }
    }
    initialSync()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // Fire-and-forget push to GitHub after local mutation
  function backgroundSync() {
    const config = getSyncSettings()
    if (!config.token) return
    syncProtectedAreas(config)
      .then((r) => {
        if (r.pushed > 0 || r.pulled > 0) setLastSync(new Date().toISOString())
      })
      .catch(() => { /* silent — manual sync still available */ })
  }

  async function handleViewArea(id: string) {
    const area = await getProtectedArea(id)
    if (area) {
      setActiveArea(area)
      setView('detail')
    }
  }

  async function handleEditArea(id: string) {
    const area = await getProtectedArea(id)
    if (area) {
      setActiveArea(area)
      setView('edit')
    }
  }

  async function handleDeleteArea(id: string) {
    const area = areas.find((a) => a.id === id)
    if (!window.confirm(`Delete "${area?.name}"? It will be moved to Trash and can be restored.`)) return
    await deleteProtectedArea(id)
    // Also delete from GitHub
    const config = getSyncSettings()
    if (config.token) {
      deleteRemoteArea(id, config).catch(() => { /* silent */ })
    }
    if (activeArea?.id === id) {
      setActiveArea(null)
      setView('dashboard')
    }
    await refresh()
  }

  async function handleSync() {
    const config = getSyncSettings()

    setSyncing(true)
    setSyncStatus('Syncing with GitHub...')

    try {
      const result = await syncProtectedAreas(config)
      await refresh()

      const parts: string[] = []
      if (result.pushed > 0) parts.push(`${result.pushed} pushed`)
      if (result.pulled > 0) parts.push(`${result.pulled} pulled`)
      if (result.errors.length > 0) parts.push(`${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}: ${result.errors.join('; ')}`)
      if (parts.length === 0) parts.push('Already in sync')
      if (!config.token) parts.push('(pull-only — no token)')

      setSyncStatus(parts.join(', '))
      setLastSync(new Date().toISOString())
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const filtered = areas.filter((a) => {
    if (filterType && a.type !== filterType) return false
    if (filterStatus && a.status !== filterStatus) return false
    return true
  })

  // Dashboard stats
  const totalTerrestrialHa = areas.filter((a) => a.type === 'cca').reduce((sum, a) => sum + (a.areaHa ?? 0), 0)
  const totalMarineHa = areas.filter((a) => a.type === 'mpa').reduce((sum, a) => sum + (a.areaHa ?? 0), 0)

  // Vanuatu reference areas for coverage calculation
  const VANUATU_LAND_AREA_HA = 1_219_000 // ~12,190 km²
  const VANUATU_MARINE_AREA_HA = 66_300_000 // ~663,000 km² EEZ
  const terrestrialCoverage = VANUATU_LAND_AREA_HA > 0 ? (totalTerrestrialHa / VANUATU_LAND_AREA_HA) * 100 : 0
  const marineCoverage = VANUATU_MARINE_AREA_HA > 0 ? (totalMarineHa / VANUATU_MARINE_AREA_HA) * 100 : 0

  // Province summary
  const provinceSummary = PROVINCES.map((province) => {
    const provinceAreas = areas.filter((a) => a.province === province)
    const terrestrial = provinceAreas.filter((a) => a.type === 'cca').reduce((sum, a) => sum + (a.areaHa ?? 0), 0)
    const marine = provinceAreas.filter((a) => a.type === 'mpa').reduce((sum, a) => sum + (a.areaHa ?? 0), 0)
    return {
      province,
      terrestrial,
      marine,
      total: terrestrial + marine,
      features: provinceAreas.length,
    }
  }).filter((p) => p.features > 0)

  if (loading) {
    return (
      <div className="data-portal">
        <div className="portal-toolbar">
          <div className="portal-toolbar-left">
            <h2>CCAs &amp; MPAs</h2>
            <span className="dataset-count">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── Dashboard / List View ──────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <div className="data-portal">
        <div className="portal-toolbar">
          <div className="portal-toolbar-left">
            <h2>CCAs &amp; MPAs</h2>
            <span className="dataset-count">
              {areas.length} protected area{areas.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="portal-toolbar-right">
            <button className="btn btn-primary" onClick={() => { setActiveArea(null); setView('create') }}>
              Add Protected Area
            </button>
          </div>
        </div>

        {/* Dashboard stats */}
        <div className="db-stats-grid">
          <div className="db-stat-card">
            <span className="db-stat-value">{formatArea(totalTerrestrialHa)}</span>
            <span className="db-stat-label">Terrestrial (CCA)</span>
          </div>
          <div className="db-stat-card">
            <span className="db-stat-value">{formatArea(totalMarineHa)}</span>
            <span className="db-stat-label">Marine (MPA)</span>
          </div>
          <div className="db-stat-card">
            <span className="db-stat-value">{areas.length}</span>
            <span className="db-stat-label">Data Records</span>
          </div>
          <div className="db-stat-card">
            <span className="db-stat-value">{terrestrialCoverage.toFixed(2)}%</span>
            <span className="db-stat-label">Terrestrial Coverage</span>
          </div>
          <div className="db-stat-card">
            <span className="db-stat-value">{marineCoverage.toFixed(2)}%</span>
            <span className="db-stat-label">Marine Coverage</span>
          </div>
          <div className="db-stat-card">
            <span className="db-stat-value">{new Set(areas.map((a) => a.province).filter(Boolean)).size}</span>
            <span className="db-stat-label">Provinces</span>
          </div>
        </div>

        {/* GitHub Sync */}
        <div className="db-sync-section">
          <div className="db-sync-row">
            <div className="db-sync-info">
              <strong>GitHub Sync</strong>
              {lastSync && (
                <span className="db-sync-last">
                  Last sync: {new Date(lastSync).toLocaleString()}
                </span>
              )}
            </div>
            <div className="db-sync-actions">
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
          {syncStatus && (
            <div className="db-sync-status" role="status">
              {syncStatus}
              <button className="db-dismiss" onClick={() => setSyncStatus('')} aria-label="Dismiss">
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        {areas.length > 0 && (
          <div className="pa-filters">
            <div className="pa-filter-group">
              <label htmlFor="filter-type">Type</label>
              <select
                id="filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as ProtectedAreaType | '')}
              >
                <option value="">All</option>
                <option value="cca">CCA</option>
                <option value="mpa">MPA</option>
              </select>
            </div>
            <div className="pa-filter-group">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ProtectedAreaStatus | '')}
              >
                <option value="">All</option>
                <option value="proposed">Proposed</option>
                <option value="designated">Designated</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <span className="pa-filter-count">
              Showing {filtered.length} of {areas.length}
            </span>
          </div>
        )}

        {/* Province Summary */}
        {provinceSummary.length > 0 && (
          <div className="table-container" style={{ marginBottom: '1.5rem' }}>
            <h3>Province Summary</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Province</th>
                  <th>Terrestrial (ha)</th>
                  <th>Marine (ha)</th>
                  <th>Total (ha)</th>
                  <th>Features</th>
                </tr>
              </thead>
              <tbody>
                {provinceSummary.map((p) => (
                  <tr key={p.province}>
                    <td>{p.province}</td>
                    <td>{formatArea(p.terrestrial > 0 ? p.terrestrial : null)}</td>
                    <td>{formatArea(p.marine > 0 ? p.marine : null)}</td>
                    <td>{formatArea(p.total > 0 ? p.total : null)}</td>
                    <td>{p.features}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="portal-empty">
            {areas.length === 0 ? (
              <>
                <p>No protected areas registered yet.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  Click <strong>Add Protected Area</strong> to register a CCA or MPA.
                </p>
              </>
            ) : (
              <p>No protected areas match the current filters.</p>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Island</th>
                  <th>Province</th>
                  <th>Area</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((area) => (
                  <tr key={area.id}>
                    <td>
                      <button className="link-button" onClick={() => handleViewArea(area.id)}>
                        {area.name}
                      </button>
                    </td>
                    <td>
                      <span className={`badge badge-pa-type badge-pa-${area.type}`}>
                        {TYPE_LABELS[area.type]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${area.status}`}>
                        {STATUS_LABELS[area.status]}
                      </span>
                    </td>
                    <td>{area.island || '—'}</td>
                    <td>{area.province || '—'}</td>
                    <td>{formatArea(area.areaHa)}</td>
                    <td>{new Date(area.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-sm" onClick={() => handleEditArea(area.id)}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteArea(area.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ─── Detail View ────────────────────────────────────────────────
  if (view === 'detail' && activeArea) {
    return (
      <AreaDetail
        area={activeArea}
        onBack={() => { setActiveArea(null); setView('dashboard') }}
        onEdit={() => setView('edit')}
        onDelete={() => handleDeleteArea(activeArea.id)}
        onRefresh={async () => {
          const updated = await getProtectedArea(activeArea.id)
          if (updated) setActiveArea(updated)
        }}
      />
    )
  }

  // ─── Create / Edit Form ─────────────────────────────────────────
  if (view === 'create' || view === 'edit') {
    return (
      <AreaForm
        existing={view === 'edit' ? activeArea : null}
        onSave={async (data) => {
          if (view === 'edit' && activeArea) {
            await updateProtectedArea(activeArea.id, data)
          } else {
            await createProtectedArea(data)
          }
          backgroundSync()
          await refresh()
          setActiveArea(null)
          setView('dashboard')
        }}
        onCancel={() => setView(activeArea ? 'detail' : 'dashboard')}
      />
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════
// Detail sub-component
// ═══════════════════════════════════════════════════════════════════

interface AreaDetailProps {
  area: ProtectedArea
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => Promise<void>
}

const AreaDetail: FC<AreaDetailProps> = ({ area, onBack, onEdit, onDelete, onRefresh }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await addAttachment(area.id, file)
    await onRefresh()
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleRemoveAttachment(attachmentId: string) {
    if (!window.confirm('Remove this attachment?')) return
    await removeAttachment(area.id, attachmentId)
    await onRefresh()
  }

  return (
    <div className="data-portal">
      <div className="detail-header">
        <button className="btn btn-secondary" onClick={onBack}>
          &larr; Back to List
        </button>
        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          <button className="btn btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="detail-meta-card">
        <div className="detail-title-row">
          <h2>{area.name}</h2>
          <span className={`badge badge-pa-type badge-pa-${area.type}`}>
            {TYPE_LABELS[area.type]}
          </span>
          <span className={`badge badge-${area.status}`}>
            {STATUS_LABELS[area.status]}
          </span>
        </div>
        {area.description && (
          <p className="detail-description">{area.description}</p>
        )}
        <div className="detail-stats">
          <div className="detail-stat">
            <span className="detail-stat-label">Island</span>
            <span className="detail-stat-value">{area.island || '—'}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Province</span>
            <span className="detail-stat-value">{area.province || '—'}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Area</span>
            <span className="detail-stat-value">{formatArea(area.areaHa)}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Designated</span>
            <span className="detail-stat-value">{area.designatedDate || '—'}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Management</span>
            <span className="detail-stat-value">{area.managementAuthority || '—'}</span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Created</span>
            <span className="detail-stat-value">
              {new Date(area.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Boundary map */}
      {area.boundary && area.boundary.features.length > 0 && (
        <div className="detail-map">
          <h3>Boundary Map</h3>
          <MapViewer data={area.boundary} height="400px" />
        </div>
      )}

      {/* Attachments */}
      <div className="pa-attachments-card">
        <div className="pa-attachments-header">
          <h3>Attachments ({area.attachments.length})</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.geojson,.json,.csv,.kml,.zip"
              onChange={handleUploadAttachment}
              hidden
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </div>
        {area.attachments.length === 0 ? (
          <p className="pa-attachments-empty">No attachments yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {area.attachments.map((att) => (
                <tr key={att.id}>
                  <td>{att.name}</td>
                  <td>{att.mimeType || '—'}</td>
                  <td>{formatBytes(att.sizeBytes)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-sm"
                        onClick={() => downloadAttachment(att)}
                      >
                        Download
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveAttachment(att.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ═══════════════════════════════════════════════════════════════════
// Create / Edit form sub-component
// ═══════════════════════════════════════════════════════════════════

interface AreaFormProps {
  existing: ProtectedArea | null
  onSave: (data: {
    name: string
    type: ProtectedAreaType
    status: ProtectedAreaStatus
    description: string
    island: string
    province: string
    areaHa: number | null
    designatedDate: string
    managementAuthority: string
    boundary: import('geojson').FeatureCollection | null
  }) => Promise<void>
  onCancel: () => void
}

const AreaForm: FC<AreaFormProps> = ({ existing, onSave, onCancel }) => {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<ProtectedAreaType>(existing?.type ?? 'cca')
  const [status, setStatus] = useState<ProtectedAreaStatus>(existing?.status ?? 'proposed')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [island, setIsland] = useState(existing?.island ?? '')
  const [province, setProvince] = useState(existing?.province ?? '')
  const [areaHa, setAreaHa] = useState(existing?.areaHa?.toString() ?? '')
  const [designatedDate, setDesignatedDate] = useState(existing?.designatedDate ?? '')
  const [managementAuthority, setManagementAuthority] = useState(existing?.managementAuthority ?? '')
  const [boundary, setBoundary] = useState<import('geojson').FeatureCollection | null>(existing?.boundary ?? null)
  const [boundaryFileName, setBoundaryFileName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleBoundaryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const fc = parseGeoJSON(reader.result as string)
        setBoundary(fc)
        setBoundaryFileName(file.name)
        setError('')
      } catch {
        setError('Invalid GeoJSON boundary file.')
        setBoundary(null)
        setBoundaryFileName('')
      }
    }
    reader.readAsText(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await onSave({
        name: name.trim(),
        type,
        status,
        description: description.trim(),
        island: island.trim(),
        province,
        areaHa: areaHa ? parseFloat(areaHa) : null,
        designatedDate,
        managementAuthority: managementAuthority.trim(),
        boundary,
      })
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="data-portal">
      <div className="upload-panel" style={{ maxWidth: '720px' }}>
        <h3>{existing ? 'Edit Protected Area' : 'Add Protected Area'}</h3>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pa-name">Name *</label>
            <input
              id="pa-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nguna-Pele Marine Protected Area"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pa-type">Type</label>
              <select id="pa-type" value={type} onChange={(e) => setType(e.target.value as ProtectedAreaType)}>
                <option value="cca">CCA — Community Conservation Area</option>
                <option value="mpa">MPA — Marine Protected Area</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pa-status">Status</label>
              <select id="pa-status" value={status} onChange={(e) => setStatus(e.target.value as ProtectedAreaStatus)}>
                <option value="proposed">Proposed</option>
                <option value="designated">Designated</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="pa-desc">Description</label>
            <textarea
              id="pa-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the protected area"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pa-island">Island</label>
              <input
                id="pa-island"
                type="text"
                value={island}
                onChange={(e) => setIsland(e.target.value)}
                placeholder="e.g. Efate"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pa-province">Province</label>
              <select id="pa-province" value={province} onChange={(e) => setProvince(e.target.value)}>
                <option value="">Select province</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pa-area">Area (hectares)</label>
              <input
                id="pa-area"
                type="number"
                step="0.1"
                min="0"
                value={areaHa}
                onChange={(e) => setAreaHa(e.target.value)}
                placeholder="e.g. 1250"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pa-date">Designated Date</label>
              <input
                id="pa-date"
                type="date"
                value={designatedDate}
                onChange={(e) => setDesignatedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="pa-mgmt">Management Authority</label>
            <input
              id="pa-mgmt"
              type="text"
              value={managementAuthority}
              onChange={(e) => setManagementAuthority(e.target.value)}
              placeholder="e.g. DEPC / Community Council"
            />
          </div>

          <div className="form-group">
            <label htmlFor="pa-boundary">Boundary (GeoJSON)</label>
            <input
              id="pa-boundary"
              type="file"
              accept=".geojson,.json"
              onChange={handleBoundaryFile}
            />
            {boundaryFileName && (
              <span className="pa-boundary-file">Loaded: {boundaryFileName}</span>
            )}
            {existing?.boundary && !boundaryFileName && (
              <span className="pa-boundary-file">
                Existing boundary ({existing.boundary.features.length} feature{existing.boundary.features.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : existing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProtectedAreas
