/**
 * Leaflet map used as an inline pin-drop picker inside EventForm.
 * Lazy-loaded to avoid Leaflet SSR / hydration issues.
 */
import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon paths (Vite asset handling quirk)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Component that listens for click events and updates the marker
function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapPicker({ initialLatLng, onSelect }) {
  const [pin, setPin] = useState(initialLatLng ?? null);

  const handleSelect = (latlng) => {
    setPin(latlng);
    onSelect(latlng);
  };

  return (
    <div className="space-y-2">
      <MapContainer
        center={[-15.376706, 166.959158]}
        zoom={6}
        style={{ height: '360px', width: '100%', borderRadius: '8px' }}
        className="border border-gray-200"
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={handleSelect} />
        {pin && <Marker position={[pin.lat, pin.lng]} />}
      </MapContainer>
      <p className="text-xs text-gray-400">
        {pin
          ? `Selected: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} — click elsewhere to move the pin`
          : 'Click on the map to drop a pin'}
      </p>
    </div>
  );
}
