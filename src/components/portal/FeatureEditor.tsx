import { useEffect, useRef, useState, useCallback, type FC } from 'react'
import L from 'leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeoDataset } from '../../types/geospatial'
import { updateDatasetFeatures } from '../../services/datasetStore'
import 'leaflet/dist/leaflet.css'
import './FeatureEditor.css'

interface Props {
  dataset: GeoDataset
  onClose: () => void
  onSaved: () => void
}

const STYLE_DEFAULT = { color: '#2D5E5A', weight: 2, fillColor: '#3E7A75', fillOpacity: 0.3 }
const STYLE_SELECTED = { color: '#963A2E', weight: 3, fillColor: '#B34839', fillOpacity: 0.5 }
const DEFAULT_CENTER: [number, number] = [-17.7333, 168.3273]

const FeatureEditor: FC<Props> = ({ dataset, onClose, onSaved }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)

  const [features, setFeatures] = useState<Feature[]>(() => dataset.data.features)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [editProps, setEditProps] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [addMode, setAddMode] = useState<'none' | 'point' | 'manual'>('none')
  const [manualType, setManualType] = useState<'Point' | 'LineString' | 'Polygon'>('Point')
  const [manualCoords, setManualCoords] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')

  const allPropKeys = dataset.properties

  const selectFeature = useCallback((idx: number, feature: Feature) => {
    setSelectedIdx(idx)
    setEditProps(
      Object.fromEntries(
        Object.entries(feature.properties ?? {}).map(([k, v]) => [k, String(v ?? '')]),
      ),
    )
    setAddMode('none')
  }, [])

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current) return
    const map = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, 7)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Rebuild geoJSON layer whenever features or selection changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geoLayerRef.current) map.removeLayer(geoLayerRef.current)

    // Tag each feature with its array index so click handlers can find it
    const taggedFeatures = features.map((f, i) => ({ ...f, _fe_idx: i }))
    const fc: FeatureCollection = { type: 'FeatureCollection', features: taggedFeatures }

    const layer = L.geoJSON(fc, {
      style: (f) => {
        const idx = (f as { _fe_idx?: number })._fe_idx ?? -1
        return idx === selectedIdx ? STYLE_SELECTED : STYLE_DEFAULT
      },
      pointToLayer: (f, latlng) => {
        const idx = (f as { _fe_idx?: number })._fe_idx ?? -1
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: idx === selectedIdx ? '#B34839' : '#2D5E5A',
          color: '#fff',
          weight: 2,
          fillOpacity: idx === selectedIdx ? 0.9 : 0.85,
        })
      },
      onEachFeature: (f, l) => {
        const idx = (f as { _fe_idx?: number })._fe_idx ?? -1
        l.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          selectFeature(idx, features[idx])
        })
      },
    }).addTo(map)

    geoLayerRef.current = layer

    // Fit bounds on initial load only
    if (selectedIdx === null && features.length > 0) {
      const bounds = layer.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [features, selectedIdx, selectFeature])

  // Map click → place new point (when in point-add mode)
  useEffect(() => {
    const map = mapRef.current
    if (!map || addMode !== 'point') return

    const onMapClick = (e: L.LeafletMouseEvent) => {
      const newFeature: Feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] },
        properties: Object.fromEntries(allPropKeys.map((k) => [k, ''])),
      }
      setFeatures((prev) => {
        const next = [...prev, newFeature]
        // Select the newly placed feature
        selectFeature(next.length - 1, newFeature)
        return next
      })
      setDirty(true)
      setAddMode('none')
    }

    map.on('click', onMapClick)
    map.getContainer().style.cursor = 'crosshair'
    return () => {
      map.off('click', onMapClick)
      map.getContainer().style.cursor = ''
    }
  }, [addMode, allPropKeys, selectFeature])

  function handleDeleteFeature(idx: number) {
    setFeatures((prev) => prev.filter((_, i) => i !== idx))
    if (selectedIdx === idx) {
      setSelectedIdx(null)
      setEditProps({})
    } else if (selectedIdx !== null && selectedIdx > idx) {
      setSelectedIdx(selectedIdx - 1)
    }
    setDirty(true)
  }

  function handleApplyProps() {
    if (selectedIdx === null) return
    setFeatures((prev) =>
      prev.map((f, i) => (i === selectedIdx ? { ...f, properties: { ...editProps } } : f)),
    )
    setDirty(true)
    setStatus('Properties applied.')
    setTimeout(() => setStatus(''), 2000)
  }

  function handleAddManual() {
    try {
      let geometry: Geometry

      if (manualType === 'Point') {
        const parts = manualCoords.split(',').map((s) => parseFloat(s.trim()))
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          throw new Error('Enter: latitude, longitude')
        }
        geometry = { type: 'Point', coordinates: [parts[1], parts[0]] }
      } else {
        const pairs = manualCoords
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const p = line.split(',').map((s) => parseFloat(s.trim()))
            if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) throw new Error('Each line: lat, lng')
            return [p[1], p[0]]
          })
        geometry =
          manualType === 'LineString'
            ? { type: 'LineString', coordinates: pairs }
            : { type: 'Polygon', coordinates: [pairs] }
      }

      const newFeature: Feature = {
        type: 'Feature',
        geometry,
        properties: Object.fromEntries(allPropKeys.map((k) => [k, ''])),
      }

      setFeatures((prev) => {
        const next = [...prev, newFeature]
        selectFeature(next.length - 1, newFeature)
        return next
      })
      setManualCoords('')
      setAddMode('none')
      setDirty(true)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Invalid coordinates')
    }
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const fc: FeatureCollection = { type: 'FeatureCollection', features }
      await updateDatasetFeatures(dataset.id, fc)
      setDirty(false)
      setStatus('Saved.')
      setTimeout(() => {
        setStatus('')
        onSaved()
      }, 1200)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (dirty && !window.confirm('Unsaved changes will be lost. Close anyway?')) return
    onClose()
  }

  function featureLabel(f: Feature, idx: number): string {
    const first = Object.values(f.properties ?? {}).find(
      (v) => v != null && String(v).trim() !== '',
    )
    return first ? String(first).slice(0, 36) : `Feature ${idx + 1}`
  }

  return (
    <div className="fe-overlay">
      {/* ── Header ── */}
      <div className="fe-header">
        <div className="fe-header-left">
          <h2 className="fe-title">Edit Features: {dataset.metadata.name}</h2>
          <span className="fe-count">{features.length} features</span>
          {dirty && <span className="fe-dirty">Unsaved changes</span>}
        </div>
        <div className="fe-header-right">
          {status && <span className="fe-status">{status}</span>}
          <button
            className="btn btn-primary"
            onClick={handleSaveAll}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save All Changes'}
          </button>
          <button className="btn btn-secondary" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="fe-body">
        {/* Left: feature list */}
        <div className="fe-sidebar">
          <div className="fe-sidebar-head">
            <span>Features</span>
            <div className="fe-add-btns">
              <button
                className={`btn btn-sm ${addMode === 'point' ? 'fe-btn-active' : 'btn-secondary'}`}
                onClick={() => setAddMode(addMode === 'point' ? 'none' : 'point')}
                title="Click on map to place a point"
              >
                + Point
              </button>
              <button
                className={`btn btn-sm ${addMode === 'manual' ? 'fe-btn-active' : 'btn-secondary'}`}
                onClick={() => setAddMode(addMode === 'manual' ? 'none' : 'manual')}
                title="Enter coordinates manually"
              >
                + Manual
              </button>
            </div>
          </div>

          {addMode === 'point' && (
            <div className="fe-hint">Click anywhere on the map to place a new point.</div>
          )}

          {addMode === 'manual' && (
            <div className="fe-manual">
              <label>Type</label>
              <select
                value={manualType}
                onChange={(e) =>
                  setManualType(e.target.value as 'Point' | 'LineString' | 'Polygon')
                }
              >
                <option value="Point">Point</option>
                <option value="LineString">LineString</option>
                <option value="Polygon">Polygon</option>
              </select>
              <label>
                {manualType === 'Point'
                  ? 'Latitude, Longitude'
                  : 'Vertices — one "lat, lng" per line'}
              </label>
              <textarea
                rows={manualType === 'Point' ? 1 : 4}
                value={manualCoords}
                onChange={(e) => setManualCoords(e.target.value)}
                placeholder={
                  manualType === 'Point'
                    ? '-17.73, 168.32'
                    : '-17.73, 168.32\n-17.80, 168.40\n-17.73, 168.32'
                }
              />
              <button className="btn btn-sm btn-primary" onClick={handleAddManual}>
                Add Feature
              </button>
            </div>
          )}

          <div className="fe-list">
            {features.length === 0 && (
              <div className="fe-empty">No features. Add one above.</div>
            )}
            {features.map((f, idx) => (
              <div
                key={`${idx}-${f.geometry?.type}-${JSON.stringify(f.geometry && 'coordinates' in f.geometry ? (f.geometry.coordinates as number[])[0] : idx)}`}
                className={`fe-item ${selectedIdx === idx ? 'fe-item-selected' : ''}`}
                onClick={() => selectFeature(idx, f)}
              >
                <span className="fe-geom-badge">
                  {f.geometry?.type === 'Point'
                    ? 'Pt'
                    : f.geometry?.type === 'LineString'
                      ? 'Ln'
                      : f.geometry?.type === 'Polygon'
                        ? 'Pg'
                        : '?'}
                </span>
                <span className="fe-label">{featureLabel(f, idx)}</span>
                <button
                  className="fe-del"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFeature(idx)
                  }}
                  title="Delete feature"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center: map */}
        <div className="fe-map-wrap">
          <div ref={mapContainerRef} className="fe-map" />
        </div>

        {/* Right: property editor */}
        {selectedIdx !== null && features[selectedIdx] && (
          <div className="fe-props">
            <div className="fe-props-head">
              <strong>Feature {selectedIdx + 1}</strong>
              <span className="fe-geom-type">{features[selectedIdx].geometry?.type}</span>
            </div>

            <div className="fe-fields">
              {Object.entries(editProps).map(([key, value]) => (
                <div key={key} className="fe-field">
                  <label className="fe-field-key">{key}</label>
                  <input
                    className="fe-field-val"
                    value={value}
                    onChange={(e) =>
                      setEditProps((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}

              {/* Add new property */}
              <div className="fe-new-prop">
                <input
                  className="fe-field-newkey"
                  placeholder="New key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                  className="fe-field-newval"
                  placeholder="Value"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={!newKey.trim()}
                  onClick={() => {
                    if (!newKey.trim()) return
                    setEditProps((prev) => ({ ...prev, [newKey.trim()]: newVal }))
                    setNewKey('')
                    setNewVal('')
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <button className="btn btn-primary fe-apply-btn" onClick={handleApplyProps}>
              Apply Property Changes
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default FeatureEditor
