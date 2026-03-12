import { useState, useCallback, useEffect, type FC } from 'react'
import type { DatasetSummary, GeoDataset } from '../../types/geospatial'
import { getDataset, migrateFromLocalStorage, onDatasetsChanged } from '../../services/datasetStore'
import PublicDatasetList from './PublicDatasetList'
import PublicDatasetDetail from './PublicDatasetDetail'
import './PublicPortal.css'

type PortalView = 'list' | 'detail'

const PublicDataPortal: FC = () => {
  const [view, setView] = useState<PortalView>('list')
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [activeDataset, setActiveDataset] = useState<GeoDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Real-time listener for cross-device sync
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    migrateFromLocalStorage()
      .then(() => {
        if (cancelled) return
        unsubscribe = onDatasetsChanged((all) => {
          if (!cancelled) setDatasets(all.filter((ds) => ds.metadata.status === 'active'))
        })
      })
      .catch(() => { if (!cancelled) setError('Unable to load datasets. Please try refreshing the page.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const handleView = useCallback(async (id: string) => {
    const ds = await getDataset(id)
    if (ds) {
      setActiveDataset(ds)
      setView('detail')
    }
  }, [])

  if (loading) {
    return (
      <div className="data-portal">
        <div className="portal-toolbar">
          <div className="portal-toolbar-left">
            <h2>Published Datasets</h2>
            <span className="dataset-count">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="data-portal">
      {error && (
        <div className="form-error" role="alert">{error}</div>
      )}
      {view === 'list' && (
        <>
          <div className="portal-toolbar">
            <div className="portal-toolbar-left">
              <h2>Published Datasets</h2>
              <span className="dataset-count">
                {datasets.length} dataset{datasets.length !== 1 ? 's' : ''} available
              </span>
            </div>
            <div className="portal-toolbar-right">
              <span className="public-read-only-badge">Read-Only</span>
            </div>
          </div>
          {datasets.length === 0 && !error ? (
            <div className="portal-empty">
              <p>No published datasets available yet.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Datasets will appear here once they are published by DEPC staff.
              </p>
            </div>
          ) : (
            <PublicDatasetList datasets={datasets} onView={handleView} />
          )}
        </>
      )}

      {view === 'detail' && activeDataset && (
        <PublicDatasetDetail
          dataset={activeDataset}
          onBack={() => {
            setActiveDataset(null)
            setView('list')
          }}
        />
      )}
    </div>
  )
}

export default PublicDataPortal
