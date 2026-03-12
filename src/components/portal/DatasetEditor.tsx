import { useState, type FC } from 'react'
import type { DatasetMetadata, DatasetStatus } from '../../types/geospatial'

interface DatasetEditorProps {
  metadata: DatasetMetadata
  onSave: (updates: Partial<DatasetMetadata>) => void
  onCancel: () => void
}

const statusOptions: DatasetStatus[] = ['active', 'archived', 'draft']

const DatasetEditor: FC<DatasetEditorProps> = ({
  metadata,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(metadata.name)
  const [description, setDescription] = useState(metadata.description)
  const [source, setSource] = useState(metadata.source)
  const [license, setLicense] = useState(metadata.license)
  const [status, setStatus] = useState<DatasetStatus>(metadata.status)
  const [crs, setCrs] = useState(metadata.crs)
  const [tagsInput, setTagsInput] = useState(metadata.tags.join(', '))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    onSave({ name, description, source, license, status, crs, tags })
  }

  return (
    <div className="editor-panel">
      <h3>Edit Dataset Metadata</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="edit-name">Name</label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-desc">Description</label>
          <textarea
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-source">Source</label>
            <input
              id="edit-source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-license">License</label>
            <input
              id="edit-license"
              type="text"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="e.g. CC-BY-4.0"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-status">Status</label>
            <select
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DatasetStatus)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="edit-crs">CRS</label>
            <input
              id="edit-crs"
              type="text"
              value={crs}
              onChange={(e) => setCrs(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="edit-tags">Tags (comma-separated)</label>
          <input
            id="edit-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="vcap2, marine, vanuatu, survey"
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}

export default DatasetEditor
