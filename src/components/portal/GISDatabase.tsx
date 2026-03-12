import { useState, useCallback, useEffect, useRef, type FC } from 'react'
import type { DatasetSummary, GeoDataset } from '../../types/geospatial'
import {
  listDatasets,
  getDataset,
  deleteDataset,
  exportAllDatasets,
  importDatasets,
  getStorageEstimate,
  formatBytes,
  migrateFromLocalStorage,
  onDatasetsChanged,
} from '../../services/datasetStore'
import {
  syncDatasets,
  getSyncSettings,
  getSyncState,
  deleteRemoteDataset,
} from '../../services/githubSync'
import DatasetUpload from './DatasetUpload'
import FeatureEditor from './FeatureEditor'
import MapViewer from './MapViewer'
import './DataPortal.css'
import './GISDatabase.css'

interface GISDatabaseProps {
  onNavigate?: (section: string) => void
}

type DbView = 'browse' | 'upload' | 'edit-features'

const GISDatabase: FC<GISDatabaseProps> = ({ onNavigate }) => {
  const [view, setView] = useState<DbView>('browse')
  const [editingDataset, setEditingDataset] = useState<GeoDataset | null>(null)
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [storageUsed, setStorageUsed] = useState<number | null>(null)
  const [storageQuota, setStorageQuota] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<GeoDataset | null>(null)
  const [importStatus, setImportStatus] = useState('')
  const backupInputRef = useRef<HTMLInputElement>(null)

  // GitHub sync state
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)

  // Load sync state on mount
  useEffect(() => {
    const state = getSyncState()
    setLastSync(state.lastSync)
  }, [])

  const refresh = useCallback(async () => {
    const list = await listDatasets()
    setDatasets(list)
    const est = await getStorageEstimate()
    if (est) {
      setStorageUsed(est.used)
      setStorageQuota(est.quota)
    }
  }, [])

  // Auto-sync on mount: migrate, pull from GitHub, then subscribe to real-time updates
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function initialLoad() {
      await migrateFromLocalStorage()
      try {
        const config = getSyncSettings()
        const result = await syncDatasets(config)
        if (!cancelled && (result.pulled > 0 || result.pushed > 0)) {
          setLastSync(new Date().toISOString())
        }
      } catch {
        // silent — manual sync still available
      }
      if (!cancelled) {
        // Subscribe to real-time updates for cross-device sync
        unsubscribe = onDatasetsChanged((list) => {
          if (!cancelled) setDatasets(list)
        })
        setLoading(false)
      }
    }
    initialLoad()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const totalFeatures = datasets.reduce((sum, d) => sum + d.featureCount, 0)
  const totalSize = datasets.reduce((sum, d) => sum + d.sizeBytes, 0)

  async function handlePreview(id: string) {
    if (selectedId === id) {
      setSelectedId(null)
      setPreview(null)
      return
    }
    setSelectedId(id)
    const ds = await getDataset(id)
    setPreview(ds)
  }

  async function handleEditFeatures(id: string) {
    const ds = await getDataset(id)
    if (ds) {
      setEditingDataset(ds)
      setView('edit-features')
    }
  }

  // Fire-and-forget push to GitHub after local mutation
  function backgroundSync() {
    const config = getSyncSettings()
    if (!config.token) return
    syncDatasets(config)
      .then((r) => {
        if (r.pushed > 0 || r.pulled > 0) setLastSync(new Date().toISOString())
      })
      .catch(() => { /* silent — manual sync still available */ })
  }

  async function handleDelete(id: string) {
    const ds = datasets.find((d) => d.id === id)
    if (!window.confirm(`Delete "${ds?.metadata.name}"? This cannot be undone.`)) return
    await deleteDataset(id)
    // Also delete from GitHub
    const config = getSyncSettings()
    if (config.token) {
      deleteRemoteDataset(id, config).catch(() => { /* silent */ })
    }
    if (selectedId === id) {
      setSelectedId(null)
      setPreview(null)
    }
    await refresh()
  }

  async function handleExportAll() {
    const all = await exportAllDatasets()
    const json = JSON.stringify(all, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vcap2-gis-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportStatus('Importing...')
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      let toImport: GeoDataset[]
      if (Array.isArray(data)) {
        toImport = data
      } else if (data.type === 'FeatureCollection' || data.type === 'Feature' || data.coordinates) {
        setImportStatus('This is a GIS file — use the "Upload Dataset" button to add it to the database.')
        return
      } else {
        setImportStatus('Invalid backup file format.')
        return
      }

      const result = await importDatasets(toImport)
      await refresh()
      setImportStatus(
        `Imported ${result.imported} dataset${result.imported !== 1 ? 's' : ''}` +
        (result.skipped > 0 ? `, ${result.skipped} already existed` : ''),
      )
    } catch {
      setImportStatus('Failed to import — invalid file format.')
    }

    if (backupInputRef.current) backupInputRef.current.value = ''
  }

  async function handleExportOne(id: string) {
    const ds = await getDataset(id)
    if (!ds) return
    const json = JSON.stringify(ds.data, null, 2)
    const blob = new Blob([json], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ds.metadata.name.replace(/\s+/g, '_')}.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSync() {
    const config = getSyncSettings()

    setSyncing(true)
    setSyncStatus('Syncing with GitHub...')

    try {
      const result = await syncDatasets(config)
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

  if (loading) {
    return (
      <div className="data-portal">
        <div className="portal-toolbar">
          <div className="portal-toolbar-left">
            <h2>GIS Database</h2>
            <span className="dataset-count">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'upload') {
    return (
      <div className="data-portal">
        <DatasetUpload
          onUploaded={async () => {
            backgroundSync()
            await refresh()
            setView('browse')
            setImportStatus('Dataset uploaded and stored to database.')
          }}
          onCancel={() => setView('browse')}
        />
      </div>
    )
  }

  if (view === 'edit-features' && editingDataset) {
    return (
      <FeatureEditor
        dataset={editingDataset}
        onClose={() => {
          setView('browse')
          setEditingDataset(null)
        }}
        onSaved={async () => {
          backgroundSync()
          await refresh()
          setView('browse')
          setEditingDataset(null)
          setImportStatus('Features saved.')
        }}
      />
    )
  }

  return (
    <div className="data-portal">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>GIS Database</h2>
          <span className="dataset-count">
            {datasets.length} dataset{datasets.length !== 1 ? 's' : ''} stored
          </span>
        </div>
        <div className="portal-toolbar-right">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            hidden
          />
          <button
            className="btn btn-secondary"
            onClick={() => backupInputRef.current?.click()}
          >
            Restore Backup
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportAll}
            disabled={datasets.length === 0}
          >
            Export Backup
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setView('upload')}
          >
            Upload Dataset
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="db-import-status" role="status">
          {importStatus}
          <button className="db-dismiss" onClick={() => setImportStatus('')} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}

      {/* Storage stats */}
      <div className="db-stats-grid">
        <div className="db-stat-card">
          <span className="db-stat-value">{datasets.length}</span>
          <span className="db-stat-label">Datasets</span>
        </div>
        <div className="db-stat-card">
          <span className="db-stat-value">{totalFeatures.toLocaleString()}</span>
          <span className="db-stat-label">Total Features</span>
        </div>
        <div className="db-stat-card">
          <span className="db-stat-value">{formatBytes(totalSize)}</span>
          <span className="db-stat-label">Data Size</span>
        </div>
        <div className="db-stat-card">
          <span className="db-stat-value">
            {storageQuota ? formatBytes(storageQuota - (storageUsed ?? 0)) : 'N/A'}
          </span>
          <span className="db-stat-label">Storage Available</span>
        </div>
      </div>

      {storageUsed != null && storageQuota != null && storageQuota > 0 && (
        <div className="db-storage-bar-container">
          <div className="db-storage-bar">
            <div
              className="db-storage-bar-fill"
              style={{ width: `${Math.min((storageUsed / storageQuota) * 100, 100)}%` }}
            />
          </div>
          <span className="db-storage-text">
            {formatBytes(storageUsed)} of {formatBytes(storageQuota)} used
          </span>
        </div>
      )}

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

      {/* Dataset table */}
      {datasets.length === 0 ? (
        <div className="portal-empty">
          <p>No datasets in the database yet.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Click <strong>Upload Dataset</strong> to add GIS files (GeoJSON, CSV, KML), or use <strong>Restore Backup</strong> to import a previous export.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => setView('upload')}
            >
              Upload Your First Dataset
            </button>
            {onNavigate && (
              <button
                className="btn btn-secondary"
                onClick={() => onNavigate('data-portal')}
              >
                Go to Data Portal
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Format</th>
                <th>Features</th>
                <th>Size</th>
                <th>Status</th>
                <th>Stored</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => (
                <tr key={ds.id} className={selectedId === ds.id ? 'db-row-selected' : ''}>
                  <td>
                    <button className="link-button" onClick={() => handlePreview(ds.id)}>
                      {ds.metadata.name}
                    </button>
                    {ds.metadata.description && (
                      <span className="dataset-description">{ds.metadata.description}</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-format">{ds.format.toUpperCase()}</span>
                  </td>
                  <td>{ds.featureCount.toLocaleString()}</td>
                  <td>{formatBytes(ds.sizeBytes)}</td>
                  <td>
                    <span className={`badge badge-${ds.metadata.status}`}>
                      {ds.metadata.status}
                    </span>
                  </td>
                  <td>{new Date(ds.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleEditFeatures(ds.id)}
                        title="Edit features"
                      >
                        Edit Features
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleExportOne(ds.id)}
                        title="Download as GeoJSON"
                      >
                        Download
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(ds.id)}
                        title="Delete from database"
                      >
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

      {/* Map preview */}
      {preview && (
        <div className="db-preview">
          <div className="db-preview-header">
            <h3>Preview: {preview.metadata.name}</h3>
            <button className="btn btn-sm" onClick={() => { setSelectedId(null); setPreview(null) }}>
              Close
            </button>
          </div>
          <div className="db-preview-meta">
            <span>{preview.featureCount} features</span>
            <span>{preview.format.toUpperCase()}</span>
            <span>{formatBytes(preview.sizeBytes)}</span>
            {preview.bbox && (
              <span>
                Bbox: [{preview.bbox.map((v) => v.toFixed(2)).join(', ')}]
              </span>
            )}
          </div>
          <MapViewer data={preview.data} height="350px" />
        </div>
      )}
    </div>
  )
}

export default GISDatabase
