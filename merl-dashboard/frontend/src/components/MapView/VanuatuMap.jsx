import React, { useState, useEffect, useMemo } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, Marker, Popup,
  CircleMarker, useMap, LayersControl,
} from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Constants ─────────────────────────────────────────────────────────────────
const VANUATU_CENTER = [-15.376706, 166.959158];
const INITIAL_ZOOM = 7;

const EVENT_COLOURS = {
  cyclone:    '#ef4444',
  flood:      '#3b82f6',
  drought:    '#f97316',
  sea_level:  '#8b5cf6',
  earthquake: '#eab308',
  landslide:  '#a16207',
  other:      '#6b7280',
};

const EVENT_TYPE_LABELS = {
  cyclone:    'Cyclone',
  flood:      'Flood',
  drought:    'Drought',
  sea_level:  'Sea Level Rise',
  earthquake: 'Earthquake',
  landslide:  'Landslide',
  other:      'Other',
};

const PROVINCE_COLOURS = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#f3e8ff', '#ffedd5',
];

// ── Province styling ──────────────────────────────────────────────────────────
function getProvinceStyle(feature, index, engagementsByProvince) {
  const provinceName = feature.properties?.NAME_1 ?? feature.properties?.name ?? '';
  const count = engagementsByProvince[provinceName] ?? 0;
  const opacity = count > 0 ? Math.min(0.8, 0.2 + count * 0.05) : 0.2;

  return {
    fillColor:   PROVINCE_COLOURS[index % PROVINCE_COLOURS.length],
    fillOpacity: opacity,
    color:       '#64748b',
    weight:      1,
    opacity:     0.7,
  };
}

// ── Fit bounds to Vanuatu ─────────────────────────────────────────────────────
function FitBounds({ geoJson }) {
  const map = useMap();
  useEffect(() => {
    if (geoJson) {
      try {
        const layer = L.geoJSON(geoJson);
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
      } catch {
        // ignore
      }
    }
  }, [geoJson, map]);
  return null;
}

// ── Legend panel ──────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'auto' }}>
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 p-3 m-3 text-xs space-y-2 min-w-[140px]">
        <p className="font-bold text-gray-800 text-sm">Legend</p>

        <div>
          <p className="font-semibold text-gray-600 mb-1">L&amp;D Events</p>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 py-0.5">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: EVENT_COLOURS[key] }}
              />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="font-semibold text-gray-600 mb-1">Community</p>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-gray-600">Engagement</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main map component ────────────────────────────────────────────────────────
