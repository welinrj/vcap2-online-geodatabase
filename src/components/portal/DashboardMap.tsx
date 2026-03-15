import { useEffect, useRef, useState, type FC } from 'react'
import L from 'leaflet'
import type { ProtectedArea } from '../../types/protectedArea'
import type { DatasetSummary } from '../../types/geospatial'
import { exportAllAreas } from '../../services/protectedAreaStore'
import { listDatasets, getDataset } from '../../services/datasetStore'
import 'leaflet/dist/leaflet.css'

const VANUATU_CENTER: [number, number] = [-16.5, 168.0]
const DEFAULT_ZOOM = 7

const CCA_STYLE: L.PathOptions = {
  color: '#16a34a',
  weight: 2,
  fillColor: '#22c55e',
  fillOpacity: 0.25,
}

const MPA_STYLE: L.PathOptions = {
  color: '#2563eb',
  weight: 2,
  fillColor: '#3b82f6',
  fillOpacity: 0.2,
}

/** Palette for user-uploaded dataset layers */
const DATASET_COLORS = [
  '#f97316', // orange
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#eab308', // yellow
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
]

const DashboardMap: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [areasLoaded, setAreasLoaded] = useState(false)
  const [ccaCount, setCcaCount] = useState(0)
  const [mpaCount, setMpaCount] = useState(0)
  const [datasetLayers, setDatasetLayers] = useState<
    { name: string; color: string; count: number }[]
  >([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView(VANUATU_CENTER, DEFAULT_ZOOM)
    mapRef.current = map

    L.control.zoom({ position: 'topright' }).addTo(map)

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
    )

    const streetMap = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
    )

    const topographic = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17 },
    )

    satellite.addTo(map)

    L.control
      .layers(
        { Satellite: satellite, 'Street Map': streetMap, Topographic: topographic },
        undefined,
        { position: 'topright' },
      )
      .addTo(map)

    // Load protected areas with boundaries
    exportAllAreas().then((areas: ProtectedArea[]) => {
      let ccas = 0
      let mpas = 0

      areas.forEach((area) => {
        if (!area.boundary) return

        const style = area.type === 'cca' ? CCA_STYLE : MPA_STYLE
        if (area.type === 'cca') ccas++
        else mpas++

        L.geoJSON(area.boundary, {
          style: () => style,
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
              radius: 6,
              ...style,
              fillOpacity: 0.7,
            }),
          onEachFeature: (_feature, layer) => {
            const statusColors: Record<string, string> = {
              active: '#22c55e',
              designated: '#a855f7',
              proposed: '#f59e0b',
              inactive: '#6b7280',
            }
            const statusColor = statusColors[area.status] ?? '#6b7280'
            layer.bindPopup(
              `<div style="font-family:system-ui;font-size:13px;min-width:160px">
                <div style="font-weight:700;margin-bottom:4px">${area.name}</div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                  <span style="background:${area.type === 'cca' ? '#dcfce7' : '#dbeafe'};color:${area.type === 'cca' ? '#16a34a' : '#2563eb'};font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;text-transform:uppercase">${area.type}</span>
                  <span style="background:${statusColor}22;color:${statusColor};font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px">${area.status}</span>
                </div>
                ${area.province ? `<div style="font-size:12px;color:#666">${area.island ? area.island + ', ' : ''}${area.province}</div>` : ''}
                ${area.areaHa ? `<div style="font-size:12px;color:#666">${area.areaHa.toLocaleString()} ha</div>` : ''}
              </div>`,
              { maxWidth: 260 },
            )
          },
        }).addTo(map)
      })

      setCcaCount(ccas)
      setMpaCount(mpas)
      setAreasLoaded(true)
    })

    // Load uploaded datasets
    listDatasets().then(async (summaries: DatasetSummary[]) => {
      const activeSummaries = summaries.filter(
        (s) => s.metadata.status !== 'archived',
      )
      const layers: { name: string; color: string; count: number }[] = []

      for (let i = 0; i < activeSummaries.length; i++) {
        const summary = activeSummaries[i]
        try {
          const dataset = await getDataset(summary.id)
          if (!dataset?.data?.features?.length) continue

          // Skip raw file placeholders (shapefiles, images, etc.)
          const firstProps = dataset.data.features[0]?.properties
          if (firstProps?._rawFile) continue

          const color = DATASET_COLORS[i % DATASET_COLORS.length]
          const layerStyle: L.PathOptions = {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.25,
          }

          L.geoJSON(dataset.data, {
            style: () => layerStyle,
            pointToLayer: (_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 6,
                ...layerStyle,
                fillOpacity: 0.7,
              }),
            onEachFeature: (feature, layer) => {
              const props = feature.properties ?? {}
              const propEntries = Object.entries(props).filter(
                ([k]) => !k.startsWith('_'),
              )
              const propsHtml = propEntries
                .slice(0, 8)
                .map(
                  ([k, v]) =>
                    `<div style="font-size:12px;color:#666"><strong>${k}:</strong> ${v}</div>`,
                )
                .join('')

              layer.bindPopup(
                `<div style="font-family:system-ui;font-size:13px;min-width:160px">
                  <div style="font-weight:700;margin-bottom:4px">${dataset.metadata.name}</div>
                  <div style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;background:${color}22;color:${color};display:inline-block;margin-bottom:4px">${dataset.metadata.category || dataset.format}</div>
                  ${propsHtml}
                </div>`,
                { maxWidth: 280 },
              )
            },
          }).addTo(map)

          layers.push({
            name: dataset.metadata.name,
            color,
            count: dataset.featureCount,
          })
        } catch {
          // Skip datasets that fail to load
        }
      }

      setDatasetLayers(layers)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <div className="dash-map-section">
      <h3 className="dash-section-title">Vanuatu Data Overview</h3>
      <p className="dash-section-desc">
        Interactive map showing registered protected areas across Vanuatu's islands and exclusive economic zone.
      </p>
      <div className="dash-map-wrapper">
        <div ref={containerRef} className="dash-map-container" />
        <div className="dash-map-legend">
          <div className="dash-map-legend-item">
            <span className="dash-map-legend-swatch dash-map-swatch-cca" />
            <span>CCA Boundaries{areasLoaded ? ` (${ccaCount})` : ''}</span>
          </div>
          <div className="dash-map-legend-item">
            <span className="dash-map-legend-swatch dash-map-swatch-mpa" />
            <span>MPA Boundaries{areasLoaded ? ` (${mpaCount})` : ''}</span>
          </div>
          {datasetLayers.map((dl) => (
            <div className="dash-map-legend-item" key={dl.name}>
              <span
                className="dash-map-legend-swatch"
                style={{ background: dl.color }}
              />
              <span>
                {dl.name} ({dl.count})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DashboardMap
