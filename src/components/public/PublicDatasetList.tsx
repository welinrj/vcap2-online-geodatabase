import type { FC } from 'react'
import type { DatasetSummary } from '../../types/geospatial'
import { formatBytes } from '../../services/datasetStore'

interface PublicDatasetListProps {
  datasets: DatasetSummary[]
  onView: (id: string) => void
}

const PublicDatasetList: FC<PublicDatasetListProps> = ({ datasets, onView }) => {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Format</th>
            <th>Features</th>
            <th>Size</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((ds) => (
            <tr key={ds.id}>
              <td>
                <button className="link-button" onClick={() => onView(ds.id)}>
                  {ds.metadata.name}
                </button>
                {ds.metadata.description && (
                  <span className="dataset-description">
                    {ds.metadata.description}
                  </span>
                )}
              </td>
              <td>
                <span className="badge badge-format">
                  {ds.format.toUpperCase()}
                </span>
              </td>
              <td>{ds.featureCount.toLocaleString()}</td>
              <td>{formatBytes(ds.sizeBytes)}</td>
              <td>{new Date(ds.updatedAt).toLocaleDateString()}</td>
              <td>
                <div className="action-buttons">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onView(ds.id)}
                    title="View dataset on map"
                  >
                    View on Map
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

export default PublicDatasetList
