import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { freshness } from '../lib/format.js';

const pin = (cls, text) =>
  L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${text ?? ''}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
const meIcon = L.divIcon({ className: '', html: '<div class="pin me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
  }, [JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Tiles() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

export function ListingsMap({ listings, me, highlight, onSelect }) {
  const points = listings.map((l) => [l.lat, l.lng]);
  if (me) points.push([me.lat, me.lng]);
  const center = points[0] || [12.8231, 80.0444];
  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <Tiles />
      <FitTo points={points} />
      {me && <Marker position={[me.lat, me.lng]} icon={meIcon}><Popup>You are here</Popup></Marker>}
      {listings.map((l) => {
        const f = freshness(l.expires_at, l.prepared_at);
        return (
          <Marker key={l.listing_id} position={[l.lat, l.lng]}
                  icon={pin(`${f.level}${highlight === l.listing_id ? ' hl' : ''}`, l.quantity_servings)}
                  zIndexOffset={highlight === l.listing_id ? 1000 : 0}
                  eventHandlers={{ click: () => onSelect?.(l.listing_id) }}>
            <Popup><strong>{l.title}</strong><br />{l.donor_name}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export function SpotMap({ lat, lng, label }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <Tiles />
      <Marker position={[lat, lng]} icon={pin('', '')}><Popup>{label}</Popup></Marker>
    </MapContainer>
  );
}

function ClickToSet({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) });
  return null;
}

export function LocationPicker({ value, onChange, height = 260 }) {
  const center = value?.lat ? [value.lat, value.lng] : [12.8231, 80.0444];
  return (
    <div className="mini-map" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
        <Tiles />
        <ClickToSet onPick={onChange} />
        {value?.lat && <FitTo points={[[value.lat, value.lng]]} />}
        {value?.lat && (
          <Marker position={[value.lat, value.lng]} icon={pin('', '')} draggable
                  eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onChange({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); } }} />
        )}
      </MapContainer>
    </div>
  );
}
