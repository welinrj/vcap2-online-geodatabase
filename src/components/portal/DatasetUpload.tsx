import { useState, useRef, type FC, type DragEvent } from 'react'
import type { DatasetFormat } from '../../types/geospatial'
import { parseGeoJSON, parseCSV, parseKML, addDataset } from '../../services/datasetStore'

interface DatasetUploadProps {
  onUploaded: () => void
  onCancel: () => void
}

// Binary/non-parseable formats stored as raw attachments
type RawFormat = 'shapefile' | 'geopackage' | 'pdf' | 'png'

function detectFormat(filename: string): DatasetFormat | RawFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'geojson' || ext === 'json') return 'geojson'
  if (ext === 'csv') return 'csv'
  if (ext === 'kml') return 'kml'
  if (ext === 'shp' || ext === 'zip') return 'shapefile'
  if (ext === 'gpkg') return 'geopackage'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'tif' || ext === 'tiff') return 'png'
  return null
}

const RAW_FORMATS: string[] = ['shapefile', 'geopackage', 'pdf', 'png']

function isRawFormat(fmt: string | null): fmt is RawFormat {
  return fmt !== null && RAW_FORMATS.includes(fmt)
}

const DatasetUpload: FC<DatasetUploadProps> = ({ onUploaded, onCancel }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [latField, setLatField] = useState('latitude')
  const [lngField, setLngField] = useState('longitude')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const format = file ? detectFormat(file.name) : null

  function handleFile(f: File) {
    const detected = detectFormat(f.name)
    if (!detected) {
      setError('Unsupported file format. Supports GeoJSON, CSV, KML, Shapefile (.shp/.zip), GeoPackage (.gpkg), PDF, and images.')
      return
    }
    setFile(f)
    setError('')
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !format) return

    setLoading(true)
    setError('')

    try {
      if (isRawFormat(format)) {
        // Store raw files as a single-feature dataset with metadata
        const fc: import('geojson').FeatureCollection = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: {
              _rawFile: true,
              _fileName: file.name,
              _fileSize: file.size,
              _fileType: format,
              _mimeType: file.type,
            },
          }],
        }
        await addDataset(fc, { name, description, source }, 'geojson')
        onUploaded()
        return
      }

      const text = await file.text()
      let fc

      switch (format) {
        case 'geojson':
          fc = parseGeoJSON(text)
          break
        case 'csv':
          fc = parseCSV(text, latField, lngField)
          break
        case 'kml':
          fc = parseKML(text)
          break
      }

      await addDataset(fc, { name, description, source }, format)
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="upload-panel">
      <h3>Upload Dataset</h3>
      <form onSubmit={handleSubmit}>
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json,.csv,.kml,.shp,.zip,.gpkg,.pdf,.png,.jpg,.jpeg,.tif,.tiff"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            hidden
          />
          {file ? (
            <div className="drop-zone-file">
              <span className="badge badge-format">{format?.toUpperCase()}</span>
              <span>{file.name}</span>
            </div>
          ) : (
            <div className="drop-zone-prompt">
              <p>Drag & drop a file here, or click to browse</p>
              <p className="drop-zone-hint">GeoJSON, CSV, KML, Shapefile, GeoPackage, PDF, PNG</p>
            </div>
          )}
        </div>

        {format === 'csv' && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="lat-field">Latitude Column</label>
              <input
                id="lat-field"
                type="text"
                value={latField}
                onChange={(e) => setLatField(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lng-field">Longitude Column</label>
              <input
                id="lng-field"
                type="text"
                value={lngField}
                onChange={(e) => setLngField(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="ds-name">Name</label>
          <input
            id="ds-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dataset name"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="ds-desc">Description</label>
          <textarea
            id="ds-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the dataset"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label htmlFor="ds-source">Source</label>
          <input
            id="ds-source"
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Data source or provider"
          />
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!file || loading}
          >
            {loading ? 'Uploading...' : 'Upload Dataset'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default DatasetUpload
