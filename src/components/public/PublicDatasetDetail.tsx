import type { FC } from 'react'
import type { GeoDataset } from '../../types/geospatial'
import { formatBytes } from '../../services/datasetStore'
import MapViewer from '../portal/MapViewer'
import AttributeTable from '../portal/AttributeTable'

interface PublicDatasetDetailProps {
  dataset: GeoDataset
  onBack: () => void
}

const PublicDatasetDetail: FC<PublicDatasetDetailProps> = ({ dataset, onBack }) => {
  const { metadata, data, properties } = dataset

  function handleExport() {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${metadata.name.replace(/\s+/g, '_')}.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dataset-detail">
      <div className="detail-header">
        <button className="btn btn-sm" onClick={onBack}>
          &larr; Back to Datasets
        </button>
        <div className="detail-actions">
          <button className="btn btn-sm btn-primary" onClick={handleExport}>
            Download GeoJSON
          </button>
        </div>
      </div>

      <div className="detail-meta-card">
        <div className="detail-title-row">
          <h2>{metadata.name}</h2>
          <span className="badge badge-active">Published</span>
        </div>
        {metadata.description && (
          <p className="detail-description">{metadata.description}</p>
        )}
        <div className="detail-stats">
          <div className="detail-stat">
            <span className="detail-stat-label">Format</span>
            <span className="detail-stat-value">
              {dataset.format.toUpperCase()}
            </span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Features</span>
            <span className="detail-stat-value">
              {dataset.featureCount.toLocaleString()}
            </span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">Size</span>
            <span className="detail-stat-value">
              {formatBytes(dataset.sizeBytes)}
            </span>
          </div>
          <div className="detail-stat">
            <span className="detail-stat-label">CRS</span>
            <span className="detail-stat-value">{metadata.crs}</span>
          </div>
          {metadata.source && (
            <div className="detail-stat">
              <span className="detail-stat-label">Source</span>
              <span className="detail-stat-value">{metadata.source}</span>
            </div>
          )}
          {metadata.license && (
            <div className="detail-stat">
              <span className="detail-stat-label">License</span>
              <span className="detail-stat-value">{metadata.license}</span>
            </div>
          )}
        </div>
        {metadata.tags.length > 0 && (
          <div className="detail-tags">
            {metadata.tags.map((tag) => (
              <span key={tag} className="badge badge-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        {dataset.bbox && (
          <div className="detail-bbox">
            <span className="detail-stat-label">Bounding Box</span>
            <code>
              [{dataset.bbox.map((v) => v.toFixed(4)).join(', ')}]
            </code>
          </div>
        )}
      </div>

      <div className="detail-map">
        <h3>Map Preview</h3>
        <MapViewer data={data} height="450px" />
      </div>

      <AttributeTable data={data} properties={properties} />
    </div>
  )
}

export default PublicDatasetDetail
