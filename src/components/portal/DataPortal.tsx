import { useState, useCallback, useEffect, type FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import {
  listDatasets,
  getDataset,
  deleteDataset,
  updateDatasetMetadata,
  addDataset,
  migrateFromLocalStorage,
  onDatasetsChanged,
} from '../../services/datasetStore'
import {
  vanuatuSurveyPoints,
  vanuatuIslandBoundaries,
} from '../../data/sampleGeoData'
import DatasetList from './DatasetList'
import DatasetUpload from './DatasetUpload'
import DatasetDetail from './DatasetDetail'
import DatasetEditor from './DatasetEditor'
import type { GeoDataset, DatasetMetadata } from '../../types/geospatial'
import './DataPortal.css'

interface DataPortalProps {
  onNavigate?: (section: string) => void
}

type PortalView = 'list' | 'upload' | 'detail' | 'edit'

const DataPortal: FC<DataPortalProps> = ({ onNavigate }) => {
  const [view, setView] = useState<PortalView>('list')
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [activeDataset, setActiveDataset] = useState<GeoDataset | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await listDatasets()
    setDatasets(list)
  }, [])

  // Initial migration + real-time listener for cross-device sync
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    migrateFromLocalStorage()
      .then(() => {
        if (cancelled) return
        // Subscribe to real-time updates so changes from other devices appear instantly
        unsubscribe = onDatasetsChanged((list) => {
          if (!cancelled) setDatasets(list)
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  async function handleView(id: string) {
    const ds = await getDataset(id)
    if (ds) {
      setActiveDataset(ds)
      setView('detail')
    } else {
      setActiveDataset(null)
      setView('list')
    }
  }

  async function handleEdit(id: string) {
    const ds = await getDataset(id)
    if (ds) {
      setActiveDataset(ds)
      setView('edit')
    } else {
      setActiveDataset(null)
      setView('list')
    }
  }

  async function handleDelete(id: string) {
    const ds = datasets.find((d) => d.id === id)
    const confirmed = window.confirm(
      `Delete dataset "${ds?.metadata.name ?? id}"? This cannot be undone.`,
    )
    if (confirmed) {
      await deleteDataset(id)
      await refresh()
      if (activeDataset?.id === id) {
        setActiveDataset(null)
        setView('list')
      }
    }
  }

  async function handleSaveMetadata(updates: Partial<DatasetMetadata>) {
    if (!activeDataset) return
    const updated = await updateDatasetMetadata(activeDataset.id, updates)
    if (updated) {
      setActiveDataset(updated)
      await refresh()
      setView('detail')
    }
  }

  async function loadSampleData() {
    const existing = await listDatasets()
    if (existing.some((d) => d.metadata.name === 'VCAP2 Survey Points')) return

    await addDataset(
      vanuatuSurveyPoints,
      {
        name: 'VCAP2 Survey Points',
        description: 'Marine survey observation points across Vanuatu islands',
        source: 'DEPC Field Survey 2026',
        tags: ['vcap2', 'marine', 'survey', 'vanuatu'],
      },
      'geojson',
    )
    await addDataset(
      vanuatuIslandBoundaries,
      {
        name: 'Island Survey Boundaries',
        description: 'Survey area boundaries for major Vanuatu islands',
        source: 'National GIS Office',
        tags: ['boundaries', 'islands', 'survey-areas'],
      },
      'geojson',
    )
    await refresh()
  }

  if (loading) {
    return (
      <div className="data-portal">
        <div className="portal-toolbar">
          <div className="portal-toolbar-left">
            <h2>GIS Data Portal</h2>
            <span className="dataset-count">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="data-portal">
      {view === 'list' && (
        <>
          <div className="portal-toolbar">
            <div className="portal-toolbar-left">
              <h2>GIS Data Portal</h2>
              <span className="dataset-count">
                {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="portal-toolbar-right">
              {datasets.length === 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={loadSampleData}
                >
                  Load Sample Data
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => setView('upload')}
              >
                Upload Dataset
              </button>
            </div>
          </div>
          {datasets.length > 0 && onNavigate && (
            <div className="db-import-status" style={{ marginBottom: '1rem' }}>
              All datasets are stored in the GIS Database.
              <button
                className="btn btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => onNavigate('gis-database')}
              >
                Open GIS Database
              </button>
            </div>
          )}
          <DatasetList
            datasets={datasets}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </>
      )}

      {view === 'upload' && (
        <DatasetUpload
          onUploaded={async () => {
            await refresh()
            setView('list')
          }}
          onCancel={() => setView('list')}
        />
      )}

      {view === 'detail' && activeDataset && (
        <DatasetDetail
          dataset={activeDataset}
          onBack={() => {
            setActiveDataset(null)
            setView('list')
          }}
          onEdit={() => setView('edit')}
          onDelete={() => handleDelete(activeDataset.id)}
        />
      )}

      {view === 'edit' && activeDataset && (
        <DatasetEditor
          metadata={activeDataset.metadata}
          onSave={handleSaveMetadata}
          onCancel={() => setView(activeDataset ? 'detail' : 'list')}
        />
      )}
    </div>
  )
}

export default DataPortal
