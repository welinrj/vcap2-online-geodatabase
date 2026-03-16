import { useState, useEffect, type FC } from 'react'
import type { DatasetSummary, PortalCategory } from '../../types/geospatial'
import { PRODOC_CATEGORIES } from '../../types/geospatial'
import { formatBytes } from '../../services/datasetStore'
import { listCategories } from '../../services/portalCategoryStore'

interface DatasetListProps {
  datasets: DatasetSummary[]
  onView: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const statusBadgeClass: Record<string, string> = {
  active: 'badge badge-active',
  archived: 'badge badge-archived',
  draft: 'badge badge-draft',
}

const DatasetList: FC<DatasetListProps> = ({
  datasets,
  onView,
  onEdit,
  onDelete,
}) => {
  const [portalCategories, setPortalCategories] = useState<PortalCategory[]>([])

  useEffect(() => {
    listCategories().then(setPortalCategories).catch(() => {})
  }, [])
  if (datasets.length === 0) {
    return (
      <div className="portal-empty">
        <p>No datasets yet. Upload a GeoJSON, CSV, or KML file to get started.</p>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Format</th>
            <th>Features</th>
            <th>Size</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((ds) => (
            <tr key={ds.id}>
              <td>
                <button
                  className="link-button"
                  onClick={() => onView(ds.id)}
                >
                  {ds.metadata.name}
                </button>
                {ds.metadata.description && (
                  <span className="dataset-description">
                    {ds.metadata.description}
                  </span>
                )}
              </td>
              <td>
                {(() => {
                  const pCat = ds.metadata.portalCategory
                    ? portalCategories.find((c) => c.id === ds.metadata.portalCategory)
                    : null
                  return (
                    <>
                      {ds.metadata.category ? (
                        <span className={`badge badge-category badge-category-${ds.metadata.category.startsWith('1') ? 'terrestrial' : 'marine'}`}>
                          {PRODOC_CATEGORIES.find((c) => c.id === ds.metadata.category)?.label ?? ds.metadata.category}
                        </span>
                      ) : null}
                      {pCat ? (
                        <span className="badge" style={{ background: pCat.color, color: '#fff', marginLeft: ds.metadata.category ? 4 : 0 }}>
                          {pCat.name}
                        </span>
                      ) : null}
                      {!ds.metadata.category && !pCat && <span className="text-muted">—</span>}
                    </>
                  )
                })()}
              </td>
              <td>
                <span className="badge badge-format">
                  {ds.format.toUpperCase()}
                </span>
              </td>
              <td>{ds.featureCount.toLocaleString()}</td>
              <td>{formatBytes(ds.sizeBytes)}</td>
              <td>
                <span className={statusBadgeClass[ds.metadata.status] ?? 'badge'}>
                  {ds.metadata.status}
                </span>
              </td>
              <td>{new Date(ds.updatedAt).toLocaleDateString()}</td>
              <td>
                <div className="action-buttons">
                  <button
                    className="btn btn-sm"
                    onClick={() => onView(ds.id)}
                    title="View dataset"
                  >
                    View
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => onEdit(ds.id)}
                    title="Edit metadata"
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => onDelete(ds.id)}
                    title="Delete dataset"
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
  )
}

export default DatasetList
