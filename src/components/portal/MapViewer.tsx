import { useEffect, useRef, type FC } from 'react'
import L from 'leaflet'
import type { FeatureCollection } from 'geojson'
import 'leaflet/dist/leaflet.css'

interface MapViewerProps {
  data: FeatureCollection
  height?: string
}

const DEFAULT_CENTER: [number, number] = [-17.7333, 168.3273]
const DEFAULT_ZOOM = 7

const MapViewer: FC<MapViewerProps> = ({ data, height = '400px' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (mapRef.current) {
      mapRef.current.remove()
    }

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    const geoJsonLayer = L.geoJSON(data, {
      style: () => ({
        color: '#2d6a4f',
        weight: 2,
        fillColor: '#40916c',
        fillOpacity: 0.3,
      }),
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 7,
          fillColor: '#2d6a4f',
          color: '#fff',
          weight: 2,
          fillOpacity: 0.85,
        })
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const rows = Object.entries(feature.properties)
            .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`)
            .join('')
          layer.bindPopup(
            `<table class="popup-table">${rows}</table>`,
            { maxWidth: 300 },
          )
        }
      },
    }).addTo(map)

    const bounds = geoJsonLayer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [data])

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{ height }}
      data-testid="map-viewer"
    />
  )
}

export default MapViewer