export default function VanuatuMap() {
  const [geoJson, setGeoJson] = useState(null);
  const [geoError, setGeoError] = useState(false);

  // Load province GeoJSON
  useEffect(() => {
    fetch('/vanuatu-provinces.geojson')
      .then((r) => {
        if (!r.ok) throw new Error('GeoJSON not found');
        return r.json();
      })
      .then(setGeoJson)
      .catch(() => setGeoError(true));
  }, []);

  // Fetch events for map
  const { data: eventsData } = useQuery({
    queryKey: ['events-map'],
    queryFn: () => axios.get('/api/events/map').then((r) => r.data),
  });

  // Fetch engagements with location
  const { data: engagementsData } = useQuery({
    queryKey: ['engagements-map'],
    queryFn: () => axios.get('/api/community/engagements?has_location=true').then((r) => r.data),
  });

  const events      = eventsData?.events      ?? eventsData ?? [];
  const engagements = engagementsData?.items  ?? engagementsData ?? [];

  // Count engagements per province for choropleth
  const engagementsByProvince = useMemo(() => {
    const counts = {};
    engagements.forEach((e) => {
      if (e.province) counts[e.province] = (counts[e.province] ?? 0) + 1;
    });
    return counts;
  }, [engagements]);

  // Province popup on each feature
  const onEachFeature = (feature, layer, index) => {
    const name = feature.properties?.NAME_1 ?? feature.properties?.name ?? 'Province';
    const count = engagementsByProvince[name] ?? 0;
    layer.bindPopup(`
      <div class="text-sm">
        <strong class="font-semibold">${name}</strong>
        <br/>
        <span class="text-gray-500">${count} community engagement${count !== 1 ? 's' : ''}</span>
      </div>
    `);
    layer.on('mouseover', () => layer.setStyle({ weight: 2, opacity: 1 }));
    layer.on('mouseout',  () => layer.setStyle({ weight: 1, opacity: 0.7 }));
  };

  // GeoJSON style function
  let featureIndex = 0;
  const geoJsonStyle = (feature) => {
    return getProvinceStyle(feature, featureIndex++, engagementsByProvince);
  };

  return (
    <div className="relative h-full" style={{ minHeight: '500px' }}>
      {geoError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
          Province boundaries not loaded — place vanuatu-provinces.geojson in /public
        </div>
      )}

      <MapContainer
        center={VANUATU_CENTER}
        zoom={INITIAL_ZOOM}
        style={{ height: '100%', width: '100%', minHeight: '500px' }}
        className="rounded-none"
      >
        <LayersControl position="topright">
          {/* Base layers */}
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://osm.org">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (Esri)">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          {/* Province overlay */}
          <LayersControl.Overlay checked name="Province Boundaries">
            <>
              {geoJson && (
                <>
                  <FitBounds geoJson={geoJson} />
                  <GeoJSON
                    key={JSON.stringify(engagementsByProvince)}
                    data={geoJson}
                    style={(feature) => {
                      const name = feature.properties?.NAME_1 ?? feature.properties?.name ?? '';
                      const count = engagementsByProvince[name] ?? 0;
                      const opacity = count > 0 ? Math.min(0.8, 0.2 + count * 0.05) : 0.2;
                      const colours = PROVINCE_COLOURS;
                      const idx = Object.keys(engagementsByProvince).indexOf(name);
                      return {
                        fillColor:   colours[idx % colours.length] ?? '#dbeafe',
                        fillOpacity: opacity,
                        color:       '#64748b',
                        weight:      1,
                        opacity:     0.7,
                      };
                    }}
                    onEachFeature={onEachFeature}
                  />
                </>
              )}
            </>
          </LayersControl.Overlay>

          {/* L&D Events overlay */}
          <LayersControl.Overlay checked name="L&D Events">
            <>
              {events.map((ev) => {
                if (ev.latitude == null || ev.longitude == null) return null;
                const colour = EVENT_COLOURS[ev.event_type] ?? EVENT_COLOURS.other;
                return (
                  <CircleMarker
                    key={ev.id}
                    center={[ev.latitude, ev.longitude]}
                    radius={8}
                    pathOptions={{
                      color: colour,
                      fillColor: colour,
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-sm space-y-1 min-w-[160px]">
                        <p className="font-semibold">{ev.name}</p>
                        <p className="text-gray-500 capitalize">{ev.event_type?.replace('_', ' ')}</p>
                        {ev.start_date && (
                          <p className="text-gray-500">{new Date(ev.start_date).toLocaleDateString()}</p>
                        )}
                        {ev.economic_loss_vuv > 0 && (
                          <p className="text-red-600 font-medium">
                            Loss: VUV {new Intl.NumberFormat().format(ev.economic_loss_vuv)}
                          </p>
                        )}
                        {(ev.islands_affected?.length > 0) && (
                          <p className="text-gray-500">
                            Islands: {Array.isArray(ev.islands_affected)
                              ? ev.islands_affected.join(', ')
                              : ev.islands_affected}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </>
          </LayersControl.Overlay>

          {/* Community engagements overlay */}
          <LayersControl.Overlay checked name="Community Engagements">
            <>
              {engagements.map((eng) => {
                if (eng.latitude == null || eng.longitude == null) return null;
                return (
                  <CircleMarker
                    key={eng.id}
                    center={[eng.latitude, eng.longitude]}
                    radius={7}
                    pathOptions={{
                      color: '#16a34a',
                      fillColor: '#22c55e',
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-sm space-y-1 min-w-[160px]">
                        <p className="font-semibold">{eng.community_name}</p>
                        <p className="text-gray-500">{eng.island} · {eng.province}</p>
                        {eng.engagement_date && (
                          <p className="text-gray-500">
                            {new Date(eng.engagement_date).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-green-700 font-medium">
                          {eng.total_participants} participant{eng.total_participants !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </>
          </LayersControl.Overlay>
        </LayersControl>

        {/* Custom legend (outside LayersControl) */}
        <Legend />
      </MapContainer>
    </div>
  );
}
